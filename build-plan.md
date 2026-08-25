# Flap Random Trading Bot — Claude Code Build Specification

## 1. Project Objective

Build an experimental **BNB Testnet token trading bot** for testing automated buy/sell execution against:

* **Target chain:** BNB Smart Chain
* **Primary environment:** BNB Testnet
* **Primary DEX:** Flap — bonding-curve mechanism
* **Secondary/test executor:** PancakeSwap on BNB Testnet
* **Runtime:** Node.js + TypeScript
* **Blockchain library:** ethers.js v6

The bot is an experimental trading/execution harness. It must operate **only on BNB Testnet initially**.

Do not implement mainnet trading in this version.

The bot should:

1. Connect to BNB Testnet.
2. Load one or more configured wallets.
3. Monitor BNB/token balances.
4. Maintain a configurable gas reserve.
5. Randomly select BUY or SELL.
6. Randomly select trade amounts within configured limits.
7. Randomly wait between trades.
8. Check whether the selected action is actually possible.
9. Preview the trade before executing.
10. Apply configurable slippage protection.
11. Estimate gas before submitting.
12. Execute the transaction.
13. Wait for confirmation.
14. Log the complete trade lifecycle.
15. Recover gracefully from failed transactions.
16. Never intentionally spend the wallet's gas reserve.
17. Stop safely when wallet conditions make trading impossible.

---

# 2. IMPORTANT DEVELOPMENT RULES

Before writing implementation code:

1. Inspect the current Flap developer documentation.
2. Inspect the current Flap deployed contract addresses.
3. Inspect the current Flap bonding-curve trading interfaces.
4. Inspect the current PancakeSwap BNB Testnet deployment/interface.
5. Do not invent contract addresses or ABI signatures.
6. Prefer official Flap documentation and official PancakeSwap documentation.
7. If the documentation conflicts with assumptions in this specification, follow the current official documentation.
8. Keep all contract addresses configurable through environment variables.
9. Do not hardcode private keys.
10. Do not put private keys into source code.
11. Do not implement mainnet support yet.

---

# 3. Recommended Project Structure

Create:

```text
flap-random-trader/
├── src/
│   ├── index.ts
│   ├── config.ts
│   │
│   ├── chain/
│   │   ├── provider.ts
│   │   └── gas.ts
│   │
│   ├── wallets/
│   │   ├── walletManager.ts
│   │   └── walletState.ts
│   │
│   ├── flap/
│   │   ├── flapClient.ts
│   │   ├── flapPortal.ts
│   │   ├── buy.ts
│   │   ├── sell.ts
│   │   └── tokenState.ts
│   │
│   ├── pancake/
│   │   ├── pancakeClient.ts
│   │   ├── buy.ts
│   │   └── sell.ts
│   │
│   ├── strategy/
│   │   ├── randomStrategy.ts
│   │   ├── amountGenerator.ts
│   │   └── scheduler.ts
│   │
│   ├── execution/
│   │   ├── tradeExecutor.ts
│   │   ├── transactionManager.ts
│   │   └── retry.ts
│   │
│   ├── safety/
│   │   ├── balanceGuard.ts
│   │   ├── gasGuard.ts
│   │   ├── slippageGuard.ts
│   │   └── circuitBreaker.ts
│   │
│   └── utils/
│       ├── logger.ts
│       ├── formatting.ts
│       └── random.ts
│
├── abi/
│   ├── FlapPortal.json
│   └── PancakeRouter.json
│
├── scripts/
│   ├── check-wallet.ts
│   ├── inspect-token.ts
│   └── test-trade.ts
│
├── test/
│   ├── randomStrategy.test.ts
│   ├── balanceGuard.test.ts
│   ├── gasGuard.test.ts
│   └── amountGenerator.test.ts
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

# 4. Dependencies

Use:

```text
typescript
tsx
ethers
dotenv
pino
pino-pretty
```

Development dependencies:

```text
vitest
typescript
tsx
```

Use strict TypeScript.

Enable:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  }
}
```

---

# 5. Environment Configuration

Create `.env.example`.

Use variables similar to:

```env
NETWORK=bsc-testnet

RPC_URL=
CHAIN_ID=97

PRIVATE_KEY=

FLAP_PORTAL_ADDRESS=
FLAP_TOKEN_ADDRESS=

PANCAKE_ROUTER_ADDRESS=

TRADING_MODE=flap

MIN_DELAY_SECONDS=30
MAX_DELAY_SECONDS=300

MIN_BUY_BNB=0.001
MAX_BUY_BNB=0.01

MIN_SELL_PERCENT=10
MAX_SELL_PERCENT=40

BUY_WEIGHT=50
SELL_WEIGHT=50

SLIPPAGE_BPS=300

GAS_RESERVE_BNB=0.01
MIN_BNB_BALANCE=0.015

MAX_GAS_PRICE_GWEI=
MAX_GAS_COST_BNB=

MAX_TRADE_COUNT=0

DRY_RUN=true
```

`MAX_TRADE_COUNT=0` means unlimited.

`DRY_RUN=true` must be the safe default.

---

# 6. Network Configuration

Initially support only:

```text
BNB Testnet
Chain ID: 97
```

Create a provider using ethers v6.

Validate that:

```text
provider.getNetwork()
```

matches the configured chain ID.

If the chain is not BNB Testnet:

```text
FAIL CLOSED
```

Do not execute transactions.

---

# 7. Wallet Manager

Create a wallet manager responsible for:

* loading the configured wallet
* validating the address
* reading BNB balance
* reading token balance
* estimating gas
* signing transactions

Never print:

* private key
* mnemonic
* seed phrase

Logging the wallet public address is acceptable.

Example:

```text
Wallet: 0x1234...abcd
BNB Balance: 0.0812
Token Balance: 1542.83
```

---

# 8. Gas Management

This is one of the most important components.

The bot must NEVER use the entire BNB balance for trading.

Define:

```text
GAS_RESERVE_BNB
```

Example:

```text
wallet balance = 0.10 BNB
gas reserve    = 0.02 BNB

maximum trading allocation = 0.08 BNB
```

Before every BUY:

```text
walletBalance
-
gasReserve
-
estimatedGasCost
=
maximum spendable BNB
```

If the requested BUY exceeds that amount:

```text
reduce trade amount
```

or:

```text
skip trade
```

depending on configuration.

Never allow:

```text
remainingBalance < GAS_RESERVE_BNB
```

after a transaction.

---

# 9. Gas Bank / Automatic Gas Refill

Design the architecture so multiple wallets can eventually be supported.

Create a `GasManager` interface:

```ts
interface GasManager {
  getGasReserve(wallet: string): Promise<bigint>;
  hasEnoughGas(wallet: string, estimatedGas: bigint): Promise<boolean>;
  requestRefill(wallet: string, amount: bigint): Promise<void>;
}
```

For version 1:

```text
requestRefill()
```

may simply log:

```text
Wallet requires gas refill.
```

Do not automatically move funds between wallets unless explicitly enabled by configuration.

Create:

```env
AUTO_GAS_REFILL=false
GAS_BANK_PRIVATE_KEY=
```

but leave the feature disabled in v1.

---

# 10. Random Strategy

Create:

```ts
RandomStrategy
```

It must randomly determine:

### Action

```text
BUY
SELL
```

using:

```env
BUY_WEIGHT=50
SELL_WEIGHT=50
```

The weights should be configurable.

For example:

```text
BUY_WEIGHT=70
SELL_WEIGHT=30
```

means:

```text
~70% BUY
~30% SELL
```

Do not guarantee exact percentages.

---

# 11. Random Delay

After every completed cycle:

```text
delay = random(
    MIN_DELAY_SECONDS,
    MAX_DELAY_SECONDS
)
```

Do not use a fixed interval.

Example:

```text
Trade completed.

Next trade in:
143 seconds
```

The random generator should use an unbiased integer selection for the configured range.

---

# 12. Random BUY Amount

Generate a random amount between:

```env
MIN_BUY_BNB
MAX_BUY_BNB
```

Do not use floating-point arithmetic for blockchain amounts.

Convert values to `bigint`/wei using ethers utilities.

Example:

```text
MIN_BUY_BNB=0.001
MAX_BUY_BNB=0.010
```

Possible results:

```text
0.0021 BNB
0.0074 BNB
0.0038 BNB
```

The random amount must then be passed through the balance/gas guard.

---

# 13. Random SELL Amount

SELL must be based on the wallet's current token balance.

Example:

```env
MIN_SELL_PERCENT=10
MAX_SELL_PERCENT=40
```

If the wallet has:

```text
10,000 TOKEN
```

and random percentage is:

```text
27%
```

the bot sells:

```text
2,700 TOKEN
```

Never calculate token amounts using JavaScript floating-point numbers.

Use token decimals and bigint arithmetic.

---

# 14. Flap Integration

Create a dedicated Flap client.

The implementation must be based on the CURRENT official Flap developer documentation.

Do not assume the ABI.

Verify the current Portal contract and ABI before implementing.

The Flap integration should support:

```text
previewBuy
buy
previewSell
sell
```

Where available according to the current deployed contract/interface.

The bot should first determine the token's current bonding-curve state.

At minimum inspect:

```text
token status
token version
quote token
curve state
current price
reserve
circulating supply
DEX/migration state
```

If the token is not currently tradable through the bonding curve:

```text
SKIP
```

Do not blindly send a transaction.

---

# 15. Flap BUY Flow

Implement:

```text
1. Check BNB balance
2. Check gas reserve
3. Determine random BUY amount
4. Query token/curve state
5. Preview BUY
6. Calculate minimum acceptable output
7. Estimate gas
8. Check gas reserve again
9. Build transaction
10. Simulate/call where practical
11. Send transaction
12. Wait for receipt
13. Verify receipt.status
14. Log result
15. Update wallet state
```

Slippage:

```text
minAmountOut =
    expectedAmountOut *
    (10000 - slippageBps) /
    10000
```

Use bigint arithmetic.

---

# 16. Flap SELL Flow

Implement:

```text
1. Read token balance
2. Check token balance > 0
3. Generate random SELL percentage
4. Calculate token amount
5. Query curve state
6. Preview SELL
7. Calculate minimum BNB output
8. Estimate gas
9. Verify gas reserve
10. Build transaction
11. Simulate/call where practical
12. Send transaction
13. Wait for receipt
14. Verify receipt.status
15. Log result
```

Never attempt to sell:

```text
0 tokens
```

Never attempt to sell more than:

```text
wallet token balance
```

---

# 17. PancakeSwap Adapter

Create PancakeSwap as a separate execution adapter.

Do not mix PancakeSwap logic into the Flap implementation.

Interface:

```ts
interface DexAdapter {
  getTokenState(token: string): Promise<TokenState>;
  previewBuy(token: string, amountIn: bigint): Promise<TradeQuote>;
  previewSell(token: string, amountIn: bigint): Promise<TradeQuote>;
  buy(token: string, amountIn: bigint, options: TradeOptions): Promise<TransactionResponse>;
  sell(token: string, amountIn: bigint, options: TradeOptions): Promise<TransactionResponse>;
}
```

Then:

```text
FlapAdapter implements DexAdapter
PancakeAdapter implements DexAdapter
```

The strategy engine should not care which DEX is being used.

Select through:

```env
TRADING_MODE=flap
```

or:

```env
TRADING_MODE=pancake
```

---

# 18. Transaction Manager

Create a transaction manager that handles:

```text
send
wait
receipt
timeout
retry
logging
```

Every transaction should record:

```text
timestamp
wallet
chain
DEX
token
action
amountIn
expectedAmountOut
minimumAmountOut
gasLimit
gasPrice
txHash
status
error
```

Example log:

```text
2026-08-24 00:31:42
BUY
FLAP
Token: 0x1234...abcd
Amount: 0.0042 BNB
Expected: 381.42 TOKEN
Minimum: 370.00 TOKEN
Gas: 0.00018 BNB
TX: 0xabcd...
Status: SUCCESS
```

---

# 19. Retry Policy

Do not blindly retry failed blockchain transactions.

Classify failures:

### Retryable

Examples:

```text
RPC timeout
temporary provider error
rate limit
```

### Non-retryable

Examples:

```text
insufficient funds
slippage exceeded
token not tradable
contract revert
invalid token
```

For retryable errors:

```text
maximum 2-3 retries
exponential backoff
```

Never repeatedly submit the same transaction because of uncertainty about whether it was mined.

Check transaction state first.

---

# 20. Circuit Breaker

Create a safety circuit breaker.

Automatically pause trading when:

```text
3 consecutive failed transactions
```

or:

```text
wallet falls below gas reserve
```

or:

```text
RPC becomes unreliable
```

or:

```text
unexpected contract state
```

Example:

```text
[CIRCUIT BREAKER]

Trading paused.

Reason:
3 consecutive transaction failures.

Manual restart required.
```

---

# 21. Dry Run Mode

This is mandatory.

Default:

```env
DRY_RUN=true
```

In dry-run mode:

```text
DO NOT SEND TRANSACTIONS
```

Instead print:

```text
[DRY RUN]

Action: BUY
Amount: 0.0037 BNB

Preview:
Expected output: 421.32 TOKEN
Minimum output: 408.68 TOKEN

Estimated gas:
0.00017 BNB

Would execute:
YES
```

This mode should allow testing the entire decision pipeline without signing transactions.

---

# 22. CLI

Implement:

```bash
npm run dev
```

and:

```bash
npm run build
npm start
```

Add:

```bash
npm run wallet:check
npm run token:inspect
npm run trade:test
npm test
```

`wallet:check` should display:

```text
Network
Chain ID
Wallet address
BNB balance
Token address
Token balance
Gas reserve
Maximum spendable BNB
```

---

# 23. Startup Validation

Before trading begins:

```text
Validate environment
        ↓
Validate network
        ↓
Validate wallet
        ↓
Validate contract addresses
        ↓
Validate token
        ↓
Read token state
        ↓
Read balances
        ↓
Validate gas reserve
        ↓
Display configuration
        ↓
Require dry-run/test mode
        ↓
Start scheduler
```

If anything fails:

```text
STOP
```

Do not continue partially configured.

---

# 24. Example Startup Output

The application should produce something similar to:

```text
╔══════════════════════════════════════════╗
║       FLAP RANDOM TRADING BOT             ║
╠══════════════════════════════════════════╣
║ Network:        BNB Testnet               ║
║ Chain ID:       97                        ║
║ Mode:           FLAP                      ║
║ Dry Run:        TRUE                      ║
║ Wallet:         0x1234...abcd             ║
║ BNB Balance:    0.1842                    ║
║ Gas Reserve:    0.0200                    ║
║ Token:          0xabcd...1234             ║
╚══════════════════════════════════════════╝

Token status: TRADABLE

Scheduler started.

Next action in 83 seconds.
```

---

# 25. Trade Lifecycle

Every cycle should look conceptually like:

```text
WAIT
 ↓
RANDOM ACTION
 ↓
BALANCE CHECK
 ↓
TOKEN STATE CHECK
 ↓
GENERATE AMOUNT
 ↓
PREVIEW
 ↓
SLIPPAGE CHECK
 ↓
GAS ESTIMATION
 ↓
GAS RESERVE CHECK
 ↓
DRY RUN?
 ├── YES → LOG ONLY
 └── NO
       ↓
     SEND
       ↓
     WAIT
       ↓
     RECEIPT
       ↓
     VERIFY
       ↓
     LOG
       ↓
     WAIT AGAIN
```

---

# 26. Testing Requirements

Write unit tests for:

### Random strategy

Test:

```text
BUY/SELL selection
weight handling
delay range
amount range
```

### Amount generator

Test:

```text
BUY amount never below minimum
BUY amount never above maximum
SELL percentage stays within range
bigint calculations are correct
```

### Gas guard

Test:

```text
trade allowed when reserve remains
trade rejected when reserve would be violated
```

### Balance guard

Test:

```text
BUY rejected with insufficient BNB
SELL rejected with zero token balance
SELL never exceeds token balance
```

### Slippage

Test:

```text
expected output
minimum output
different slippage settings
```

### Circuit breaker

Test:

```text
three failures => paused
successful transaction resets failure count
```

---

# 27. Security Requirements

Never:

```text
commit .env
log private keys
log seed phrases
hardcode private keys
hardcode production credentials
```

`.gitignore` must contain:

```text
.env
.env.*
!.env.example
node_modules/
dist/
logs/
```

Also add validation that refuses to run if:

```text
PRIVATE_KEY
```

looks invalid.

---

# 28. Logging

Use structured logging with Pino.

Log levels:

```text
DEBUG
INFO
WARN
ERROR
```

Separate:

```text
logs/app.log
logs/trades.log
```

Trade logs should be machine-readable JSON.

---

# 29. Multi-Wallet Architecture

Do not implement sophisticated multi-wallet automation in the first milestone, but design for it.

The architecture should eventually support:

```text
wallets:
  - id: wallet-01
    privateKey: ...
  - id: wallet-02
    privateKey: ...
  - id: wallet-03
    privateKey: ...
```

However, v1 should operate with:

```text
ONE WALLET
```

This keeps debugging simple.

After the single-wallet testnet version works, add multi-wallet support.

---

# 30. Operational Limits

Implement global safety limits:

```env
MAX_TRADE_COUNT=20
MAX_DAILY_BNB_VOLUME=0.1
MAX_SINGLE_TRADE_BNB=0.01
```

For v1, enforce:

```text
MAX_TRADE_COUNT
MAX_SINGLE_TRADE_BNB
GAS_RESERVE_BNB
```

The bot should stop once the configured trade count is reached.

---

# 31. Do Not Implement Yet

Do NOT implement:

```text
mainnet trading
private-key generation
wallet farming
anti-detection mechanisms
fake volume generation
wash trading
front-running
MEV strategies
transaction obfuscation
anti-bot evasion
automatic wallet creation at scale
```

The initial objective is simply:

```text
SAFE TESTNET EXECUTION
```

---

# 32. Development Milestones

## Milestone 1 — Project Bootstrap

Implement:

```text
TypeScript
ethers
dotenv
logging
configuration
provider
wallet
```

Verify:

```bash
npm run wallet:check
```

works.

---

## Milestone 2 — Token Inspection

Implement:

```bash
npm run token:inspect
```

It should retrieve and display the current Flap token state.

Do not execute trades yet.

---

## Milestone 3 — Flap Preview

Implement:

```text
previewBuy()
previewSell()
```

No transactions.

Verify quotes against the Flap UI/API where possible.

---

## Milestone 4 — Dry-Run Strategy

Implement:

```text
random action
random amount
random delay
balance checks
gas checks
slippage calculations
```

Everything remains:

```env
DRY_RUN=true
```

---

## Milestone 5 — One Real Testnet Trade

Enable:

```env
DRY_RUN=false
```

Execute exactly:

```text
ONE BUY
```

Verify:

```text
transaction
receipt
token balance
gas usage
```

Then stop.

---

## Milestone 6 — One SELL

Execute:

```text
ONE BUY
↓
ONE SELL
```

Verify that the wallet returns approximately to its previous token state, accounting for:

```text
price movement
bonding curve
slippage
fees
gas
```

---

## Milestone 7 — Random Scheduler

Enable:

```text
multiple trades
random delays
random amounts
random BUY/SELL
```

Use a small maximum trade count.

Example:

```env
MAX_TRADE_COUNT=10
```

---

## Milestone 8 — PancakeSwap Adapter

After Flap execution is stable:

```text
PancakeAdapter
```

should be implemented behind the same `DexAdapter` interface.

---

## Milestone 9 — Multi-Wallet

Only after single-wallet execution is stable:

```text
wallet manager
wallet rotation
per-wallet gas reserve
per-wallet trading allocation
```

---

# 33. Claude Code Workflow

Do NOT attempt to build the entire project in one giant implementation.

Work sequentially.

For each milestone:

1. Inspect existing files.
2. Implement the smallest working component.
3. Run TypeScript compilation.
4. Run unit tests.
5. Run the relevant CLI command.
6. Fix errors.
7. Show the result.
8. Only then move to the next milestone.

After each milestone report:

```text
STATUS
------

Completed:
- ...

Tests:
- ...

Commands executed:
- ...

Problems:
- ...

Next milestone:
- ...
```

Do not silently skip failed tests.

---

# 34. First Claude Code Task

Start ONLY with Milestone 1.

Your first task is:

```text
Initialize the project.

Do not implement trading yet.

Create:
- package.json
- tsconfig.json
- .env.example
- .gitignore
- src/config.ts
- src/chain/provider.ts
- src/wallets/walletManager.ts
- src/utils/logger.ts
- src/index.ts

Install dependencies.

Implement BNB Testnet connection.

Implement wallet loading.

Implement wallet balance inspection.

Implement:

npm run wallet:check

The command must display:

- network
- chain ID
- wallet address
- BNB balance

It must refuse to continue if the network is not BNB Testnet.

Run TypeScript compilation and tests.

Do not implement BUY or SELL yet.

When finished, report exactly what was created, the commands run, and any errors encountered.
```

# 35. Definition of Done

The project is considered successful only when:

```text
[✓] BNB Testnet connection works
[✓] Wallet loads securely
[✓] Wallet balance is readable
[✓] Flap token state can be inspected
[✓] Flap BUY can be previewed
[✓] Flap SELL can be previewed
[✓] Random strategy works
[✓] Gas reserve is enforced
[✓] Slippage is enforced
[✓] Dry-run works
[✓] One real testnet BUY succeeds
[✓] One real testnet SELL succeeds
[✓] Random scheduler works
[✓] Failed transactions are handled
[✓] Circuit breaker works
[✓] Unit tests pass
[✓] PancakeSwap adapter works
```

Do not move to mainnet until the complete testnet lifecycle has been demonstrated successfully.
