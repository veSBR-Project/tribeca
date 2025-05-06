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
import { BN } from '@coral-xyz/anchor';

/**
 * Tribeca SDK
 * @class
 * @description - The TribecaSDK class is used to interact with the Tribeca locked-voter program
 */
export class TribecaSDK {
  private readonly program: Program;
  private readonly gokiProgram: Program;
  private readonly governorProgram: Program;

  /**
   * Constructor for TribecaSDK
   * @param program - The locked voter program
   * @param gokiProgram - The Goki smart wallet program
   * @param governorProgram - The Tribeca governor program
   */
  constructor(
    program: Program,
    gokiProgram: Program,
    governorProgram: Program
  ) {
    this.program = program;
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
      maxOwners?: number;
      threshold?: BN;
      minimumDelay?: BN;
      electorate?: PublicKey;
      votingDelay?: BN;
      votingPeriod?: BN;
      quorumVotes?: BN;
      timelockDelaySeconds?: BN;
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
      const owners = [payer, tribecaGovernorPDA];

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
          voting_delay: votingDelay,
          voting_period: votingPeriod,
          quorum_votes: quorumVotes,
          timelock_delay_seconds: timelockDelaySeconds,
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
   * Create reward vaults for tokens
   * @param tokenMint - The mint address of the token
   * @returns - The reward vault PDA for the token
   */
  getRewardVault(tokenMint: PublicKey) {
    try {
      const [rewardVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('reward_vault'), tokenMint.toBuffer()],
        this.program.programId
      );

      return rewardVaultPDA;
    } catch (error) {
      console.error('Error getting reward vault', error);
      throw error;
    }
  }

  /**
   * Create a locked voter instance
   * @param payer - The payer of the transaction
   * @param governanceToken - The governance token mint
   * @param options - Configuration options
   * @returns - The instruction to create a locked voter instance
   */
  async createLockedVoter(
    payer: PublicKey,
    governanceToken: PublicKey,
    options: {
      governor?: PublicKey;
      vestingMinTimeSeconds?: BN;
      maxStakeVoteMultiplier?: number;
      proposalActivationMinVotes?: BN;
    } = {}
  ) {
    try {
      // Default values
      const {
        governor,
        vestingMinTimeSeconds = new BN(86400), // 1 day
        maxStakeVoteMultiplier = 10,
        proposalActivationMinVotes = new BN(1000000),
      } = options;

      // Find locker PDA
      const [lockerPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('locker')],
        this.program.programId
      );

      // Create the instruction
      const createLockedVoterInstruction = await this.program.methods
        .createLocker(
          vestingMinTimeSeconds,
          maxStakeVoteMultiplier,
          proposalActivationMinVotes
        )
        .accounts({
          locker: lockerPDA,
          tokenMint: governanceToken,
          governor: governor,
          payer: payer,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      return {
        createLockedVoterInstruction,
        lockerPDA,
      };
    } catch (error) {
      console.error('Error creating locked voter', error);
      throw error;
    }
  }

  /**
   * Create escrow account for user
   * @param payer - The payer of the transaction
   * @param owner - The owner of the escrow
   * @param locker - The locker account
   * @returns - The instruction to create an escrow account
   */
  async createEscrow(payer: PublicKey, owner: PublicKey, locker: PublicKey) {
    try {
      // Find escrow PDA
      const [escrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), owner.toBuffer()],
        this.program.programId
      );

      // Create the instruction
      const createEscrowInstruction = await this.program.methods
        .createEscrow()
        .accounts({
          escrow: escrowPDA,
          locker: locker,
          owner: owner,
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
   * @param connection - Solana connection
   * @param payer - The payer of the transaction
   * @param owner - The owner of the escrow
   * @param locker - The locker account
   * @param escrow - The escrow account
   * @param tokenMint - The mint of the token to lock
   * @param amount - The amount to lock
   * @param duration - The lock duration in seconds
   * @returns - The instruction to lock tokens
   */
  async lockTokens(
    connection: Connection,
    payer: anchor.Wallet,
    owner: PublicKey,
    locker: PublicKey,
    escrow: PublicKey,
    tokenMint: PublicKey,
    amount: BN,
    duration: BN
  ) {
    try {
      // Get the token accounts
      const ownerTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        tokenMint,
        owner
      );

      // Find locker vault PDA
      const [lockerVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), locker.toBuffer()],
        this.program.programId
      );

      // Create the instruction
      const lockTokensInstruction = await this.program.methods
        .lock(amount, duration)
        .accounts({
          locker: locker,
          escrow: escrow,
          lockerVault: lockerVaultPDA,
          tokenMint: tokenMint,
          tokenFrom: ownerTokenAccount.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          owner: owner,
        })
        .instruction();

      return {
        lockTokensInstruction,
        lockerVaultPDA,
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
    newDuration: BN
  ) {
    try {
      // Create the instruction
      const extendLockDurationInstruction = await this.program.methods
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
   * @param connection - Solana connection
   * @param owner - The owner of the escrow
   * @param locker - The locker account
   * @param escrow - The escrow account
   * @param tokenMint - The mint of the token to unlock
   * @returns - The instruction to unlock tokens
   */
  async unlockTokens(
    connection: Connection,
    payer: anchor.Wallet,
    owner: PublicKey,
    locker: PublicKey,
    escrow: PublicKey,
    tokenMint: PublicKey
  ) {
    try {
      // Get the token accounts
      const ownerTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        tokenMint,
        owner
      );

      // Find locker vault PDA
      const [lockerVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), locker.toBuffer()],
        this.program.programId
      );

      // Create the instruction
      const unlockTokensInstruction = await this.program.methods
        .unlock()
        .accounts({
          locker: locker,
          escrow: escrow,
          lockerVault: lockerVaultPDA,
          tokenMint: tokenMint,
          tokenTo: ownerTokenAccount.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          owner: owner,
        })
        .instruction();

      return {
        unlockTokensInstruction,
        lockerVaultPDA,
      };
    } catch (error) {
      console.error('Error unlocking tokens', error);
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
    amount: BN,
    startTs: BN,
    endTs: BN
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
      const addRewardsInstruction = await this.program.methods
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
      const claimRewardsInstruction = await this.program.methods
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
   * Vote on behalf of an escrow
   * @param owner - The owner of the escrow
   * @param escrow - The escrow account
   * @param proposalAddress - The proposal address
   * @param vote - The vote (true for yes, false for no)
   * @returns - The instruction to vote
   */
  async vote(
    owner: PublicKey,
    escrow: PublicKey,
    proposalAddress: PublicKey,
    vote: boolean
  ) {
    try {
      // Create the instruction
      const voteInstruction = await this.program.methods
        .vote(vote)
        .accounts({
          escrow: escrow,
          proposal: proposalAddress,
          owner: owner,
        })
        .instruction();

      return {
        voteInstruction,
      };
    } catch (error) {
      console.error('Error voting', error);
      throw error;
    }
  }
}
