use anchor_lang::prelude::*;

#[error_code]
pub enum BotheistError {
    #[msg("A campaign needs between 1 and 8 rewards, each with a positive amount")]
    InvalidRewards,
    #[msg("Each rule can only have one reward")]
    DuplicateRule,
    #[msg("Submissions must close in the future and before the payout deadline")]
    InvalidSchedule,
    #[msg("The verifier cannot be the default key")]
    InvalidVerifier,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("This rule has no reward in the campaign")]
    UnknownRule,
    #[msg("The reward for this rule was already paid")]
    AlreadyClaimed,
    #[msg("The payout deadline has passed")]
    PayoutWindowClosed,
    #[msg("The vault does not hold enough lamports for this reward")]
    InsufficientFunds,
    #[msg("The campaign is closed")]
    CampaignClosed,
    #[msg("Funds can only be returned after the payout deadline")]
    PayoutWindowOpen,
    #[msg("The winner cannot be the vault or the campaign")]
    InvalidWinner,
}
