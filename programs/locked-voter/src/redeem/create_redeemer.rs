//! Create locker redeemer instruction.
use crate::program::LockedVoter;
use anchor_lang::prelude::*;

use crate::state::*;

/// Accounts for creating a locker redeemer.
#[derive(Accounts)]
pub struct CreateRedeemer<'info> {
    /// The locker that is being redeemed.
    pub locker: Account<'info, Locker>,

    /// The redeemer that is being created.
    #[account(
        init,
        payer = payer,
        space = 8 + std::mem::size_of::<LockerRedeemer>(),
        seeds = [
            b"Redeemer".as_ref(),
            locker.key().as_ref(),
            reward_mint.key().as_ref(),
        ],
        bump
    )]
    pub redeemer: Account<'info, LockerRedeemer>,

    /// The reward mint to be used for redemption.
    pub reward_mint: Account<'info, anchor_spl::token::Mint>,

    /// The payer for creating the redeemer account.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The program account.
    #[account(
        constraint = program.programdata_address()? == Some(program_data.key())
    )]
    pub program: Program<'info, LockedVoter>,

    /// The program data account.
    #[account(
        constraint = program_data.upgrade_authority_address == Some(payer.key())
    )]
    pub program_data: Account<'info, ProgramData>,

    /// System program.
    pub system_program: Program<'info, System>,
}

/// Creates a new locker redeemer account.
impl<'info> CreateRedeemer<'info> {
    pub fn create_redeemer(&mut self, claim_rate: u8) -> Result<()> {
        let redeemer = &mut self.redeemer;

        redeemer.locker = self.locker.key();
        redeemer.admin = self.payer.key();
        redeemer.reward_mint = self.reward_mint.key();
        redeemer.status = 1; // active
        redeemer.claim_rate = claim_rate;
        msg!("Created locker redeemer for locker {}", self.locker.key());
        Ok(())
    }
}
