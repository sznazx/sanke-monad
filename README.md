# Secure Snake Game with Backend Rewards

## Setup

```bash
npm install
cp .env.example .env         # fill in values
node server.js               # starts on http://localhost:3000
```

### Required .env variables

| Key              | Purpose                               |
|------------------|---------------------------------------|
| TREASURY         | Address that receives the 0.15 MON fee|
| PAY_AMOUNT       | Entry fee (default 0.15)              |
| RPC_URL          | Monad testnet RPC URL                 |
| PRIVATE_KEY      | **Hot wallet** key that holds reward tokens |
| TOKEN_ADDRESSES  | JSON map of symbol → token address    |

## Claim Flow

1. Player clicks **Claim** → front‑end POSTs `/claim` with `{address, counts}`  
2. Server verifies & signs `transfer()` txs using `PRIVATE_KEY`  
3. Player sees tx hashes; counters reset to zero.