use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::{constants::*, error::BotheistError, state::*};

#[event]
pub struct CampaignRefunded {
    pub campaign: Pubkey,
    pub organizer: Pubkey,
    pub amount: u64,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub organizer: Signer<'info>,
    #[account(
        mut,
        has_one = organizer,
        seeds = [CAMPAIGN_SEED, organizer.key().as_ref(), campaign.campaign_id.as_ref()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump = campaign.vault_bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Return whatever is left in the vault to the organizer. Only possible after
/// the payout deadline, so an organizer cannot pull prizes from a live campaign.
pub fn handle_refund(ctx: Context<Refund>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let campaign_key = ctx.accounts.campaign.key();
    let campaign = &mut ctx.accounts.campaign;
    require!(!campaign.closed, BotheistError::CampaignClosed);
    require!(now > campaign.payout_deadline_at, BotheistError::PayoutWindowOpen);

    let amount = ctx.accounts.vault.lamports();
    campaign.closed = true;
    if amount > 0 {
        let bump = [campaign.vault_bump];
        let seeds: &[&[u8]] = &[VAULT_SEED, campaign_key.as_ref(), &bump];
        let signer = [seeds];
        let cpi = CpiContext::new_with_signer(
            system_program::ID,
            Transfer { from: ctx.accounts.vault.to_account_info(), to: ctx.accounts.organizer.to_account_info() },
            &signer,
        );
        system_program::transfer(cpi, amount)?;
    }

    emit!(CampaignRefunded { campaign: campaign_key, organizer: ctx.accounts.organizer.key(), amount });
    Ok(())
}
