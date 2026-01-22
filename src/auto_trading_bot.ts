import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { Wallet } from '@ethersproject/wallet';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { BalanceChecker, BalanceInfo } from './balance_checker';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface PriceData {
    UP: number;
    DOWN: number;
}

interface Trade {
    tokenType: string;
    tokenId: string;
    buyOrderId: string;
    takeProfitOrderId: string;
    stopLossOrderId: string;
    buyPrice: number;
    targetPrice: number;
    stopPrice: number;
    amount: number;
    timestamp: Date;
    status: string;
}

interface TradeOpportunity {
    tokenType: string;
    tokenId: string;
    softwarePrice: number;
    polymarketPrice: number;
    difference: number;
    action: 'BUY' | 'SELL'; // Whether to buy (software thinks higher) or sell (software thinks lower)
}

class AutoTradingBot {
    private wallet: Wallet;
    private client: ClobClient;
    private balanceChecker: BalanceChecker;
    private tokenIdUp: string | null = null;
    private tokenIdDown: string | null = null;
    
    private softwarePrices: PriceData = { UP: 0, DOWN: 0 };
    private polymarketPrices: Map<string, number> = new Map();
    
    private activeTrades: Trade[] = [];
    private lastTradeTime: number = 0;
    private lastBalanceCheck: number = 0;
    private balanceCheckInterval: number = 60000;
    
    private priceThreshold: number;
    private stopLossAmount: number;
    private takeProfitAmount: number;
    private tradeCooldown: number;
    private tradeAmount: number;
    
    private softwareWs: WebSocket | null = null;
    private polymarketWs: WebSocket | null = null;
    private isRunning: boolean = false;

    constructor() {
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey || privateKey.length < 64) {
            console.error('❌ PRIVATE_KEY not found or invalid in environment variables');
            console.error('Please add your private key to the .env file:');
            console.error('PRIVATE_KEY=0xYourPrivateKeyHere');
            throw new Error('PRIVATE_KEY not found in .env');
        }

        this.wallet = new Wallet(privateKey);
        this.client = new ClobClient(
            process.env.CLOB_API_URL || 'https://clob.polymarket.com',
            137,
            this.wallet
        );
        this.balanceChecker = new BalanceChecker();

        this.priceThreshold = parseFloat(process.env.PRICE_DIFFERENCE_THRESHOLD || '0.015');
        this.stopLossAmount = parseFloat(process.env.STOP_LOSS_AMOUNT || '0.005');
        this.takeProfitAmount = parseFloat(process.env.TAKE_PROFIT_AMOUNT || '0.01');
        this.tradeCooldown = parseInt(process.env.TRADE_COOLDOWN || '30') * 1000;
        this.tradeAmount = parseFloat(process.env.DEFAULT_TRADE_AMOUNT || '5.0');
    }

    async start() {
        console.log('='.repeat(60));
        console.log('Starting Auto Trading Bot...');
        console.log('='.repeat(60));
        console.log(`Wallet: ${this.wallet.address}`);
        console.log(`Threshold: $${this.priceThreshold.toFixed(4)}`);
        console.log(`Take Profit: +$${this.takeProfitAmount.toFixed(4)}`);
        console.log(`Stop Loss: -$${this.stopLossAmount.toFixed(4)}`);
        console.log(`Trade Amount: $${this.tradeAmount.toFixed(2)}`);
        console.log(`Cooldown: ${this.tradeCooldown / 1000}s`);
        console.log('='.repeat(60));
        console.log('✅ RPC is valid');
        console.log('\n💰 Checking wallet balances...');
        const balances = await this.checkAndDisplayBalances();
        
        // Require minimum $500 USDC for trading
        const minimumBalance = 500.0;
        const check = this.balanceChecker.checkSufficientBalance(balances, minimumBalance, 0.05);
        console.log('\n📊 Balance Check (Minimum $500 required for trading):');
        check.warnings.forEach(w => console.log(`  ${w}`));
        
        if (!check.sufficient) {
            console.log('\n❌ Insufficient funds to start trading!');
            console.log('Please fund your wallet:');
            console.log(`  - USDC: At least $${minimumBalance.toFixed(2)}`);
            console.log(`  - MATIC: At least 0.05 for gas fees`);
            throw new Error('Insufficient balance');
        }
        
        console.log('\n✅ Balances sufficient!');
        
        await this.initializeMarket();
        
        console.log('\n📡 Connecting to data feeds...');
        await this.connectSoftwareWebSocket();
        await this.connectPolymarketWebSocket();
        
        console.log('⏳ Waiting for initial price data...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        this.isRunning = true;
        this.startMonitoring();
        
        console.log('\n✅ Bot started successfully!');
        console.log('🚀 Starting automatic trading immediately...\n');
        
        // Immediately start checking for trade opportunities
        this.startImmediateTrading();
    }

    private async checkAndDisplayBalances(): Promise<BalanceInfo> {
        const balances = await this.balanceChecker.checkBalances(this.wallet);
        this.balanceChecker.displayBalances(balances);
        return balances;
    }

    private async initializeMarket() {
        console.log('Finding current Bitcoin market...');
        
        const now = new Date();
        const month = now.toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const day = now.getDate();
        const hour = now.getHours();
        const timeStr = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
        const slug = `bitcoin-up-or-down-${month}-${day}-${timeStr}-et`;
        
        console.log(`Searching for market: ${slug}`);
        
        const response = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
        const data: any = await response.json();
        
        let market = null;
        if (Array.isArray(data) && data.length > 0) {
            market = data[0];
        } else if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            market = data.data[0];
        }
        
        if (!market) {
            console.log('Market not found by slug, searching active markets...');
            const activeResponse = await fetch('https://gamma-api.polymarket.com/markets?active=true&limit=50&closed=false');
            const activeData: any = await activeResponse.json();
            const markets = Array.isArray(activeData) ? activeData : (activeData.data || []);
            
            market = markets.find((m: any) => {
                const q = (m.question || '').toLowerCase();
                return (q.includes('bitcoin') || q.includes('btc')) && q.includes('up') && q.includes('down');
            });
            
            if (!market) {
                throw new Error('No active Bitcoin market found');
            }
        }

        let tokenIds = market.clobTokenIds || [];
        if (typeof tokenIds === 'string') {
            tokenIds = JSON.parse(tokenIds);
        }
        
        let outcomes = market.outcomes || [];
        if (typeof outcomes === 'string') {
            outcomes = JSON.parse(outcomes);
        }

        if (tokenIds.length < 2) {
            throw new Error('Market must have at least 2 tokens');
        }

        let upIndex = outcomes.findIndex((o: string) => o.toLowerCase().includes('up') || o.toLowerCase().includes('yes'));
        let downIndex = outcomes.findIndex((o: string) => o.toLowerCase().includes('down') || o.toLowerCase().includes('no'));

        if (upIndex === -1) upIndex = 0;
        if (downIndex === -1) downIndex = 1;

        this.tokenIdUp = String(tokenIds[upIndex]);
        this.tokenIdDown = String(tokenIds[downIndex]);

        console.log(`Market found: ${market.question}`);
        console.log(`UP Token: ${this.tokenIdUp.substring(0, 20)}...`);
        console.log(`DOWN Token: ${this.tokenIdDown.substring(0, 20)}...`);
    }

    private async connectSoftwareWebSocket() {
        const url = process.env.SOFTWARE_WS_URL || 'ws://45.130.166.119:5001';
        
        const connect = () => {
            if (!this.isRunning) return;
            
            this.softwareWs = new WebSocket(url);
            
            this.softwareWs.on('open', () => {
                console.log('✅ Software WebSocket connected');
            });

            this.softwareWs.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    const probUp = message.prob_up || 0;
                    const probDown = message.prob_down || 0;

                    this.softwarePrices.UP = probUp / 100.0;
                    this.softwarePrices.DOWN = probDown / 100.0;
                } catch (error) {
                }
            });

            this.softwareWs.on('error', (error) => {
                console.error('Software WebSocket error:', error.message);
            });

            this.softwareWs.on('close', () => {
                console.log('Software WebSocket closed');
                if (this.isRunning) {
                    console.log('Reconnecting in 5 seconds...');
                    setTimeout(connect, 5000);
                }
            });
        };
        
        connect();
    }

    private async connectPolymarketWebSocket() {
        const url = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
        
        const connect = () => {
            if (!this.isRunning) return;
            
            this.polymarketWs = new WebSocket(url);
            
            this.polymarketWs.on('open', () => {
                console.log('✅ Polymarket WebSocket connected');
                
                const subscribeMessage = {
                    action: 'subscribe',
                    subscriptions: [{
                        topic: 'clob_market',
                        type: '*',
                        filters: JSON.stringify([this.tokenIdUp, this.tokenIdDown])
                    }]
                };
                
                this.polymarketWs?.send(JSON.stringify(subscribeMessage));
            });

            this.polymarketWs.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.processPolymarketMessage(message);
                } catch (error) {
                }
            });

            this.polymarketWs.on('error', (error) => {
                console.error('Polymarket WebSocket error:', error.message);
            });

            this.polymarketWs.on('close', () => {
                console.log('Polymarket WebSocket closed');
                if (this.isRunning) {
                    console.log('Reconnecting in 5 seconds...');
                    setTimeout(connect, 5000);
                }
            });
        };
        
        connect();
    }

    private processPolymarketMessage(data: any) {
        try {
            const topic = data.topic;
            const payload = data.payload || {};

            if (topic === 'clob_market') {
                const assetId = payload.asset_id || '';
                
                if (payload.price) {
                    const price = parseFloat(payload.price);
                    if (price > 0) {
                        this.polymarketPrices.set(assetId, price);
                    }
                }

                const bids = payload.bids || [];
                const asks = payload.asks || [];
                if (bids.length > 0 && asks.length > 0) {
                    const bestBid = parseFloat(bids[0].price);
                    const bestAsk = parseFloat(asks[0].price);
                    const midPrice = (bestBid + bestAsk) / 2.0;
                    this.polymarketPrices.set(assetId, midPrice);
                }
            }
        } catch (error) {
        }
    }

    private startImmediateTrading() {
        // Start actively trading immediately
        const immediateTradingLoop = async () => {
            if (!this.isRunning) return;
            
            try {
                const opportunity = await this.checkTradeOpportunity();
                if (opportunity) {
                    console.log('\n' + '='.repeat(60));
                    console.log('🎯 TRADE OPPORTUNITY DETECTED!');
                    console.log('='.repeat(60));
                    console.log(`Token: ${opportunity.tokenType}`);
                    console.log(`Action: ${opportunity.action}`);
                    console.log(`Software Price: $${opportunity.softwarePrice.toFixed(4)}`);
                    console.log(`Polymarket Price: $${opportunity.polymarketPrice.toFixed(4)}`);
                    console.log(`Difference: $${Math.abs(opportunity.difference).toFixed(4)} (threshold: $${this.priceThreshold.toFixed(4)})`);
                    console.log(`Strategy: ${opportunity.action === 'BUY' ? 'Software thinks price should be HIGHER' : 'Software thinks price should be LOWER'}`);
                    console.log('='.repeat(60));
                    
                    await this.executeTrade(opportunity);
                }
            } catch (error: any) {
                console.error('Error in immediate trading loop:', error.message);
            }
            
            // Continue checking every second
            setTimeout(immediateTradingLoop, 1000);
        };
        
        // Start the loop immediately
        immediateTradingLoop();
    }

    private startMonitoring() {
        let lastLogTime = 0;
        const logInterval = 30000;
        
        setInterval(async () => {
            if (!this.isRunning) return;

            const now = Date.now();
            
            if (now - this.lastBalanceCheck >= this.balanceCheckInterval) {
                console.log('\n💰 Periodic balance check...');
                const balances = await this.checkAndDisplayBalances();
                // Check against minimum $500 requirement
                const minimumBalance = 500.0;
                const check = this.balanceChecker.checkSufficientBalance(balances, minimumBalance, 0.02);
                
                if (!check.sufficient) {
                    console.log('⚠️  WARNING: Low balance detected! Trading requires at least $500 USDC');
                    check.warnings.forEach(w => console.log(`  ${w}`));
                    console.log('⚠️  Bot will continue monitoring but may not execute trades until balance is sufficient.');
                }
                
                this.lastBalanceCheck = now;
                console.log('');
            }
            
            if (now - lastLogTime >= logInterval) {
                const upSoft = this.softwarePrices.UP.toFixed(4);
                const downSoft = this.softwarePrices.DOWN.toFixed(4);
                const upMarket = (this.polymarketPrices.get(this.tokenIdUp!) || 0).toFixed(4);
                const downMarket = (this.polymarketPrices.get(this.tokenIdDown!) || 0).toFixed(4);
                
                console.log(`[Monitor] Software: UP=$${upSoft} DOWN=$${downSoft} | Market: UP=$${upMarket} DOWN=$${downMarket}`);
                lastLogTime = now;
            }
        }, 1000);
    }

    private async checkTradeOpportunity(): Promise<TradeOpportunity | null> {
        const currentTime = Date.now();
        const remainingCooldown = this.tradeCooldown - (currentTime - this.lastTradeTime);

        if (remainingCooldown > 0) {
            return null;
        }

        // Check balance before trading - require minimum $500
        const balances = await this.balanceChecker.checkBalances(this.wallet);
        const minimumBalance = 500.0;
        if (balances.usdc < minimumBalance) {
            return null; // Skip trading if balance is below minimum
        }

        for (const tokenType of ['UP', 'DOWN']) {
            const softwarePrice = this.softwarePrices[tokenType as keyof PriceData];
            const tokenId = tokenType === 'UP' ? this.tokenIdUp : this.tokenIdDown;
            
            if (!tokenId) continue;

            const polyPrice = this.polymarketPrices.get(tokenId) || 0;
            
            if (softwarePrice <= 0 || polyPrice <= 0) continue;

            const diff = softwarePrice - polyPrice;
            const absDiff = Math.abs(diff);

            // Check for BUY opportunity: software thinks price should be HIGHER
            if (diff >= this.priceThreshold) {
                return {
                    tokenType,
                    tokenId,
                    softwarePrice,
                    polymarketPrice: polyPrice,
                    difference: diff,
                    action: 'BUY'
                };
            }
            
            // Check for SELL opportunity: software thinks price should be LOWER
            // Note: For selling, we need to have the token first, so this is a short opportunity
            // In Polymarket, we can sell tokens we don't own (short) if we have USDC
            if (diff <= -this.priceThreshold) {
                return {
                    tokenType,
                    tokenId,
                    softwarePrice,
                    polymarketPrice: polyPrice,
                    difference: diff,
                    action: 'SELL'
                };
            }
        }

        return null;
    }

    private async executeTrade(opportunity: TradeOpportunity) {
        console.log('\n📊 Executing trade...');
        this.lastTradeTime = Date.now();

        try {
            // Get current market price (ask for buy, bid for sell)
            const marketPrice = opportunity.action === 'BUY' 
                ? await this.client.getPrice(opportunity.tokenId, Side.BUY)
                : await this.client.getPrice(opportunity.tokenId, Side.SELL);
            
            if (!marketPrice) {
                throw new Error('Could not get market price');
            }

            const executionPrice = parseFloat(marketPrice);
            const shares = this.tradeAmount / executionPrice;

            // Use a smaller buffer (0.5% instead of 1%) for better fills
            const priceBuffer = opportunity.action === 'BUY' ? 1.005 : 0.995;
            const orderPrice = executionPrice * priceBuffer;

            console.log(`💰 ${opportunity.action === 'BUY' ? 'Buying' : 'Selling'} ${shares.toFixed(4)} shares`);
            console.log(`   Market Price: $${executionPrice.toFixed(4)}`);
            console.log(`   Order Price: $${orderPrice.toFixed(4)} (${opportunity.action === 'BUY' ? '+' : '-'}0.5% buffer)`);
            console.log(`⏳ Placing initial order...`);

            const initialOrderResult = await this.client.createAndPostOrder(
                {
                    tokenID: opportunity.tokenId,
                    price: orderPrice,
                    size: shares,
                    side: opportunity.action === 'BUY' ? Side.BUY : Side.SELL
                },
                { tickSize: '0.001', negRisk: false },
                OrderType.GTC
            );

            console.log(`✅ ${opportunity.action} order placed: ${initialOrderResult.orderID}`);

            // Wait and verify order status
            console.log(`⏳ Waiting 3 seconds and verifying order status...`);
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Check if order was filled
            let actualFillPrice = executionPrice;
            let filledShares = shares;
            try {
                const orderStatus = await this.client.getOrder(initialOrderResult.orderID);
                // If order is filled or partially filled, use actual fill price
                if (orderStatus && (orderStatus.status === 'FILLED' || orderStatus.status === 'PARTIALLY_FILLED')) {
                    // Try to get actual fill price from order status
                    if (orderStatus.avgFillPrice) {
                        actualFillPrice = parseFloat(orderStatus.avgFillPrice);
                    }
                    if (orderStatus.filledSize) {
                        filledShares = parseFloat(orderStatus.filledSize);
                    }
                    console.log(`✅ Order ${orderStatus.status.toLowerCase()}`);
                    console.log(`   Actual Fill Price: $${actualFillPrice.toFixed(4)}`);
                    console.log(`   Filled Shares: ${filledShares.toFixed(4)}`);
                } else {
                    console.log(`⚠️  Order still ${orderStatus?.status || 'PENDING'}, using market price for TP/SL`);
                }
            } catch (error) {
                console.log(`⚠️  Could not verify order status, using market price for TP/SL`);
            }

            // Calculate take profit and stop loss based on actual fill price
            let takeProfitPrice: number;
            let stopLossPrice: number;
            let takeProfitSide: Side;
            let stopLossSide: Side;

            if (opportunity.action === 'BUY') {
                // For BUY: TP is higher, SL is lower
                takeProfitPrice = Math.min(actualFillPrice + this.takeProfitAmount, 0.99);
                stopLossPrice = Math.max(actualFillPrice - this.stopLossAmount, 0.01);
                takeProfitSide = Side.SELL;
                stopLossSide = Side.SELL;
            } else {
                // For SELL: TP is lower (buy back cheaper), SL is higher (buy back more expensive)
                takeProfitPrice = Math.max(actualFillPrice - this.takeProfitAmount, 0.01);
                stopLossPrice = Math.min(actualFillPrice + this.stopLossAmount, 0.99);
                takeProfitSide = Side.BUY;
                stopLossSide = Side.BUY;
            }

            console.log(`⏳ Placing take profit and stop loss orders...`);

            const takeProfitResult = await this.client.createAndPostOrder(
                {
                    tokenID: opportunity.tokenId,
                    price: takeProfitPrice,
                    size: filledShares,
                    side: takeProfitSide
                },
                { tickSize: '0.001', negRisk: false },
                OrderType.GTC
            );

            const stopLossResult = await this.client.createAndPostOrder(
                {
                    tokenID: opportunity.tokenId,
                    price: stopLossPrice,
                    size: filledShares,
                    side: stopLossSide
                },
                { tickSize: '0.001', negRisk: false },
                OrderType.GTC
            );

            console.log(`✅ Take Profit order: ${takeProfitResult.orderID} @ $${takeProfitPrice.toFixed(4)}`);
            console.log(`✅ Stop Loss order: ${stopLossResult.orderID} @ $${stopLossPrice.toFixed(4)}`);

            const trade: Trade = {
                tokenType: opportunity.tokenType,
                tokenId: opportunity.tokenId,
                buyOrderId: initialOrderResult.orderID,
                takeProfitOrderId: takeProfitResult.orderID,
                stopLossOrderId: stopLossResult.orderID,
                buyPrice: actualFillPrice,
                targetPrice: takeProfitPrice,
                stopPrice: stopLossPrice,
                amount: this.tradeAmount,
                timestamp: new Date(),
                status: 'active'
            };

            this.activeTrades.push(trade);
            
            console.log('='.repeat(60));
            console.log('✅ TRADE EXECUTION COMPLETE!');
            console.log(`Action: ${opportunity.action}`);
            console.log(`Entry Price: $${actualFillPrice.toFixed(4)}`);
            console.log(`Take Profit: $${takeProfitPrice.toFixed(4)}`);
            console.log(`Stop Loss: $${stopLossPrice.toFixed(4)}`);
            console.log(`Total trades: ${this.activeTrades.length}`);
            console.log('='.repeat(60));
            console.log(`⏰ Next trade available in ${this.tradeCooldown / 1000} seconds\n`);

        } catch (error: any) {
            console.error('='.repeat(60));
            console.error('❌ TRADE EXECUTION FAILED!');
            console.error(`Error: ${error.message}`);
            console.error('='.repeat(60));
        }
    }

    stop() {
        this.isRunning = false;
        this.softwareWs?.close();
        this.polymarketWs?.close();
        console.log('Bot stopped');
    }
}

async function main() {
    const bot = new AutoTradingBot();
    
    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        bot.stop();
        process.exit(0);
    });

    await bot.start();
}

main().catch(console.error);

