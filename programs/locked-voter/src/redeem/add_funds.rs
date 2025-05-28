use crate::errors::LockedVoterError;
use crate::*;
use anchor_spl::associated_token::get_associated_token_address;

/// Accounts for [locked_voter::add_funds].
#[derive(Accounts)]
pub struct AddFunds<'info> {
    /// The [Locker].
    pub locker: Account<'info, Locker>,

    /// The [LockerRedeemer].
    #[account(
        mut,
        constraint = redeemer.locker == locker.key(),
        constraint = redeemer.admin == payer.key(),
    )]
    pub redeemer: Account<'info, LockerRedeemer>,

    /// The [TokenAccount] holding the redeemer's receipt tokens.
    #[account(
        mut,
        constraint = redeemer_receipt_account.mint == redeemer.receipt_mint,
    )]
    pub redeemer_receipt_account: Account<'info, TokenAccount>,

    /// The source token account to transfer from.
    #[account(
        mut,
        constraint = source_token_account.mint == redeemer.receipt_mint,
        constraint = source_token_account.owner == payer.key(),
    )]
    pub source_token_account: Account<'info, TokenAccount>,

    /// The payer for adding funds.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Token program.
    pub token_program: Program<'info, Token>,
}

impl<'info> AddFunds<'info> {
    pub fn add_funds(&mut self, amount: u64) -> Result<()> {
        let redeemer_ata =
            get_associated_token_address(&self.redeemer.key(), &self.redeemer.receipt_mint);

        require!(
            redeemer_ata == self.redeemer_receipt_account.key(),
            LockedVoterError::InvalidTokenAccount,
        );

        // Transfer tokens from source to redeemer receipt account
        anchor_spl::token::transfer(
            CpiContext::new(
                self.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: self.source_token_account.to_account_info(),
                    to: self.redeemer_receipt_account.to_account_info(),
                    authority: self.payer.to_account_info(),
                },
            ),
            amount,
        )
        .map_err(|_| LockedVoterError::OperationFailed)?;

        // Update the redeemer balance
        self.redeemer.amount = self
            .redeemer
            .amount
            .checked_add(amount)
            .ok_or(LockedVoterError::OperationFailed)?;

        // Emit an event for the funds addition
        emit!(AddFundsEvent {
            locker: self.locker.key(),
            redeemer: self.redeemer.key(),
            receipt_mint: self.redeemer.receipt_mint,
            amount,
            admin: self.payer.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

#[event]
/// Event emitted when funds are added to the redeemer.
pub struct AddFundsEvent {
    /// The locker.
    #[index]
    pub locker: Pubkey,
    /// The redeemer.
    #[index]
    pub redeemer: Pubkey,
    /// The receipt mint.
    pub receipt_mint: Pubkey,
    /// The amount added.
    pub amount: u64,
    /// The admin that added the funds.
    pub admin: Pubkey,
    /// The time of funds addition.
    pub timestamp: i64,
}
