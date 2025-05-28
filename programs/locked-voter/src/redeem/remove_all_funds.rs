use crate::errors::LockedVoterError;
use crate::*;
use anchor_spl::associated_token::get_associated_token_address;

/// Accounts for [locked_voter::remove_all_funds].
#[derive(Accounts)]
pub struct RemoveAllFunds<'info> {
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

    /// The destination token account to transfer to.
    #[account(
        mut,
        constraint = destination_token_account.mint == redeemer.receipt_mint,
        constraint = destination_token_account.owner == payer.key(),
    )]
    pub destination_token_account: Account<'info, TokenAccount>,

    /// The payer for removing funds.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Token program.
    pub token_program: Program<'info, Token>,
}

impl<'info> RemoveAllFunds<'info> {
    pub fn remove_all_funds(&mut self) -> Result<()> {
        let redeemer_ata =
            get_associated_token_address(&self.redeemer.key(), &self.redeemer.receipt_mint);

        require!(
            redeemer_ata == self.redeemer_receipt_account.key(),
            LockedVoterError::InvalidTokenAccount,
        );

        let amount = self.redeemer.amount;
        invariant!(amount > 0, "No funds to remove");

        let redeemer_seeds: &[&[&[u8]]] = redeemer_seeds!(self.redeemer);

        // Transfer all tokens from redeemer receipt account to destination
        anchor_spl::token::transfer(
            CpiContext::new(
                self.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: self.redeemer_receipt_account.to_account_info(),
                    to: self.destination_token_account.to_account_info(),
                    authority: self.redeemer.to_account_info(),
                },
            )
            .with_signer(redeemer_seeds),
            amount,
        )?;

        // Reset the redeemer balance to zero
        self.redeemer.amount = 0;

        // Emit an event for the funds removal
        emit!(RemoveAllFundsEvent {
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
/// Event emitted when all funds are removed from the redeemer.
pub struct RemoveAllFundsEvent {
    /// The locker.
    #[index]
    pub locker: Pubkey,
    /// The redeemer.
    #[index]
    pub redeemer: Pubkey,
    /// The receipt mint.
    pub receipt_mint: Pubkey,
    /// The amount removed.
    pub amount: u64,
    /// The admin that removed the funds.
    pub admin: Pubkey,
    /// The time of funds removal.
    pub timestamp: i64,
}
