# Polymarket Trading Bot

A TypeScript-based trading bot for Polymarket with credential management, order execution, market analysis, and automated trading capabilities.

## Questions? Problems?

Hit me up: https://t.me/blategold

## ⚠️ Disclaimer

**This software is provided for educational and research purposes only. Trading cryptocurrencies and prediction markets involves substantial risk of loss. Use at your own risk. The authors are not responsible for any financial losses.**

## Features

- 🔐 **Credential Management**: Secure private key handling and API authentication
- 💰 **Allowance Control**: Manage USDC token allowances for trading
- 📊 **Market Analysis**: Real-time bid/ask spreads and price data
- 🎯 **Order Execution**: Place market and limit orders
- 🔍 **Market Discovery**: Auto-detect current Bitcoin markets
- 📈 **Price Tracking**: Get real-time price updates from order books
- 🤖 **Auto Trading Bot**: Automated trading with risk management

## Project Structure

```
polymarket-trading-bot/
├── src/
│   ├── main.ts                  # Interactive CLI trading interface
│   ├── auto_trading_bot.ts      # Automated trading bot
│   ├── _gen_credential.ts       # Credential management
│   ├── generate_credentials.ts  # Credential generation utility
│   ├── allowance.ts             # Token allowance management
│   ├── balance_checker.ts       # Wallet balance checking
│   ├── bid_asker.ts             # Bid/ask price fetching
│   ├── market_order.ts          # Order execution
│   └── market_finder.ts        # Market discovery
├── .env                         # Environment variables (create this)
├── .credentials.json            # Generated API credentials (auto-generated)
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── start-bot.ps1               # PowerShell startup script
└── start-bot.bat               # Batch startup script
```

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- A wallet with USDC on Polygon network
- MATIC for gas fees

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd polymarket-trading-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create `.env` file**
   Create a `.env` file in the root directory:
   ```env
   PRIVATE_KEY=your_private_key_here
   CLOB_API_URL=https://clob.polymarket.com
   POLYGON_CHAIN_ID=137
   
   # Auto Trading Parameters (optional)
   SOFTWARE_WS_URL=ws://your-oracle-server:5001
   PRICE_DIFFERENCE_THRESHOLD=0.015
   STOP_LOSS_AMOUNT=0.005
   TAKE_PROFIT_AMOUNT=0.01
   DEFAULT_TRADE_AMOUNT=5.0
   TRADE_COOLDOWN=30
   ```

   **⚠️ Security Warning**: Never commit your `.env` file or share your private key!

4. **Generate API credentials**
   ```bash
   npm run gen-creds
   ```
   This will create `.credentials.json` with your Polymarket API credentials.

## Usage

### Generate CLOB Credentials (First Time Setup)

```bash
npm run gen-creds
```

### Run Auto Trading Bot

```bash
npm run auto-trade
```

### Run Manual Interactive Bot

```bash
npm run dev
```

### Individual Scripts

```bash
# Check credentials
npm run credentials

# Check allowance
npm run allowance

# Check balance
npm run check-balance

# Find current Bitcoin market
npm run market

# Get bid/ask prices (requires token ID as argument)
npm run bid-ask <token_id>

# Place orders (interactive)
npm run order
```

### Build for Production

```bash
# Compile TypeScript
npm run build

# Run compiled version
npm start
```

## Auto Trading Bot Logic

The automated bot implements a price arbitrage strategy:

1. **Price Monitoring**: Compares oracle prices with Polymarket market prices
2. **Opportunity Detection**: Triggers trade when price difference exceeds threshold
3. **Three-Order Execution**:
   - Market Buy: Buys tokens at current price
   - Take Profit Limit Sell: Sells when price rises
   - Stop Loss Limit Sell: Sells when price falls
4. **Risk Management**: Configurable stop loss and take profit levels

### Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| PRICE_DIFFERENCE_THRESHOLD | 0.015 | Minimum price difference to trigger trade |
| TAKE_PROFIT_AMOUNT | 0.01 | Profit target above buy price |
| STOP_LOSS_AMOUNT | 0.005 | Maximum loss below buy price |
| DEFAULT_TRADE_AMOUNT | 5.0 | USDC amount per trade |
| TRADE_COOLDOWN | 30 | Seconds between trades |

## Modules

### 1. Credential Generator (`_gen_credential.ts`)

Manages wallet credentials and API authentication.

```typescript
import { CredentialGenerator } from './_gen_credential';

const generator = new CredentialGenerator();
generator.displayInfo();
```

### 2. Allowance Manager (`allowance.ts`)

Control USDC token allowances for trading.

```typescript
import { AllowanceManager } from './allowance';

const manager = new AllowanceManager();
await manager.checkAllowance();
await manager.setAllowance('1000'); // Set 1000 USDC allowance
```

### 3. Bid/Ask Pricer (`bid_asker.ts`)

Get real-time order book data.

```typescript
import { BidAsker } from './bid_asker';

const bidAsker = new BidAsker();
const data = await bidAsker.getPriceData(tokenId);
console.log(data.bidAsk.midpoint);
```

### 4. Market Order Executor (`market_order.ts`)

Place and manage orders.

```typescript
import { MarketOrderExecutor } from './market_order';

const executor = new MarketOrderExecutor();
await executor.placeMarketOrder({
    tokenId: 'TOKEN_ID',
    side: 'BUY',
    amount: 10 // 10 USDC
});
```

### 5. Market Finder (`market_finder.ts`)

Auto-detect and search for markets.

```typescript
import { MarketFinder } from './market_finder';

const finder = new MarketFinder();
const market = await finder.findCurrentBitcoinMarket();
console.log(market.tokens); // UP and DOWN tokens
```

### 6. Balance Checker (`balance_checker.ts`)

Check wallet balances for USDC and MATIC.

```typescript
import { BalanceChecker } from './balance_checker';

const checker = new BalanceChecker();
const balances = await checker.checkBalances(wallet);
checker.displayBalances(balances);
```

## Safety Features

- ✅ Confirmation prompts before placing orders
- ✅ Price validation and sanity checks
- ✅ Automatic market price buffers
- ✅ Private key never exposed in logs
- ✅ Error handling and recovery
- ✅ Balance checks before trading

## Security Notes

⚠️ **IMPORTANT:**
- Never commit your `.env` file to version control
- Keep your private key secure and never share it
- Test with small amounts first
- Review all transactions before confirming
- The `.credentials.json` file is also sensitive - keep it secure

## Dependencies

- `@polymarket/clob-client` - Official Polymarket CLOB client
- `ethers` - Ethereum wallet and cryptography
- `axios` - HTTP requests
- `dotenv` - Environment variable management
- `ws` - WebSocket client
- `typescript` - Type safety and modern JavaScript

## Development

```bash
# Watch mode (auto-reload)
npm run dev

# Type checking
npx tsc --noEmit

# Build
npm run build
```

## Troubleshooting

### Common Issues

1. **"PRIVATE_KEY not found"**
   - Ensure your `.env` file exists and contains `PRIVATE_KEY=0x...`

2. **"No active Bitcoin market found"**
   - Markets open at the top of each hour. Wait a few minutes if it's just past the hour.

3. **"Insufficient balance"**
   - Ensure you have USDC on Polygon network (not Ethereum mainnet)
   - Ensure you have MATIC for gas fees

4. **WebSocket connection issues**
   - Check your internet connection
   - Verify the WebSocket URL in your `.env` file
   - Check firewall settings

## License

ISC

## Support

For issues or questions:
- [Polymarket Documentation](https://docs.polymarket.com)
- [CLOB API Documentation](https://docs.polymarket.com/#clob-api)

---

**Disclaimer**: Use at your own risk. This software is provided as-is without warranties. Always test with small amounts first. Trading involves risk of loss.
