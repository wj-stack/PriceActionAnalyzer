
import type { DetectedPattern, Candle, BacktestSettings } from '../types';
import { SignalDirection } from '../types';

export interface EquityPoint {
    time: number;
    capital: number;
}

export type TradeCloseReason = 'STOP_LOSS' | 'TAKE_PROFIT' | 'END_OF_DATA';

export type TradeLogEvent =
  | { type: 'START'; time: number; capital: number }
  | { type: 'ENTER_LONG'; time: number; price: number; signal: string }
  | { type: 'ENTER_SHORT'; time: number; price: number; signal: string }
  | { type: 'CLOSE_LONG'; time: number; price: number; grossPnl: number; commission: number; netPnl: number; reason: TradeCloseReason; }
  | { type: 'CLOSE_SHORT'; time: number; price: number; grossPnl: number; commission: number; netPnl: number; reason: TradeCloseReason; }
  | { type: 'FINISH'; time: number };


export interface BacktestResult {
    finalCapital: number;
    pnl: number;
    pnlPercentage: number;
    totalTrades: number;
    winRate: number;
    tradeLog: TradeLogEvent[];
    equityCurve: EquityPoint[];
    settings: BacktestSettings;
}


// --- Indicator Calculation Helpers ---

const calculateSMA = (values: number[], period: number): (number | null)[] => {
    const sma: (number | null)[] = new Array(values.length).fill(null);
    if (values.length < period) return sma;

    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += values[i];
    }
    sma[period - 1] = sum / period;

    for (let i = period; i < values.length; i++) {
        sum = sum - values[i - period] + values[i];
        sma[i] = sum / period;
    }
    return sma;
};

const calculateRSI = (candles: Candle[], period: number): (number | null)[] => {
    const rsi: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period + 1) return rsi;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const change = candles[i].close - candles[i - 1].close;
        if (change > 0) {
            gains += change;
        } else {
            losses -= change;
        }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    if (avgLoss === 0) {
        rsi[period] = 100;
    } else {
        const rs = avgGain / avgLoss;
        rsi[period] = 100 - (100 / (1 + rs));
    }

    for (let i = period + 1; i < candles.length; i++) {
        const change = candles[i].close - candles[i - 1].close;
        let gain = 0;
        let loss = 0;
        if (change > 0) {
            gain = change;
        } else {
            loss = -change;
        }
        
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        
        if (avgLoss === 0) {
            rsi[i] = 100;
        } else {
            const rs = avgGain / avgLoss;
            rsi[i] = 100 - (100 / (1 + rs));
        }
    }
    return rsi;
};

interface BBands {
    middle: number;
    upper: number;
    lower: number;
}

const calculateBollingerBands = (candles: Candle[], period: number, stdDev: number): (BBands | null)[] => {
    const bands: (BBands | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period) return bands;

    for (let i = period - 1; i < candles.length; i++) {
        const slice = candles.slice(i - period + 1, i + 1);
        const sma = slice.reduce((sum, candle) => sum + candle.close, 0) / period;
        
        const variance = slice.reduce((sum, candle) => sum + Math.pow(candle.close - sma, 2), 0) / period;
        const deviation = Math.sqrt(variance);
        
        bands[i] = {
            middle: sma,
            upper: sma + deviation * stdDev,
            lower: sma - deviation * stdDev,
        };
    }
    return bands;
};


/**
 * Runs a backtest strategy with configurable strategies, Stop Loss and Take Profit.
 */
export const runBacktest = (
    candles: Candle[],
    patterns: DetectedPattern[],
    settings: BacktestSettings,
    t: (key: string) => string
): BacktestResult => {
    const { 
        initialCapital, commissionRate, stopLoss: stopLossPercent, takeProfit: takeProfitPercent, 
        strategy, rsiPeriod = 14, rsiOversold = 30, rsiOverbought = 70, 
        bbPeriod = 20, bbStdDev = 2,
        useVolumeFilter = false, volumeMaPeriod = 20, volumeThreshold = 1.5
    } = settings;

    const startTime = candles.length > 0 ? candles[0].time - 1 : Date.now() / 1000;
    const equityCurve: EquityPoint[] = [{ time: startTime, capital: initialCapital }];
    const log: TradeLogEvent[] = [{ type: 'START', time: startTime, capital: initialCapital }];
    
    if (candles.length === 0 || patterns.length === 0) {
        return {
            finalCapital: initialCapital, pnl: 0, pnlPercentage: 0, totalTrades: 0, winRate: 0,
            tradeLog: [ ...log, { type: 'FINISH', time: Date.now() / 1000 }],
            equityCurve, settings
        };
    }

    // Pre-calculate indicators
    const rsiValues = strategy === 'RSI_FILTER' ? calculateRSI(candles, rsiPeriod) : [];
    const bbValues = strategy === 'BOLLINGER_BANDS' ? calculateBollingerBands(candles, bbPeriod, bbStdDev) : [];
    const volumeMA = useVolumeFilter ? calculateSMA(candles.map(c => c.volume), volumeMaPeriod) : [];

    let capital = initialCapital;
    let position: 'LONG' | 'SHORT' | null = null;
    let entryPrice = 0;
    let positionSize = 0;
    let slPrice = 0;
    let tpPrice = 0;
    let winningTrades = 0;
    let totalTrades = 0;
    
    const patternMap = new Map(patterns.map(p => [p.index, p]));

    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];

        // 1. Check for and process exits (SL/TP)
        if (position !== null) {
            let exitPrice: number | null = null;
            let reason: TradeCloseReason | null = null;

            if (position === 'LONG') {
                if (stopLossPercent > 0 && candle.low <= slPrice) {
                    exitPrice = candle.open <= slPrice ? candle.open : slPrice;
                    reason = 'STOP_LOSS';
                } else if (takeProfitPercent > 0 && candle.high >= tpPrice) {
                    exitPrice = tpPrice;
                    reason = 'TAKE_PROFIT';
                }
            } else { // SHORT
                if (stopLossPercent > 0 && candle.high >= slPrice) {
                    exitPrice = candle.open >= slPrice ? candle.open : slPrice;
                    reason = 'STOP_LOSS';
                } else if (takeProfitPercent > 0 && candle.low <= tpPrice) {
                    exitPrice = tpPrice;
                    reason = 'TAKE_PROFIT';
                }
            }

            if (exitPrice !== null && reason !== null) {
                let grossPnl = 0;
                if (position === 'LONG') {
                    grossPnl = (exitPrice - entryPrice) * positionSize;
                } else { // SHORT
                    grossPnl = (entryPrice - exitPrice) * positionSize;
                }
                const commission = (entryPrice * positionSize + exitPrice * positionSize) * commissionRate;
                const netPnl = grossPnl - commission;
                capital += netPnl;
                totalTrades++;
                if (netPnl > 0) winningTrades++;
                
                const closeLog: TradeLogEvent = position === 'LONG' 
                  ? { type: 'CLOSE_LONG', time: candle.time, price: exitPrice, grossPnl, commission, netPnl, reason }
                  : { type: 'CLOSE_SHORT', time: candle.time, price: exitPrice, grossPnl, commission, netPnl, reason };
                log.push(closeLog);
                equityCurve.push({ time: candle.time, capital });

                position = null;
                entryPrice = 0;
                positionSize = 0;
                slPrice = 0;
                tpPrice = 0;
            }
        }

        // 2. Check for entries (only if flat)
        if (position === null) {
            const pattern = patternMap.get(i);
            if (pattern) {
                let entryConditionMet = false;

                // 1. Check volume filter first if it's enabled
                if (useVolumeFilter) {
                    const avgVolume = volumeMA[i];
                    if (avgVolume === null || candle.volume <= avgVolume * volumeThreshold) {
                        continue; // Volume condition not met, skip to next candle
                    }
                }

                // 2. If volume is ok (or filter is off), check strategy
                switch (strategy) {
                    case 'SIGNAL_ONLY':
                        entryConditionMet = true;
                        break;
                    case 'RSI_FILTER':
                        const rsi = rsiValues[i];
                        if (rsi !== null) {
                            if (pattern.direction === SignalDirection.Bullish && rsi <= rsiOversold) {
                                entryConditionMet = true;
                            } else if (pattern.direction === SignalDirection.Bearish && rsi >= rsiOverbought) {
                                entryConditionMet = true;
                            }
                        }
                        break;
                    case 'BOLLINGER_BANDS':
                         const bands = bbValues[i];
                         if (bands !== null) {
                            if (pattern.direction === SignalDirection.Bullish && candle.low <= bands.lower) {
                                entryConditionMet = true;
                            } else if (pattern.direction === SignalDirection.Bearish && candle.high >= bands.upper) {
                                entryConditionMet = true;
                            }
                         }
                        break;
                }


                if (entryConditionMet) {
                    entryPrice = candle.close;
                    positionSize = capital / entryPrice; // Use full capital for position size
                    const signalName = t(pattern.name);
                    if (pattern.direction === SignalDirection.Bullish) {
                        position = 'LONG';
                        slPrice = entryPrice * (1 - stopLossPercent / 100);
                        tpPrice = entryPrice * (1 + takeProfitPercent / 100);
                        log.push({ type: 'ENTER_LONG', time: candle.time, price: entryPrice, signal: signalName });
                    } else { // Bearish
                        position = 'SHORT';
                        slPrice = entryPrice * (1 + stopLossPercent / 100);
                        tpPrice = entryPrice * (1 - takeProfitPercent / 100);
                        log.push({ type: 'ENTER_SHORT', time: candle.time, price: entryPrice, signal: signalName });
                    }
                }
            }
        }
    }
    
    // 3. Close any open position at the end of data
    if (position !== null) {
        const lastPrice = candles[candles.length-1].close;
        let grossPnl = 0;
        if(position === 'LONG') {
            grossPnl = (lastPrice - entryPrice) * positionSize;
        } else { // SHORT
            grossPnl = (entryPrice - lastPrice) * positionSize;
        }
        const commission = (entryPrice * positionSize + lastPrice * positionSize) * commissionRate;
        const netPnl = grossPnl - commission;
        capital += netPnl;
        totalTrades++;
        if(netPnl > 0) winningTrades++;
        const endLog: TradeLogEvent = position === 'LONG'
            ? { type: 'CLOSE_LONG', time: candles[candles.length - 1].time, price: lastPrice, grossPnl, commission, netPnl, reason: 'END_OF_DATA' }
            : { type: 'CLOSE_SHORT', time: candles[candles.length - 1].time, price: lastPrice, grossPnl, commission, netPnl, reason: 'END_OF_DATA' };
        log.push(endLog);
        equityCurve.push({ time: candles[candles.length - 1].time, capital });
    }

    const pnl = capital - initialCapital;
    const pnlPercentage = (pnl / initialCapital) * 100;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    log.push({ type: 'FINISH', time: candles.length > 0 ? candles[candles.length - 1].time : Date.now() / 1000 });

    return {
        finalCapital: capital,
        pnl,
        pnlPercentage,
        totalTrades,
        winRate,
        tradeLog: log.reverse(), // Show most recent events first
        equityCurve,
        settings,
    };
};