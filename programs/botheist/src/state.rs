use anchor_lang::prelude::*;

use crate::constants::MAX_REWARDS;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, Debug, PartialEq, Eq)]
pub struct RewardEntry {
    /// Rule index agreed off-chain (0 = Double Dip, 1 = Wrong Pocket, 2 = Ghost Order, ...).
    pub rule_id: u8,
    /// Reward in lamports, fixed at creation. The verifier cannot change it.
    pub amount: u64,
    pub claimed: bool,
}

#[account]
#[derive(InitSpace)]
pub struct Campaign {
    pub organizer: Pubkey,
    /// The only key allowed to call `award` for this campaign.
    pub verifier: Pubkey,
    /// Off-chain campaign identifier (UUID bytes), part of the PDA seeds.
    pub campaign_id: [u8; 16],
    /// Hash of the frozen campaign terms: agent version, rules, rewards, limits.
    pub config_hash: [u8; 32],
    pub rewards: [RewardEntry; MAX_REWARDS as usize],
    pub reward_count: u8,
    pub total_funded: u64,
    pub total_paid: u64,
    pub created_at: i64,
    pub submissions_close_at: i64,
    pub payout_deadline_at: i64,
    pub closed: bool,
    pub bump: u8,
    pub vault_bump: u8,
}

impl Campaign {
    pub fn reward_mut(&mut self, rule_id: u8) -> Option<&mut RewardEntry> {
        let count = self.reward_count as usize;
        self.rewards[..count].iter_mut().find(|r| r.rule_id == rule_id)
    }
}

/// One per (campaign, rule). Its existence is the on-chain guarantee that a
/// reward is paid at most once.
#[account]
#[derive(InitSpace)]
pub struct Claim {
    pub campaign: Pubkey,
    pub rule_id: u8,
    pub winner: Pubkey,
    /// Off-chain run identifier (UUID bytes).
    pub run_id: [u8; 16],
    /// SHA-256 of the canonical proof record.
    pub proof_hash: [u8; 32],
    pub amount: u64,
    pub awarded_at: i64,
    pub bump: u8,
}
