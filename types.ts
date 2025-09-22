
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
}

export type BacktestStrategy = 'SIGNAL_ONLY' | 'RSI_FILTER' | 'BOLLINGER_BANDS';

export interface BacktestSettings {
    initialCapital: number;
    commissionRate: number;
    stopLoss: number;
    takeProfit: number;
    strategy: BacktestStrategy;
    rsiPeriod?: number;
    rsiOversold?: number;
    rsiOverbought?: number;
    bbPeriod?: number;
    bbStdDev?: number;
    useVolumeFilter?: boolean;
    volumeMaPeriod?: number;
    volumeThreshold?: number;
}

export interface AlphaToken {
    alphaId: string;
    symbol: string;
    name: string;
    chainId: string;
    contractAddress: string;
    chainIconUrl: string;
    chainName: string;
    iconUrl:string;
}
