import { Program } from '@coral-xyz/anchor-0-29.0.0';
import * as anchor from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const { BN } = anchor.default;

/**
 * Tribeca SDK
 * @class
 * @description - The TribecaSDK class is used to interact with the Tribeca locked-voter program
 */
export class TribecaSDK {
  public tribecaProgram: Program;
  public gokiProgram: Program;
  public governorProgram: Program;

  /**
   * Constructor for TribecaSDK
   * @param tribecaProgram - The tribeca program
   * @param gokiProgram - The Goki smart wallet program
   * @param governorProgram - The Tribeca governor program
   */
  constructor(
    tribecaProgram: Program,
    gokiProgram: Program,
    governorProgram: Program
  ) {
    this.tribecaProgram = tribecaProgram;
    this.gokiProgram = gokiProgram;
    this.governorProgram = governorProgram;
  }

  /**
   * Creates smart wallet and governor instructions
   * @param payer - The payer of the transaction
   * @param baseKey - Base key for deriving PDAs
   * @param options - Configuration options
   * @returns - Instructions for creating smart wallet and governor
   */
  async createSmartWalletAndGovernor(
    payer: anchor.Wallet,
    baseKey: PublicKey,
    options: {
      maxOwners?: any;
      threshold?: any;
      minimumDelay?: any;
      electorate?: PublicKey;
      votingDelay?: any;
      votingPeriod?: any;
      quorumVotes?: any;
      timelockDelaySeconds?: any;
    } = {}
  ) {
    try {
      // Set default values if not provided
      const {
        maxOwners = 5,
        threshold = new BN(1),
        minimumDelay = new BN(0),
        votingDelay = new BN(0),
        votingPeriod = new BN(0),
        quorumVotes = new BN(10),
        timelockDelaySeconds = new BN(0),
        electorate = payer.publicKey,
      } = options;

      // Find PDAs
      const [gokiSmartWalletPDA, gokiSmartWalletBump] =
        PublicKey.findProgramAddressSync(
          [Buffer.from('GokiSmartWallet'), baseKey.toBuffer()],
          this.gokiProgram.programId
        );

      const [tribecaGovernorPDA, tribecaGovernorBump] =
        PublicKey.findProgramAddressSync(
          [Buffer.from('TribecaGovernor'), baseKey.toBuffer()],
          this.governorProgram.programId
        );

      // Define the owners array (payer and governor)
      const owners = [payer.publicKey, tribecaGovernorPDA];

      // Create smart wallet instruction
      const createSmartWalletInstruction = await this.gokiProgram.methods
        .createSmartWallet(
          gokiSmartWalletBump,
          maxOwners,
          owners,
          threshold,
          minimumDelay
        )
        .accounts({
          base: baseKey,
          gokiProgram: this.gokiProgram.programId,
          smartWallet: gokiSmartWalletPDA,
          payer: payer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Create governor instruction
      const createGovernorInstruction = await this.governorProgram.methods
        .createGovernor(tribecaGovernorBump, electorate, {
          votingDelay,
          votingPeriod,
          quorumVotes,
          timelockDelaySeconds,
        })
        .accounts({
          base: baseKey,
          governor: tribecaGovernorPDA,
          governorProgram: this.governorProgram.programId,
          smartWallet: gokiSmartWalletPDA,
          payer: payer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      return {
        createSmartWalletInstruction,
        createGovernorInstruction,
        gokiSmartWalletPDA,
        tribecaGovernorPDA,
        gokiSmartWalletBump,
        tribecaGovernorBump,
      };
    } catch (error) {
      console.error('Error creating smart wallet and governor', error);
      throw error;
    }
  }

  /**
   * Create a new locker instance
   * @param payer - The payer of the transaction
   * @param baseKey - The base keypair for deriving PDAs (must be a signer)
   * @param governanceToken - The governance token mint
   * @param governor - The governor account
   * @param options - Configuration options
   * @returns - The instruction to create a new locker instance
   */
  async createNewLocker(
    payer: PublicKey,
    baseKey: PublicKey,
    governanceToken: PublicKey,
    governor: PublicKey,
    options: {
      whitelistEnabled: boolean;
      maxStakeVoteMultiplier: any;
      maxStakeDuration: any;
      minStakeDuration: any;
      proposalActivationMinVotes: any;
    }
  ) {
    try {
      const {
        whitelistEnabled,
        maxStakeVoteMultiplier,
        minStakeDuration,
        maxStakeDuration,
        proposalActivationMinVotes,
      } = options;

      const [lockerPDA, lockerBump] = PublicKey.findProgramAddressSync(
        [Buffer.from('Locker'), baseKey.toBuffer()],
        this.tribecaProgram.programId
      );

      const createLockerInstruction = await this.tribecaProgram.methods
        .newLocker(lockerBump, {
          whitelistEnabled,
          maxStakeVoteMultiplier,
          minStakeDuration,
          maxStakeDuration,
          proposalActivationMinVotes,
        })
        .accounts({
          base: baseKey,
          locker: lockerPDA,
          tokenMint: governanceToken,
          governor: governor,
          payer: payer,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      return {
        createLockerInstruction,
        lockerPDA,
      };
    } catch (error) {
      console.error('Error creating new locker', error);
      throw error;
    }
  }

  /**
   * Create escrow account for user
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param owner - The owner of the escrow
   * @returns - The instruction to create an escrow account
   */
  async createNewEscrow(payer: PublicKey, locker: PublicKey, owner: PublicKey) {
    try {
      // Find escrow PDA
      const [escrowPDA, escrowBump] = PublicKey.findProgramAddressSync(
        [Buffer.from('Escrow'), locker.toBuffer(), owner.toBuffer()],
        this.tribecaProgram.programId
      );

      // Create the instruction
      const createEscrowInstruction = await this.tribecaProgram.methods
        .newEscrow(escrowBump)
        .accounts({
          locker: locker,
          escrow: escrowPDA,
          escrowOwner: owner,
          payer: payer,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      return {
        createEscrowInstruction,
        escrowPDA,
      };
    } catch (error) {
      console.error('Error creating escrow', error);
      throw error;
    }
  }

  /**
   * Lock tokens in escrow
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param escrow - The escrow account
   * @param escrowTokens - The escrow token account
   * @param sourceTokens - The source token account
   * @param tokenMint - The mint of the token to lock
   * @param amount - The amount to lock
   * @returns - The instruction to lock tokens
   */
  async lockTokens(
    payer: PublicKey,
    locker: PublicKey,
    escrow: PublicKey,
    escrowTokens: PublicKey,
    sourceTokens: PublicKey,
    amount: any,
    duration: any
  ) {
    try {
      const lock = {
        locker: locker,
        escrow: escrow,
        escrowTokens: escrowTokens,
        escrowOwner: payer,
        sourceTokens: sourceTokens,
        tokenProgram: TOKEN_PROGRAM_ID,
      };

      const lockTokensInstruction = await this.tribecaProgram.methods
        .lockWithWhitelist(amount, duration)
        .accounts({
          lock: lock,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction();

      return {
        lockTokensInstruction,
      };
    } catch (error) {
      console.error('Error locking tokens', error);
      throw error;
    }
  }

  /**
   * Unlock tokens from escrow
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param escrow - The escrow account
   * @param escrowOwner - The owner of the escrow
   * @param escrowTokens - The escrow token account
   * @param destinationTokens - The destination token account
   * @param tokenMint - The mint of the token to unlock
   * @returns - The instruction to unlock tokens
   */
  async exitEscrow(
    payer: PublicKey,
    locker: PublicKey,
    escrow: PublicKey,
    escrowOwner: PublicKey,
    escrowTokens: PublicKey,
    destinationTokens: PublicKey,
    tokenMint: PublicKey
  ) {
    try {
      // Create the instruction
      const unlockTokensInstruction = await this.tribecaProgram.methods
        .exit()
        .accounts({
          locker: locker,
          escrow: escrow,
          escrowTokens: escrowTokens,
          destinationTokens: destinationTokens,
          tokenMint: tokenMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          owner: escrowOwner,
        })
        .instruction();

      return {
        unlockTokensInstruction,
      };
    } catch (error) {
      console.error('Error unlocking tokens', error);
      throw error;
    }
  }

  /**
   * Create a new locker redeemer
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param receiptMint - The mint of the receipt token
   * @param redemptionRate - The redemption rate of the locker redeemer
   * @param cutoffDate - The cutoff date of the locker redeemer
   * @param treasuryTokenAccount - The treasury token account
   * @returns - The instruction to create a new locker redeemer
   */
  async createLockerRedeemer(
    payer: PublicKey,
    locker: PublicKey,
    receiptMint: PublicKey,
    redemptionRate: any,
    cutoffDate: any,
    treasuryTokenAccount: PublicKey
  ) {
    try {
      const [redeemerPDA, redeemerBump] = PublicKey.findProgramAddressSync(
        [Buffer.from('Redeemer'), locker.toBuffer(), receiptMint.toBuffer()],
        this.tribecaProgram.programId
      );

      const programData = anchor.web3.PublicKey.findProgramAddressSync(
        [this.tribecaProgram.programId.toBuffer()],
        new anchor.web3.PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
      )[0];

      // Create the instruction
      const createLockerRedeemerInstruction = await this.tribecaProgram.methods
        .createRedeemer(redemptionRate, cutoffDate, redeemerBump)
        .accounts({
          locker: locker,
          admin: payer, // must be admin of the locker
          redeemer: redeemerPDA,
          receiptMint: receiptMint,
          treasuryTokenAccount: treasuryTokenAccount,
          payer: payer,
          program: this.tribecaProgram.programId,
          programData: programData,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      return {
        createLockerRedeemerInstruction,
        redeemerPDA,
      };
    } catch (error) {
      console.error('Error creating locker redeemer', error);
      throw error;
    }
  }

  /**
   *
   * Add funds to locker redeemer
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param redeemer - The redeemer account
   * @param redeemerReceiptAccount - The redeemer receipt token account
   * @param sourceTokenAccount - The source token account
   * @param amount - The amount to add
   * @returns - The instruction to add funds
   */
  async addFunds(
    payer: PublicKey,
    locker: PublicKey,
    redeemer: PublicKey,
    redeemerReceiptAccount: PublicKey,
    sourceTokenAccount: PublicKey,
    amount: any
  ) {
    try {
      const addFundsInstruction = await this.tribecaProgram.methods
        .addFunds(amount)
        .accounts({
          locker: locker,
          redeemer: redeemer,
          redeemerReceiptAccount: redeemerReceiptAccount,
          sourceTokenAccount: sourceTokenAccount,
          payer: payer,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      return {
        addFundsInstruction,
      };
    } catch (error) {
      console.error('Error adding funds', error);
      throw error;
    }
  }

  /**
   * Remove all funds from locker redeemer
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param redeemer - The redeemer account
   * @param redeemerReceiptAccount - The redeemer receipt token account
   * @param destinationTokenAccount - The destination token account
   * @returns - The instruction to remove all funds
   */
  async removeAllFunds(
    payer: PublicKey,
    locker: PublicKey,
    redeemer: PublicKey,
    redeemerReceiptAccount: PublicKey,
    destinationTokenAccount: PublicKey
  ) {
    try {
      const removeAllFundsInstruction = await this.tribecaProgram.methods
        .removeAllFunds()
        .accounts({
          locker: locker,
          redeemer: redeemer,
          redeemerReceiptAccount: redeemerReceiptAccount,
          destinationTokenAccount: destinationTokenAccount,
          payer: payer,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      return {
        removeAllFundsInstruction,
      };
    } catch (error) {
      console.error('Error removing all funds', error);
      throw error;
    }
  }

  /**
   * Instant withdraw from locker
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param redeemer - The redeemer account
   * @param receiptMint - The mint of the receipt token
   * @param escrow - The escrow account
   * @param escrowTokens - The escrow token account
   * @param treasuryTokenAccount - The treasury token account
   * @param userReceipt - The user receipt token account
   * @returns - The instruction to instant withdraw
   */
  async instantWithdraw(
    payer: PublicKey,
    locker: PublicKey,
    redeemer: PublicKey,
    receiptMint: PublicKey,
    redeemerReceiptAccount: PublicKey,
    escrow: PublicKey,
    escrowTokens: PublicKey,
    treasuryTokenAccount: PublicKey,
    userReceipt: PublicKey
  ) {
    try {
      const [blacklistPDA, blacklistBump] = PublicKey.findProgramAddressSync(
        [Buffer.from('Blacklist'), locker.toBuffer(), escrow.toBuffer()],
        this.tribecaProgram.programId
      );

      // Create the instruction
      const instantWithdrawInstruction = await this.tribecaProgram.methods
        .instantWithdraw()
        .accounts({
          locker: locker,
          redeemer: redeemer,
          escrow: escrow,
          blacklist: blacklistPDA,
          receiptMint: receiptMint,
          redeemerReceiptAccount: redeemerReceiptAccount,
          escrowTokens: escrowTokens,
          treasuryTokenAccount: treasuryTokenAccount,
          userReceipt: userReceipt,
          payer: payer,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      return {
        instantWithdrawInstruction,
        blacklistPDA,
      };
    } catch (error) {
      console.error('Error instant withdrawing', error);
      throw error;
    }
  }

  /**
   * Add a blacklist entry
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param escrow - The escrow account
   * @param redeemer - The redeemer account
   * @param receiptMint - The mint of the receipt token
   * @returns - The instruction to add a blacklist entry
   */
  async addBlacklistEntry(
    payer: PublicKey,
    locker: PublicKey,
    escrow: PublicKey,
    redeemer: PublicKey
  ) {
    try {
      const [blacklistPDA, blacklistBump] = PublicKey.findProgramAddressSync(
        [Buffer.from('Blacklist'), locker.toBuffer(), escrow.toBuffer()],
        this.tribecaProgram.programId
      );

      const addBlacklistEntryInstruction = await this.tribecaProgram.methods
        .addBlacklistEntry()
        .accounts({
          locker: locker,
          redeemer: redeemer,
          escrow: escrow,
          blacklist: blacklistPDA,
          payer: payer,
          systemProgram: SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .instruction();

      return {
        addBlacklistEntryInstruction,
      };
    } catch (error) {
      console.error('Error adding blacklist entry', error);
      throw error;
    }
  }

  /**
   * Remove a blacklist entry
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param escrow - The escrow account
   * @param redeemer - The redeemer account
   * @returns - The instruction to remove a blacklist entry
   */
  async removeBlacklistEntry(
    payer: PublicKey,
    locker: PublicKey,
    escrow: PublicKey,
    redeemer: PublicKey
  ) {
    try {
      const [blacklistPDA, blacklistBump] = PublicKey.findProgramAddressSync(
        [Buffer.from('Blacklist'), locker.toBuffer(), escrow.toBuffer()],
        this.tribecaProgram.programId
      );

      const removeBlacklistEntryInstruction = await this.tribecaProgram.methods
        .removeBlacklistEntry()
        .accounts({
          locker: locker,
          redeemer: redeemer,
          escrow: escrow,
          blacklist: blacklistPDA,
          payer: payer,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      return {
        removeBlacklistEntryInstruction,
      };
    } catch (error) {
      console.error('Error removing blacklist entry', error);
      throw error;
    }
  }

  /**
   * Update the treasury of a locker redeemer
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param redeemer - The redeemer account
   * @param newTreasury - The new treasury account
   * @returns - The instruction to update the treasury
   */
  async updateTreasury(
    payer: PublicKey,
    locker: PublicKey,
    redeemer: PublicKey,
    newTreasury: PublicKey
  ) {
    try {
      const updateTreasuryInstruction = await this.tribecaProgram.methods
        .updateTreasury()
        .accounts({
          locker: locker,
          redeemer: redeemer,
          payer: payer,
          newTreasury: newTreasury,
        })
        .instruction();

      return {
        updateTreasuryInstruction,
      };
    } catch (error) {
      console.error('Error updating treasury', error);
      throw error;
    }
  }

  /**
   * Toggle the status of a locker redeemer
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param redeemer - The redeemer account
   * @param toggleTo - The new status of the redeemer (0 = paused, 1 = active)
   * @returns - The instruction to toggle the status
   */
  async toggleRedeemer(
    payer: PublicKey,
    locker: PublicKey,
    redeemer: PublicKey,
    toggleTo: number // 0 or 1 (0 = paused, 1 = active)
  ) {
    try {
      const toggleRedeemerInstruction = await this.tribecaProgram.methods
        .toggleRedeemer(toggleTo)
        .accounts({
          locker: locker,
          redeemer: redeemer,
          payer: payer,
        })
        .instruction();

      return {
        toggleRedeemerInstruction,
      };
    } catch (error) {
      console.error('Error toggling redeemer', error);
      throw error;
    }
  }

  /**
   * Update the redemption rate of a locker redeemer
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param redeemer - The redeemer account
   * @param newRedemptionRate - The new redemption rate
   * @returns - The instruction to update the redemption rate
   */
  async updateRedemptionRate(
    payer: PublicKey,
    locker: PublicKey,
    redeemer: PublicKey,
    newRedemptionRate: any
  ) {
    try {
      const updateRedemptionRateInstruction = await this.tribecaProgram.methods
        .updateRedemptionRate(newRedemptionRate)
        .accounts({
          locker: locker,
          redeemer: redeemer,
          payer: payer,
        })
        .instruction();

      return {
        updateRedemptionRateInstruction,
      };
    } catch (error) {
      console.error('Error updating redemption rate', error);
      throw error;
    }
  }

  /**
   * Update the admin of a locker redeemer
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param redeemer - The redeemer account
   * @param newAdmin - The new admin account
   * @returns - The instruction to update the admin
   */
  async updateRedeemerAdmin(
    payer: PublicKey,
    locker: PublicKey,
    redeemer: PublicKey,
    newAdmin: PublicKey
  ) {
    try {
      const updateRedeemerAdminInstruction = await this.tribecaProgram.methods
        .updateRedeemerAdmin()
        .accounts({
          locker: locker,
          redeemer: redeemer,
          currentAdmin: payer,
          newAdmin: newAdmin,
        })
        .instruction();

      return {
        updateRedeemerAdminInstruction,
      };
    } catch (error) {
      console.error('Error updating redeemer admin', error);
      throw error;
    }
  }

  /**
   * Accept the pending admin of a locker redeemer
   * @param payer - The payer of the transaction
   * @param locker - The locker account
   * @param redeemer - The redeemer account
   * @returns - The instruction to accept the pending admin
   */
  async acceptRedeemerAdmin(
    payer: PublicKey,
    locker: PublicKey,
    redeemer: PublicKey
  ) {
    try {
      const acceptRedeemerAdminInstruction = await this.tribecaProgram.methods
        .acceptRedeemerAdmin()
        .accounts({
          locker: locker,
          redeemer: redeemer,
          pendingAdmin: payer,
        })
        .instruction();

      return {
        acceptRedeemerAdminInstruction,
      };
    } catch (error) {
      console.error('Error accepting redeemer admin', error);
      throw error;
    }
  }

  /**
   * Get the voting power of an escrow
   * @param escrow - The escrow account public key
   * @param locker - The locker account public key
   * @returns - The voting power of the escrow (as a BN)
   */
  async getVotingPower(escrow: PublicKey, locker: PublicKey): Promise<any> {
    try {
      const escrowData: any =
        await this.tribecaProgram.account.escrow.fetch(escrow);
      const lockerData: any =
        await this.tribecaProgram.account.locker.fetch(locker);

      const calculateVotingPower = (timestampSeconds: number) => {
        if (escrowData.escrowStartedAt.eq(new BN(0))) {
          return new BN(0);
        }

        if (
          timestampSeconds < escrowData.escrowStartedAt.toNumber() ||
          timestampSeconds >= escrowData.escrowEndsAt.toNumber()
        ) {
          return new BN(0);
        }

        const secondsUntilLockupExpiry = escrowData.escrowEndsAt
          .sub(new BN(timestampSeconds))
          .toNumber();

        const relevantSecondsUntilLockupExpiry = Math.min(
          secondsUntilLockupExpiry,
          lockerData.params.maxStakeDuration.toNumber()
        );

        const powerIfMaxLockup = escrowData.amount.mul(
          new BN(lockerData.params.maxStakeVoteMultiplier)
        );

        const result = powerIfMaxLockup
          .mul(new BN(relevantSecondsUntilLockupExpiry))
          .div(lockerData.params.maxStakeDuration);

        return result.toNumber() / 10 ** 6;
      };

      return calculateVotingPower(Date.now() / 1000);
    } catch (error) {
      console.error('Error getting voting power', error);
      throw error;
    }
  }
}
