import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { Program } from '@coral-xyz/anchor-0-29.0.0';
import * as anchor from '@coral-xyz/anchor';
import type { Wallet as SaberWallet } from '@coral-xyz/anchor';
import {
  mintTo,
  createMint,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
  transfer,
} from '@solana/spl-token';
import {
  Connection,
  Keypair,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { getProgram } from './helpers.ts';
import {
  GOKI_PROGRAM,
  GOVERNOR_PROGRAM,
  LOCKED_V_PROGRAM,
  RPC_URL,
} from './constants.ts';
import { TribecaSDK } from './sdk.ts';
import { expect } from 'chai';

const goki_idl = require('./goki_idl.json');
const govern_idl = require('../target/idl/govern.json');
const locked_voter_idl = require('../target/idl/locked_voter.json');

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const payer = provider.wallet as anchor.Wallet;
const connection = new Connection(RPC_URL, 'confirmed');

const { BN } = anchor.default;

// TODO: Make sure to update this accurately for mainnet
const REDEMPTION_RATE = 10000; // 1 USDC = 10000 veSBR
const CUTOFF_DATE = new BN(Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60); // two months ago

const BASE_KEY = Keypair.generate();
const TREASURY_KEY = Keypair.generate();

let SBR_MINT: anchor.web3.PublicKey;
let USDC_MINT: anchor.web3.PublicKey;

let GOKI_SMART_WALLET_PDA: anchor.web3.PublicKey;
let GOKI_SMART_WALLET_BUMP: number;

let TRIBECA_GOVERNOR_PDA: anchor.web3.PublicKey;
let TRIBECA_GOVERNOR_BUMP: number;

let LOCKER_PDA: anchor.web3.PublicKey;
let LOCKER_BUMP: number;

let ESCROW_PDA: anchor.web3.PublicKey;
let ESCROW_BUMP: number;

let REDEEMER_PDA: anchor.web3.PublicKey;
let REDEEMER_BUMP: number;

describe('tribeca test', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payer = provider.wallet as anchor.Wallet;
  const connection = new Connection(RPC_URL, 'confirmed');

  const sdk = new TribecaSDK(
    getProgram(payer, JSON.stringify(locked_voter_idl), LOCKED_V_PROGRAM),
    getProgram(payer, JSON.stringify(goki_idl), GOKI_PROGRAM),
    getProgram(payer, JSON.stringify(govern_idl), GOVERNOR_PROGRAM)
  );

  it('creates and mints tokens', async () => {
    try {
      const sbrMintKeypair = Keypair.generate();
      const usdcMintKeypair = Keypair.generate();

      SBR_MINT = await createMint(
        connection,
        payer.payer,
        payer.publicKey,
        payer.publicKey,
        6,
        sbrMintKeypair
      );

      USDC_MINT = await createMint(
        connection,
        payer.payer,
        payer.publicKey,
        payer.publicKey,
        6,
        usdcMintKeypair
      );

      console.log('SBR Mint', SBR_MINT.toBase58());
      console.log('USDC Mint', USDC_MINT.toBase58());

      const depositTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        SBR_MINT,
        payer.publicKey
      );

      const usdcTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        USDC_MINT,
        payer.publicKey
      );

      const mintSbrIx = await mintTo(
        connection,
        payer.payer,
        SBR_MINT,
        depositTokenAccount.address,
        payer.publicKey,
        100000 * 10 ** 6
      );

      const mintUsdcIx = await mintTo(
        connection,
        payer.payer,
        USDC_MINT,
        usdcTokenAccount.address,
        payer.publicKey,
        100000 * 10 ** 6
      );

      const sbrBalance = await connection.getTokenAccountBalance(
        depositTokenAccount.address
      );
      const usdcBalance = await connection.getTokenAccountBalance(
        usdcTokenAccount.address
      );

      console.log('SBR Balance', sbrBalance);
      console.log('USDC Balance', usdcBalance);
    } catch (err) {
      console.error('Error creating tokens', err);
      throw err;
    }
  });

  it('Creates a smart wallet and governor', async () => {
    try {
      const maxOwners = 5;
      const owners = [payer.publicKey, TRIBECA_GOVERNOR_PDA];
      const threshold = new BN(1);
      const minimumDelay = new BN(0);

      const electorate = payer.publicKey;
      const votingDelay = new BN(0);
      const votingPeriod = new BN(0);
      const quorumVotes = new BN(10);
      const timelockDelaySeconds = new BN(0);

      const {
        createSmartWalletInstruction,
        createGovernorInstruction,
        tribecaGovernorPDA,
        gokiSmartWalletPDA,
        gokiSmartWalletBump,
      } = await sdk.createSmartWalletAndGovernor(payer, BASE_KEY.publicKey, {
        maxOwners,
        threshold,
        minimumDelay,
        electorate,
        votingDelay,
        votingPeriod,
        quorumVotes,
        timelockDelaySeconds,
      });

      TRIBECA_GOVERNOR_PDA = tribecaGovernorPDA;
      GOKI_SMART_WALLET_PDA = gokiSmartWalletPDA;
      GOKI_SMART_WALLET_BUMP = gokiSmartWalletBump;

      const transaction = new anchor.web3.Transaction();
      transaction.add(createSmartWalletInstruction, createGovernorInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
        BASE_KEY,
      ]);

      console.log('Transaction sent and confirmed', tx);
    } catch (err) {
      console.error('Error creating smart wallet and governor', err);
      throw err;
    }
  });

  it('Creates a locker', async () => {
    try {
      const whitelistEnabled = true;
      const maxStakeVoteMultiplier = 10;
      const maxStakeDuration = new BN(52 * 7 * 24 * 60 * 60); // 52 weeks in seconds
      const minStakeDuration = new BN(7 * 24 * 60 * 60); // 1 week in seconds
      const proposalActivationMinVotes = new BN(2000 * Math.pow(10, 6));

      const { createLockerInstruction, lockerPDA } = await sdk.createNewLocker(
        payer.publicKey,
        BASE_KEY.publicKey,
        SBR_MINT,
        TRIBECA_GOVERNOR_PDA,
        {
          whitelistEnabled,
          maxStakeVoteMultiplier,
          maxStakeDuration,
          minStakeDuration,
          proposalActivationMinVotes,
        }
      );

      LOCKER_PDA = lockerPDA;

      console.log('Locker PDA', LOCKER_PDA.toBase58());

      const transaction = new anchor.web3.Transaction();
      transaction.add(createLockerInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
        BASE_KEY,
      ]);

      console.log('Transaction sent and confirmed', tx);
    } catch (err) {
      console.error('Error creating locker', err);
      throw err;
    }
  });

  it('Creates a locker redeemer', async () => {
    try {
      const { address: treasuryTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          SBR_MINT,
          TREASURY_KEY.publicKey
        );

      const { createLockerRedeemerInstruction, redeemerPDA } =
        await sdk.createLockerRedeemer(
          payer.publicKey,
          LOCKER_PDA,
          USDC_MINT,
          new BN(REDEMPTION_RATE), // redemption rate multiplier -  1 USDC = 1000 veSBR
          CUTOFF_DATE,
          treasuryTokenAccount
        );

      const transaction = new anchor.web3.Transaction();
      transaction.add(createLockerRedeemerInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]);

      console.log('Transaction sent and confirmed', tx);

      REDEEMER_PDA = redeemerPDA;
      console.log('Redeemer PDA', REDEEMER_PDA.toBase58());
    } catch (err) {
      console.error('Error creating locker redeemer', err);
      throw err;
    }
  });

  it('Creates an escrow', async () => {
    try {
      const { createEscrowInstruction, escrowPDA } = await sdk.createNewEscrow(
        payer.publicKey,
        LOCKER_PDA,
        payer.publicKey
      );

      const transaction = new anchor.web3.Transaction();
      transaction.add(createEscrowInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]);

      ESCROW_PDA = escrowPDA;

      console.log('Transaction sent and confirmed', tx);
    } catch (err) {
      console.error('Error creating escrow', err);
      throw err;
    }
  });

  it('Locks tokens in escrow', async () => {
    try {
      const { address: sourceTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          SBR_MINT,
          payer.publicKey
        );

      const { address: escrowTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          SBR_MINT,
          ESCROW_PDA,
          true
        );

      const { lockTokensInstruction } = await sdk.lockTokens(
        payer.publicKey,
        LOCKER_PDA,
        ESCROW_PDA,
        escrowTokenAccount,
        sourceTokenAccount,
        new BN(1000 * Math.pow(10, 6)),
        new BN(60 * 60 * 24 * 7 * 52) // 52 weeks in seconds
      );

      const transaction = new anchor.web3.Transaction();
      transaction.add(lockTokensInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]);

      // get the voting power of the escrow
      const votingPower = await sdk.getVotingPower(ESCROW_PDA, LOCKER_PDA);

      console.log('Voting power', votingPower);

      expect(Math.round(votingPower)).to.be.greaterThan(0);

      console.log('Transaction sent and confirmed', tx);
    } catch (err) {
      console.error('Error locking tokens', err);
      throw err;
    }
  });

  it('Unlocks tokens from escrow', async () => {
    try {
      const { address: escrowTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          SBR_MINT,
          ESCROW_PDA,
          true
        );

      const { address: destinationTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          SBR_MINT,
          payer.publicKey
        );

      const { unlockTokensInstruction } = await sdk.exitEscrow(
        payer.publicKey,
        LOCKER_PDA,
        ESCROW_PDA,
        payer.publicKey,
        escrowTokenAccount,
        destinationTokenAccount,
        SBR_MINT
      );

      const transaction = new anchor.web3.Transaction();
      transaction.add(unlockTokensInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]).catch(err => {
        expect(err.message).to.include('Escrow has not ended');
      });

      console.log('Transaction sent and confirmed', tx);
    } catch (err) {
      console.error('Error unlocking tokens', err);
      throw err;
    }
  });

  it('Adds funds to locker redeemer', async () => {
    try {
      const { address: redeemerReceiptAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          USDC_MINT,
          REDEEMER_PDA,
          true
        );

      const { address: sourceTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          USDC_MINT,
          payer.publicKey
        );

      const { addFundsInstruction } = await sdk.addFunds(
        payer.publicKey,
        LOCKER_PDA,
        REDEEMER_PDA,
        redeemerReceiptAccount,
        sourceTokenAccount,
        new BN(10000 * Math.pow(10, 6))
      );

      const transaction = new anchor.web3.Transaction();
      transaction.add(addFundsInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]);

      console.log('Transaction sent and confirmed', tx);

      // get the redeemer account
      const redeemer =
        await sdk.tribecaProgram.account.lockerRedeemer.fetch(REDEEMER_PDA);
      console.log('Redeemer', redeemer.amount.toString());
    } catch (err) {
      console.error('Error adding funds to locker redeemer', err);
      throw err;
    }
  });

  it('Adds a blacklist entry', async () => {
    try {
      const { addBlacklistEntryInstruction } = await sdk.addBlacklistEntry(
        payer.publicKey,
        LOCKER_PDA,
        ESCROW_PDA,
        REDEEMER_PDA
      );

      const transaction = new anchor.web3.Transaction();
      transaction.add(addBlacklistEntryInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]);

      console.log('Transaction sent and confirmed', tx);
    } catch (err) {
      console.error('Error adding blacklist entry', err);
      throw err;
    }
  });

  it('Removes a blacklist entry', async () => {
    try {
      const { removeBlacklistEntryInstruction } =
        await sdk.removeBlacklistEntry(
          payer.publicKey,
          LOCKER_PDA,
          ESCROW_PDA,
          REDEEMER_PDA
        );

      const transaction = new anchor.web3.Transaction();
      transaction.add(removeBlacklistEntryInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]);

      console.log('Transaction sent and confirmed', tx);
    } catch (err) {
      console.error('Error removing blacklist entry', err);
      throw err;
    }
  });

  it('Instantly withdraws from locker', async () => {
    try {
      // the user's escrow token account SBR is being withdrawn from
      const { address: escrowTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          SBR_MINT,
          ESCROW_PDA,
          true
        );

      // the redeemer's token account USDC is being withdrawn from
      const { address: redeemerReceiptAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          USDC_MINT,
          REDEEMER_PDA,
          true
        );

      // the token account SBR is being deposited into
      const { address: treasuryTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          SBR_MINT,
          TREASURY_KEY.publicKey
        );

      // the user's token account USDC is being received with
      const { address: userReceipt } = await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        USDC_MINT,
        payer.publicKey
      );

      const { instantWithdrawInstruction, blacklistPDA } =
        await sdk.instantWithdraw(
          payer.publicKey,
          LOCKER_PDA,
          REDEEMER_PDA,
          USDC_MINT,
          redeemerReceiptAccount,
          ESCROW_PDA,
          escrowTokenAccount,
          treasuryTokenAccount,
          userReceipt
        );

      const transaction = new anchor.web3.Transaction();
      transaction.add(instantWithdrawInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]);

      console.log('Transaction sent and confirmed', tx);

      // get the escrow account
      const escrow = await sdk.tribecaProgram.account.escrow.fetch(ESCROW_PDA);
      console.log('Escrow', escrow);

      // get the redeemer account
      const redeemer =
        await sdk.tribecaProgram.account.lockerRedeemer.fetch(REDEEMER_PDA);
      console.log('Redeemer', redeemer.amount.toString());
    } catch (err) {
      console.error('Error instant withdrawing', err);
      throw err;
    }
  });

  // This will fail which is expected
  it('Attempts to instantly withdraw from locker again', async () => {
    try {
      const { address: escrowTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          SBR_MINT,
          ESCROW_PDA,
          true
        );

      const { address: redeemerReceiptAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          USDC_MINT,
          REDEEMER_PDA,
          true
        );

      const { address: treasuryTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          SBR_MINT,
          TREASURY_KEY.publicKey
        );

      const { address: userReceipt } = await getOrCreateAssociatedTokenAccount(
        connection,
        payer.payer,
        USDC_MINT,
        payer.publicKey
      );

      const { instantWithdrawInstruction, blacklistPDA } =
        await sdk.instantWithdraw(
          payer.publicKey,
          LOCKER_PDA,
          REDEEMER_PDA,
          USDC_MINT,
          redeemerReceiptAccount,
          ESCROW_PDA,
          escrowTokenAccount,
          treasuryTokenAccount,
          userReceipt
        );

      const transaction = new anchor.web3.Transaction();
      transaction.add(instantWithdrawInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]).catch(err => {
        expect(err.message).to.include('already in use');
      });
    } catch (err) {
      console.error('Error instant withdrawing', err);
      throw err;
    }
  });

  it('Removes all remaining funds from locker redeemer', async () => {
    try {
      const { address: redeemerReceiptAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          USDC_MINT,
          REDEEMER_PDA,
          true
        );

      const { address: destinationTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          USDC_MINT,
          payer.publicKey
        );

      const { removeAllFundsInstruction } = await sdk.removeAllFunds(
        payer.publicKey,
        LOCKER_PDA,
        REDEEMER_PDA,
        redeemerReceiptAccount,
        destinationTokenAccount
      );

      const transaction = new anchor.web3.Transaction();
      transaction.add(removeAllFundsInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]);

      console.log('Transaction sent and confirmed', tx);
    } catch (err) {
      console.error('Error removing all funds from locker redeemer', err);
      throw err;
    }
  });

  it('Updates the treasury of a locker redeemer', async () => {
    try {
      const randomKey = Keypair.generate();

      const { address: newTreasuryTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          SBR_MINT,
          randomKey.publicKey
        );

      const { updateTreasuryInstruction } = await sdk.updateTreasury(
        payer.publicKey,
        LOCKER_PDA,
        REDEEMER_PDA,
        newTreasuryTokenAccount
      );

      const transaction = new anchor.web3.Transaction();
      transaction.add(updateTreasuryInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]);

      console.log('Transaction sent and confirmed', tx);
    } catch (err) {
      console.error('Error updating treasury', err);
      throw err;
    }
  });

  it('Updates the redemption rate of a locker redeemer', async () => {
    try {
      const { updateRedemptionRateInstruction } =
        await sdk.updateRedemptionRate(
          payer.publicKey,
          LOCKER_PDA,
          REDEEMER_PDA,
          new BN(2000)
        );

      const transaction = new anchor.web3.Transaction();
      transaction.add(updateRedemptionRateInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]);

      console.log('Transaction sent and confirmed', tx);

      // get the redeemer account
      const redeemer =
        await sdk.tribecaProgram.account.lockerRedeemer.fetch(REDEEMER_PDA);
      console.log('Redeemer', redeemer.redemptionRate.toString());
    } catch (err) {
      console.error('Error updating redemption rate', err);
      throw err;
    }
  });

  it('Toggles the status of a locker redeemer', async () => {
    try {
      const { toggleRedeemerInstruction } = await sdk.toggleRedeemer(
        payer.publicKey,
        LOCKER_PDA,
        REDEEMER_PDA,
        1 // 0 = paused, 1 = active
      );

      const transaction = new anchor.web3.Transaction();
      transaction.add(toggleRedeemerInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]);

      console.log('Transaction sent and confirmed', tx);

      // get the redeemer account
      const redeemer =
        await sdk.tribecaProgram.account.lockerRedeemer.fetch(REDEEMER_PDA);
      console.log('Redeemer', redeemer.status);
    } catch (err) {
      console.error('Error toggling redeemer', err);
      throw err;
    }
  });

  const newAdmin = Keypair.generate();

  it('Updates the admin of a locker redeemer', async () => {
    try {
      const { updateRedeemerAdminInstruction } = await sdk.updateRedeemerAdmin(
        payer.publicKey,
        LOCKER_PDA,
        REDEEMER_PDA,
        newAdmin.publicKey
      );

      const transaction = new anchor.web3.Transaction();
      transaction.add(updateRedeemerAdminInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]);

      console.log('Transaction sent and confirmed', tx);

      // get the redeemer account
      const redeemer =
        await sdk.tribecaProgram.account.lockerRedeemer.fetch(REDEEMER_PDA);
      console.log('Redeemer', redeemer.pendingAdmin.toString());
    } catch (err) {
      console.error('Error updating redeemer admin', err);
      throw err;
    }
  });

  it('Accepts the pending admin of a locker redeemer', async () => {
    try {
      const { acceptRedeemerAdminInstruction } = await sdk.acceptRedeemerAdmin(
        newAdmin.publicKey,
        LOCKER_PDA,
        REDEEMER_PDA
      );

      const transaction = new anchor.web3.Transaction();
      transaction.add(acceptRedeemerAdminInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        newAdmin,
        payer.payer, // to pay for the transaction
      ]);

      console.log('Transaction sent and confirmed', tx);

      // get the redeemer account
      const redeemer =
        await sdk.tribecaProgram.account.lockerRedeemer.fetch(REDEEMER_PDA);
      console.log('Redeemer', redeemer.admin.toString());
    } catch (err) {
      console.error('Error accepting redeemer admin', err);
      throw err;
    }
  });
});
