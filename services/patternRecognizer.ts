import type { Candle, DetectedPattern, TrendPoint, TrendLine, TrendDirection } from '../types';
import { PatternType, SignalDirection } from '../types';

// --- Type Definitions for Clarity ---
type PatternDetector = (candles: Candle[], i: number, context: AnalysisContext) => DetectedPattern | null;
interface AnalysisContext {
    ema20: (number | null)[];
    volumeSma20: (number | null)[];
    trend: TrendDirection;
    swingHighs: TrendPoint[];
    swingLows: TrendPoint[];
}

// --- Helper Functions ---

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

const getBody = (candle: Candle) => Math.abs(candle.close - candle.open);
const getRange = (candle: Candle) => candle.high - candle.low;

// New helper to check proximity to a key level (prior high/low)
const getProximityBonus = (
    price: number,
    keyLevels: TrendPoint[],
    currentIndex: number,
    candleRange: number
): number => {
    // Look for key levels that occurred before the current candle
    const relevantLevels = keyLevels.filter(level => level.index < currentIndex);
    if (relevantLevels.length === 0) return 0;

    let minDistance = Infinity;
    for (const level of relevantLevels) {
        const distance = Math.abs(price - level.price);
        if (distance < minDistance) {
            minDistance = distance;
        }
    }
    
    // Give a strong bonus if price is very close to a key level (within half a candle's range)
    if (minDistance <= candleRange * 0.5) {
        return 40;
    }
    // Give a medium bonus if reasonably close (within one candle's range)
    if (minDistance <= candleRange) {
        return 20;
    }

    return 0;
};


const findMajorSwingPoints = (candles: Candle[], pivotLegs = 10): {swingHighs: TrendPoint[], swingLows: TrendPoint[]} => {
    const swingHighs: TrendPoint[] = [];
    const swingLows: TrendPoint[] = [];

    for (let i = pivotLegs; i < candles.length - pivotLegs; i++) {
        const centerCandle = candles[i];
        let isSwingHigh = true;
        let isSwingLow = true;

        for (let j = 1; j <= pivotLegs; j++) {
            if (candles[i - j].high > centerCandle.high || candles[i + j].high > centerCandle.high) {
                isSwingHigh = false;
            }
            if (candles[i - j].low < centerCandle.low || candles[i + j].low < centerCandle.low) {
                isSwingLow = false;
            }
        }
        if (isSwingHigh) {
            swingHighs.push({ index: i, price: centerCandle.high, time: centerCandle.time });
        }
        if (isSwingLow) {
            swingLows.push({ index: i, price: centerCandle.low, time: centerCandle.time });
        }
    }
    return { swingHighs, swingLows };
}

const detectTrend = (swingHighs: TrendPoint[], swingLows: TrendPoint[]): TrendDirection => {
    const lastHigh = swingHighs[swingHighs.length - 1];
    const prevHigh = swingHighs[swingHighs.length - 2];
    const lastLow = swingLows[swingLows.length - 1];
    const prevLow = swingLows[swingLows.length - 2];

    if (!lastHigh || !prevHigh || !lastLow || !prevLow) {
        return 'RANGE';
    }

    const isUptrend = lastHigh.price > prevHigh.price && lastLow.price > prevLow.price;
    const isDowntrend = lastHigh.price < prevHigh.price && lastLow.price < prevLow.price;

    if (isUptrend) return 'UPTREND';
    if (isDowntrend) return 'DOWNTREND';
    
    return 'RANGE';
}


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

const isLongCandle = (candle: Candle) => {
    const range = getRange(candle);
    return range > 0 && getBody(candle) / range > 0.6;
};

const isShortCandle = (candle: Candle) => {
    const range = getRange(candle);
    if (range === 0) return true; 
    return getBody(candle) / range < 0.3;
};

// --- Individual Pattern Detector Functions ---

const reversalDetectors: PatternDetector[] = [
    // Hammer
    (candles, i, context) => {
        const current = candles[i];
        const totalRange = getRange(current);
        if (totalRange === 0) return null;

        const bodySize = getBody(current);
        const lowerWick = Math.min(current.open, current.close) - current.low;
        const lowerWickRatio = bodySize > 0 ? lowerWick / bodySize : 10;
        if (lowerWickRatio < 2.0) return null;

        let longStrength = 0;
        let shortStrength = 10;
        
        // ** ENHANCEMENT: Score higher if at a key support level (prior low) **
        longStrength += getProximityBonus(current.low, context.swingLows, i, totalRange);

        const avgVolume = context.volumeSma20[i];
        if (avgVolume && current.volume > avgVolume * 1.5) longStrength += 25;
        const closePosition = (current.close - current.low) / totalRange;
        if (closePosition > 0.7) longStrength += 25;
        if (current.isBullish) {
            longStrength += 20;
        } else {
            shortStrength += 20;
        }
        const upperWick = current.high - Math.max(current.open, current.close);
        if (upperWick / totalRange > 0.1) {
            shortStrength += 15;
        }

        const priority = longStrength > 75 ? 4 : (longStrength > 50 ? 3 : (longStrength > 25 ? 2 : 1));
        if (priority < 1) return null;
        
        return { index: i, candle: current, name: 'hammer', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'hammerDesc', priority, strengthScore: { long: Math.min(100, longStrength), short: Math.min(100, shortStrength) } };
    },
    // Shooting Star
    (candles, i, context) => {
        const current = candles[i];
        const totalRange = getRange(current);
        if (totalRange === 0) return null;

        const bodySize = getBody(current);
        const upperWick = current.high - Math.max(current.open, current.close);
        const upperWickRatio = bodySize > 0 ? upperWick / bodySize : 10;
        if (upperWickRatio < 2.0) return null;

        let longStrength = 10;
        let shortStrength = 0;
        
        // ** ENHANCEMENT: Score higher if at a key resistance level (prior high) **
        shortStrength += getProximityBonus(current.high, context.swingHighs, i, totalRange);

        const avgVolume = context.volumeSma20[i];
        if (avgVolume && current.volume > avgVolume * 1.5) shortStrength += 25;
        const closePosition = (current.high - current.close) / totalRange;
        if (closePosition > 0.7) shortStrength += 25;
        if (!current.isBullish) {
            shortStrength += 20;
        } else {
            longStrength += 20;
        }
        const lowerWick = Math.min(current.open, current.close) - current.low;
        if (lowerWick / totalRange > 0.1) {
            longStrength += 15;
        }

        const priority = shortStrength > 75 ? 4 : (shortStrength > 50 ? 3 : (shortStrength > 25 ? 2 : 1));
        if (priority < 1) return null;

        return { index: i, candle: current, name: 'shootingStar', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'shootingStarDesc', priority, strengthScore: { long: Math.min(100, longStrength), short: Math.min(100, shortStrength) } };
    },
    // Bullish Engulfing
    (candles, i, context) => {
        const current = candles[i];
        const prev = candles[i - 1];
        if (!current.isBullish || prev.isBullish || current.close <= prev.open || current.open >= prev.close) return null;
        
        const prevBody = getBody(prev);
        if (prevBody === 0) return null;

        let longStrength = 0;
        let shortStrength = 10;
        
        // ** ENHANCEMENT: Score higher if at a key support level (prior low) **
        longStrength += getProximityBonus(current.low, context.swingLows, i, getRange(current));
        
        const avgVolume = context.volumeSma20[i];
        if (avgVolume && current.volume > avgVolume * 1.5) longStrength += 25;
        if (current.high > prev.high && current.low < prev.low) longStrength += 20; // Engulfs range
        if (isStrongTrend(context.ema20, i - 1, 'down')) longStrength += 15;
        const upperWick = current.high - current.close;
        if (upperWick / getRange(current) > 0.3) shortStrength += 20;

        const priority = longStrength > 75 ? 4 : (longStrength > 50 ? 3 : (longStrength > 25 ? 2 : 1));
        if (priority < 2) return null; // Engulfing should be higher priority
        
        return { index: i, candle: current, name: 'bullishEngulfing', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'bullishEngulfingDesc', priority, strengthScore: { long: Math.min(100, longStrength), short: Math.min(100, shortStrength) } };
    },
    // Bearish Engulfing
    (candles, i, context) => {
        const current = candles[i];
        const prev = candles[i - 1];
        if (current.isBullish || !prev.isBullish || current.close >= prev.open || current.open <= prev.close) return null;

        const prevBody = getBody(prev);
        if (prevBody === 0) return null;
        
        let longStrength = 10;
        let shortStrength = 0;
        
        // ** ENHANCEMENT: Score higher if at a key resistance level (prior high) **
        shortStrength += getProximityBonus(current.high, context.swingHighs, i, getRange(current));
        
        const avgVolume = context.volumeSma20[i];
        if (avgVolume && current.volume > avgVolume * 1.5) shortStrength += 25;
        if (current.high > prev.high && current.low < prev.low) shortStrength += 20; // Engulfs range
        if (isStrongTrend(context.ema20, i - 1, 'up')) shortStrength += 15;
        const lowerWick = current.close - current.low;
        if (lowerWick / getRange(current) > 0.3) longStrength += 20;

        const priority = shortStrength > 75 ? 4 : (shortStrength > 50 ? 3 : (shortStrength > 25 ? 2 : 1));
        if (priority < 2) return null;

        return { index: i, candle: current, name: 'bearishEngulfing', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'bearishEngulfingDesc', priority, strengthScore: { long: Math.min(100, longStrength), short: Math.min(100, shortStrength) } };
    },
    // Doji
    (candles, i, context) => {
        const current = candles[i];
        const totalRange = getRange(current);
        const bodySize = getBody(current);
        const isDojiSignal = totalRange > 0 ? bodySize / totalRange < 0.1 : true;

        if (isDojiSignal) {
            let longStrength = 30;
            let shortStrength = 30;
            // ** ENHANCEMENT: A Doji at a key level is a strong sign of indecision/reversal **
            longStrength += getProximityBonus(current.low, context.swingLows, i, totalRange);
            shortStrength += getProximityBonus(current.high, context.swingHighs, i, totalRange);
            const priority = (longStrength > 50 || shortStrength > 50) ? 2 : 1;
            return { index: i, candle: current, name: 'doji', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'dojiDesc', priority, strengthScore: { long: Math.min(100, longStrength), short: Math.min(100, shortStrength) } };
        }
        return null;
    },
    // Bullish Harami
    (candles, i, context) => {
        const current = candles[i];
        const prev = candles[i - 1];
        if (current.isBullish && !prev.isBullish && current.high < prev.high && current.low > prev.low && current.close < prev.open && current.open > prev.close) {
            const longBonus = getProximityBonus(current.low, context.swingLows, i, getRange(prev));
            const priority = longBonus > 0 ? 2 : 1;
            return { index: i, candle: current, name: 'bullishHarami', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'bullishHaramiDesc', priority, strengthScore: { long: 30 + longBonus, short: 15 } };
        }
        return null;
    },
    // Bearish Harami
    (candles, i, context) => {
        const current = candles[i];
        const prev = candles[i - 1];
        if (!current.isBullish && prev.isBullish && current.high < prev.high && current.low > prev.low && current.close > prev.open && current.open < prev.close) {
            const shortBonus = getProximityBonus(current.high, context.swingHighs, i, getRange(prev));
            const priority = shortBonus > 0 ? 2 : 1;
            return { index: i, candle: current, name: 'bearishHarami', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'bearishHaramiDesc', priority, strengthScore: { long: 15, short: 30 + shortBonus } };
        }
        return null;
    },
    // Bullish/Bearish Outside Bar
    (candles, i, context) => {
        const current = candles[i];
        const prev = candles[i - 1];
        if (current.high > prev.high && current.low < prev.low) {
            let priority = 2;
            let longStrength = 50, shortStrength = 50;
            const longBonus = getProximityBonus(current.low, context.swingLows, i, getRange(current));
            const shortBonus = getProximityBonus(current.high, context.swingHighs, i, getRange(current));
            if (current.isBullish) {
                longStrength += longBonus;
                if (longBonus > 0) priority = 3;
                return { index: i, candle: current, name: 'bullishOutsideBar', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'bullishOutsideBarDesc', priority, strengthScore: { long: Math.min(100, longStrength), short: 20 } };
            } else {
                shortStrength += shortBonus;
                if (shortBonus > 0) priority = 3;
                return { index: i, candle: current, name: 'bearishOutsideBar', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'bearishOutsideBarDesc', priority, strengthScore: { long: 20, short: Math.min(100, shortStrength) } };
            }
        }
        return null;
    },
    // Morning/Evening Star
    (candles, i, context) => {
        if (i < 2) return null;
        const c1 = candles[i - 2], c2 = candles[i - 1], c3 = candles[i];

        const isMorningStar = !c1.isBullish && isLongCandle(c1) && isShortCandle(c2) && c2.close < c1.close && c3.isBullish && isLongCandle(c3) && c3.close > (c1.open + c1.close) / 2;
        if (isMorningStar) {
            const longBonus = getProximityBonus(c2.low, context.swingLows, i, getRange(c2));
            const priority = longBonus > 0 ? 4 : 3;
            return { index: i, candle: c3, name: 'morningStar', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'morningStarDesc', priority, strengthScore: { long: 60 + longBonus, short: 10 } };
        }

        const isEveningStar = c1.isBullish && isLongCandle(c1) && isShortCandle(c2) && c2.close > c1.close && !c3.isBullish && isLongCandle(c3) && c3.close < (c1.open + c1.close) / 2;
        if (isEveningStar) {
            const shortBonus = getProximityBonus(c2.high, context.swingHighs, i, getRange(c2));
            const priority = shortBonus > 0 ? 4 : 3;
            return { index: i, candle: c3, name: 'eveningStar', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'eveningStarDesc', priority, strengthScore: { long: 10, short: 60 + shortBonus } };
        }

        return null;
    },
    // Tower Top/Bottom
    (candles, i, context) => {
        if (i < 4) return null;
        const [c1, c2, c3, c4, c5] = candles.slice(i - 4, i + 1);
        const consolidationCandles = [c2, c3, c4];
        const lowPoint = Math.min(c1.low, ...consolidationCandles.map(c => c.low));
        const highPoint = Math.max(c1.high, ...consolidationCandles.map(c => c.high));

        // Tower Bottom Logic
        const isTowerBottomStructure = !c1.isBullish && isLongCandle(c1) && consolidationCandles.every(c => isShortCandle(c)) && Math.max(...consolidationCandles.map(c => c.high)) < c1.open && c5.isBullish && isLongCandle(c5);
        if (isTowerBottomStructure && c5.close > c1.close) {
            let longStrength = 30; // Base score for correct structure
            const longBonus = getProximityBonus(lowPoint, context.swingLows, i, getRange(c1));
            longStrength += longBonus;
            const priority = longStrength > 75 ? 4 : (longStrength > 50 ? 3 : 2);
            return { index: i, candle: c5, name: 'towerBottom', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'towerBottomDesc', priority, strengthScore: { long: Math.min(100, longStrength), short: 15 } };
        }

        // Tower Top Logic
        const isTowerTopStructure = c1.isBullish && isLongCandle(c1) && consolidationCandles.every(c => isShortCandle(c)) && Math.min(...consolidationCandles.map(c => c.low)) > c1.open && !c5.isBullish && isLongCandle(c5);
        if (isTowerTopStructure && c5.close < c1.close) {
            let shortStrength = 30; // Base score for correct structure
            const shortBonus = getProximityBonus(highPoint, context.swingHighs, i, getRange(c1));
            shortStrength += shortBonus;
            const priority = shortStrength > 75 ? 4 : (shortStrength > 50 ? 3 : 2);
            return { index: i, candle: c5, name: 'towerTop', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'towerTopDesc', priority, strengthScore: { long: 15, short: Math.min(100, shortStrength) } };
        }

        return null;
    },
];

const trendDetectors: PatternDetector[] = [
    (candles, i, context) => {
        const current = candles[i];
        const prev = candles[i - 1];
        if (!context.ema20[i] || !isStrongTrend(context.ema20, i, 'up')) return null;
        
        // ** ENHANCEMENT: Check for breakout of a major prior high **
        const relevantHighs = context.swingHighs.filter(h => h.index < i - 1);
        for (const swingHigh of relevantHighs) {
            if (current.close > swingHigh.price && prev.close < swingHigh.price) {
                const isStrongClose = current.close > current.open + getRange(current) * 0.6;
                const priority = isStrongClose ? 4 : 3;
                return { index: i, candle: current, name: 'bullishBreakout', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'bullishBreakoutDesc', priority, strengthScore: { long: priority * 25, short: 10 } };
            }
        }
        return null;
    },
    (candles, i, context) => {
        const current = candles[i];
        const prev = candles[i - 1];
        if (!context.ema20[i] || !isStrongTrend(context.ema20, i, 'down')) return null;
        
        // ** ENHANCEMENT: Check for breakdown of a major prior low **
        const relevantLows = context.swingLows.filter(l => l.index < i - 1);
        for (const swingLow of relevantLows) {
            if (current.close < swingLow.price && prev.close > swingLow.price) {
                const isStrongClose = current.close < current.open - getRange(current) * 0.6;
                const priority = isStrongClose ? 4 : 3;
                return { index: i, candle: current, name: 'bearishBreakout', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'bearishBreakoutDesc', priority, strengthScore: { long: 10, short: priority * 25 } };
            }
        }
        return null;
    },
    (candles, i, context) => {
        const current = candles[i];
        const ema = context.ema20[i];
        if (!ema || !context.ema20[i - 1] || !isStrongTrend(context.ema20, i, 'up')) return null;

        if (current.low <= ema && current.isBullish) {
            const isStrongBar = (current.close - current.open) > getRange(current) * 0.5;
            const priority = isStrongBar ? 4 : 3;
            return { index: i, candle: current, name: 'emaPullbackBull', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'emaPullbackBullDesc', priority, strengthScore: { long: 20 + priority * 15, short: 15 } };
        }
        return null;
    },
    (candles, i, context) => {
        const current = candles[i];
        const ema = context.ema20[i];
        if (!ema || !context.ema20[i - 1] || !isStrongTrend(context.ema20, i, 'down')) return null;

        if (current.high >= ema && !current.isBullish) {
            const isStrongBar = (current.open - current.close) > getRange(current) * 0.5;
            const priority = isStrongBar ? 4 : 3;
            return { index: i, candle: current, name: 'emaPullbackBear', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'emaPullbackBearDesc', priority, strengthScore: { long: 15, short: 20 + priority * 15 } };
        }
        return null;
    },
    (candles, i) => { // Three Soldiers
        if (i < 2) return null;
        const [c1, c2, c3] = candles.slice(i - 2, i + 1);
        const isSoldier = (c: Candle) => c.isBullish && (c.high - c.close) / getRange(c) < 0.25 && getBody(c) / getRange(c) > 0.6;

        if (isSoldier(c1) && isSoldier(c2) && isSoldier(c3) && c3.close > c2.close && c2.close > c1.close && c2.open > c1.open && c2.open < c1.close && c3.open > c2.open && c3.open < c2.close) {
            return { index: i, candle: c3, name: 'threeSoldiers', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'threeSoldiersDesc', priority: 3, strengthScore: { long: 85, short: 5 } };
        }
        return null;
    },
    (candles, i) => { // Three Crows
        if (i < 2) return null;
        const [c1, c2, c3] = candles.slice(i - 2, i + 1);
        const isCrow = (c: Candle) => !c.isBullish && (c.close - c.low) / getRange(c) < 0.25 && getBody(c) / getRange(c) > 0.6;

        if (isCrow(c1) && isCrow(c2) && isCrow(c3) && c3.close < c2.close && c2.close < c1.close && c2.open < c1.open && c2.open > c1.close && c3.open < c2.open && c3.open > c2.close) {
            return { index: i, candle: c3, name: 'threeCrows', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'threeCrowsDesc', priority: 3, strengthScore: { long: 5, short: 85 } };
        }
        return null;
    },
];

const rangeDetectors: PatternDetector[] = [
    // Failed Bullish Breakout (Bearish Reversal at Resistance)
    (candles, i, context) => {
        const current = candles[i];
        const prev = candles[i - 1];
        if (isStrongTrend(context.ema20, i, 'up') || isStrongTrend(context.ema20, i, 'down')) return null;

        // ** ENHANCEMENT: Check for failure at a major prior high **
        const relevantHighs = context.swingHighs.filter(h => h.index < i - 1 && h.index > i - 50); // Look at recent major highs
        if (relevantHighs.length === 0) return null;

        for (const swingHigh of relevantHighs) {
            if (prev.high > swingHigh.price && current.close < swingHigh.price && !current.isBullish) {
                const isEngulfing = !current.isBullish && prev.isBullish && current.close < prev.open && current.open > prev.close;
                const shortStrength = 60 + (isEngulfing ? 30 : 0);
                const priority = isEngulfing ? 4 : 3;
                return { index: i, candle: current, name: 'failedBullishBreakout', type: PatternType.Range, direction: SignalDirection.Bearish, description: 'failedBullishBreakoutDesc', priority, strengthScore: { long: 10, short: Math.min(100, shortStrength) } };
            }
        }
        return null;
    },
    // Failed Bearish Breakout (Bullish Reversal at Support)
    (candles, i, context) => {
        const current = candles[i];
        const prev = candles[i - 1];
        if (isStrongTrend(context.ema20, i, 'up') || isStrongTrend(context.ema20, i, 'down')) return null;

        // ** ENHANCEMENT: Check for failure at a major prior low **
        const relevantLows = context.swingLows.filter(l => l.index < i - 1 && l.index > i - 50); // Look at recent major lows
        if (relevantLows.length === 0) return null;

        for (const swingLow of relevantLows) {
            if (prev.low < swingLow.price && current.close > swingLow.price && current.isBullish) {
                const isEngulfing = current.isBullish && !prev.isBullish && current.close > prev.open && current.open < prev.close;
                const longStrength = 60 + (isEngulfing ? 30 : 0);
                const priority = isEngulfing ? 4 : 3;
                return { index: i, candle: current, name: 'failedBearishBreakout', type: PatternType.Range, direction: SignalDirection.Bullish, description: 'failedBearishBreakoutDesc', priority, strengthScore: { long: Math.min(100, longStrength), short: 10 } };
            }
        }
        return null;
    }
];

const allDetectors = [...reversalDetectors, ...trendDetectors, ...rangeDetectors];

const findTrendLines = (swingPoints: TrendPoint[], type: 'UP' | 'DOWN', candles: Candle[]): TrendLine[] => {
    const trendLines: TrendLine[] = [];
    const recentSwingPoints = swingPoints.slice(-30);
    if (recentSwingPoints.length < 2) return [];

    for (let i = 0; i < recentSwingPoints.length - 1; i++) {
        for (let j = i + 1; j < recentSwingPoints.length; j++) {
            const p1 = recentSwingPoints[i];
            const p2 = recentSwingPoints[j];
            
            if (p2.time === p1.time) continue;
            if ((type === 'UP' && p2.price < p1.price) || (type === 'DOWN' && p2.price > p1.price)) continue;
            
            const slope = (p2.price - p1.price) / (p2.time - p1.time);
            const intercept = p1.price - slope * p1.time;

            let isBrokenBetween = false;
            for (let k = p1.index + 1; k < p2.index; k++) {
                const linePrice = slope * candles[k].time + intercept;
                if ((type === 'UP' && candles[k].low < linePrice) || (type === 'DOWN' && candles[k].high > linePrice)) {
                    isBrokenBetween = true;
                    break;
                }
            }
            if (isBrokenBetween) continue;

            const touches = [p1, p2];
            let lastTouchIndex = p2.index;
            for (let k = p2.index + 1; k < candles.length; k++) {
                const candle = candles[k];
                const linePrice = slope * candle.time + intercept;
                const tolerance = candle.high * 0.005;
                if ((type === 'UP' && Math.abs(candle.low - linePrice) < tolerance) || (type === 'DOWN' && Math.abs(candle.high - linePrice) < tolerance)) {
                    touches.push({ index: k, price: type === 'UP' ? candle.low : candle.high, time: candle.time });
                    lastTouchIndex = k;
                }
                if ((type === 'UP' && candle.close < linePrice) || (type === 'DOWN' && candle.close > linePrice)) break;
            }

            const duration = lastTouchIndex - p1.index;
            if (touches.length >= 2 && duration > 5) {
                const strength = Math.min(5, Math.floor(touches.length / 2) + Math.floor(duration / 50));
                const trendLine: TrendLine = { p1, p2, touches, type, strength, slope, intercept };

                let maxDistance = 0;
                let channelPoint: TrendPoint | null = null;
                for (let k = p1.index; k <= lastTouchIndex; k++) {
                    const linePrice = slope * candles[k].time + intercept;
                    const distance = type === 'UP' ? candles[k].high - linePrice : linePrice - candles[k].low;
                    if (distance > maxDistance) {
                        maxDistance = distance;
                        channelPoint = { index: k, price: type === 'UP' ? candles[k].high : candles[k].low, time: candles[k].time };
                    }
                }
                if (channelPoint) {
                    trendLine.channelLine = { intercept: channelPoint.price - slope * channelPoint.time };
                }
                trendLines.push(trendLine);
            }
        }
    }
    return trendLines.sort((a, b) => b.strength - a.strength);
};

const detectTrendlineSignals = (candles: Candle[], trendlines: TrendLine[], context: AnalysisContext): DetectedPattern[] => {
    const signals: DetectedPattern[] = [];
    if (trendlines.length === 0) return [];

    for (let i = 20; i < candles.length; i++) {
        const candle = candles[i];
        const prevCandle = candles[i - 1];
        
        for (const tl of trendlines) {
            if (i < tl.p2.index + 2) continue;
            
            const linePriceAtCurrent = tl.slope * candle.time + tl.intercept;
            const linePriceAtPrev = tl.slope * prevCandle.time + tl.intercept;
            const avgVolume = context.volumeSma20[i];
            const isHighVolume = avgVolume && candle.volume > avgVolume * 1.5;

            if (tl.type === 'DOWN' && prevCandle.close < linePriceAtPrev && candle.close > linePriceAtCurrent) {
                signals.push({ index: i, candle, name: 'trendlineBreakoutUp', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'trendlineBreakoutUpDesc', priority: isHighVolume ? 4 : 3, strengthScore: { long: 60 + (isHighVolume ? 30 : 0), short: 10 } });
            }
            if (tl.type === 'UP' && prevCandle.close > linePriceAtPrev && candle.close < linePriceAtCurrent) {
                signals.push({ index: i, candle, name: 'trendlineBreakoutDown', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'trendlineBreakoutDownDesc', priority: isHighVolume ? 4 : 3, strengthScore: { long: 10, short: 60 + (isHighVolume ? 30 : 0) } });
            }
            
            const tolerance = candle.high * 0.005;
            if (tl.type === 'UP' && Math.abs(candle.low - linePriceAtCurrent) < tolerance && candle.isBullish && getBody(candle) / getRange(candle) > 0.5) {
                signals.push({ index: i, candle, name: 'trendlineBounceBullish', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'trendlineBounceBullishDesc', priority: isHighVolume ? 3 : 2, strengthScore: { long: 50 + (isHighVolume ? 25 : 0), short: 15 } });
            }
            if (tl.type === 'DOWN' && Math.abs(candle.high - linePriceAtCurrent) < tolerance && !candle.isBullish && getBody(candle) / getRange(candle) > 0.5) {
                signals.push({ index: i, candle, name: 'trendlineBounceBearish', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'trendlineBounceBearishDesc', priority: isHighVolume ? 3 : 2, strengthScore: { long: 15, short: 50 + (isHighVolume ? 25 : 0) } });
            }
        }
    }
    
    const signalMap = new Map<number, DetectedPattern>();
    for (const signal of signals) {
        if (!signalMap.has(signal.index) || signal.priority > signalMap.get(signal.index)!.priority) {
            signalMap.set(signal.index, signal);
        }
    }
    return Array.from(signalMap.values());
};


export const analyzeCandles = (candles: Candle[]): { patterns: DetectedPattern[], trendlines: TrendLine[] } => {
    if (candles.length < 21) return { patterns: [], trendlines: [] };

    const { swingHighs, swingLows } = findMajorSwingPoints(candles, 10);
    const trend = detectTrend(swingHighs, swingLows);

    const context: AnalysisContext = {
        ema20: calculateEMA(candles, 20),
        volumeSma20: calculateSMA(candles.map(c => c.volume), 20),
        trend,
        swingHighs,
        swingLows,
    };

    const patternMap = new Map<number, DetectedPattern>();
    for (let i = 1; i < candles.length; i++) {
        for (const detector of allDetectors) {
            const result = detector(candles, i, context);
            if (result) {
                if (!patternMap.has(result.index) || result.priority > patternMap.get(result.index)!.priority) {
                    patternMap.set(result.index, result);
                }
            }
        }
    }
    
    const basePatterns = Array.from(patternMap.values());

    const uptrendLines = findTrendLines(swingLows, 'UP', candles);
    const downtrendLines = findTrendLines(swingHighs, 'DOWN', candles);
    const trendlines = [...uptrendLines, ...downtrendLines]
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 4);

    const trendlinePatterns = detectTrendlineSignals(candles, trendlines, context);
    const allPatterns = [...basePatterns, ...trendlinePatterns];

    const lastLow = swingLows.length > 0 ? swingLows[swingLows.length - 1] : null;
    const lastHigh = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1] : null;

    for (const p of allPatterns) {
        if (trend === 'UPTREND' && p.direction === SignalDirection.Bullish && lastLow && p.index > lastLow.index) {
            if (p.candle.low >= lastLow.price) {
                p.isKeySignal = true;
                p.anchorPoint = lastLow;
            }
        } else if (trend === 'DOWNTREND' && p.direction === SignalDirection.Bearish && lastHigh && p.index > lastHigh.index) {
            if (p.candle.high <= lastHigh.price) {
                p.isKeySignal = true;
                p.anchorPoint = lastHigh;
            }
        }
    }
    
    return { patterns: allPatterns, trendlines };
};