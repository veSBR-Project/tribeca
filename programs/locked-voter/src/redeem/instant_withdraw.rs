use crate::*;

/// Accounts for [locked_voter::instant_withdraw].
#[derive(Accounts)]
pub struct InstantWithdraw<'info> {
    /// The [Locker].
    #[account(mut)]
    pub locker: Box<Account<'info, Locker>>,

    /// The [LockerRedeemer].
    #[account(
        mut,
        constraint = redeemer.locker == locker.key(),
        constraint = redeemer.status == 1 @ErrorCode::RedeemerNotActive
    )]
    pub redeemer: Box<Account<'info, LockerRedeemer>>,

    /// The [Escrow] that tokens are being withdrawn from.
    #[account(
        mut,
        has_one = locker,
        constraint = escrow.owner == payer.key(),
    )]
    pub escrow: Box<Account<'info, Escrow>>,

    /// The [Blacklist].
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
    pub blacklist: Box<Account<'info, Blacklist>>,

    /// The receipt token [Mint].
    #[account(mut)]
    pub receipt_mint: Box<Account<'info, Mint>>,

    /// The [TokenAccount] holding the redeemer's receipt tokens.
    #[account(
        mut,
        constraint = redeemer_receipt_account.mint == receipt_mint.key(),
    )]
    pub redeemer_receipt_account: Box<Account<'info, TokenAccount>>,

    /// The [TokenAccount] holding the escrow's tokens, i.e., the source of the withdrawal.
    #[account(
        mut,
        constraint = escrow_tokens.mint == locker.token_mint,
    )]
    pub escrow_tokens: Box<Account<'info, TokenAccount>>,

    /// The DAO treasury [TokenAccount] that will receive the withdrawn tokens.
    #[account(
        mut,
        constraint = treasury_token_account.mint == locker.token_mint,
        constraint = treasury_token_account.key() == redeemer.treasury,
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,

    /// The receipt [TokenAccount] owned by the user.
    #[account(
        mut,
        constraint = user_receipt.mint == receipt_mint.key(),
        constraint = user_receipt.owner == payer.key(),
    )]
    pub user_receipt: Box<Account<'info, TokenAccount>>,

    /// The payer for creating the blacklist account.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Program to create the receipt token mint.
    pub token_program: Program<'info, Token>,

    /// Clock to get the current time.
    pub clock: Sysvar<'info, Clock>,

    /// System program.
    pub system_program: Program<'info, System>,
}

impl<'info> InstantWithdraw<'info> {
    pub fn validate(&self) -> Result<()> {
        // Ensure the escrow has tokens
        invariant!(self.escrow.amount > 0, "Escrow is empty");
        invariant!(self.blacklist.timestamp == 0, "Escrow account blacklisted");
        invariant!(
            self.escrow.escrow_started_at < self.redeemer.cutoff_date,
            "This escrow is too recent to be redeemed"
        );
        Ok(())
    }

    pub fn instant_withdraw(&mut self) -> Result<()> {
        let base_amount = self.escrow.amount;
        let ve_sbr_amount = self.escrow.voting_power(&self.locker.params)?;
        let redemption_rate = self.redeemer.redemption_rate;
        let receipt_amount = ve_sbr_amount.checked_div(redemption_rate).unwrap();

        let escrow_seeds: &[&[&[u8]]] = escrow_seeds!(self.escrow);
        let redeemer_seeds: &[&[&[u8]]] = redeemer_seeds!(self.redeemer);

        // Transfer escrow tokens to treasury
        anchor_spl::token::transfer(
            CpiContext::new(
                self.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: self.escrow_tokens.to_account_info(),
                    to: self.treasury_token_account.to_account_info(),
                    authority: self.escrow.to_account_info(),
                },
            )
            .with_signer(escrow_seeds),
            base_amount,
        )?;

        // transfer receipt tokens to the user
        anchor_spl::token::transfer(
            CpiContext::new(
                self.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: self.redeemer_receipt_account.to_account_info(),
                    to: self.user_receipt.to_account_info(),
                    authority: self.redeemer.to_account_info(),
                },
            )
            .with_signer(redeemer_seeds),
            receipt_amount,
        )?;

        // Update the redeemer balance
        self.redeemer.amount = self.redeemer.amount.checked_sub(receipt_amount).unwrap();

        // Update the escrow state
        self.escrow.amount = self.escrow.amount.checked_sub(base_amount).unwrap();
        self.escrow.escrow_ends_at = 0;
        self.escrow.escrow_started_at = 0;

        // update blacklist
        self.blacklist.locker = self.locker.key();
        self.blacklist.escrow = self.escrow.key();
        self.blacklist.owner = self.payer.key();
        self.blacklist.timestamp = self.clock.unix_timestamp;

        // Emit an event for the withdrawal
        emit!(InstantWithdrawEvent {
            locker: self.locker.key(),
            escrow: self.escrow.key(),
            owner: self.payer.key(),
            amount: receipt_amount,
            timestamp: self.clock.unix_timestamp,
        });

        Ok(())
    }
}

/// Event emitted when tokens are instantly withdrawn.
#[event]
pub struct InstantWithdrawEvent {
    /// The locker.
    #[index]
    pub locker: Pubkey,
    /// The escrow.
    #[index]
    pub escrow: Pubkey,
    /// The escrow owner.
    #[index]
    pub owner: Pubkey,
    /// The amount withdrawn.
    pub amount: u64,
    /// The time of withdrawal.
    pub timestamp: i64,
}

#[error_code]
enum ErrorCode {
    #[msg("Redeemer is currently paused")]
    RedeemerNotActive,
}
