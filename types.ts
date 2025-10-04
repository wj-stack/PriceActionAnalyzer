

export type BinanceKline = [
  number, // Kline open time
  string, // Open price
  string, // High price
  string, // Low price
  string, // Close price
  string, // Volume
  number, // Kline close time
  string, // Quote asset volume
  number, // Number of trades
  string, // Taker buy base asset volume
  string, // Taker buy quote asset volume
  string  // Unused
];

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isBullish: boolean;
  isClosed: boolean;
}

export interface AlphaToken {
  alphaId: string;
  symbol: string;
  name: string;
  chainId: string;
  chainIconUrl: string;
  contractAddress: string | null;
}

export interface AccountBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface AccountInfo {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  accountType: string;
  balances: AccountBalance[];
  permissions: string[];
}

export type OrderStatus = 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'PENDING_CANCEL' | 'REJECTED' | 'EXPIRED';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET' | 'STOP_LOSS' | 'STOP_LOSS_LIMIT' | 'TAKE_PROFIT' | 'TAKE_PROFIT_LIMIT' | 'LIMIT_MAKER';

export interface Order {
    symbol: string;
    orderId: number;
    orderListId: number;
    clientOrderId: string;
    price: string;
    origQty: string;
    executedQty: string;
    cummulativeQuoteQty: string;
    status: OrderStatus;
    timeInForce: string;
    type: OrderType;
    side: OrderSide;
    stopPrice: string;
    icebergQty: string;
    time: number;
    updateTime: number;
    isWorking: boolean;
    origQuoteOrderQty: string;
}

export interface PriceAlert {
  id: string;
  price: number;
}
export interface OpenPosition {
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  size: number;
}

export interface EquityDataPoint {
  time: number;
  equity: number;
}

export enum SignalDirection {
    Bullish = 'BULLISH',
    Bearish = 'BEARISH',
}

export enum PatternType {
    Reversal = 'REVERSAL',
    Trend = 'TREND',
    Range = 'RANGE',
    SMC = 'SMC', // Smart Money Concepts
}

export interface DetectedPattern {
    index: number;
    name: string;
    description: string;
    candle: Candle;
    direction: SignalDirection;
    priority: 1 | 2 | 3 | 4; // 1-low, 4-very high
    type: PatternType;
    strengthScore: {
        long: number;  // 0-100
        short: number; // 0-100
    };
    isKeySignal: boolean;
}

export type BacktestStrategy = 'STRUCTURAL' | 'SHORT_TERM' | 'MTF_BUFF';

export type TradeOpenReason = 'HTF_ZONE_RSI_OVERSOLD' | 'HTF_ZONE_RSI_OVERBOUGHT' | 'HTF_ZONE_SMC_IMBALANCE' | 'HTF_ZONE_CHOCH_REVERSAL' | 'HTF_ZONE_PINBAR';
export type TradeCloseReason = 'STOP_LOSS' | 'TAKE_PROFIT' | 'LIQUIDATION' | 'END_OF_DATA';

export interface TrendPoint {
    index: number;
    price: number;
    time: number;
}


export interface SwingPoint {
    price: number;
    time: number;
    type: 'high' | 'low';
    index: number;
}

export interface SRZone {
    startPrice: number;
    endPrice: number;
    type: 'support' | 'resistance';
    touches: number;
    score: number;
    scoreDetails?: {
        srScore: number;
        fibScore: number;
        macdScore: number;
    };
    confluence?: {
        hasFib?: boolean;
        fibLevel?: number;
        hasMacdDiv?: boolean;
        hasMacdZeroCross?: 'bullish' | 'bearish';
        isMacdExtreme?: 'overbought' | 'oversold';
    };
}

export interface BacktestSettings {
    strategy: BacktestStrategy;
    initialCapital: number;
    commissionRate: number;
    leverage: number;
    riskPerTradePercent: number;
    minRiskReward: number;
    followHtfTrend: boolean;
    allowRangeTrading: boolean;
    
    // Layer 1: HTF Zone Identification
    srWeight: number;
    macdWeight: number;
    fibWeight: number;
    zoneScoreThreshold: number;
    useMacdDivergence: boolean;
    
    // Layer 2: LTF Entry Engine
    useSMC: boolean;
    useCHOCH: boolean;
    usePinbar: boolean;
    
    // Shared Indicator Settings
    atrPeriod: number;
    atrMultiplier: number;
}

export interface PredictionResult {
    status: 'PLAN_TRADE' | 'SKIP_SIGNAL';
    reason: string;
    pattern: DetectedPattern | null;
    direction?: 'LONG' | 'SHORT';
    entryPrice?: number;
    slPrice?: number;
    tpPrice?: number;
    rr?: number;
    srZones?: SRZone[];
}

// Indicator types
export interface BBands {
    middle: number | null;
    upper: number | null;
    lower: number | null;
}

export interface MACDValue {
    macd: number | null;
    signal: number | null;
    histogram: number | null;
}

export interface IndicatorData {
    ema20?: (number | null)[];
    ema24?: (number | null)[];
    ema52?: (number | null)[];
    bb20?: (BBands | null)[];
    rsi14?: (number | null)[];
    macd?: (MACDValue | null)[];
}

export interface Imbalance {
    startPrice: number;
    endPrice: number;
    index: number;
}

// AI Analysis Types
export interface MultiTimeframeDataPoint {
  name: string;
  trend: 'Uptrend' | 'Downtrend' | 'Range';
  rsi: 'Overbought' | 'Oversold' | 'Neutral';
}

export interface MultiTimeframeData {
  timeframes: MultiTimeframeDataPoint[];
}

// Backtesting Types
export interface TradeLogEvent {
    type: 'ENTRY' | 'EXIT';
    direction: 'LONG' | 'SHORT';
    time: number;
    price: number;
    positionSize?: number; // Size in base asset (e.g., BTC)
    equity: number;
    reason?: string;
    profit?: number;
    profitPercent?: number;
    riskRewardRatio?: number;
    stopLoss?: number;
    takeProfit?: number;
    leverage?: number;
    liquidationPrice?: number;
    zoneScoreDetails?: {
        total: number;
        sr: number;
        fib: number;
        macd: number;
    };
}

export interface BacktestKPIs {
    netProfit: number;
    netProfitPercent: number;
    totalTrades: number;
    winRate: number;
    profitFactor: number | null;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    avgTradePnl: number;
    avgWin: number | null;
    avgLoss: number | null;
    expectancy: number;
}

export interface BacktestResult {
    kpis: BacktestKPIs;
    equityCurve: EquityDataPoint[];
    tradeLog: TradeLogEvent[];
    srZones: SRZone[];
}