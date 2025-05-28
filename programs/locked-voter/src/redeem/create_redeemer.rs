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
            receipt_mint.key().as_ref(),
        ],
        bump
    )]
    pub redeemer: Account<'info, LockerRedeemer>,

    /// The receipt mint to be used for redemption.
    pub receipt_mint: Account<'info, anchor_spl::token::Mint>,

    /// The treasury account where locker mint tokens are stored
    /// e.g SBR when redeeming for USDC
    #[account(
        mut,
        constraint = treasury_token_account.mint == locker.token_mint,
    )]
    pub treasury_token_account: Account<'info, anchor_spl::token::TokenAccount>,

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

    pub system_program: Program<'info, System>,
}

/// Creates a new locker redeemer account.
impl<'info> CreateRedeemer<'info> {
    pub fn create_redeemer(
        &mut self,
        redemption_rate: u64,
        cutoff_date: i64,
        bump: u8,
    ) -> Result<()> {
        require!(redemption_rate != 0, ErrorCode::InvalidRedemptionRate);

        let current_time = Clock::get()?.unix_timestamp;
        msg!("Current time: {}", current_time);
        msg!("Cutoff date: {}", cutoff_date);
        require!(cutoff_date < current_time, ErrorCode::InvalidCutoffDate);

        let redeemer = &mut self.redeemer;

        redeemer.locker = self.locker.key();
        redeemer.admin = self.payer.key();
        redeemer.pending_admin = Pubkey::default();
        redeemer.receipt_mint = self.receipt_mint.key();
        redeemer.status = 1; // active
        redeemer.redemption_rate = redemption_rate;
        redeemer.treasury = self.treasury_token_account.key();
        redeemer.cutoff_date = cutoff_date;
        redeemer.bump = bump;

        msg!("Created locker redeemer for locker {}", self.locker.key());
        Ok(())
    }
}

// Define error codes
#[error_code]
pub enum ErrorCode {
    #[msg("Redemption rate must be greater than zero.")]
    InvalidRedemptionRate,
    #[msg("Cutoff date must be in the past.")]
    InvalidCutoffDate,
}
