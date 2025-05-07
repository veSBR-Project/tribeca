use crate::*;

/// Accounts for [locked_voter::add_blacklist_entry].
#[derive(Accounts)]
pub struct AddBlacklistEntry<'info> {
    /// The [Locker].
    pub locker: Account<'info, Locker>,

    /// The [LockerRedeemer].
    #[account(
        constraint = redeemer.admin == payer.key(),
        constraint = redeemer.locker == locker.key(),
    )]
    pub redeemer: Account<'info, LockerRedeemer>,

    /// The [Escrow] to blacklist.
    pub escrow: Account<'info, Escrow>,

    /// The [Blacklist] account to create.
    #[account(
        init,
        payer = payer,
        space = 8 + std::mem::size_of::<Blacklist>(),
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
    pub clock: Sysvar<'info, Clock>,
}

impl<'info> AddBlacklistEntry<'info> {
    pub fn add_blacklist_entry(&mut self) -> Result<()> {
        // Initialize the blacklist account
        self.blacklist.locker = self.locker.key();
        self.blacklist.escrow = self.escrow.key();
        self.blacklist.owner = self.escrow.owner;
        self.blacklist.timestamp = self.clock.unix_timestamp;

        // Emit an event for the blacklist addition
        emit!(AddBlacklistEntryEvent {
            locker: self.locker.key(),
            escrow: self.escrow.key(),
            owner: self.escrow.owner,
            admin: self.payer.key(),
            timestamp: self.clock.unix_timestamp,
        });

        Ok(())
    }
}

#[event]
/// Event emitted when a user is added to the blacklist.
pub struct AddBlacklistEntryEvent {
    /// The locker.
    #[index]
    pub locker: Pubkey,
    /// The escrow being blacklisted.
    #[index]
    pub escrow: Pubkey,
    /// The owner of the escrow.
    #[index]
    pub owner: Pubkey,
    /// The admin that added the blacklist entry.
    pub admin: Pubkey,
    /// The time of blacklist addition.
    pub timestamp: i64,
}
