import { Program } from '@coral-xyz/anchor-0-29.0.0';
import * as anchor from '@coral-xyz/anchor';

export const getProgram = (
  wallet: anchor.Wallet,
  idl: string,
  address: string
) => {
  try {
    const parsedIdl: any = JSON.parse(idl);

    const program: any = new Program(
      parsedIdl,
      new anchor.web3.PublicKey(address)
    );
    return program;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
