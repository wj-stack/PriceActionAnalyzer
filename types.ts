

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

export enum PatternType {
  Reversal = 'Reversal',
  Trend = 'Trend',
  Range = 'Range'
}

export enum SignalDirection {
  Bullish = 'Bullish',
  Bearish = 'Bearish'
}

export interface DetectedPattern {
  index: number;
  candle: Candle;
  name: string;
  type: PatternType;
  direction: SignalDirection;
  description: string;
  priority: number; // Priority scale: 1 (Low) to 4 (Very High)
  strengthScore: { // Contextual strength of the signal (0-100)
    long: number;
    short: number;
  };
  isKeySignal?: boolean;
  anchorPoint?: TrendPoint;
  trendlineId?: string;
}

export type BacktestStrategy = 'STRUCTURAL' | 'SHORT_TERM';

export interface BacktestSettings {
    strategy: BacktestStrategy;
    htfTimeframe?: string; // High timeframe for short-term strategy
    initialCapital: number;
    commissionRate: number;
    leverage: number;
    positionSizePercent: number; // For fixed % position sizing
    minRiskReward: number;
    useAtrTrailingStop: boolean;
    useAtrPositionSizing: boolean;
    riskPerTradePercent: number; // For risk-based position sizing
    // Optional entry filters
    rsiPeriod?: number;
    rsiBullLevel?: number;
    rsiBearLevel?: number;
    useVolumeFilter?: boolean;
    volumeMaPeriod?: number;
    volumeThreshold?: number;
    // ATR settings for trailing stop or position sizing
    atrPeriod?: number;
    atrMultiplier?: number;
    // New EMA Trend Filter
    useEmaFilter?: boolean;
    emaFastPeriod?: number;
    emaSlowPeriod?: number;
    // New ADX Trend Strength Filter
    useAdxFilter?: boolean;
    adxPeriod?: number;
    adxThreshold?: number;
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

export interface MultiTimeframeData {
    timeframe: string;
    candles: Candle[];
    patterns: DetectedPattern[];
    isPrimary: boolean;
}

export type MarketType = 'SPOT' | 'FUTURES';
export type RiskAppetite = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AIDecision {
    decision: 'LONG' | 'SHORT' | 'WAIT';
    reasoning: string;
    entryPrice: string;
    stopLoss: number;
    takeProfitLevels: number[];
    confidenceScore: number;
    riskWarning: string;
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
export type TradeCloseReason = 'STOP_LOSS' | 'TAKE_PROFIT' | 'END_OF_DATA' | 'REVERSE_SIGNAL' | 'LIQUIDATION' | 'CANCELLED';
export interface MultiTimeframeAnalysis {
  timeframe: string;
  patterns: DetectedPattern[];
  trendlines: TrendLine[];
  trend: TrendDirection;
  rsi: {
    value: number | null;
    state: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  };
}


export interface TrendPoint {
  index: number;
  price: number;
  time: number;
}

export interface TrendLine {
  id: string;
  p1: TrendPoint;
  p2: TrendPoint;
  touches: TrendPoint[];
  type: 'UP' | 'DOWN';
  strength: number; // 1 to 5 scale based on touches and length
  slope: number;
  intercept: number;
  timeframe?: string;
  channelLine?: {
      intercept: number;
  };
}

export type TrendDirection = 'UPTREND' | 'DOWNTREND' | 'RANGE';

export interface PredictionResult {
  status: 'PLAN_TRADE' | 'SKIP_SIGNAL';
  reason: string;
  pattern?: DetectedPattern;
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

export interface IndicatorData {
    ema20?: (number | null)[];
    bb20?: (BBands | null)[];
    rsi14?: (number | null)[];
}