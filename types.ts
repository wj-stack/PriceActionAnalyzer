

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

// FIX: Add missing AlphaToken type to resolve an import error in TokenListModal.tsx
export interface AlphaToken {
  alphaId: string;
  symbol: string;
  name: string;
  chainId: string;
  chainIconUrl: string;
  contractAddress: string | null;
}

// FIX: Add missing types for authenticated Binance API responses.
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
// FIX: Add missing OpenPosition type for simulation panel.
export interface OpenPosition {
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  size: number;
}

// FIX: Add missing EquityDataPoint type for equity chart.
export interface EquityDataPoint {
  time: number;
  equity: number;
}

// FIX: Add missing types for patterns, signals, and backtesting.
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

export type TradeCloseReason = 'STOP_LOSS' | 'TAKE_PROFIT' | 'LIQUIDATION' | 'END_OF_DATA';

export interface TrendPoint {
    index: number;
    price: number;
    time: number;
}

export interface TrendLine {
    start: TrendPoint;
    end: TrendPoint;
    type: 'SUPPORT' | 'RESISTANCE';
}


export interface BuffZone {
    id: string;
    startPrice: number;
    endPrice: number;
    startTime: number;
    endTime: number;
    score: number;
    direction: SignalDirection;
}

export interface BacktestSettings {
    strategy: BacktestStrategy;
    initialCapital: number;
    commissionRate: number;
    leverage?: number;
    positionSizePercent?: number;
    minRiskReward?: number;
    rrMode?: 'simple' | 'dynamic';
    dynamicMinRiskReward?: { [key: number]: number };
    useAtrTrailingStop?: boolean;
    useAtrPositionSizing?: boolean;
    riskPerTradePercent?: number;
    rsiPeriod?: number;
    rsiBullLevel?: number;
    rsiBearLevel?: number;
    useVolumeFilter?: boolean;
    volumeMaPeriod?: number;
    volumeThreshold?: number;
    atrPeriod?: number;
    atrMultiplier?: number;
    useEmaFilter?: boolean;
    emaFastPeriod?: number;
    emaSlowPeriod?: number;
    useAdxFilter?: boolean;
    adxPeriod?: number;
    adxThreshold?: number;
    buffZoneScoreThreshold?: number;
    buffMACDWeight?: number;
    buffFibWeight?: number;
    buffSRWeight?: number;
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