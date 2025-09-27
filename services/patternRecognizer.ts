

import type { Candle, DetectedPattern } from '../types';
import { PatternType, SignalDirection } from '../types';

// --- Type Definitions for Clarity ---
type PatternDetector = (candles: Candle[], i: number, context: AnalysisContext) => DetectedPattern | null;
interface AnalysisContext {
    ema20: (number | null)[];
}

// --- Helper Functions ---

const calculateEMA = (candles: Candle[], period: number): (number | null)[] => {
    const emaValues: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period) return emaValues;
    let sma = candles.slice(0, period).reduce((sum, candle) => sum + candle.close, 0) / period;
    emaValues[period - 1] = sma;
    const multiplier = 2 / (period + 1);
    for (let i = period; i < candles.length; i++) {
        const ema = (candles[i].close - emaValues[i - 1]!) * multiplier + emaValues[i - 1]!;
        emaValues[i] = ema;
    }
    return emaValues;
};

const findSwingPoints = (candles: Candle[], index: number, lookback: number): { swingHigh: number, swingLow: number } => {
    const start = Math.max(0, index - lookback);
    const slice = candles.slice(start, index);
    if (slice.length === 0) return { swingHigh: 0, swingLow: Infinity };
    let swingHigh = 0;
    let swingLow = Infinity;
    for (const candle of slice) {
        if (candle.high > swingHigh) swingHigh = candle.high;
        if (candle.low < swingLow) swingLow = candle.low;
    }
    return { swingHigh, swingLow };
};

// --- Individual Pattern Detector Functions ---

const isHammer = (current: Candle, prev: Candle, i: number, candles: Candle[]): boolean => {
    const totalRange = current.high - current.low;
    if (totalRange === 0) return false;
    const bodySize = Math.abs(current.close - current.open);
    const lowerWick = Math.min(current.open, current.close) - current.low;
    const upperWick = current.high - Math.max(current.open, current.close);
    const isDownTrend = findSwingPoints(candles, i, 10).swingLow > current.low;

    return lowerWick >= bodySize * 2 // Lower wick at least 2x body
        && bodySize / totalRange < 0.3 // Small body
        && upperWick / totalRange < 0.1 // Almost no upper wick
        && isDownTrend; // Occurs after a downtrend
};

const isShootingStar = (current: Candle, prev: Candle, i: number, candles: Candle[]): boolean => {
    const totalRange = current.high - current.low;
    if (totalRange === 0) return false;
    const bodySize = Math.abs(current.close - current.open);
    const upperWick = current.high - Math.max(current.open, current.close);
    const lowerWick = Math.min(current.open, current.close) - current.low;
    const isUpTrend = findSwingPoints(candles, i, 10).swingHigh < current.high;
    
    return upperWick >= bodySize * 2 // Upper wick at least 2x body
        && bodySize / totalRange < 0.3 // Small body
        && lowerWick / totalRange < 0.1 // Almost no lower wick
        && isUpTrend; // Occurs after an uptrend
};

const isDoji = (current: Candle): boolean => {
    const totalRange = current.high - current.low;
    if (totalRange === 0) return true; // A flat line is a doji
    const bodySize = Math.abs(current.close - current.open);
    return bodySize / totalRange < 0.05; // Body is less than 5% of the total range
};

const isBullishEngulfing = (current: Candle, prev: Candle): boolean => {
    const prevBody = Math.abs(prev.open - prev.close);
    const currentBody = Math.abs(current.open - current.close);
    return current.isBullish 
        && !prev.isBullish 
        && current.close > prev.open 
        && current.open < prev.close
        && currentBody > prevBody * 1.1; // Body is at least 10% larger
};

const isBearishEngulfing = (current: Candle, prev: Candle): boolean => {
     const prevBody = Math.abs(prev.open - prev.close);
    const currentBody = Math.abs(current.open - current.close);
    return !current.isBullish 
        && prev.isBullish 
        && current.close < prev.open 
        && current.open > prev.close
        && currentBody > prevBody * 1.1; // Body is at least 10% larger
};

const isBullishHarami = (current: Candle, prev: Candle): boolean => {
    return current.isBullish && !prev.isBullish && current.high < prev.high && current.low > prev.low && current.close < prev.open && current.open > prev.close;
};

const isBearishHarami = (current: Candle, prev: Candle): boolean => {
    return !current.isBullish && prev.isBullish && current.high < prev.high && current.low > prev.low && current.close > prev.open && current.open < prev.close;
};


// --- Refactored Detector Implementations ---

const reversalDetectors: PatternDetector[] = [
    (candles, i) => {
        const current = candles[i];
        const prev = candles[i-1];
        if (isHammer(current, prev, i, candles)) {
            return { index: i, candle: current, name: 'hammer', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'hammerDesc', priority: 3 };
        }
        return null;
    },
    (candles, i) => {
        const current = candles[i];
        const prev = candles[i-1];
        if (isShootingStar(current, prev, i, candles)) {
            return { index: i, candle: current, name: 'shootingStar', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'shootingStarDesc', priority: 3 };
        }
        return null;
    },
     (candles, i) => {
        const current = candles[i];
        const prev = candles[i-1];
        const { swingLow } = findSwingPoints(candles, i, 15);
        if (current.low <= swingLow && isBullishEngulfing(current, prev)) {
             return { index: i, candle: current, name: 'bullishEngulfing', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'bullishEngulfingDesc', priority: 3 };
        }
        return null;
    },
    (candles, i) => {
        const current = candles[i];
        const prev = candles[i-1];
        const { swingHigh } = findSwingPoints(candles, i, 15);
        if (current.high >= swingHigh && isBearishEngulfing(current, prev)) {
             return { index: i, candle: current, name: 'bearishEngulfing', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'bearishEngulfingDesc', priority: 3 };
        }
        return null;
    },
     (candles, i) => {
        const current = candles[i];
         if (isDoji(current)) {
            return { index: i, candle: current, name: 'doji', type: PatternType.Reversal, direction: current.isBullish ? SignalDirection.Bullish : SignalDirection.Bearish, description: 'dojiDesc', priority: 1 };
        }
        return null;
    },
    (candles, i) => {
        const current = candles[i];
        const prev = candles[i-1];
        if (isBullishHarami(current, prev)) {
            return { index: i, candle: current, name: 'bullishHarami', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'bullishHaramiDesc', priority: 1 };
        }
        return null;
    },
    (candles, i) => {
        const current = candles[i];
        const prev = candles[i-1];
        if (isBearishHarami(current, prev)) {
            return { index: i, candle: current, name: 'bearishHarami', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'bearishHaramiDesc', priority: 1 };
        }
        return null;
    },
    (candles, i) => { // Legacy Outside Bar
        const current = candles[i];
        const prev = candles[i-1];
        if (current.high > prev.high && current.low < prev.low) {
            if (current.isBullish) {
                return { index: i, candle: current, name: 'bullishOutsideBar', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'bullishOutsideBarDesc', priority: 2 };
            } else {
                return { index: i, candle: current, name: 'bearishOutsideBar', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'bearishOutsideBarDesc', priority: 2 };
            }
        }
        return null;
    },
];

const trendDetectors: PatternDetector[] = [
    (candles, i, { ema20 }) => {
        const current = candles[i];
        const prev = candles[i-1];
        const ema = ema20[i];
        if (!ema || !ema20[i-1]) return null;
        const isAboveEma = current.close > ema;
        const emaSlope = ema > ema20[i - 1]! ? 'up' : 'down';
        if (isAboveEma && emaSlope === 'up') {
            const { swingHigh } = findSwingPoints(candles, i, 10);
            if (swingHigh > 0 && current.close > swingHigh && prev.close < swingHigh) {
                 return { index: i, candle: current, name: 'bullishBreakout', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'bullishBreakoutDesc', priority: 2 };
            }
        }
        return null;
    },
    (candles, i, { ema20 }) => {
        const current = candles[i];
        const prev = candles[i-1];
        const ema = ema20[i];
        if (!ema || !ema20[i-1]) return null;
        const isBelowEma = current.close < ema;
        const emaSlope = ema > ema20[i - 1]! ? 'up' : 'down';
        if (isBelowEma && emaSlope === 'down') {
            const { swingLow } = findSwingPoints(candles, i, 10);
            if (swingLow < Infinity && current.close < swingLow && prev.close > swingLow) {
                 return { index: i, candle: current, name: 'bearishBreakout', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'bearishBreakoutDesc', priority: 2 };
            }
        }
        return null;
    },
    (candles, i, { ema20 }) => {
        const current = candles[i];
        const ema = ema20[i];
        if (!ema || !ema20[i-1]) return null;
        const emaSlope = ema > ema20[i - 1]! ? 'up' : 'down';
        if (current.close > ema && emaSlope === 'up' && current.low <= ema && candles[i-1].low > ema && current.isBullish) {
            return { index: i, candle: current, name: 'emaPullbackBull', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'emaPullbackBullDesc', priority: 1 };
        }
        return null;
    },
    (candles, i, { ema20 }) => {
        const current = candles[i];
        const ema = ema20[i];
        if (!ema || !ema20[i-1]) return null;
        const emaSlope = ema > ema20[i - 1]! ? 'up' : 'down';
        if (current.close < ema && emaSlope === 'down' && current.high >= ema && candles[i-1].high < ema && !current.isBullish) {
            return { index: i, candle: current, name: 'emaPullbackBear', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'emaPullbackBearDesc', priority: 1 };
        }
        return null;
    },
     (candles, i) => { // Three Soldiers
        if (i < 2) return null;
        const c1 = candles[i-2], c2 = candles[i-1], c3 = candles[i];

        const isSoldier = (c: Candle) => {
            const range = c.high - c.low;
            if (range === 0) return false;
            const upperWick = c.high - c.close;
            return c.isBullish && (upperWick / range) < 0.25; // Upper wick is small
        }

        if (isSoldier(c1) && isSoldier(c2) && isSoldier(c3) &&
            c3.close > c2.close && c2.close > c1.close && // Each closes higher
            c2.open > c1.open && c2.open < c1.close && // c2 opens in c1 body
            c3.open > c2.open && c3.open < c2.close    // c3 opens in c2 body
        ) {
            return { index: i, candle: c3, name: 'threeSoldiers', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'threeSoldiersDesc', priority: 2 };
        }
        return null;
    },
    (candles, i) => { // Three Crows
        if (i < 2) return null;
        const c1 = candles[i-2], c2 = candles[i-1], c3 = candles[i];
        
        const isCrow = (c: Candle) => {
            const range = c.high - c.low;
            if (range === 0) return false;
            const lowerWick = c.close - c.low;
            return !c.isBullish && (lowerWick / range) < 0.25; // Lower wick is small
        }

        if (isCrow(c1) && isCrow(c2) && isCrow(c3) &&
            c3.close < c2.close && c2.close < c1.close && // Each closes lower
            c2.open < c1.open && c2.open > c1.close && // c2 opens in c1 body
            c3.open < c2.open && c3.open > c2.close    // c3 opens in c2 body
        ) {
            return { index: i, candle: c3, name: 'threeCrows', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'threeCrowsDesc', priority: 2 };
        }
        return null;
    },
];

const rangeDetectors: PatternDetector[] = [
    (candles, i, { ema20 }) => {
        const current = candles[i];
        const prev = candles[i-1];
        const ema = ema20[i];
        if (!ema) return null;
        const isRanging = Math.abs(current.close - ema) < (current.high - current.low);
        if (isRanging) {
            const { swingHigh } = findSwingPoints(candles, i, 20);
            if (swingHigh > 0 && prev.high > swingHigh && current.close < swingHigh && !current.isBullish) {
                 return { index: i, candle: current, name: 'failedBullishBreakout', type: PatternType.Range, direction: SignalDirection.Bearish, description: 'failedBullishBreakoutDesc', priority: 1 };
            }
        }
        return null;
    },
    (candles, i, { ema20 }) => {
        const current = candles[i];
        const prev = candles[i-1];
        const ema = ema20[i];
        if (!ema) return null;
        const isRanging = Math.abs(current.close - ema) < (current.high - current.low);
        if (isRanging) {
            const { swingLow } = findSwingPoints(candles, i, 20);
            if (swingLow < Infinity && prev.low < swingLow && current.close > swingLow && current.isBullish) {
                 return { index: i, candle: current, name: 'failedBearishBreakout', type: PatternType.Range, direction: SignalDirection.Bullish, description: 'failedBearishBreakoutDesc', priority: 1 };
            }
        }
        return null;
    }
];

const allDetectors = [...reversalDetectors, ...trendDetectors, ...rangeDetectors];

export const analyzeCandles = (candles: Candle[]): DetectedPattern[] => {
    const patterns: DetectedPattern[] = [];
    if (candles.length < 21) return [];

    const context: AnalysisContext = {
        ema20: calculateEMA(candles, 20),
    };

    for (let i = 1; i < candles.length; i++) {
        for (const detector of allDetectors) {
            const result = detector(candles, i, context);
            if (result) {
                patterns.push(result);
            }
        }
    }

    // Remove duplicate patterns for the same index to prioritize more specific ones (e.g. Engulfing over Outside Bar)
    const uniquePatterns = Array.from(new Map(patterns.reverse().map(p => [p.index, p])).values()).reverse();
    
    return uniquePatterns;
};