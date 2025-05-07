use crate::*;

/// Accounts for updating a locker redeemer's treasury address.
#[derive(Accounts)]
pub struct UpdateTreasury<'info> {
    /// The locker that is associated with the redeemer.
    pub locker: Account<'info, Locker>,

    /// The redeemer account to update.
    #[account(
        mut,
        constraint = redeemer.locker == locker.key()
    )]
    pub redeemer: Account<'info, LockerRedeemer>,

    /// The new treasury token account.
    /// CHECK: This account will become the new treasury.
    #[account(
        constraint = new_treasury.mint == locker.token_mint
    )]
    pub new_treasury: Account<'info, TokenAccount>,

    /// The admin of the redeemer.
    #[account(
            constraint = redeemer.admin.key() == payer.key()
        )]
    pub payer: Signer<'info>,
}

impl<'info> UpdateTreasury<'info> {
    pub fn update_treasury(&mut self) -> Result<()> {
        let redeemer = &mut self.redeemer;

        // Store the previous treasury for logging
        let previous_treasury = redeemer.treasury;

        // Update the treasury to the new treasury
        redeemer.treasury = self.new_treasury.key();

        msg!(
            "Updated locker redeemer treasury from {} to {} for locker {}",
            previous_treasury,
            redeemer.treasury,
            self.locker.key()
        );

        Ok(())
    }
}

#[event]
/// Event emitted when treasury is updated.
pub struct UpdateTreasuryEvent {
    /// The locker.
    #[index]
    pub locker: Pubkey,
    /// The redeemer.
    #[index]
    pub redeemer: Pubkey,
    /// Previous treasury address.
    pub previous_treasury: Pubkey,
    /// New treasury address.
    pub new_treasury: Pubkey,
    /// The admin that updated the treasury.
    pub admin: Pubkey,
    /// The time of update.
    pub timestamp: i64,
}
