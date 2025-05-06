use crate::*;

/// Accounts for [locked_voter::instant_withdraw].
#[derive(Accounts)]
pub struct InstantWithdraw<'info> {
    /// The [Locker].
    #[account(mut)]
    pub locker: Account<'info, Locker>,

    /// The [Escrow] that tokens are being withdrawn from.
    #[account(
        mut,
        has_one = locker,
        has_one = owner,
    )]
    pub escrow: Account<'info, Escrow>,

    /// The escrow owner.
    pub owner: Signer<'info>,

    /// The [TokenAccount] holding the escrow's tokens, i.e., the source of the withdrawal.
    #[account(
        mut,
        constraint = escrow_tokens.mint == locker.token_mint,
        constraint = escrow_tokens.owner == escrow.key(),
    )]
    pub escrow_tokens: Account<'info, TokenAccount>,

    /// The DAO treasury [TokenAccount] that will receive the withdrawn tokens.
    #[account(
        mut,
        constraint = treasury.mint == locker.token_mint,
    )]
    pub treasury: Account<'info, TokenAccount>,

    /// The receipt token [Mint].
    #[account(mut)]
    pub receipt_mint: Account<'info, Mint>,

    /// The receipt [TokenAccount] owned by the user.
    #[account(
        mut,
        constraint = user_receipt.mint == receipt_mint.key(),
        constraint = user_receipt.owner == owner.key(),
    )]
    pub user_receipt: Account<'info, TokenAccount>,

    /// Program to create the receipt token mint.
    pub token_program: Program<'info, Token>,

    /// Clock to get the current time.
    pub clock: Sysvar<'info, Clock>,
}

impl<'info> InstantWithdraw<'info> {
    pub fn validate(&self) -> Result<()> {
        // Ensure the escrow has tokens
        invariant!(self.escrow.amount > 0, "Escrow is empty");
        Ok(())
    }

    pub fn instant_withdraw(&mut self, amount: u64) -> Result<()> {
        // Verify the amount to withdraw
        invariant!(
            amount > 0 && amount <= self.escrow.amount,
            "Invalid withdrawal amount"
        );

        // Calculate any fees or penalties for early withdrawal
        // This could be a percentage of the locked tokens
        let penalty_rate = 5; // Example: 5% penalty
        let penalty_amount = amount.checked_mul(penalty_rate).unwrap() / 100;
        let transfer_amount = amount;

        // Transfer tokens from escrow to treasury
        anchor_spl::token::transfer(
            CpiContext::new(
                self.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: self.escrow_tokens.to_account_info(),
                    to: self.treasury.to_account_info(),
                    authority: self.escrow.to_account_info(),
                },
            ),
            transfer_amount,
        )?;

        // Mint receipt tokens to the user
        // The amount could be the same as withdrawn or adjusted based on some formula
        let receipt_amount = amount;

        anchor_spl::token::mint_to(
            CpiContext::new_with_signer(
                self.token_program.to_account_info(),
                anchor_spl::token::MintTo {
                    mint: self.receipt_mint.to_account_info(),
                    to: self.user_receipt.to_account_info(),
                    authority: self.receipt_mint.to_account_info(),
                },
                &[&[b"receipt_mint".as_ref(), &[/* Bump goes here */]]],
            ),
            receipt_amount,
        )?;

        // Update the escrow state
        self.escrow.amount = self.escrow.amount.checked_sub(amount).unwrap();

        // If completely withdrawn, you might want to reset other escrow properties
        if self.escrow.amount == 0 {
            self.escrow.escrow_started_at = 0;
            self.escrow.escrow_ends_at = 0;
        }

        // Emit an event for the withdrawal
        emit!(InstantWithdrawEvent {
            locker: self.locker.key(),
            escrow: self.escrow.key(),
            owner: self.owner.key(),
            amount,
            penalty: penalty_amount,
            receipt_amount,
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
    /// The penalty applied.
    pub penalty: u64,
    /// The receipt tokens minted.
    pub receipt_amount: u64,
    /// The time of withdrawal.
    pub timestamp: i64,
}
