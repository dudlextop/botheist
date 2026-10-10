use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::{constants::*, error::BotheistError, state::*};

#[event]
pub struct RewardAwarded {
    pub campaign: Pubkey,
    pub rule_id: u8,
    pub winner: Pubkey,
    pub amount: u64,
    pub run_id: [u8; 16],
    pub proof_hash: [u8; 32],
}

#[derive(Accounts)]
#[instruction(rule_id: u8)]
pub struct Award<'info> {
    /// The campaign's verifier signs and pays for the Claim account.
    #[account(mut)]
    pub verifier: Signer<'info>,
    #[account(
        mut,
        has_one = verifier,
        seeds = [CAMPAIGN_SEED, campaign.organizer.as_ref(), campaign.campaign_id.as_ref()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump = campaign.vault_bump)]
    pub vault: SystemAccount<'info>,
    /// `init` fails if a Claim for this (campaign, rule) already exists.
    #[account(
        init,
        payer = verifier,
        space = 8 + Claim::INIT_SPACE,
        seeds = [CLAIM_SEED, campaign.key().as_ref(), &[rule_id]],
        bump
    )]
    pub claim: Account<'info, Claim>,
    /// The wallet bound to the winning run. Recorded in the Claim.
    #[account(mut, constraint = winner.key() != vault.key() @ BotheistError::InvalidWinner)]
    pub winner: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_award(ctx: Context<Award>, rule_id: u8, run_id: [u8; 16], proof_hash: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let campaign_key = ctx.accounts.campaign.key();
    let campaign = &mut ctx.accounts.campaign;
    require!(!campaign.closed, BotheistError::CampaignClosed);
    require!(now <= campaign.payout_deadline_at, BotheistError::PayoutWindowClosed);

    let reward = campaign.reward_mut(rule_id).ok_or(BotheistError::UnknownRule)?;
    require!(!reward.claimed, BotheistError::AlreadyClaimed);
    let amount = reward.amount;

    let rent_min = Rent::get()?.minimum_balance(0);
    let needed = amount.checked_add(rent_min).ok_or(BotheistError::Overflow)?;
    require!(ctx.accounts.vault.lamports() >= needed, BotheistError::InsufficientFunds);

    reward.claimed = true;
    campaign.total_paid = campaign.total_paid.checked_add(amount).ok_or(BotheistError::Overflow)?;

    let claim = &mut ctx.accounts.claim;
    claim.campaign = campaign_key;
    claim.rule_id = rule_id;
    claim.winner = ctx.accounts.winner.key();
    claim.run_id = run_id;
    claim.proof_hash = proof_hash;
    claim.amount = amount;
    claim.awarded_at = now;
    claim.bump = ctx.bumps.claim;

    let bump = [campaign.vault_bump];
    let seeds: &[&[u8]] = &[VAULT_SEED, campaign_key.as_ref(), &bump];
    let signer = [seeds];
    let cpi = CpiContext::new_with_signer(
        system_program::ID,
        Transfer { from: ctx.accounts.vault.to_account_info(), to: ctx.accounts.winner.to_account_info() },
        &signer,
    );
    system_program::transfer(cpi, amount)?;

    emit!(RewardAwarded { campaign: campaign_key, rule_id, winner: ctx.accounts.winner.key(), amount, run_id, proof_hash });
    Ok(())
}
