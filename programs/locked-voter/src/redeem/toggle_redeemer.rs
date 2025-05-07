use crate::*;

/// Accounts for toggling a locker redeemer's status.
#[derive(Accounts)]
pub struct ToggleRedeemer<'info> {
    /// The locker that is associated with the redeemer.
    pub locker: Account<'info, Locker>,

    /// The redeemer account to update.
    #[account(
        mut,
        constraint = redeemer.locker == locker.key()
    )]
    pub redeemer: Account<'info, LockerRedeemer>,

    /// The admin of the redeemer.
    #[account(
        constraint = redeemer.admin.key() == payer.key()
    )]
    pub payer: Signer<'info>,
}

impl<'info> ToggleRedeemer<'info> {
    pub fn toggle_redeemer(&mut self, toggle_to: u8) -> Result<()> {
        let redeemer = &mut self.redeemer;

        // Toggle the status between 0 (paused) and 1 (active)
        redeemer.status = toggle_to;

        // Emit an event for the status change
        emit!(ToggleRedeemerEvent {
            locker: self.locker.key(),
            redeemer: redeemer.key(),
            new_status: redeemer.status,
            admin: self.payer.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

#[event]
/// Event emitted when redeemer status is toggled.
pub struct ToggleRedeemerEvent {
    /// The locker.
    #[index]
    pub locker: Pubkey,
    /// The redeemer.
    #[index]
    pub redeemer: Pubkey,
    /// The new status (0 = paused, 1 = active).
    pub new_status: u8,
    /// The admin that toggled the status.
    pub admin: Pubkey,
    /// The time of status change.
    pub timestamp: i64,
}
