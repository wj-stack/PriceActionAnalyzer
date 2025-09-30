import type { DetectedPattern, Candle, BacktestSettings, TradeCloseReason } from '../types';
import { SignalDirection } from '../types';
import { calculateATR, calculateBollingerBands, calculateRSI, calculateSMA } from './indicatorService';

export interface EquityPoint {
    time: number;
    capital: number;
}

export type TradeLogEvent =
  | { type: 'START'; time: number; capital: number }
  | { type: 'ENTER_LONG'; time: number; price: number; signal: string; size: number; value: number; capital: number; }
  | { type: 'ENTER_SHORT'; time: number; price: number; signal: string; size: number; value: number; capital: number; }
  | { type: 'CLOSE_LONG'; time: number; price: number; grossPnl: number; commission: number; netPnl: number; reason: TradeCloseReason; entryPrice: number; size: number; duration: number; capital: number; }
  | { type: 'CLOSE_SHORT'; time: number; price: number; grossPnl: number; commission: number; netPnl: number; reason: TradeCloseReason; entryPrice: number; size: number; duration: number; capital: number; }
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

// Internal state for an open position
interface Position {
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    size: number;
    slPrice: number;
    tpPrice: number;
    entrySignal: DetectedPattern;
    entryIndex: number;
}


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
        strategy, leverage = 1, positionSizePercent = 100, rsiPeriod = 14, rsiOversold = 30, rsiOverbought = 70, 
        bbPeriod = 20, bbStdDev = 2,
        useVolumeFilter = false, volumeMaPeriod = 20, volumeThreshold = 1.5,
        atrPeriod = 14, atrMultiplierSL = 2, atrMultiplierTP = 3,
        useAtrPositionSizing = false, riskPerTradePercent = 1
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
    const atrValues = (strategy === 'ATR_TRAILING_STOP' || useAtrPositionSizing) ? calculateATR(candles, atrPeriod) : [];
    const volumeMA = useVolumeFilter ? calculateSMA(candles.map(c => c.volume), volumeMaPeriod) : [];

    let capital = initialCapital;
    let position: Position | null = null;
    
    // Metrics variables
    let winningTrades = 0;
    let totalTrades = 0;
    let totalGrossProfit = 0;
    let totalGrossLoss = 0;
    let totalTradeDurationInBars = 0;
    
    const patternMap = new Map(patterns.map(p => [p.index, p]));

    // Helper to check if a signal is valid according to the current strategy filters
    const isSignalValid = (pattern: DetectedPattern, candle: Candle, i: number): boolean => {
        if (useVolumeFilter) {
            const avgVolume = volumeMA[i];
            if (avgVolume === null || candle.volume <= avgVolume * volumeThreshold) {
                return false; // Fails volume filter
            }
        }
    
        switch (strategy) {
            case 'SIGNAL_ONLY':
            case 'ATR_TRAILING_STOP': // ATR is for exits, not entries, so entry is valid by default
                return true;
            case 'RSI_FILTER': {
                const rsi = rsiValues[i];
                if (rsi !== null) {
                    if (pattern.direction === SignalDirection.Bullish && rsi <= rsiOversold) return true;
                    if (pattern.direction === SignalDirection.Bearish && rsi >= rsiOverbought) return true;
                }
                return false;
            }
            case 'BOLLINGER_BANDS': {
                const bands = bbValues[i];
                if (bands !== null && bands.lower && bands.upper) {
                    if (pattern.direction === SignalDirection.Bullish && candle.low <= bands.lower) return true;
                    if (pattern.direction === SignalDirection.Bearish && candle.high >= bands.upper) return true;
                }
                return false;
            }
            default:
                return false;
        }
    };


    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        const pattern = patternMap.get(i);
        let processedActionOnCandle = false;

        // --- 1. HANDLE OPEN POSITION ---
        if (position) {
            // Update trailing stop for ATR strategy
            if (strategy === 'ATR_TRAILING_STOP') {
                const atr = atrValues[i];
                if (atr) {
                    if (position.direction === 'LONG') {
                        const newSlPrice = candle.close - atr * atrMultiplierSL;
                        if (newSlPrice > position.slPrice) {
                            position.slPrice = newSlPrice;
                        }
                    } else { // SHORT
                        const newSlPrice = candle.close + atr * atrMultiplierSL;
                        if (newSlPrice < position.slPrice) {
                            position.slPrice = newSlPrice;
                        }
                    }
                }
            }

            let exitPrice = 0;
            let reason: TradeCloseReason | null = null;
            let isLiquidation = false;

            // 1a. Check for Liquidation first if leverage is used
            if (leverage > 1) {
                if (position.direction === 'LONG') {
                    const liquidationPrice = position.entryPrice * (1 - (1 / leverage));
                    if (candle.low <= liquidationPrice) {
                        isLiquidation = true;
                        reason = 'LIQUIDATION';
                        exitPrice = Math.min(liquidationPrice, candle.open);
                    }
                } else { // SHORT
                    const liquidationPrice = position.entryPrice * (1 + (1 / leverage));
                    if (candle.high >= liquidationPrice) {
                        isLiquidation = true;
                        reason = 'LIQUIDATION';
                        exitPrice = Math.max(liquidationPrice, candle.open);
                    }
                }
            }
            
            // 1b. If not liquidated, check for Stop Loss or Take Profit
            if (!reason) {
                if (position.direction === 'LONG') {
                    if (stopLossPercent > 0 && candle.low <= position.slPrice) {
                        reason = 'STOP_LOSS';
                        exitPrice = Math.min(position.slPrice, candle.open);
                    } else if (takeProfitPercent > 0 && candle.high >= position.tpPrice) {
                        reason = 'TAKE_PROFIT';
                        exitPrice = Math.max(position.tpPrice, candle.open);
                    }
                } else { // SHORT
                    if (stopLossPercent > 0 && candle.high >= position.slPrice) {
                        reason = 'STOP_LOSS';
                        exitPrice = Math.max(position.slPrice, candle.open);
                    } else if (takeProfitPercent > 0 && candle.low <= position.tpPrice) {
                        reason = 'TAKE_PROFIT';
                        exitPrice = Math.min(position.tpPrice, candle.open);
                    }
                }
            }

            // 1c. Check for a stronger reverse signal
            if (!reason && pattern && isSignalValid(pattern, candle, i)) {
                const isConflicting =
                    (position.direction === 'LONG' && pattern.direction === SignalDirection.Bearish) ||
                    (position.direction === 'SHORT' && pattern.direction === SignalDirection.Bullish);

                if (isConflicting && pattern.priority > position.entrySignal.priority) {
                    reason = 'REVERSE_SIGNAL';
                    exitPrice = candle.close;
                }
            }

            // 1d. Process Exit if a reason was found
            if (reason) {
                let grossPnl: number;
                let commission: number;
                let netPnl: number;
                const oldPosition = position;

                if (isLiquidation) {
                    const positionValue = oldPosition.entryPrice * oldPosition.size;
                    const margin = positionValue / leverage;
                    netPnl = -margin;
                    grossPnl = oldPosition.direction === 'LONG'
                        ? (exitPrice - oldPosition.entryPrice) * oldPosition.size
                        : (oldPosition.entryPrice - exitPrice) * oldPosition.size;
                    commission = (oldPosition.entryPrice * oldPosition.size + exitPrice * oldPosition.size) * commissionRate;
                } else {
                    grossPnl = oldPosition.direction === 'LONG'
                        ? (exitPrice - oldPosition.entryPrice) * oldPosition.size
                        : (oldPosition.entryPrice - exitPrice) * oldPosition.size;
                    
                    commission = (oldPosition.entryPrice * oldPosition.size + exitPrice * oldPosition.size) * commissionRate;
                    netPnl = grossPnl - commission;
                }

                capital += netPnl;
                totalTrades++;
                if (netPnl > 0) winningTrades++;
                
                if (grossPnl > 0) totalGrossProfit += grossPnl;
                else totalGrossLoss += grossPnl;

                const duration = i - oldPosition.entryIndex;
                totalTradeDurationInBars += duration;

                const closeLog: TradeLogEvent = oldPosition.direction === 'LONG' 
                  ? { type: 'CLOSE_LONG', time: candle.time, price: exitPrice, grossPnl, commission, netPnl, reason, entryPrice: oldPosition.entryPrice, size: oldPosition.size, duration, capital }
                  : { type: 'CLOSE_SHORT', time: candle.time, price: exitPrice, grossPnl, commission, netPnl, reason, entryPrice: oldPosition.entryPrice, size: oldPosition.size, duration, capital };
                log.push(closeLog);
                equityCurve.push({ time: candle.time, capital });
                
                position = null; // Position is now closed
                processedActionOnCandle = true;

                // 1e. If it was a reverse signal, immediately open a new position (Stop and Reverse)
                if (reason === 'REVERSE_SIGNAL' && capital > 0 && pattern) {
                    const entryPrice = candle.close;
                    const capitalBeforeTrade = capital;
                    let size: number;
                    
                    if (useAtrPositionSizing) {
                        const atr = atrValues[i];
                        if (atr) {
                            const stopLossDistance = atr * atrMultiplierSL;
                            const riskAmount = capital * (riskPerTradePercent / 100);
                            const positionValue = (riskAmount / stopLossDistance) * entryPrice;
                            size = positionValue / entryPrice;
                        } else {
                            const positionValue = (capital * (positionSizePercent / 100)) * leverage;
                            size = positionValue / entryPrice;
                        }
                    } else {
                        const positionValue = (capital * (positionSizePercent / 100)) * leverage;
                        size = positionValue / entryPrice;
                    }
                     const positionValue = size * entryPrice;
                     const signalName = t(pattern.name);

                    let slPrice: number, tpPrice: number;
                    if (strategy === 'ATR_TRAILING_STOP') {
                        const atr = atrValues[i];
                        if (atr) {
                             if (pattern.direction === SignalDirection.Bullish) {
                                slPrice = entryPrice - atr * atrMultiplierSL;
                                tpPrice = entryPrice + atr * atrMultiplierTP;
                            } else { // Bearish
                                slPrice = entryPrice + atr * atrMultiplierSL;
                                tpPrice = entryPrice - atr * atrMultiplierTP;
                            }
                        } else { // Fallback
                            slPrice = entryPrice * (1 - (pattern.direction === SignalDirection.Bullish ? stopLossPercent / 100 : -stopLossPercent / 100));
                            tpPrice = entryPrice * (1 + (pattern.direction === SignalDirection.Bullish ? takeProfitPercent / 100 : -takeProfitPercent / 100));
                        }
                    } else { // Percentage-based
                        if (pattern.direction === SignalDirection.Bullish) {
                            slPrice = entryPrice * (1 - stopLossPercent / 100);
                            tpPrice = entryPrice * (1 + takeProfitPercent / 100);
                        } else { // Bearish
                            slPrice = entryPrice * (1 + stopLossPercent / 100);
                            tpPrice = entryPrice * (1 - takeProfitPercent / 100);
                        }
                    }

                    if (pattern.direction === SignalDirection.Bullish) {
                        position = { direction: 'LONG', entryPrice, size, slPrice, tpPrice, entrySignal: pattern, entryIndex: i };
                        log.push({ type: 'ENTER_LONG', time: candle.time, price: entryPrice, signal: signalName, size, value: positionValue, capital: capitalBeforeTrade });
                    } else {
                        position = { direction: 'SHORT', entryPrice, size, slPrice, tpPrice, entrySignal: pattern, entryIndex: i };
                        log.push({ type: 'ENTER_SHORT', time: candle.time, price: entryPrice, signal: signalName, size, value: positionValue, capital: capitalBeforeTrade });
                    }
                }
                 if (capital <= 0) break; // Bankrupt
            }
        }
        
        // --- 2. HANDLE ENTRY FROM FLAT STATE ---
        if (!position && !processedActionOnCandle && capital > 0 && pattern && isSignalValid(pattern, candle, i)) {
            const entryPrice = candle.close;
            const capitalBeforeTrade = capital;
            let size: number;
            
            if (useAtrPositionSizing) {
                const atr = atrValues[i];
                if (atr && atr > 0) {
                    const stopLossDistance = atr * atrMultiplierSL;
                    const riskAmount = capital * (riskPerTradePercent / 100);
                    // size in quote asset / entry price = size in base asset
                    size = (riskAmount / stopLossDistance);
                } else { // Fallback if ATR is not available
                    const positionValue = (capital * (positionSizePercent / 100)) * leverage;
                    size = positionValue / entryPrice;
                }
            } else {
                const positionValue = (capital * (positionSizePercent / 100)) * leverage;
                size = positionValue / entryPrice;
            }
            const positionValue = size * entryPrice;
            const signalName = t(pattern.name);
            
            let slPrice: number, tpPrice: number;
             if (strategy === 'ATR_TRAILING_STOP') {
                const atr = atrValues[i];
                if (atr) {
                    if (pattern.direction === SignalDirection.Bullish) {
                        slPrice = entryPrice - atr * atrMultiplierSL;
                        tpPrice = entryPrice + atr * atrMultiplierTP;
                    } else { // Bearish
                        slPrice = entryPrice + atr * atrMultiplierSL;
                        tpPrice = entryPrice - atr * atrMultiplierTP;
                    }
                } else { // Fallback
                    slPrice = entryPrice * (1 - (pattern.direction === SignalDirection.Bullish ? stopLossPercent / 100 : -stopLossPercent / 100));
                    tpPrice = entryPrice * (1 + (pattern.direction === SignalDirection.Bullish ? takeProfitPercent / 100 : -takeProfitPercent / 100));
                }
            } else { // Percentage-based
                if (pattern.direction === SignalDirection.Bullish) {
                    slPrice = entryPrice * (1 - stopLossPercent / 100);
                    tpPrice = entryPrice * (1 + takeProfitPercent / 100);
                } else { // Bearish
                    slPrice = entryPrice * (1 + stopLossPercent / 100);
                    tpPrice = entryPrice * (1 - takeProfitPercent / 100);
                }
            }
            
            if (pattern.direction === SignalDirection.Bullish) {
                position = { direction: 'LONG', entryPrice, size, slPrice, tpPrice, entrySignal: pattern, entryIndex: i };
                log.push({ type: 'ENTER_LONG', time: candle.time, price: entryPrice, signal: signalName, size, value: positionValue, capital: capitalBeforeTrade });
            } else {
                position = { direction: 'SHORT', entryPrice, size, slPrice, tpPrice, entrySignal: pattern, entryIndex: i };
                log.push({ type: 'ENTER_SHORT', time: candle.time, price: entryPrice, signal: signalName, size, value: positionValue, capital: capitalBeforeTrade });
            }
        }

        // --- 3. UPDATE EQUITY CURVE FOR OPEN POSITIONS ---
        if (position) {
            const currentPrice = candle.close;
            const unrealizedPnl = position.direction === 'LONG'
                ? (currentPrice - position.entryPrice) * position.size
                : (position.entryPrice - currentPrice) * position.size;
            
            const currentEquity = capital + unrealizedPnl;
            
            log.push({
                type: 'UPDATE_PNL',
                time: candle.time,
                price: currentPrice,
                unrealizedPnl,
                equity: currentEquity,
            });
            equityCurve.push({ time: candle.time, capital: currentEquity });
        }
    }
    
    // --- 4. CLOSE ANY OPEN POSITION AT THE END OF DATA ---
    if (position !== null) {
        const lastCandle = candles[candles.length - 1];
        const lastPrice = lastCandle.close;
        const grossPnl = position.direction === 'LONG'
            ? (lastPrice - position.entryPrice) * position.size
            : (position.entryPrice - lastPrice) * position.size;
        
        const commission = (position.entryPrice * position.size + lastPrice * position.size) * commissionRate;
        const netPnl = grossPnl - commission;
        capital += netPnl;
        totalTrades++;
        if(netPnl > 0) winningTrades++;

        if (grossPnl > 0) totalGrossProfit += grossPnl;
        else totalGrossLoss += grossPnl;

        const duration = (candles.length - 1 - position.entryIndex);
        totalTradeDurationInBars += duration;
        
        const endLog: TradeLogEvent = position.direction === 'LONG'
            ? { type: 'CLOSE_LONG', time: lastCandle.time, price: lastPrice, grossPnl, commission, netPnl, reason: 'END_OF_DATA', entryPrice: position.entryPrice, size: position.size, duration, capital }
            : { type: 'CLOSE_SHORT', time: lastCandle.time, price: lastPrice, grossPnl, commission, netPnl, reason: 'END_OF_DATA', entryPrice: position.entryPrice, size: position.size, duration, capital };
        log.push(endLog);
        equityCurve.push({ time: lastCandle.time, capital });
    }

    capital = Math.max(0, capital); // Ensure capital doesn't go negative in final result
    
    // --- 5. CALCULATE FINAL METRICS ---
    const pnl = capital - initialCapital;
    const pnlPercentage = (pnl / initialCapital) * 100;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const profitFactor = totalGrossLoss !== 0 ? totalGrossProfit / Math.abs(totalGrossLoss) : Infinity;
    const avgTradeDurationBars = totalTrades > 0 ? totalTradeDurationInBars / totalTrades : 0;

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
