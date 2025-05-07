use anchor_lang::prelude::*;

use crate::state::*;

/// Accounts for updating a locker redeemer's admin.
#[derive(Accounts)]
pub struct UpdateRedeemerAdmin<'info> {
    pub locker: Account<'info, Locker>,

    #[account(
        mut,
        constraint = redeemer.locker == locker.key()
    )]
    pub redeemer: Account<'info, LockerRedeemer>,

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

        redeemer.pending_admin = self.new_admin.key();

        msg!(
            "Pending locker redeemer admin from {} to {} for locker {}",
            self.current_admin.key(),
            self.new_admin.key(),
            self.locker.key()
        );

        Ok(())
    }
}
