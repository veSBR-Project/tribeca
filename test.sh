# airdrop on localnet
solana airdrop 100 67fMdDhsYkoGsPAxvzwqBJjdnofg3gRKCDRVk29GyX4B --url http://127.0.0.1:8899

solana program deploy ./target/deploy/locked_voter.so --keypair ./local-keypair.json
solana program deploy ./target/deploy/govern.so --keypair ./local-keypair.json

anchor test --skip-deploy --skip-build --skip-local-validator
