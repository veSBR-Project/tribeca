use crate::*;

/// Accounts for [locked_voter::remove_blacklist_entry].
#[derive(Accounts)]
pub struct RemoveBlacklistEntry<'info> {
    /// The [Locker].
    pub locker: Account<'info, Locker>,

    /// The [LockerRedeemer].
    #[account(
        constraint = redeemer.admin == payer.key(),
        constraint = redeemer.locker == locker.key(),
    )]
    pub redeemer: Account<'info, LockerRedeemer>,

    /// The [Escrow] to remove from blacklist.
    pub escrow: Account<'info, Escrow>,

    /// The [Blacklist] account to remove.
    #[account(
        mut,
        close = payer,
        seeds = [
            b"Blacklist".as_ref(),
            locker.key().as_ref(),
            escrow.key().as_ref(),
        ],
        bump,
    )]
    pub blacklist: Account<'info, Blacklist>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> RemoveBlacklistEntry<'info> {
    pub fn remove_blacklist_entry(&mut self) -> Result<()> {
        // Emit an event for the blacklist removal
        emit!(RemoveBlacklistEntryEvent {
            locker: self.locker.key(),
            escrow: self.escrow.key(),
            owner: self.escrow.owner,
            admin: self.payer.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

#[event]
/// Event emitted when a user is removed from the blacklist.
pub struct RemoveBlacklistEntryEvent {
    /// The locker.
    #[index]
    pub locker: Pubkey,
    /// The escrow being removed from blacklist.
    #[index]
    pub escrow: Pubkey,
    /// The owner of the escrow.
    #[index]
    pub owner: Pubkey,
    /// The admin that removed the blacklist entry.
    pub admin: Pubkey,
    /// The time of blacklist removal.
    pub timestamp: i64,
}
