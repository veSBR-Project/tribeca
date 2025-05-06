# Dump the relevant program states from mainnet/devnet so we can test locally
solana program dump -u m GokivDYuQXPZCWRkwMhdH2h91KpDQXBEmpgBgs55bnpH ~/tribeca1.so
solana program dump -u m Govz1VyoyLD5BL6CSCxUJLVLsQHRwjfFj1prNsdNg5Jw ~/tribeca2.so
solana program dump -u m LocktDzaV1W2Bm9DeZeiyz4J9zs4fRqNiYqQyracRXw ~/tribeca3.so

anchor build
anchor deploy
# anchor deploy --program-name saber-lock --program-keypair ./test-keypair.json
anchor test --skip-build --skip-deploy --skip-local-validator

