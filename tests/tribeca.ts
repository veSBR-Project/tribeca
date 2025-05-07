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

const BASE_KEY = Keypair.generate();

let SBR_MINT: anchor.web3.PublicKey;
let USDC_MINT: anchor.web3.PublicKey;

let REWARD_VAULT_SBR_PDA: anchor.web3.PublicKey;
let REWARD_VAULT_USDC_PDA: anchor.web3.PublicKey;

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

const { BN } = anchor.default;

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
        1000 * 10 ** 6
      );

      const mintUsdcIx = await mintTo(
        connection,
        payer.payer,
        USDC_MINT,
        usdcTokenAccount.address,
        payer.publicKey,
        1000 * 10 ** 6
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

      expect(Math.round(votingPower)).to.be.equal(10000);

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

  it('Creates a locker redeemer', async () => {
    try {
      const { createLockerRedeemerInstruction, redeemerPDA } =
        await sdk.createLockerRedeemer(
          payer.publicKey,
          LOCKER_PDA,
          USDC_MINT,
          10
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

      // source token account
      const { address: sourceTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          USDC_MINT,
          payer.publicKey
        );

      // redeemer token account
      const { address: redeemerTokenAccount } =
        await getOrCreateAssociatedTokenAccount(
          connection,
          payer.payer,
          USDC_MINT,
          REDEEMER_PDA,
          true
        );

      // transfer 1000 sbr to the redeemer
      const transferSbrIx = await transfer(
        connection,
        payer.payer,
        sourceTokenAccount,
        redeemerTokenAccount,
        payer.publicKey,
        100 * Math.pow(10, 6)
      );
    } catch (err) {
      console.error('Error creating locker redeemer', err);
      throw err;
    }
  });
});
