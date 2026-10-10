pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("FomST5XstXfxSRTEZFVkXRonCVrjML9KhFS4ryeH9Vt1");

/// BotHeist bounty escrow.
///
/// An organizer funds a campaign up front. A designated verifier pays the first
/// confirmed finding for each rule exactly once. Whatever is left returns to the
/// organizer only after the payout deadline.
#[program]
pub mod botheist {
    use super::*;

    pub fn create_and_fund_campaign(ctx: Context<CreateAndFundCampaign>, args: CreateCampaignArgs) -> Result<()> {
        crate::instructions::create_and_fund_campaign::handle_create_and_fund_campaign(ctx, args)
    }

    pub fn award(ctx: Context<Award>, rule_id: u8, run_id: [u8; 16], proof_hash: [u8; 32]) -> Result<()> {
        crate::instructions::award::handle_award(ctx, rule_id, run_id, proof_hash)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        crate::instructions::refund::handle_refund(ctx)
    }
}
