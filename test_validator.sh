if [ ! -f ./test_programs/tribeca1.so ]; then
solana program dump -u m GokivDYuQXPZCWRkwMhdH2h91KpDQXBEmpgBgs55bnpH ./test_programs/tribeca1.so
fi
if [ ! -f ./test_programs/tribeca2.so ]; then   
solana program dump -u m Govz1VyoyLD5BL6CSCxUJLVLsQHRwjfFj1prNsdNg5Jw ./test_programs/tribeca2.so
fi
if [ ! -f ./test_programs/tribeca3.so ]; then
solana program dump -u m LocktDzaV1W2Bm9DeZeiyz4J9zs4fRqNiYqQyracRXw ./test_programs/tribeca3.so
fi

solana-test-validator \
    --bpf-program GokivDYuQXPZCWRkwMhdH2h91KpDQXBEmpgBgs55bnpH ./test_programs/tribeca1.so \
    --bpf-program Govz1VyoyLD5BL6CSCxUJLVLsQHRwjfFj1prNsdNg5Jw ./test_programs/tribeca2.so \
    --bpf-program LocktDzaV1W2Bm9DeZeiyz4J9zs4fRqNiYqQyracRXw ./test_programs/tribeca3.so \
    --reset



