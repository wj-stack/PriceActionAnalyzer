import type { DetectedPattern, Candle, BacktestSettings, TradeCloseReason, TrendDirection, TrendPoint } from '../types';
import { SignalDirection } from '../types';
import { calculateATR, calculateRSI, calculateSMA, calculateEMA, calculateADX } from './indicatorService';
import { analyzeCandles } from './patternRecognizer';

export interface EquityPoint {
    time: number;
    capital: number;
}

export type TradeLogEvent =
  | { type: 'START'; time: number; capital: number }
  | { type: 'PLAN'; time: number; direction: 'LONG' | 'SHORT'; signal: string; entryPrice: number; slPrice: number; tpPrice: number; rr: number; patternIndex: number; }
  | { type: 'PLAN_SKIPPED_RR'; time: number; direction: 'LONG' | 'SHORT'; signal: string; rr: number; minRr: number; patternIndex: number; }
  | { type: 'PLAN_SKIPPED_TREND'; time: number; direction: 'LONG' | 'SHORT'; signal: string; trend: TrendDirection; patternIndex: number; }
  | { type: 'PLAN_SKIPPED_TARGET'; time: number; direction: 'LONG' | 'SHORT'; signal: string; patternIndex: number; }
  | { type: 'PLAN_CANCELLED'; time: number; direction: 'LONG' | 'SHORT'; signal: string; patternIndex: number; }
  | { type: 'ENTER_LONG'; time: number; price: number; signal: string; size: number; value: number; capital: number; patternIndex: number; }
  | { type: 'ENTER_SHORT'; time: number; price: number; signal: string; size: number; value: number; capital: number; patternIndex: number; }
  | { type: 'CLOSE_LONG'; time: number; price: number; grossPnl: number; commission: number; netPnl: number; reason: TradeCloseReason; entryPrice: number; size: number; duration: number; capital: number; }
  | { type: 'CLOSE_SHORT'; time: number; price: number; grossPnl: number; commission: number; netPnl: number; reason: TradeCloseReason; entryPrice: number; size: number; duration: number; capital: number; }
  | { type: 'UPDATE_PNL'; time: number; price: number; unrealizedPnl: number; equity: number; }
  | { type: 'FINISH'; time: number }
  | { type: 'SHORT_TERM_ENTER_LONG'; time: number; htfTrend: TrendDirection; price: number; slPrice: number; tpPrice: number; rr: number; }
  | { type: 'SHORT_TERM_ENTER_SHORT'; time: number; htfTrend: TrendDirection; price: number; slPrice: number; tpPrice: number; rr: number; }
  | { type: 'SHORT_TERM_SKIPPED_TREND'; time: number; direction: 'LONG' | 'SHORT'; htfTrend: TrendDirection; };

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
    longestIdleDurationBars: number;
    skippedSignals: number;
}

// Internal state for an open position
interface Position {
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    size: number;
    slPrice: number;
    tpPrice: number;
    entrySignal?: DetectedPattern; // Optional for non-signal based entries
    entryIndex: number;
}

interface PendingEntry {
    pattern: DetectedPattern;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    expiryIndex: number;
}

const TICK_SIZE = 0.0001; // Assuming a generic tick size, can be improved for specific assets
const ENTRY_EXPIRY_BARS = 3;

const runStructuralBacktest = (
    candles: Candle[],
    patterns: DetectedPattern[],
    context: { trend: TrendDirection; swingHighs: TrendPoint[]; swingLows: TrendPoint[] },
    settings: BacktestSettings,
    t: (key: string) => string
): Omit<BacktestResult, 'maxDrawdown' | 'profitFactor' | 'avgTradeDurationBars' | 'tradeLog'> & { tradeLog: TradeLogEvent[], totalGrossProfit: number, totalGrossLoss: number, totalTradeDurationInBars: number } => {
    
    const { 
        initialCapital, commissionRate, leverage = 1, positionSizePercent = 10, minRiskReward = 1.5,
        useAtrTrailingStop = false, useAtrPositionSizing = false, riskPerTradePercent = 1,
        rsiPeriod = 14, rsiBullLevel = 40, rsiBearLevel = 60,
        useVolumeFilter = false, volumeMaPeriod = 20, volumeThreshold = 1.5,
        atrPeriod = 14, atrMultiplier = 2,
        useEmaFilter = true, emaFastPeriod = 20, emaSlowPeriod = 50,
        useAdxFilter = true, adxPeriod = 14, adxThreshold = 20
    } = settings;
    
    const useRsiFilter = !!settings.rsiPeriod;

    // Pre-calculate all indicators
    const rsiValues = useRsiFilter ? calculateRSI(candles, rsiPeriod) : [];
    const atrValues = (useAtrTrailingStop || useAtrPositionSizing) ? calculateATR(candles, atrPeriod) : [];
    const volumeMA = useVolumeFilter ? calculateSMA(candles.map(c => c.volume), volumeMaPeriod) : [];
    const emaFastValues = useEmaFilter ? calculateEMA(candles, emaFastPeriod!) : [];
    const emaSlowValues = useEmaFilter ? calculateEMA(candles, emaSlowPeriod!) : [];
    const adxValues = useAdxFilter ? calculateADX(candles, adxPeriod!) : [];
    
    let capital = initialCapital;
    let position: Position | null = null;
    let pendingEntry: PendingEntry | null = null;
    
    let winningTrades = 0;
    let totalTrades = 0;
    let totalGrossProfit = 0;
    let totalGrossLoss = 0;
    let totalTradeDurationInBars = 0;
    let skippedSignals = 0;
    let longestIdleDurationBars = 0;
    let idleStartIndex = 0;
    
    const patternMap = new Map(patterns.map(p => [p.index, p]));
    const tradeLog: TradeLogEvent[] = [];
    const equityCurve: EquityPoint[] = [];

    const isSignalValid = (pattern: DetectedPattern, candle: Candle, i: number): boolean => {
        // Volume Filter
        if (useVolumeFilter) {
            const avgVolume = volumeMA[i];
            if (avgVolume === null || candle.volume <= avgVolume * volumeThreshold) {
                return false;
            }
        }
        // EMA Trend Filter
        if (useEmaFilter) {
            const fast = emaFastValues[i];
            const slow = emaSlowValues[i];
            if (fast !== null && slow !== null) {
                if (pattern.direction === SignalDirection.Bullish && fast <= slow) return false;
                if (pattern.direction === SignalDirection.Bearish && fast >= slow) return false;
            } else return false;
        }
        // ADX Trend Strength Filter
        if (useAdxFilter) {
            const adx = adxValues[i];
            if (adx !== null) {
                 if (adx < adxThreshold) return false;
            } else return false;
        }
        // RSI Momentum Filter
        if (useRsiFilter) {
            const rsi = rsiValues[i];
            if (rsi !== null) {
                if (pattern.direction === SignalDirection.Bullish && rsi < rsiBullLevel!) return false;
                if (pattern.direction === SignalDirection.Bearish && rsi > rsiBearLevel!) return false;
            } else {
                return false;
            }
        }
        return true;
    };

    for (let i = 0; i < candles.length; i++) {
        const candle = candles[i];
        const pattern = patternMap.get(i);
        let processedActionOnCandle = false;

        if (pendingEntry) {
            const isLongTrigger = pendingEntry.direction === 'LONG' && candle.high >= pendingEntry.entryPrice;
            const isShortTrigger = pendingEntry.direction === 'SHORT' && candle.low <= pendingEntry.entryPrice;

            if (isLongTrigger || isShortTrigger) {
                const actualEntryPrice = isLongTrigger ? pendingEntry.entryPrice : pendingEntry.entryPrice;
                const capitalBeforeTrade = capital;
                let size: number;
                
                if (useAtrPositionSizing) {
                    const stopLossDistance = Math.abs(actualEntryPrice - pendingEntry.slPrice);
                    if (stopLossDistance > 0) {
                        const riskAmount = capital * (riskPerTradePercent / 100);
                        size = riskAmount / stopLossDistance;
                    } else {
                         size = (capital * (positionSizePercent / 100)) / actualEntryPrice;
                    }
                } else {
                    const positionValue = (capital * (positionSizePercent / 100)) * leverage;
                    size = positionValue / actualEntryPrice;
                }
                
                const positionValue = size * actualEntryPrice;
                const signalName = t(pendingEntry.pattern.name);
                
                const idleDuration = i - idleStartIndex;
                longestIdleDurationBars = Math.max(longestIdleDurationBars, idleDuration);

                if (pendingEntry.direction === 'LONG') {
                    position = { direction: 'LONG', entryPrice: actualEntryPrice, size, slPrice: pendingEntry.slPrice, tpPrice: pendingEntry.tpPrice, entrySignal: pendingEntry.pattern, entryIndex: i };
                    tradeLog.push({ type: 'ENTER_LONG', time: candle.time, price: actualEntryPrice, signal: signalName, size, value: positionValue, capital: capitalBeforeTrade, patternIndex: pendingEntry.pattern.index });
                } else {
                    position = { direction: 'SHORT', entryPrice: actualEntryPrice, size, slPrice: pendingEntry.slPrice, tpPrice: pendingEntry.tpPrice, entrySignal: pendingEntry.pattern, entryIndex: i };
                    tradeLog.push({ type: 'ENTER_SHORT', time: candle.time, price: actualEntryPrice, signal: signalName, size, value: positionValue, capital: capitalBeforeTrade, patternIndex: pendingEntry.pattern.index });
                }
                
                pendingEntry = null;
                processedActionOnCandle = true;
            } else if (i >= pendingEntry.expiryIndex) {
                 tradeLog.push({ type: 'PLAN_CANCELLED', time: candle.time, direction: pendingEntry.direction, signal: t(pendingEntry.pattern.name), patternIndex: pendingEntry.pattern.index });
                 pendingEntry = null;
            }
        }

        if (position) {
            if (useAtrTrailingStop) {
                const atr = atrValues[i];
                if (atr && atrMultiplier) {
                    if (position.direction === 'LONG') {
                        const newSlPrice = candle.close - atr * atrMultiplier;
                        if (newSlPrice > position.slPrice) position.slPrice = newSlPrice;
                    } else { // SHORT
                        const newSlPrice = candle.close + atr * atrMultiplier;
                        if (newSlPrice < position.slPrice) position.slPrice = newSlPrice;
                    }
                }
            }
            
            let exitPrice = 0;
            let reason: TradeCloseReason | null = null;
            let isLiquidation = false;

            if (leverage > 1) {
                const liquidationPrice = position.direction === 'LONG' 
                    ? position.entryPrice * (1 - (1 / leverage))
                    : position.entryPrice * (1 + (1 / leverage));
                
                if ((position.direction === 'LONG' && candle.low <= liquidationPrice) || (position.direction === 'SHORT' && candle.high >= liquidationPrice)) {
                    isLiquidation = true;
                    reason = 'LIQUIDATION';
                    exitPrice = liquidationPrice;
                }
            }

            if (!reason) {
                if (position.direction === 'LONG') {
                    if (candle.low <= position.slPrice) reason = 'STOP_LOSS';
                    else if (candle.high >= position.tpPrice) reason = 'TAKE_PROFIT';
                } else { // SHORT
                    if (candle.high >= position.slPrice) reason = 'STOP_LOSS';
                    else if (candle.low <= position.tpPrice) reason = 'TAKE_PROFIT';
                }
                if (reason) exitPrice = reason === 'STOP_LOSS' ? position.slPrice : position.tpPrice;
            }

            if (reason) {
                let grossPnl, commission, netPnl;
                const oldPosition = position;
                if (isLiquidation) {
                    const margin = (oldPosition.entryPrice * oldPosition.size) / leverage;
                    netPnl = -margin;
                    grossPnl = netPnl;
                    commission = 0;
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
                if (grossPnl > 0) totalGrossProfit += grossPnl; else totalGrossLoss += Math.abs(grossPnl);
                
                const duration = i - oldPosition.entryIndex;
                totalTradeDurationInBars += duration;
                
                const closeLog: TradeLogEvent = oldPosition.direction === 'LONG' 
                  ? { type: 'CLOSE_LONG', time: candle.time, price: exitPrice, grossPnl, commission, netPnl, reason, entryPrice: oldPosition.entryPrice, size: oldPosition.size, duration, capital }
                  : { type: 'CLOSE_SHORT', time: candle.time, price: exitPrice, grossPnl, commission, netPnl, reason, entryPrice: oldPosition.entryPrice, size: oldPosition.size, duration, capital };
                tradeLog.push(closeLog);
                equityCurve.push({ time: candle.time, capital });
                
                idleStartIndex = i;
                position = null;
                processedActionOnCandle = true;
                if (capital <= 0) break;
            }
        }
        
        if (!position && !pendingEntry && !processedActionOnCandle && capital > 0 && pattern) {
            const direction = pattern.direction === SignalDirection.Bullish ? 'LONG' : 'SHORT';

            // Use the broader market context trend for filtering, not the filter-based one.
            if ((context.trend === 'UPTREND' && direction === 'SHORT') || (context.trend === 'DOWNTREND' && direction === 'LONG')) {
                tradeLog.push({ type: 'PLAN_SKIPPED_TREND', time: candle.time, direction, signal: t(pattern.name), trend: context.trend, patternIndex: pattern.index });
                skippedSignals++;
                continue;
            }

            if (!isSignalValid(pattern, candle, i)) {
                skippedSignals++;
                continue;
            }

            const signalCandle = pattern.candle;
            const entryPrice = direction === 'LONG' ? signalCandle.high + TICK_SIZE : signalCandle.low - TICK_SIZE;
            const slPrice = direction === 'LONG' ? signalCandle.low - TICK_SIZE : signalCandle.high + TICK_SIZE;
            
            // FIX: Corrected Take-Profit logic to remove lookahead bias.
            // It now finds the nearest valid structural target based only on *past* confirmed swing points.
            const nextTarget = direction === 'LONG'
                ? [...context.swingHighs]
                    .filter(sh => sh.index < pattern.index) // Only use past swings
                    .sort((a, b) => a.price - b.price) // Sort by price ascending
                    .find(sh => sh.price > entryPrice) // Find the first one above entry
                : [...context.swingLows]
                    .filter(sl => sl.index < pattern.index) // Only use past swings
                    .sort((a, b) => b.price - a.price) // Sort by price descending
                    .find(sl => sl.price < entryPrice); // Find the first one below entry


            if (!nextTarget) {
                 tradeLog.push({ type: 'PLAN_SKIPPED_TARGET', time: candle.time, direction, signal: t(pattern.name), patternIndex: pattern.index });
                 skippedSignals++;
                continue;
            }
            const tpPrice = nextTarget.price;

            const risk = Math.abs(entryPrice - slPrice);
            const reward = Math.abs(tpPrice - entryPrice);
            
            if (risk === 0) continue;
            const rr = reward / risk;

            if (rr < minRiskReward) {
                tradeLog.push({ type: 'PLAN_SKIPPED_RR', time: candle.time, direction, signal: t(pattern.name), rr, minRr: minRiskReward, patternIndex: pattern.index });
                skippedSignals++;
                continue;
            }

            tradeLog.push({ type: 'PLAN', time: candle.time, direction, signal: t(pattern.name), entryPrice, slPrice, tpPrice, rr, patternIndex: pattern.index });
            pendingEntry = { pattern, direction, entryPrice, slPrice, tpPrice, expiryIndex: i + ENTRY_EXPIRY_BARS };
        }

        if (position) {
            const unrealizedPnl = position.direction === 'LONG'
                ? (candle.close - position.entryPrice) * position.size
                : (position.entryPrice - candle.close) * position.size;
            equityCurve.push({ time: candle.time, capital: capital + unrealizedPnl });
        } else {
             equityCurve.push({ time: candle.time, capital });
        }
    }

    if (position !== null) {
        const lastCandle = candles[candles.length - 1];
        const grossPnl = position.direction === 'LONG'
            ? (lastCandle.close - position.entryPrice) * position.size
            : (position.entryPrice - lastCandle.close) * position.size;
        const commission = (position.entryPrice * position.size + lastCandle.close * position.size) * commissionRate;
        const netPnl = grossPnl - commission;
        capital += netPnl;
        
        const duration = (candles.length - 1) - position.entryIndex;
        totalTradeDurationInBars += duration;
        
        tradeLog.push(position.direction === 'LONG' 
            ? { type: 'CLOSE_LONG', time: lastCandle.time, price: lastCandle.close, grossPnl, commission, netPnl, reason: 'END_OF_DATA', entryPrice: position.entryPrice, size: position.size, duration, capital }
            : { type: 'CLOSE_SHORT', time: lastCandle.time, price: lastCandle.close, grossPnl, commission, netPnl, reason: 'END_OF_DATA', entryPrice: position.entryPrice, size: position.size, duration, capital }
        );
        equityCurve.push({ time: lastCandle.time, capital });
        idleStartIndex = candles.length -1;
    }

    if (!position) {
        const finalIdleDuration = (candles.length - 1) - idleStartIndex;
        longestIdleDurationBars = Math.max(longestIdleDurationBars, finalIdleDuration);
    }
    
    capital = Math.max(0, capital);
    
    const pnl = capital - initialCapital;
    const pnlPercentage = (pnl / initialCapital) * 100;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    return {
        finalCapital: capital, pnl, pnlPercentage, totalTrades, winRate,
        tradeLog, equityCurve, settings,
        totalGrossProfit, totalGrossLoss, totalTradeDurationInBars,
        skippedSignals, longestIdleDurationBars
    };
};

const runShortTermBacktest = (
    ltfCandles: Candle[],
    htfCandles: Candle[],
    settings: BacktestSettings,
    t: (key: string) => string
): Omit<BacktestResult, 'maxDrawdown' | 'profitFactor' | 'avgTradeDurationBars' | 'tradeLog'> & { tradeLog: TradeLogEvent[], totalGrossProfit: number, totalGrossLoss: number, totalTradeDurationInBars: number } => {
    
    const { initialCapital, commissionRate, leverage = 1, minRiskReward = 1.5, riskPerTradePercent = 1 } = settings;
    const MICRO_RANGE_PERIOD = 8;
    
    let capital = initialCapital;
    let position: Position | null = null;
    let winningTrades = 0;
    let totalTrades = 0;
    let totalGrossProfit = 0;
    let totalGrossLoss = 0;
    let totalTradeDurationInBars = 0;
    let skippedSignals = 0;
    let longestIdleDurationBars = 0;
    let idleStartIndex = 0;
    
    const tradeLog: TradeLogEvent[] = [];
    const equityCurve: EquityPoint[] = [];

    // 1. Pre-calculate HTF trend context to avoid lookahead bias
    const htfAnalysis = analyzeCandles(htfCandles);
    const htfTrendMap = new Map<number, TrendDirection>();
    let lastHtfTrend: TrendDirection = 'RANGE';
    let htfCandleIndex = 0;
    for(let i = 0; i < ltfCandles.length; i++) {
        const ltfTime = ltfCandles[i].time;
        while(htfCandleIndex < htfCandles.length - 1 && htfCandles[htfCandleIndex + 1].time <= ltfTime) {
            htfCandleIndex++;
        }
        // Only use trend from *closed* HTF candles
        if (htfCandles[htfCandleIndex].time < ltfTime) {
            const htfContextForLtfTime = analyzeCandles(htfCandles.slice(0, htfCandleIndex + 1));
            lastHtfTrend = htfContextForLtfTime.trend;
        }
        htfTrendMap.set(ltfTime, lastHtfTrend);
    }

    // 2. Main loop through LTF candles
    for (let i = MICRO_RANGE_PERIOD; i < ltfCandles.length; i++) {
        const candle = ltfCandles[i];
        
        // Handle open position
         if (position) {
            let exitPrice = 0;
            let reason: TradeCloseReason | null = null;
            if (position.direction === 'LONG') {
                if (candle.low <= position.slPrice) reason = 'STOP_LOSS';
                else if (candle.high >= position.tpPrice) reason = 'TAKE_PROFIT';
            } else { // SHORT
                if (candle.high >= position.slPrice) reason = 'STOP_LOSS';
                else if (candle.low <= position.tpPrice) reason = 'TAKE_PROFIT';
            }
             if (reason) {
                exitPrice = reason === 'STOP_LOSS' ? position.slPrice : position.tpPrice;
                const oldPosition = position;
                const grossPnl = oldPosition.direction === 'LONG'
                    ? (exitPrice - oldPosition.entryPrice) * oldPosition.size
                    : (oldPosition.entryPrice - exitPrice) * oldPosition.size;
                const commission = (oldPosition.entryPrice * oldPosition.size + exitPrice * oldPosition.size) * commissionRate;
                const netPnl = grossPnl - commission;

                capital += netPnl;
                totalTrades++;
                if (netPnl > 0) winningTrades++;
                if (grossPnl > 0) totalGrossProfit += grossPnl; else totalGrossLoss += Math.abs(grossPnl);
                
                const duration = i - oldPosition.entryIndex;
                totalTradeDurationInBars += duration;
                
                tradeLog.push(oldPosition.direction === 'LONG' 
                  ? { type: 'CLOSE_LONG', time: candle.time, price: exitPrice, grossPnl, commission, netPnl, reason, entryPrice: oldPosition.entryPrice, size: oldPosition.size, duration, capital }
                  : { type: 'CLOSE_SHORT', time: candle.time, price: exitPrice, grossPnl, commission, netPnl, reason, entryPrice: oldPosition.entryPrice, size: oldPosition.size, duration, capital }
                );
                equityCurve.push({ time: candle.time, capital });
                
                idleStartIndex = i;
                position = null;
                if (capital <= 0) break;
             }
        }
        
        // Look for new trade if flat
        if (!position) {
            const htfTrend = htfTrendMap.get(candle.time) ?? 'RANGE';
            const microRangeCandles = ltfCandles.slice(i - MICRO_RANGE_PERIOD, i);
            const microRangeHigh = Math.max(...microRangeCandles.map(c => c.high));
            const microRangeLow = Math.min(...microRangeCandles.map(c => c.low));

            const isMomentumCandle = Math.abs(candle.close - candle.open) / (candle.high - candle.low) > 0.7;

            // Bullish Breakout
            if (htfTrend === 'UPTREND' && candle.isBullish && isMomentumCandle && candle.close > microRangeHigh) {
                const entryPrice = candle.close;
                const slPrice = microRangeLow;
                const risk = entryPrice - slPrice;
                if (risk > 0) {
                    const tpPrice = entryPrice + risk * minRiskReward;
                    const rr = (tpPrice - entryPrice) / risk;
                    const riskAmount = capital * (riskPerTradePercent / 100);
                    const size = riskAmount / risk;
                    
                    const idleDuration = i - idleStartIndex;
                    longestIdleDurationBars = Math.max(longestIdleDurationBars, idleDuration);
                    
                    position = { direction: 'LONG', entryPrice, size, slPrice, tpPrice, entryIndex: i };
                    tradeLog.push({ type: 'SHORT_TERM_ENTER_LONG', time: candle.time, htfTrend, price: entryPrice, slPrice, tpPrice, rr });
                }
            }
            // Bearish Breakout
            else if (htfTrend === 'DOWNTREND' && !candle.isBullish && isMomentumCandle && candle.close < microRangeLow) {
                 const entryPrice = candle.close;
                const slPrice = microRangeHigh;
                const risk = slPrice - entryPrice;
                 if (risk > 0) {
                    const tpPrice = entryPrice - risk * minRiskReward;
                    const rr = (entryPrice - tpPrice) / risk;
                    const riskAmount = capital * (riskPerTradePercent / 100);
                    const size = riskAmount / risk;
                    
                    const idleDuration = i - idleStartIndex;
                    longestIdleDurationBars = Math.max(longestIdleDurationBars, idleDuration);

                    position = { direction: 'SHORT', entryPrice, size, slPrice, tpPrice, entryIndex: i };
                    tradeLog.push({ type: 'SHORT_TERM_ENTER_SHORT', time: candle.time, htfTrend, price: entryPrice, slPrice, tpPrice, rr });
                }
            } else if (htfTrend !== 'RANGE' && ((htfTrend === 'UPTREND' && !candle.isBullish) || (htfTrend === 'DOWNTREND' && candle.isBullish)) && isMomentumCandle && (candle.close > microRangeHigh || candle.close < microRangeLow)) {
                const direction = candle.isBullish ? 'LONG' : 'SHORT';
                tradeLog.push({ type: 'SHORT_TERM_SKIPPED_TREND', time: candle.time, direction, htfTrend });
                skippedSignals++;
            }
        }

        // Update equity curve
        if (position) {
            const unrealizedPnl = position.direction === 'LONG'
                ? (candle.close - position.entryPrice) * position.size
                : (position.entryPrice - candle.close) * position.size;
            equityCurve.push({ time: candle.time, capital: capital + unrealizedPnl });
        } else {
             equityCurve.push({ time: candle.time, capital });
        }
    }
    
    // Close any final open position
    if (position !== null) {
        const lastCandle = ltfCandles[ltfCandles.length - 1];
        const grossPnl = position.direction === 'LONG'
            ? (lastCandle.close - position.entryPrice) * position.size
            : (position.entryPrice - lastCandle.close) * position.size;
        const commission = (position.entryPrice * position.size + lastCandle.close * position.size) * commissionRate;
        const netPnl = grossPnl - commission;
        capital += netPnl;
        const duration = (ltfCandles.length - 1) - position.entryIndex;
        totalTradeDurationInBars += duration;
        tradeLog.push(position.direction === 'LONG' 
            ? { type: 'CLOSE_LONG', time: lastCandle.time, price: lastCandle.close, grossPnl, commission, netPnl, reason: 'END_OF_DATA', entryPrice: position.entryPrice, size: position.size, duration, capital }
            : { type: 'CLOSE_SHORT', time: lastCandle.time, price: lastCandle.close, grossPnl, commission, netPnl, reason: 'END_OF_DATA', entryPrice: position.entryPrice, size: position.size, duration, capital }
        );
        equityCurve.push({ time: lastCandle.time, capital });
        idleStartIndex = ltfCandles.length - 1;
    }
    
    if (!position) {
        const finalIdleDuration = (ltfCandles.length - 1) - idleStartIndex;
        longestIdleDurationBars = Math.max(longestIdleDurationBars, finalIdleDuration);
    }

    capital = Math.max(0, capital);
    
    const pnl = capital - initialCapital;
    const pnlPercentage = (pnl / initialCapital) * 100;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    return { finalCapital: capital, pnl, pnlPercentage, totalTrades, winRate, tradeLog, equityCurve, settings, totalGrossProfit, totalGrossLoss, totalTradeDurationInBars, skippedSignals, longestIdleDurationBars };
};


export const runBacktest = (
    candles: Candle[],
    patterns: DetectedPattern[],
    context: { trend: TrendDirection; swingHighs: TrendPoint[]; swingLows: TrendPoint[] },
    settings: BacktestSettings,
    t: (key: string) => string,
    htfCandles?: Candle[]
): BacktestResult => {
    
    const startTime = candles.length > 0 ? candles[0].time - 1 : Date.now() / 1000;
    const startLog: TradeLogEvent = { type: 'START', time: startTime, capital: settings.initialCapital };

    if (candles.length === 0) {
        return {
            finalCapital: settings.initialCapital, pnl: 0, pnlPercentage: 0, totalTrades: 0, winRate: 0,
            tradeLog: [ startLog, { type: 'FINISH', time: Date.now() / 1000 }],
            equityCurve: [{ time: startTime, capital: settings.initialCapital }], settings, maxDrawdown: 0, profitFactor: 0, avgTradeDurationBars: 0, longestIdleDurationBars: candles.length, skippedSignals: 0
        };
    }
    
    let result;
    if (settings.strategy === 'SHORT_TERM' && htfCandles) {
        result = runShortTermBacktest(candles, htfCandles, settings, t);
    } else {
        result = runStructuralBacktest(candles, patterns, context, settings, t);
    }
    
    const { finalCapital, pnl, pnlPercentage, totalTrades, winRate, tradeLog, equityCurve, totalGrossProfit, totalGrossLoss, totalTradeDurationInBars, skippedSignals, longestIdleDurationBars } = result;

    const profitFactor = totalGrossLoss > 0 ? totalGrossProfit / totalGrossLoss : Infinity;
    const avgTradeDurationBars = totalTrades > 0 ? totalTradeDurationInBars / totalTrades : 0;

    let peakEquity = settings.initialCapital;
    let maxDrawdown = 0;
    equityCurve.forEach(point => {
        peakEquity = Math.max(peakEquity, point.capital);
        const drawdown = peakEquity > 0 ? (peakEquity - point.capital) / peakEquity : 0;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    const finalLog = [startLog, ...tradeLog, { type: 'FINISH', time: candles[candles.length - 1]?.time || Date.now() / 1000 }];

    return {
        finalCapital, pnl, pnlPercentage, totalTrades, winRate,
        tradeLog: finalLog.reverse(), 
        equityCurve, 
        settings, 
        maxDrawdown, 
        profitFactor,
        avgTradeDurationBars,
        longestIdleDurationBars,
        skippedSignals
    };
};