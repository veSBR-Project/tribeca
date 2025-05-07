use anchor_lang::prelude::*;

use crate::state::*;

/// Accounts for accepting the pending admin role of a locker redeemer.
#[derive(Accounts)]
pub struct AcceptRedeemerAdmin<'info> {
    pub locker: Account<'info, Locker>,

    #[account(
        mut,
        constraint = redeemer.locker == locker.key()
    )]
    pub redeemer: Account<'info, LockerRedeemer>,

    #[account(
        constraint = redeemer.pending_admin == pending_admin.key()
    )]
    pub pending_admin: Signer<'info>,
}

impl<'info> AcceptRedeemerAdmin<'info> {
    pub fn accept_redeemer_admin(&mut self) -> Result<()> {
        let redeemer = &mut self.redeemer;

        redeemer.admin = self.pending_admin.key();
        redeemer.pending_admin = Pubkey::default();

        msg!(
            "Accepted locker redeemer admin for locker {}",
            self.locker.key()
        );

        Ok(())
    }
}
