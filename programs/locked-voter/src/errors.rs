use anchor_lang::prelude::*;

#[error_code]
pub enum LockedVoterError {
    #[msg("Invalid token account.")]
    InvalidTokenAccount,
    #[msg("Insufficient funds.")]
    InsufficientFunds,
    #[msg("Unauthorized action.")]
    Unauthorized,
    #[msg("Operation failed.")]
    OperationFailed,
    #[msg("Redeemer is not active.")]
    RedeemerNotActive,
    #[msg("Escrow is empty.")]
    EscrowEmpty,
    #[msg("Escrow account blacklisted.")]
    EscrowBlacklisted,
    #[msg("This escrow is too recent to be redeemed.")]
    EscrowTooRecent,
    #[msg("Redemption rate must be greater than 0.")]
    InvalidRedemptionRate,
    #[msg("Redemption rate must be different from the previous rate.")]
    RedemptionRateSameAsPrevious,
}
