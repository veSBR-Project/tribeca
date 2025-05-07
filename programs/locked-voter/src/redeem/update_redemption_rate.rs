use crate::*;

/// Accounts for updating a locker redeemer's redemption rate.
#[derive(Accounts)]
pub struct UpdateRedemptionRate<'info> {
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

impl<'info> UpdateRedemptionRate<'info> {
    pub fn update_redemption_rate(&mut self, new_rate: u64) -> Result<()> {
        let redeemer = &mut self.redeemer;

        let previous_rate = redeemer.redemption_rate;

        redeemer.redemption_rate = new_rate;

        // Emit an event for the rate change
        emit!(UpdateRedemptionRateEvent {
            locker: self.locker.key(),
            redeemer: redeemer.key(),
            previous_rate,
            new_rate,
            admin: self.payer.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

#[event]
/// Event emitted when redemption rate is updated.
pub struct UpdateRedemptionRateEvent {
    /// The locker.
    #[index]
    pub locker: Pubkey,
    /// The redeemer.
    #[index]
    pub redeemer: Pubkey,
    /// Previous redemption rate.
    pub previous_rate: u64,
    /// New redemption rate.
    pub new_rate: u64,
    /// The admin that updated the rate.
    pub admin: Pubkey,
    /// The time of update.
    pub timestamp: i64,
}
