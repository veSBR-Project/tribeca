//! Update locker redeemer admin instruction.
use anchor_lang::prelude::*;

use crate::state::*;

/// Accounts for updating a locker redeemer's admin.
#[derive(Accounts)]
pub struct UpdateRedeemerAdmin<'info> {
    /// The locker that is associated with the redeemer.
    pub locker: Account<'info, Locker>,

    /// The redeemer account to update.
    #[account(
        mut,
        constraint = redeemer.locker == locker.key()
    )]
    pub redeemer: Account<'info, LockerRedeemer>,

    /// The current admin of the redeemer.
    #[account(
        constraint = redeemer.admin.key() == current_admin.key()
    )]
    pub current_admin: Signer<'info>,

    /// The new admin that will control the redeemer.
    /// CHECK: This account will become the new admin.
    pub new_admin: UncheckedAccount<'info>,
}

impl<'info> UpdateRedeemerAdmin<'info> {
    pub fn update_redeemer_admin(&mut self) -> Result<()> {
        let redeemer = &mut self.redeemer;

        // Store the previous admin for logging
        let previous_admin = redeemer.admin;

        // Update the admin to the new admin
        redeemer.admin = self.new_admin.key();

        msg!(
            "Updated locker redeemer admin from {} to {} for locker {}",
            previous_admin,
            redeemer.admin,
            self.locker.key()
        );

        Ok(())
    }
}
