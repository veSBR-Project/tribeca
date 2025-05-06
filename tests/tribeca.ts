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

const goki_idl = require('./goki_idl.json');
const govern_idl = require('./govern_idl.json');
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

const { BN } = anchor.default;

describe('tribeca test', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payer = provider.wallet as anchor.Wallet;
  const connection = new Connection(RPC_URL, 'confirmed');

  const program = getProgram(
    payer,
    JSON.stringify(locked_voter_idl),
    LOCKED_V_PROGRAM
  );
  const goki_program = getProgram(
    payer,
    JSON.stringify(goki_idl),
    GOKI_PROGRAM
  );
  const governor_program = getProgram(
    payer,
    JSON.stringify(govern_idl),
    GOVERNOR_PROGRAM
  );

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

      [REWARD_VAULT_SBR_PDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('reward_vault'), SBR_MINT.toBuffer()],
        program.programId
      );

      [REWARD_VAULT_USDC_PDA] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('reward_vault'), USDC_MINT.toBuffer()],
        program.programId
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
      // [GOKI_SMART_WALLET_PDA, GOKI_SMART_WALLET_BUMP] =
      //   anchor.web3.PublicKey.findProgramAddressSync(
      //     [Buffer.from('GokiSmartWallet'), BASE_KEY.publicKey.toBuffer()],
      //     new anchor.web3.PublicKey(GOKI_PROGRAM)
      //   );

      // [TRIBECA_GOVERNOR_PDA, TRIBECA_GOVERNOR_BUMP] =
      //   anchor.web3.PublicKey.findProgramAddressSync(
      //     [Buffer.from('TribecaGovernor'), BASE_KEY.publicKey.toBuffer()],
      //     new anchor.web3.PublicKey(GOVERNOR_PROGRAM)
      //   );

      // console.log('Goki Smart Wallet PDA', GOKI_SMART_WALLET_PDA.toBase58());
      // console.log('Tribeca Governor PDA', TRIBECA_GOVERNOR_PDA.toBase58());
      // console.log('\n');

      const maxOwners = 5;
      const owners = [payer.publicKey, TRIBECA_GOVERNOR_PDA];
      const threshold = new BN(1);
      const minimumDelay = new BN(0);

      const electorate = payer.publicKey;
      const votingDelay = new BN(0);
      const votingPeriod = new BN(0);
      const quorumVotes = new BN(10);
      const timelockDelaySeconds = new BN(0);

      const { createSmartWalletInstruction, createGovernorInstruction } =
        await sdk.createSmartWalletAndGovernor(payer, BASE_KEY.publicKey, {
          maxOwners,
          threshold,
          minimumDelay,
          electorate,
          votingDelay,
          votingPeriod,
          quorumVotes,
          timelockDelaySeconds,
        });

      const transaction = new anchor.web3.Transaction();
      transaction.add(createSmartWalletInstruction, createGovernorInstruction);
      transaction.feePayer = payer.publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;

      const tx = await sendAndConfirmTransaction(connection, transaction, [
        payer.payer,
      ]);

      console.log('Transaction sent and confirmed', tx);

      return;

      // const createSmartWalletInstruction = await goki_program.methods
      //   .createSmartWallet(
      //     GOKI_SMART_WALLET_BUMP,
      //     maxOwners,
      //     owners,
      //     threshold,
      //     minimumDelay
      //   )
      //   .accounts({
      //     base: BASE_KEY.publicKey,
      //     gokiProgram: new anchor.web3.PublicKey(GOKI_PROGRAM),
      //     smartWallet: GOKI_SMART_WALLET_PDA,
      //     payer: payer.publicKey,
      //     systemProgram: anchor.web3.SystemProgram.programId,
      //   })
      //   .instruction();

      // const electorate = payer.publicKey;
      // const votingDelay = new BN(0);
      // const votingPeriod = new BN(0);
      // const quorumVotes = new BN(10);
      // const timelockDelaySeconds = new BN(0);

      // const createGovernorInstruction = await governor_program.methods
      //   .createGovernor(TRIBECA_GOVERNOR_BUMP, electorate, {
      //     voting_delay: votingDelay,
      //     voting_period: votingPeriod,
      //     quorum_votes: quorumVotes,
      //     timelock_delay_seconds: timelockDelaySeconds,
      //   })
      //   .accounts({
      //     base: BASE_KEY.publicKey,
      //     governor: TRIBECA_GOVERNOR_PDA,
      //     governorProgram: new anchor.web3.PublicKey(GOVERNOR_PROGRAM),
      //     smartWallet: GOKI_SMART_WALLET_PDA,
      //     payer: payer.publicKey,
      //     systemProgram: anchor.web3.SystemProgram.programId,
      //   })
      //   .instruction();

      // const transaction = new anchor.web3.Transaction().add(
      //   createSmartWalletInstruction,
      //   createGovernorInstruction
      // );

      // const tx = await sendAndConfirmTransaction(connection, transaction, [
      //   payer.payer,
      //   BASE_KEY,
      // ]);

      // console.log('Transaction sent and confirmed', tx);
    } catch (err) {
      console.error('Error creating smart wallet and governor', err);
      throw err;
    }
  });
});
