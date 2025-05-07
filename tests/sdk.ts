import { Program } from '@coral-xyz/anchor-0-29.0.0';
import * as anchor from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';

const { BN } = anchor.default;

/**
 * Tribeca SDK
 * @class
 * @description - The TribecaSDK class is used to interact with the Tribeca locked-voter program
 */
export class TribecaSDK {
  private readonly tribecaProgram: Program;
  private readonly gokiProgram: Program;
  private readonly governorProgram: Program;

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
   * Extend lock duration
   * @param owner - The owner of the escrow
   * @param locker - The locker account
   * @param escrow - The escrow account
   * @param newDuration - The new lock duration in seconds
   * @returns - The instruction to extend lock duration
   */
  async extendLockDuration(
    owner: PublicKey,
    locker: PublicKey,
    escrow: PublicKey,
    newDuration: typeof BN
  ) {
    try {
      // Create the instruction
      const extendLockDurationInstruction = await this.tribecaProgram.methods
        .extendLockDuration(newDuration)
        .accounts({
          locker: locker,
          escrow: escrow,
          owner: owner,
        })
        .instruction();

      return {
        extendLockDurationInstruction,
      };
    } catch (error) {
      console.error('Error extending lock duration', error);
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
   * @param rewardMint - The mint of the reward token
   * @param claimRate - The claim rate of the locker redeemer
   * @returns - The instruction to create a new locker redeemer
   */
  async createLockerRedeemer(
    payer: PublicKey,
    locker: PublicKey,
    rewardMint: PublicKey,
    claimRate: any
  ) {
    try {
      const [redeemerPDA, redeemerBump] = PublicKey.findProgramAddressSync(
        [Buffer.from('Redeemer'), locker.toBuffer(), rewardMint.toBuffer()],
        this.tribecaProgram.programId
      );

      const programData = anchor.web3.PublicKey.findProgramAddressSync(
        [this.tribecaProgram.programId.toBuffer()],
        new anchor.web3.PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
      )[0];

      // Create the instruction
      const createLockerRedeemerInstruction = await this.tribecaProgram.methods
        .createRedeemer(claimRate)
        .accounts({
          locker: locker,
          admin: payer, // must be admin of the locker
          redeemer: redeemerPDA,
          rewardMint: rewardMint,
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
   * Add rewards to locker
   * @param connection - Solana connection
   * @param payer - The payer of the transaction
   * @param admin - The admin of the locker
   * @param locker - The locker account
   * @param rewardMint - The mint of the reward token
   * @param amount - The amount of rewards to add
   * @param startTs - The start timestamp for rewards
   * @param endTs - The end timestamp for rewards
   * @returns - The instruction to add rewards
   */
  async addRewards(
    connection: Connection,
    payer: anchor.Wallet,
    admin: PublicKey,
    locker: PublicKey,
    rewardMint: PublicKey,
    amount: any,
    startTs: any,
    endTs: any
  ) {
    try {
      // Get the token account
      const adminTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        rewardMint,
        admin
      );

      // Find reward vault PDA
      const rewardVaultPDA = this.getRewardVault(rewardMint);

      // Create the instruction
      const addRewardsInstruction = await this.tribecaProgram.methods
        .addReward(amount, startTs, endTs)
        .accounts({
          locker: locker,
          rewardVault: rewardVaultPDA,
          rewardMint: rewardMint,
          from: adminTokenAccount.address,
          admin: admin,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      return {
        addRewardsInstruction,
        rewardVaultPDA,
      };
    } catch (error) {
      console.error('Error adding rewards', error);
      throw error;
    }
  }

  /**
   * Claim rewards from locker
   * @param connection - Solana connection
   * @param owner - The owner of the escrow
   * @param locker - The locker account
   * @param escrow - The escrow account
   * @param rewardMint - The mint of the reward token
   * @returns - The instruction to claim rewards
   */
  async claimRewards(
    connection: Connection,
    payer: anchor.Wallet,
    owner: PublicKey,
    locker: PublicKey,
    escrow: PublicKey,
    rewardMint: PublicKey
  ) {
    try {
      // Get the token account
      const ownerTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        rewardMint,
        owner
      );

      // Find reward vault PDA
      const rewardVaultPDA = this.getRewardVault(rewardMint);

      // Create the instruction
      const claimRewardsInstruction = await this.tribecaProgram.methods
        .claimRewards()
        .accounts({
          locker: locker,
          escrow: escrow,
          rewardVault: rewardVaultPDA,
          rewardMint: rewardMint,
          to: ownerTokenAccount.address,
          owner: owner,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      return {
        claimRewardsInstruction,
        rewardVaultPDA,
      };
    } catch (error) {
      console.error('Error claiming rewards', error);
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
