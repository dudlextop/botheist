use anchor_lang::prelude::*;

#[constant]
pub const CAMPAIGN_SEED: &[u8] = b"campaign";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const CLAIM_SEED: &[u8] = b"claim";

/// Maximum number of rewarded rules (missions) per campaign.
#[constant]
pub const MAX_REWARDS: u8 = 8;
