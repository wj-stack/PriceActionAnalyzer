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
  | { type: 'UPDATE_PNL'; time: number; price: number; unrealizedPnl: number; equity: number; }
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
    maxDrawdown: number;
    profitFactor: number;
    avgTradeDurationBars: number;
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
        strategy, leverage = 1, rsiPeriod = 14, rsiOversold = 30, rsiOverbought = 70, 
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
            equityCurve, settings, maxDrawdown: 0, profitFactor: 0, avgTradeDurationBars: 0
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
    
    // Metrics variables
    let winningTrades = 0;
    let totalTrades = 0;
    let totalGrossProfit = 0;
    let totalGrossLoss = 0;
    let totalTradeDurationInBars = 0;
    let tradeEntryIndex = 0;
    
    const patternMap = new Map(patterns.map(p => [p.index, p]));

    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];

        // 1. Check for and process exits / update P&L
        if (position !== null) {
            let shouldExit = false;
            let exitPrice = 0;
            let reason: TradeCloseReason = 'END_OF_DATA';

            if (position === 'LONG') {
                if (stopLossPercent > 0 && candle.low <= slPrice) {
                    shouldExit = true;
                    reason = 'STOP_LOSS';
                    exitPrice = Math.min(slPrice, candle.open);
                } else if (takeProfitPercent > 0 && candle.high >= tpPrice) {
                    shouldExit = true;
                    reason = 'TAKE_PROFIT';
                    exitPrice = Math.max(tpPrice, candle.open);
                }
            } else { // SHORT
                if (stopLossPercent > 0 && candle.high >= slPrice) {
                    shouldExit = true;
                    reason = 'STOP_LOSS';
                    exitPrice = Math.max(slPrice, candle.open);
                } else if (takeProfitPercent > 0 && candle.low <= tpPrice) {
                    shouldExit = true;
                    reason = 'TAKE_PROFIT';
                    exitPrice = Math.min(tpPrice, candle.open);
                }
            }
            
            if (shouldExit) {
                const grossPnl = position === 'LONG'
                    ? (exitPrice - entryPrice) * positionSize
                    : (entryPrice - exitPrice) * positionSize;
                
                const commission = (entryPrice * positionSize + exitPrice * positionSize) * commissionRate;
                const netPnl = grossPnl - commission;
                capital += netPnl;
                totalTrades++;
                if (netPnl > 0) winningTrades++;
                
                if (grossPnl > 0) totalGrossProfit += grossPnl;
                else totalGrossLoss += grossPnl;
                
                totalTradeDurationInBars += (i - tradeEntryIndex);

                const closeLog: TradeLogEvent = position === 'LONG' 
                  ? { type: 'CLOSE_LONG', time: candle.time, price: exitPrice, grossPnl, commission, netPnl, reason }
                  : { type: 'CLOSE_SHORT', time: candle.time, price: exitPrice, grossPnl, commission, netPnl, reason };
                log.push(closeLog);
                equityCurve.push({ time: candle.time, capital });

                position = null;
                entryPrice = 0;
                positionSize = 0;

                if (capital <= 0) {
                    break; 
                }
            } else {
                // Position is still open, log unrealized P&L
                const currentPrice = candle.close;
                const unrealizedPnl = position === 'LONG'
                    ? (currentPrice - entryPrice) * positionSize
                    : (entryPrice - currentPrice) * positionSize;
                
                const currentEquity = capital + unrealizedPnl;
                
                log.push({
                    type: 'UPDATE_PNL',
                    time: candle.time,
                    price: currentPrice,
                    unrealizedPnl: unrealizedPnl,
                    equity: currentEquity,
                });
                equityCurve.push({ time: candle.time, capital: currentEquity });
            }
        }

        // 2. Check for entries (only if flat)
        if (position === null && capital > 0) {
            const pattern = patternMap.get(i);
            if (pattern) {
                let entryConditionMet = false;
                
                if (useVolumeFilter) {
                    const avgVolume = volumeMA[i];
                    if (avgVolume === null || candle.volume <= avgVolume * volumeThreshold) {
                        continue;
                    }
                }

                switch (strategy) {
                    case 'SIGNAL_ONLY':
                        entryConditionMet = true;
                        break;
                    case 'RSI_FILTER':
                        const rsi = rsiValues[i];
                        if (rsi !== null) {
                            if (pattern.direction === SignalDirection.Bullish && rsi <= rsiOversold) entryConditionMet = true;
                            else if (pattern.direction === SignalDirection.Bearish && rsi >= rsiOverbought) entryConditionMet = true;
                        }
                        break;
                    case 'BOLLINGER_BANDS':
                         const bands = bbValues[i];
                         if (bands !== null) {
                            if (pattern.direction === SignalDirection.Bullish && candle.low <= bands.lower) entryConditionMet = true;
                            else if (pattern.direction === SignalDirection.Bearish && candle.high >= bands.upper) entryConditionMet = true;
                         }
                        break;
                }

                if (entryConditionMet) {
                    entryPrice = candle.close;
                    const positionValue = capital * leverage;
                    positionSize = positionValue / entryPrice;
                    const signalName = t(pattern.name);
                    tradeEntryIndex = i;

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
        const lastCandle = candles[candles.length - 1];
        const lastPrice = lastCandle.close;
        const grossPnl = position === 'LONG'
            ? (lastPrice - entryPrice) * positionSize
            : (entryPrice - lastPrice) * positionSize;
        
        const commission = (entryPrice * positionSize + lastPrice * positionSize) * commissionRate;
        const netPnl = grossPnl - commission;
        capital += netPnl;
        totalTrades++;
        if(netPnl > 0) winningTrades++;

        if (grossPnl > 0) totalGrossProfit += grossPnl;
        else totalGrossLoss += grossPnl;

        totalTradeDurationInBars += (candles.length - 1 - tradeEntryIndex);
        
        const endLog: TradeLogEvent = position === 'LONG'
            ? { type: 'CLOSE_LONG', time: lastCandle.time, price: lastPrice, grossPnl, commission, netPnl, reason: 'END_OF_DATA' }
            : { type: 'CLOSE_SHORT', time: lastCandle.time, price: lastPrice, grossPnl, commission, netPnl, reason: 'END_OF_DATA' };
        log.push(endLog);
        equityCurve.push({ time: lastCandle.time, capital });
    }

    capital = Math.max(0, capital); // Ensure capital doesn't go negative in final result
    
    // Calculate final metrics
    const pnl = capital - initialCapital;
    const pnlPercentage = (pnl / initialCapital) * 100;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const profitFactor = totalGrossLoss !== 0 ? totalGrossProfit / Math.abs(totalGrossLoss) : Infinity;
    const avgTradeDurationBars = totalTrades > 0 ? totalTradeDurationInBars / totalTrades : 0;

    // Calculate Max Drawdown from the equity curve
    let peakEquityForDrawdown = initialCapital;
    let maxDrawdown = 0;
    for (const point of equityCurve) {
        peakEquityForDrawdown = Math.max(peakEquityForDrawdown, point.capital);
        const drawdown = peakEquityForDrawdown > 0 ? (peakEquityForDrawdown - point.capital) / peakEquityForDrawdown : 0;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    }
    
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
        maxDrawdown,
        profitFactor,
        avgTradeDurationBars,
    };
};