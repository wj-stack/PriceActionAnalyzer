

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

const isStrongTrend = (ema20: (number | null)[], index: number, direction: 'up' | 'down'): boolean => {
    if (index < 10) return false;
    const lookback = 5;
    const start = index - lookback;
    const slice = ema20.slice(start, index + 1);
    if (slice.some(v => v === null) || slice.length < lookback) return false;

    if (direction === 'up') {
        // Check if EMA is consistently rising
        for (let i = 1; i < slice.length; i++) {
            if (slice[i]! <= slice[i - 1]!) return false;
        }
    } else { // down
        // Check if EMA is consistently falling
        for (let i = 1; i < slice.length; i++) {
            if (slice[i]! >= slice[i - 1]!) return false;
        }
    }
    return true;
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
        && bodySize / totalRange < 0.33 // Small body
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
        && bodySize / totalRange < 0.33 // Small body
        && lowerWick / totalRange < 0.1 // Almost no lower wick
        && isUpTrend; // Occurs after an uptrend
};

const isDoji = (current: Candle): boolean => {
    const totalRange = current.high - current.low;
    if (totalRange === 0) return true; // A flat line is a doji
    const bodySize = Math.abs(current.close - current.open);
    return bodySize / totalRange < 0.1; // Body is less than 10% of the total range
};

const isBullishEngulfing = (current: Candle, prev: Candle): boolean => {
    const prevBody = Math.abs(prev.open - prev.close);
    const currentBody = Math.abs(current.open - current.close);
    return current.isBullish 
        && !prev.isBullish 
        && current.close > prev.open 
        && current.open < prev.close
        && currentBody > prevBody;
};

const isBearishEngulfing = (current: Candle, prev: Candle): boolean => {
     const prevBody = Math.abs(prev.open - prev.close);
    const currentBody = Math.abs(current.open - current.close);
    return !current.isBullish 
        && prev.isBullish 
        && current.close < prev.open 
        && current.open > prev.close
        && currentBody > prevBody;
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
            const { swingLow } = findSwingPoints(candles, i, 20);
            const priority = current.low <= swingLow ? 4 : 3; // Higher priority at a significant low
            return { index: i, candle: current, name: 'hammer', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'hammerDesc', priority };
        }
        return null;
    },
    (candles, i) => {
        const current = candles[i];
        const prev = candles[i-1];
        if (isShootingStar(current, prev, i, candles)) {
            const { swingHigh } = findSwingPoints(candles, i, 20);
            const priority = current.high >= swingHigh ? 4 : 3; // Higher priority at a significant high
            return { index: i, candle: current, name: 'shootingStar', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'shootingStarDesc', priority };
        }
        return null;
    },
     (candles, i) => {
        const current = candles[i];
        const prev = candles[i-1];
        if (isBullishEngulfing(current, prev)) {
             const { swingLow } = findSwingPoints(candles, i, 15);
             const isStrongBar = (current.close - current.open) > (current.high - current.low) * 0.7;
             let priority = 3;
             if (current.low <= swingLow) priority = 4; // Very high priority at a key low
             if (!isStrongBar) priority = Math.max(1, priority - 1);
             return { index: i, candle: current, name: 'bullishEngulfing', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'bullishEngulfingDesc', priority };
        }
        return null;
    },
    (candles, i) => {
        const current = candles[i];
        const prev = candles[i-1];
        if (isBearishEngulfing(current, prev)) {
             const { swingHigh } = findSwingPoints(candles, i, 15);
             const isStrongBar = (current.open - current.close) > (current.high - current.low) * 0.7;
             let priority = 3;
             if (current.high >= swingHigh) priority = 4; // Very high priority at a key high
             if (!isStrongBar) priority = Math.max(1, priority - 1);
             return { index: i, candle: current, name: 'bearishEngulfing', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'bearishEngulfingDesc', priority };
        }
        return null;
    },
     (candles, i) => {
        const current = candles[i];
         if (isDoji(current)) {
            const { swingHigh, swingLow } = findSwingPoints(candles, i, 10);
            // Doji is more significant at swing points
            const priority = current.high >= swingHigh || current.low <= swingLow ? 2 : 1;
            return { index: i, candle: current, name: 'doji', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'dojiDesc', priority };
        }
        return null;
    },
    (candles, i) => {
        const current = candles[i];
        const prev = candles[i-1];
        if (isBullishHarami(current, prev)) {
            const { swingLow } = findSwingPoints(candles, i, 10);
            const priority = current.low <= swingLow ? 2 : 1;
            return { index: i, candle: current, name: 'bullishHarami', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'bullishHaramiDesc', priority };
        }
        return null;
    },
    (candles, i) => {
        const current = candles[i];
        const prev = candles[i-1];
        if (isBearishHarami(current, prev)) {
            const { swingHigh } = findSwingPoints(candles, i, 10);
            const priority = current.high >= swingHigh ? 2 : 1;
            return { index: i, candle: current, name: 'bearishHarami', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'bearishHaramiDesc', priority };
        }
        return null;
    },
    (candles, i) => {
        const current = candles[i];
        const prev = candles[i-1];
        if (current.high > prev.high && current.low < prev.low) {
             const { swingHigh, swingLow } = findSwingPoints(candles, i, 15);
             let priority = 2;
             if ((current.isBullish && current.low <= swingLow) || (!current.isBullish && current.high >= swingHigh)) {
                 priority = 3;
             }
            if (current.isBullish) {
                return { index: i, candle: current, name: 'bullishOutsideBar', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'bullishOutsideBarDesc', priority };
            } else {
                return { index: i, candle: current, name: 'bearishOutsideBar', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'bearishOutsideBarDesc', priority };
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
        if (!ema || !isStrongTrend(ema20, i, 'up')) return null;
        
        const { swingHigh } = findSwingPoints(candles, i, 20); // Longer lookback for breakouts
        if (swingHigh > 0 && current.close > swingHigh && prev.close < swingHigh) {
            const isStrongClose = current.close > current.open + (current.high - current.low) * 0.6;
            return { index: i, candle: current, name: 'bullishBreakout', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'bullishBreakoutDesc', priority: isStrongClose ? 4 : 3 };
        }
        return null;
    },
    (candles, i, { ema20 }) => {
        const current = candles[i];
        const prev = candles[i-1];
        const ema = ema20[i];
        if (!ema || !isStrongTrend(ema20, i, 'down')) return null;

        const { swingLow } = findSwingPoints(candles, i, 20);
        if (swingLow < Infinity && current.close < swingLow && prev.close > swingLow) {
            const isStrongClose = current.close < current.open - (current.high - current.low) * 0.6;
            return { index: i, candle: current, name: 'bearishBreakout', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'bearishBreakoutDesc', priority: isStrongClose ? 4 : 3 };
        }
        return null;
    },
    (candles, i, { ema20 }) => {
        const current = candles[i];
        const ema = ema20[i];
        if (!ema || !ema20[i-1] || !isStrongTrend(ema20, i, 'up')) return null;
        
        // A pullback touches the EMA and bounces
        if (current.low <= ema && current.isBullish) {
             const isStrongBar = (current.close - current.open) > (current.high - current.low) * 0.5;
             return { index: i, candle: current, name: 'emaPullbackBull', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'emaPullbackBullDesc', priority: isStrongBar ? 4 : 3 };
        }
        return null;
    },
    (candles, i, { ema20 }) => {
        const current = candles[i];
        const ema = ema20[i];
        if (!ema || !ema20[i-1] || !isStrongTrend(ema20, i, 'down')) return null;
        
        if (current.high >= ema && !current.isBullish) {
             const isStrongBar = (current.open - current.close) > (current.high - current.low) * 0.5;
             return { index: i, candle: current, name: 'emaPullbackBear', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'emaPullbackBearDesc', priority: isStrongBar ? 4 : 3 };
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
            const body = c.close - c.open;
            return c.isBullish && (upperWick / range) < 0.25 && body / range > 0.6;
        }

        if (isSoldier(c1) && isSoldier(c2) && isSoldier(c3) &&
            c3.close > c2.close && c2.close > c1.close && 
            c2.open > c1.open && c2.open < c1.close && 
            c3.open > c2.open && c3.open < c2.close
        ) {
            return { index: i, candle: c3, name: 'threeSoldiers', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'threeSoldiersDesc', priority: 3 };
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
            const body = c.open - c.close;
            return !c.isBullish && (lowerWick / range) < 0.25 && body / range > 0.6;
        }

        if (isCrow(c1) && isCrow(c2) && isCrow(c3) &&
            c3.close < c2.close && c2.close < c1.close && 
            c2.open < c1.open && c2.open > c1.close && 
            c3.open < c2.open && c3.open > c2.close
        ) {
            return { index: i, candle: c3, name: 'threeCrows', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'threeCrowsDesc', priority: 3 };
        }
        return null;
    },
];

const rangeDetectors: PatternDetector[] = [
    (candles, i, { ema20 }) => {
        const current = candles[i];
        const prev = candles[i-1];
        const ema = ema20[i];
        const trendUp = isStrongTrend(ema20, i, 'up');
        const trendDown = isStrongTrend(ema20, i, 'down');
        if (!ema || trendUp || trendDown) return null; // Only in ranging markets

        const { swingHigh } = findSwingPoints(candles, i, 20);
        if (swingHigh > 0 && prev.high > swingHigh && current.close < swingHigh && !current.isBullish) {
            // A strong reversal bar makes this a very high probability trade
            const priority = isBearishEngulfing(current, prev) ? 4 : 3;
            return { index: i, candle: current, name: 'failedBullishBreakout', type: PatternType.Range, direction: SignalDirection.Bearish, description: 'failedBullishBreakoutDesc', priority };
        }
        return null;
    },
    (candles, i, { ema20 }) => {
        const current = candles[i];
        const prev = candles[i-1];
        const ema = ema20[i];
        const trendUp = isStrongTrend(ema20, i, 'up');
        const trendDown = isStrongTrend(ema20, i, 'down');
        if (!ema || trendUp || trendDown) return null;

        const { swingLow } = findSwingPoints(candles, i, 20);
        if (swingLow < Infinity && prev.low < swingLow && current.close > swingLow && current.isBullish) {
            const priority = isBullishEngulfing(current, prev) ? 4 : 3;
            return { index: i, candle: current, name: 'failedBearishBreakout', type: PatternType.Range, direction: SignalDirection.Bullish, description: 'failedBearishBreakoutDesc', priority };
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

    // De-duplicate patterns for the same index, prioritizing higher priority signals
    const patternMap = new Map<number, DetectedPattern>();
    for (const p of patterns) {
        if (!patternMap.has(p.index) || p.priority > patternMap.get(p.index)!.priority) {
            patternMap.set(p.index, p);
        }
    }
    
    return Array.from(patternMap.values());
};