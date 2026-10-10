use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::{constants::*, error::BotheistError, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct RewardInput {
    pub rule_id: u8,
    pub amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateCampaignArgs {
    pub campaign_id: [u8; 16],
    pub verifier: Pubkey,
    pub config_hash: [u8; 32],
    pub rewards: Vec<RewardInput>,
    pub submissions_close_at: i64,
    pub payout_deadline_at: i64,
}

#[event]
pub struct CampaignFunded {
    pub campaign: Pubkey,
    pub organizer: Pubkey,
    pub verifier: Pubkey,
    pub total_funded: u64,
    pub config_hash: [u8; 32],
}

#[derive(Accounts)]
#[instruction(args: CreateCampaignArgs)]
pub struct CreateAndFundCampaign<'info> {
    #[account(mut)]
    pub organizer: Signer<'info>,
    #[account(
        init,
        payer = organizer,
        space = 8 + Campaign::INIT_SPACE,
        seeds = [CAMPAIGN_SEED, organizer.key().as_ref(), args.campaign_id.as_ref()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(mut, seeds = [VAULT_SEED, campaign.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_and_fund_campaign(ctx: Context<CreateAndFundCampaign>, args: CreateCampaignArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let count = args.rewards.len();
    require!(count > 0 && count <= MAX_REWARDS as usize, BotheistError::InvalidRewards);
    require!(args.submissions_close_at > now, BotheistError::InvalidSchedule);
    require!(args.payout_deadline_at > args.submissions_close_at, BotheistError::InvalidSchedule);
    require_keys_neq!(args.verifier, Pubkey::default(), BotheistError::InvalidVerifier);

    let mut rewards = [RewardEntry::default(); MAX_REWARDS as usize];
    let mut total: u64 = 0;
    for (i, r) in args.rewards.iter().enumerate() {
        require!(r.amount > 0, BotheistError::InvalidRewards);
        require!(
            args.rewards[..i].iter().all(|other| other.rule_id != r.rule_id),
            BotheistError::DuplicateRule
        );
        total = total.checked_add(r.amount).ok_or(BotheistError::Overflow)?;
        rewards[i] = RewardEntry { rule_id: r.rule_id, amount: r.amount, claimed: false };
    }

    let campaign_key = ctx.accounts.campaign.key();
    let campaign = &mut ctx.accounts.campaign;
    campaign.organizer = ctx.accounts.organizer.key();
    campaign.verifier = args.verifier;
    campaign.campaign_id = args.campaign_id;
    campaign.config_hash = args.config_hash;
    campaign.rewards = rewards;
    campaign.reward_count = count as u8;
    campaign.total_funded = total;
    campaign.total_paid = 0;
    campaign.created_at = now;
    campaign.submissions_close_at = args.submissions_close_at;
    campaign.payout_deadline_at = args.payout_deadline_at;
    campaign.closed = false;
    campaign.bump = ctx.bumps.campaign;
    campaign.vault_bump = ctx.bumps.vault;

    // The whole prize pool plus the vault's rent-exempt minimum moves in the same
    // transaction that creates the campaign, so an active campaign is always funded.
    let rent_min = Rent::get()?.minimum_balance(0);
    let required = total.checked_add(rent_min).ok_or(BotheistError::Overflow)?;
    let deposit = required.saturating_sub(ctx.accounts.vault.lamports());
    if deposit > 0 {
        let cpi = CpiContext::new(
            system_program::ID,
            Transfer { from: ctx.accounts.organizer.to_account_info(), to: ctx.accounts.vault.to_account_info() },
        );
        system_program::transfer(cpi, deposit)?;
    }

    emit!(CampaignFunded {
        campaign: campaign_key,
        organizer: ctx.accounts.organizer.key(),
        verifier: args.verifier,
        total_funded: total,
        config_hash: args.config_hash,
    });
    Ok(())
}
