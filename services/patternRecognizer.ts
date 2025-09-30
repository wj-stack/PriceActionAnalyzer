import type { Candle, DetectedPattern, TrendPoint, TrendLine, TrendDirection, MultiTimeframeAnalysis } from '../types';
import { PatternType, SignalDirection } from '../types';
import { calculateEMA, calculateRSI, calculateSMA, calculateATR } from './indicatorService';

// --- Type Definitions for Clarity ---
type PatternDetector = (candles: Candle[], i: number, context: AnalysisContext) => DetectedPattern | null;
interface AnalysisContext {
    ema20: (number | null)[];
    volumeSma20: (number | null)[];
    trend: TrendDirection; // Short-term trend
    overallTrend: TrendDirection; // Long-term trend
    swingHighs: TrendPoint[];
    swingLows: TrendPoint[];
    trendlines: TrendLine[];
    htfTrendlines: TrendLine[];
}
interface AnalysisOptions {
  maxTrendlineLength?: number;
}


// --- Helper Functions ---

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

const findTrendlines = (swingPoints: TrendPoint[], candles: Candle[], type: 'UP' | 'DOWN', atrValues: (number|null)[], maxTrendlineLength: number): TrendLine[] => {
    const trendlines: TrendLine[] = [];
    if (swingPoints.length < 2) return [];

    const priceAtPoint = (p: TrendPoint) => p.price;
    const timeAtPoint = (p: TrendPoint) => p.time;

    const avgPrice = candles.reduce((acc, c) => acc + c.close, 0) / candles.length;
    const validAtrValues = atrValues.filter((v): v is number => v !== null && v > 0);
    const avgAtr = validAtrValues.length > 0 ? validAtrValues.reduce((a, b) => a + b, 0) / validAtrValues.length : avgPrice * 0.01;

    for (let i = 0; i < swingPoints.length; i++) {
        for (let j = i + 1; j < swingPoints.length; j++) {
            const p1 = swingPoints[i];
            const p2 = swingPoints[j];

            if (timeAtPoint(p1) === timeAtPoint(p2)) continue;
            
            const slope = (priceAtPoint(p2) - priceAtPoint(p1)) / (timeAtPoint(p2) - timeAtPoint(p1));

            if (type === 'UP' && slope <= 0) continue;
            if (type === 'DOWN' && slope >= 0) continue;

            const intercept = priceAtPoint(p1) - slope * timeAtPoint(p1);

            const touches: TrendPoint[] = [p1, p2];
            for (let k = 0; k < swingPoints.length; k++) {
                if (k === i || k === j) continue;
                const p3 = swingPoints[k];
                const projectedPrice = slope * timeAtPoint(p3) + intercept;
                
                const tolerance = (atrValues[p3.index] ?? avgAtr) * 0.3;
                if (Math.abs(priceAtPoint(p3) - projectedPrice) < tolerance) {
                    touches.push(p3);
                }
            }

            if (touches.length >= 3) {
                touches.sort((a, b) => timeAtPoint(a) - timeAtPoint(b));
                const firstTouch = touches[0];
                const lastTouch = touches[touches.length - 1];

                // Explicitly filter out trendlines that are too long to be relevant.
                if (lastTouch.index - firstTouch.index > maxTrendlineLength) {
                    continue;
                }

                const duration = timeAtPoint(lastTouch) - timeAtPoint(firstTouch);
                
                let strength = Math.min(5, touches.length - 1);
                if (duration > 3600 * 24) strength = Math.min(5, strength + 1); // > 1 day
                if (duration > 3600 * 24 * 7) strength = Math.min(5, strength + 1); // > 1 week

                const id = `${firstTouch.time}-${type}-${slope.toFixed(8)}`;
                
                let channelLine: { intercept: number } | undefined = undefined;
                const candlesBetweenTouches = candles.slice(firstTouch.index, lastTouch.index + 1);
                if (candlesBetweenTouches.length > 0) {
                    if (type === 'UP') {
                        const highestPoint = candlesBetweenTouches.reduce((max, c) => c.high > max.price ? { price: c.high, time: c.time } : max, { price: -Infinity, time: 0 });
                        if (highestPoint.price !== -Infinity) {
                            channelLine = { intercept: highestPoint.price - slope * highestPoint.time };
                        }
                    } else {
                        const lowestPoint = candlesBetweenTouches.reduce((min, c) => c.low < min.price ? { price: c.low, time: c.time } : min, { price: Infinity, time: 0 });
                         if (lowestPoint.price !== Infinity) {
                            channelLine = { intercept: lowestPoint.price - slope * lowestPoint.time };
                        }
                    }
                }

                trendlines.push({
                    id, p1: firstTouch, p2: lastTouch, touches, type, strength, slope, intercept, channelLine,
                });
            }
        }
    }

    const uniqueTrendlines: TrendLine[] = [];
    trendlines.sort((a, b) => b.strength - a.strength || (b.p2.time - b.p1.time) - (a.p2.time - a.p1.time));
    for (const tl of trendlines) {
        let isUnique = true;
        for (const utl of uniqueTrendlines) {
            const duration = Math.max(tl.p2.time - tl.p1.time, utl.p2.time - utl.p1.time);
            if (duration === 0) continue;
            const slopeDiff = Math.abs(utl.slope - tl.slope) * duration / avgPrice;
            const interceptDiff = Math.abs(utl.intercept - tl.intercept) / avgPrice;
            if (slopeDiff < 0.1 && interceptDiff < 0.1) {
                isUnique = false;
                break;
            }
        }
        if (isUnique) uniqueTrendlines.push(tl);
    }
    return uniqueTrendlines.slice(0, 5);
};

const isStrongTrend = (ema20: (number | null)[], index: number, direction: 'up' | 'down'): boolean => {
    if (index < 10) return false;
    const lookback = 5;
    const start = index - lookback;
    const slice = ema20.slice(start, index + 1);
    if (slice.some(v => v === null) || slice.length < lookback) return false;

    if (direction === 'up') {
        for (let i = 1; i < slice.length; i++) { if (slice[i]! <= slice[i - 1]!) return false; }
    } else {
        for (let i = 1; i < slice.length; i++) { if (slice[i]! >= slice[i - 1]!) return false; }
    }
    return true;
};

const isLongCandle = (candle: Candle) => getRange(candle) > 0 && getBody(candle) / getRange(candle) > 0.6;
const isShortCandle = (candle: Candle) => getRange(candle) === 0 || getBody(candle) / getRange(candle) < 0.3;

type AnalyzeCandlesResult = Omit<MultiTimeframeAnalysis, 'timeframe'> & {
    swingHighs: TrendPoint[];
    swingLows: TrendPoint[];
};

const reversalDetectors: PatternDetector[] = [ /* ... Omitted for brevity, no changes needed here ... */ ];
const trendDetectors: PatternDetector[] = [ /* ... Omitted for brevity, no changes needed here ... */ ];
const rangeDetectors: PatternDetector[] = [ /* ... Omitted for brevity, no changes needed here ... */ ];

// --- Main Analysis Function (REWRITTEN TO ELIMINATE LOOKAHEAD BIAS) ---
export const analyzeCandles = (candles: Candle[], htfTrendlines: TrendLine[] = [], options: AnalysisOptions = {}): AnalyzeCandlesResult => {
    if (candles.length === 0) {
        return { patterns: [], trendlines: [], trend: 'RANGE', rsi: { value: null, state: 'NEUTRAL' }, swingHighs: [], swingLows: [] };
    }
    
    const { maxTrendlineLength = 250 } = options;

    // Pre-calculate indicators that don't have lookahead bias
    const ema20 = calculateEMA(candles, 20);
    const ema200 = calculateEMA(candles, 200);
    const volumeSma20 = calculateSMA(candles.map(c => c.volume), 20);
    const atr14 = calculateATR(candles, 14);
    const rsiValues = calculateRSI(candles, 14);

    const allDetectedPatterns: DetectedPattern[] = [];
    const confirmedSwingHighs: TrendPoint[] = [];
    const confirmedSwingLows: TrendPoint[] = [];
    let currentTrendlines: TrendLine[] = [];
    
    const PIVOT_LEGS = 5;
    const TRENDLINE_LOOKBACK = 300;
    const allDetectors = [
        ...reversalDetectors,
        ...trendDetectors,
        ...rangeDetectors
    ];

    // Main simulation loop
    for (let i = PIVOT_LEGS; i < candles.length; i++) {
        // --- Step 1: Confirm Swing Points from the past ---
        // A swing point at `pivotIndex` is confirmed at `i` because we can see `PIVOT_LEGS` candles after it.
        const pivotIndex = i - PIVOT_LEGS;
        if (pivotIndex < PIVOT_LEGS) continue;

        const centerCandle = candles[pivotIndex];
        let isSwingHigh = true;
        let isSwingLow = true;
        
        for (let j = 1; j <= PIVOT_LEGS; j++) {
            if (candles[pivotIndex - j].high > centerCandle.high || candles[pivotIndex + j].high > centerCandle.high) isSwingHigh = false;
            if (candles[pivotIndex - j].low < centerCandle.low || candles[pivotIndex + j].low < centerCandle.low) isSwingLow = false;
        }
        
        let newSwingsFound = false;
        if (isSwingHigh) {
            confirmedSwingHighs.push({ index: pivotIndex, price: centerCandle.high, time: centerCandle.time });
            newSwingsFound = true;
        }
        if (isSwingLow) {
            confirmedSwingLows.push({ index: pivotIndex, price: centerCandle.low, time: centerCandle.time });
            newSwingsFound = true;
        }

        // --- Step 2: Recalculate Trendlines if new swings were found ---
        // This is computationally expensive but necessary for correctness.
        if (newSwingsFound) {
            const lookbackStartIndex = Math.max(0, i - TRENDLINE_LOOKBACK);
            const recentLows = confirmedSwingLows.filter(p => p.index >= lookbackStartIndex);
            const recentHighs = confirmedSwingHighs.filter(p => p.index >= lookbackStartIndex);
            
            // Pass only candles up to the current point `i` to `findTrendlines`
            const candlesUpToNow = candles.slice(0, i + 1);
            const upTrendlines = findTrendlines(recentLows, candlesUpToNow, 'UP', atr14, maxTrendlineLength);
            const downTrendlines = findTrendlines(recentHighs, candlesUpToNow, 'DOWN', atr14, maxTrendlineLength);
            currentTrendlines = [...upTrendlines, ...downTrendlines];
        }

        // --- Step 3: Determine Trends and Context at time `i` ---
        let shortTermTrend: TrendDirection = 'RANGE';
        if (i > 5) {
            const lastEma = ema20[i];
            const prevEma = ema20[i - 5];
            if (lastEma && prevEma && isStrongTrend(ema20, i, 'up')) shortTermTrend = 'UPTREND';
            if (lastEma && prevEma && isStrongTrend(ema20, i, 'down')) shortTermTrend = 'DOWNTREND';
        }

        let overallTrend: TrendDirection = 'RANGE';
        if (i > 210) {
            const trendLookback = 10;
            const end = i;
            const start = end - trendLookback;
            const lastEma200 = ema200[end];
            const prevEma200 = ema200[start];
            if (lastEma200 && prevEma200) {
                const slope = (lastEma200 - prevEma200) / trendLookback;
                const threshold = candles[end].close * 0.001 / trendLookback;
                if (slope > threshold) overallTrend = 'UPTREND';
                else if (slope < -threshold) overallTrend = 'DOWNTREND';
            }
        }

        // --- Step 4: Run Pattern Detectors for the current candle `i` ---
        const context: AnalysisContext = {
            ema20, volumeSma20,
            trend: shortTermTrend,
            overallTrend,
            swingHighs: confirmedSwingHighs,
            swingLows: confirmedSwingLows,
            trendlines: currentTrendlines, // Use only trendlines known at this point in time
            htfTrendlines,
        };

        for (const detector of allDetectors) {
            const pattern = detector(candles, i, context);
            if (pattern) {
                const isWithTrend = (context.overallTrend === 'UPTREND' && pattern.direction === SignalDirection.Bullish) ||
                                    (context.overallTrend === 'DOWNTREND' && pattern.direction === SignalDirection.Bearish);
                if (isWithTrend && pattern.priority >= 3) {
                    pattern.isKeySignal = true;
                }
                allDetectedPatterns.push(pattern);
            }
        }
    }

    // --- Final Step: Clean up and return ---
    const patternMapByPrio = new Map<number, DetectedPattern>();
    for (const p of allDetectedPatterns) {
        const existing = patternMapByPrio.get(p.index);
        if (!existing || p.priority > existing.priority) {
            patternMapByPrio.set(p.index, p);
        }
    }
    const finalPatterns = Array.from(patternMapByPrio.values()).sort((a,b) => a.index - b.index);

    const lastRsiValue = rsiValues[rsiValues.length - 1] ?? null;
    let rsiState: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' = 'NEUTRAL';
    if (lastRsiValue) {
        if (lastRsiValue > 70) rsiState = 'OVERBOUGHT';
        else if (lastRsiValue < 30) rsiState = 'OVERSOLD';
    }
    
    let finalOverallTrend: TrendDirection = 'RANGE';
    const finalIndex = candles.length - 1;
    if (finalIndex > 210) {
        const trendLookback = 10;
        const lastEma200 = ema200[finalIndex];
        const prevEma200 = ema200[finalIndex - trendLookback];
        if (lastEma200 && prevEma200) {
            const slope = (lastEma200 - prevEma200) / trendLookback;
            const threshold = candles[finalIndex].close * 0.001 / trendLookback;
            if (slope > threshold) finalOverallTrend = 'UPTREND';
            else if (slope < -threshold) finalOverallTrend = 'DOWNTREND';
        }
    }

    return { 
        patterns: finalPatterns, 
        trendlines: currentTrendlines, // Return the latest set of valid trendlines
        trend: finalOverallTrend,
        rsi: { value: lastRsiValue, state: rsiState },
        swingHighs: confirmedSwingHighs,
        swingLows: confirmedSwingLows,
    };
};

// --- Re-adding detector functions without changes ---
// (These functions are stateless and don't have lookahead bias themselves)
reversalDetectors.push(
    (candles, i, context) => { // Hammer
        const current = candles[i];
        const totalRange = getRange(current);
        if (totalRange === 0) return null;
        const bodySize = getBody(current);
        const lowerWick = Math.min(current.open, current.close) - current.low;
        const upperWick = current.high - Math.max(current.open, current.close);
        if (lowerWick < bodySize * 2 || upperWick > bodySize * 0.8) return null;
        let longStrength = 30 + getProximityBonus(current.low, context.swingLows, i, totalRange);
        if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]! * 1.5) longStrength += 25;
        if ((current.close - current.low) / totalRange > 0.7) longStrength += 25;
        if (current.isBullish) longStrength += 10;
        const priority = longStrength > 75 ? 4 : (longStrength > 50 ? 3 : (longStrength > 25 ? 2 : 1));
        if (priority < 1) return null;
        return { index: i, candle: current, name: 'hammer', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'hammerDesc', priority, strengthScore: { long: Math.min(100, longStrength), short: 10 } };
    },
    (candles, i, context) => { // Shooting Star
        const current = candles[i];
        const totalRange = getRange(current);
        if (totalRange === 0) return null;
        const bodySize = getBody(current);
        const upperWick = current.high - Math.max(current.open, current.close);
        const lowerWick = Math.min(current.open, current.close) - current.low;
        if (upperWick < bodySize * 2 || lowerWick > bodySize * 0.8) return null;
        let shortStrength = 30 + getProximityBonus(current.high, context.swingHighs, i, totalRange);
        if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]! * 1.5) shortStrength += 25;
        if ((current.high - current.close) / totalRange > 0.7) shortStrength += 25;
        if (!current.isBullish) shortStrength += 10;
        const priority = shortStrength > 75 ? 4 : (shortStrength > 50 ? 3 : (shortStrength > 25 ? 2 : 1));
        if (priority < 1) return null;
        return { index: i, candle: current, name: 'shootingStar', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'shootingStarDesc', priority, strengthScore: { long: 10, short: Math.min(100, shortStrength) } };
    },
    (candles, i, context) => { // Bullish Engulfing
        if (i < 1) return null;
        const prev = candles[i - 1];
        const current = candles[i];
        if (prev.isBullish || !current.isBullish) return null;
        if (current.open < prev.close && current.close > prev.open) {
            let longStrength = 50 + getProximityBonus(current.low, context.swingLows, i, getRange(current));
            if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]! * 1.5) longStrength += 25;
            if (isLongCandle(current)) longStrength += 15;
            const priority = longStrength > 80 ? 4 : (longStrength > 60 ? 3 : (longStrength > 40 ? 2 : 1));
            if (priority < 2) return null;
            return { index: i, candle: current, name: 'bullishEngulfing', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'bullishEngulfingDesc', priority, strengthScore: { long: Math.min(100, longStrength), short: 10 } };
        }
        return null;
    },
    (candles, i, context) => { // Bearish Engulfing
        if (i < 1) return null;
        const prev = candles[i - 1];
        const current = candles[i];
        if (!prev.isBullish || current.isBullish) return null;
        if (current.open > prev.close && current.close < prev.open) {
            let shortStrength = 50 + getProximityBonus(current.high, context.swingHighs, i, getRange(current));
            if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]! * 1.5) shortStrength += 25;
            if (isLongCandle(current)) shortStrength += 15;
            const priority = shortStrength > 80 ? 4 : (shortStrength > 60 ? 3 : (shortStrength > 40 ? 2 : 1));
            if (priority < 2) return null;
            return { index: i, candle: current, name: 'bearishEngulfing', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'bearishEngulfingDesc', priority, strengthScore: { long: 10, short: Math.min(100, shortStrength) } };
        }
        return null;
    },
    (candles, i, context) => { // Doji
        const current = candles[i];
        if (isShortCandle(current)) {
            let strength = 30 + getProximityBonus(current.close, [...context.swingHighs, ...context.swingLows], i, getRange(current));
            if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]! * 2) strength += 20;
            const priority = strength > 60 ? 3 : (strength > 40 ? 2 : 1);
            if (priority < 1) return null;
            const direction = context.trend === 'UPTREND' ? SignalDirection.Bearish : SignalDirection.Bullish;
            const strengthScore = direction === SignalDirection.Bullish ? { long: strength, short: 20 } : { long: 20, short: strength };
            return { index: i, candle: current, name: 'doji', type: PatternType.Reversal, direction, description: 'dojiDesc', priority, strengthScore: { long: Math.min(100, strengthScore.long), short: Math.min(100, strengthScore.short) } };
        }
        return null;
    },
    (candles, i, context) => { // Morning Star
        if (i < 2) return null;
        const c1 = candles[i-2], c2 = candles[i-1], c3 = candles[i];
        if (c1.isBullish || !isLongCandle(c1) || !isShortCandle(c2) || !c3.isBullish || !isLongCandle(c3) || c2.close > c1.close || c2.open > c1.close || c3.close < (c1.open + c1.close) / 2) return null;
        let longStrength = 70 + getProximityBonus(c2.low, context.swingLows, i, c1.high - c3.low);
        return { index: i, candle: c3, name: 'morningStar', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'morningStarDesc', priority: 4, strengthScore: { long: Math.min(100, longStrength), short: 5 } };
    },
    (candles, i, context) => { // Evening Star
        if (i < 2) return null;
        const c1 = candles[i-2], c2 = candles[i-1], c3 = candles[i];
        if (!c1.isBullish || !isLongCandle(c1) || !isShortCandle(c2) || c3.isBullish || !isLongCandle(c3) || c2.close < c1.close || c2.open < c1.close || c3.close > (c1.open + c1.close) / 2) return null;
        let shortStrength = 70 + getProximityBonus(c2.high, context.swingHighs, i, c3.high - c1.low);
        return { index: i, candle: c3, name: 'eveningStar', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'eveningStarDesc', priority: 4, strengthScore: { long: 5, short: Math.min(100, shortStrength) } };
    },
    (candles, i, context) => { // Bullish Outside Bar
        if (i < 1) return null;
        const prev = candles[i - 1], current = candles[i];
        if (!current.isBullish || !(current.high > prev.high && current.low < prev.low)) return null;
        let longStrength = 40;
        if (current.close > prev.high) longStrength += 20;
        if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]! * 1.5) longStrength += 20;
        longStrength += getProximityBonus(current.low, context.swingLows, i, getRange(current));
        const priority = longStrength > 70 ? 3 : 2;
        return { index: i, candle: current, name: 'bullishOutsideBar', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'bullishOutsideBarDesc', priority, strengthScore: { long: Math.min(100, longStrength), short: 15 } };
    },
    (candles, i, context) => { // Bearish Outside Bar
        if (i < 1) return null;
        const prev = candles[i - 1], current = candles[i];
        if (current.isBullish || !(current.high > prev.high && current.low < prev.low)) return null;
        let shortStrength = 40;
        if (current.close < prev.low) shortStrength += 20;
        if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]! * 1.5) shortStrength += 20;
        shortStrength += getProximityBonus(current.high, context.swingHighs, i, getRange(current));
        const priority = shortStrength > 70 ? 3 : 2;
        return { index: i, candle: current, name: 'bearishOutsideBar', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'bearishOutsideBarDesc', priority, strengthScore: { long: 15, short: Math.min(100, shortStrength) } };
    },
    (candles, i, context) => { // Bullish Harami
        if (i < 1) return null;
        const prev = candles[i - 1], current = candles[i];
        if (prev.isBullish || !current.isBullish || getBody(prev) / getRange(prev) < 0.5 || !(current.close < prev.open && current.open > prev.close)) return null;
        let longStrength = 45 + getProximityBonus(prev.low, context.swingLows, i, getRange(prev));
        if (context.volumeSma20[i-1] && prev.volume > context.volumeSma20[i-1]! * 1.5) longStrength += 15;
        const priority = longStrength > 60 ? 3 : 2;
        return { index: i, candle: current, name: 'bullishHarami', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'bullishHaramiDesc', priority, strengthScore: { long: Math.min(100, longStrength), short: 10 } };
    },
    (candles, i, context) => { // Bearish Harami
        if (i < 1) return null;
        const prev = candles[i - 1], current = candles[i];
        if (!prev.isBullish || current.isBullish || getBody(prev) / getRange(prev) < 0.5 || !(current.close > prev.open && current.open < prev.close)) return null;
        let shortStrength = 45 + getProximityBonus(prev.high, context.swingHighs, i, getRange(prev));
        if (context.volumeSma20[i-1] && prev.volume > context.volumeSma20[i-1]! * 1.5) shortStrength += 15;
        const priority = shortStrength > 60 ? 3 : 2;
        return { index: i, candle: current, name: 'bearishHarami', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'bearishHaramiDesc', priority, strengthScore: { long: 10, short: Math.min(100, shortStrength) } };
    },
    (candles, i, context) => { // Tower Bottom
        if (i < 4) return null;
        const c_final = candles[i];
        if (!c_final.isBullish || !isLongCandle(c_final)) return null;
        for (let period = 2; period <= 5; period++) {
            if (i - period - 1 < 0) continue;
            const c_initial = candles[i - period - 1];
            if (c_initial.isBullish || !isLongCandle(c_initial) || c_final.close < (c_initial.open + c_initial.close) / 2) continue;
            const middleCandles = candles.slice(i - period, i);
            if (middleCandles.every(mc => isShortCandle(mc))) {
                const minLow = Math.min(...middleCandles.map(c => c.low));
                let longStrength = 65 + getProximityBonus(minLow, context.swingLows, i, getRange(c_final));
                return { index: i, candle: c_final, name: 'towerBottom', type: PatternType.Reversal, direction: SignalDirection.Bullish, description: 'towerBottomDesc', priority: 3, strengthScore: { long: Math.min(100, longStrength), short: 10 } };
            }
        }
        return null;
    },
    (candles, i, context) => { // Tower Top
        if (i < 4) return null;
        const c_final = candles[i];
        if (c_final.isBullish || !isLongCandle(c_final)) return null;
        for (let period = 2; period <= 5; period++) {
            if (i - period - 1 < 0) continue;
            const c_initial = candles[i - period - 1];
            if (!c_initial.isBullish || !isLongCandle(c_initial) || c_final.close > (c_initial.open + c_initial.close) / 2) continue;
            const middleCandles = candles.slice(i - period, i);
            if (middleCandles.every(mc => isShortCandle(mc))) {
                const maxHigh = Math.max(...middleCandles.map(c => c.high));
                let shortStrength = 65 + getProximityBonus(maxHigh, context.swingHighs, i, getRange(c_final));
                return { index: i, candle: c_final, name: 'towerTop', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'towerTopDesc', priority: 3, strengthScore: { long: 10, short: Math.min(100, shortStrength) } };
            }
        }
        return null;
    }
);
trendDetectors.push(
    (candles, i, context) => { // EMA Pullback Bull
        if (i < 1 || !isStrongTrend(context.ema20, i-1, 'up')) return null;
        const current = candles[i], ema = context.ema20[i], prevEma = context.ema20[i-1];
        if (ema === null || prevEma === null || ema <= prevEma || current.low > ema || current.close <= ema || !current.isBullish) return null;
        let longStrength = 60;
        if ((current.close - current.low) / getRange(current) > 0.7) longStrength += 20;
        if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]!) longStrength += 10;
        return { index: i, candle: current, name: 'emaPullbackBull', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'emaPullbackBullDesc', priority: longStrength > 75 ? 3 : 2, strengthScore: { long: Math.min(100, longStrength), short: 10 } };
    },
    (candles, i, context) => { // EMA Pullback Bear
        if (i < 1 || !isStrongTrend(context.ema20, i-1, 'down')) return null;
        const current = candles[i], ema = context.ema20[i], prevEma = context.ema20[i-1];
        if (ema === null || prevEma === null || ema >= prevEma || current.high < ema || current.close >= ema || current.isBullish) return null;
        let shortStrength = 60;
        if ((current.high - current.close) / getRange(current) > 0.7) shortStrength += 20;
        if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]!) shortStrength += 10;
        return { index: i, candle: current, name: 'emaPullbackBear', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'emaPullbackBearDesc', priority: shortStrength > 75 ? 3 : 2, strengthScore: { long: 10, short: Math.min(100, shortStrength) } };
    },
    (candles, i, context) => { // Three White Soldiers
        if (i < 2) return null;
        const c1 = candles[i-2], c2 = candles[i-1], c3 = candles[i];
        if (!c1.isBullish || !c2.isBullish || !c3.isBullish || c2.close <= c1.close || c3.close <= c2.close) return null;
        let longStrength = 60;
        if (isLongCandle(c1) && isLongCandle(c2) && isLongCandle(c3)) longStrength += 15;
        if (c2.open > c1.open && c2.open < c1.close && c3.open > c2.open && c3.open < c2.close) longStrength += 15;
        if ((c3.high - c3.close) / getRange(c3) < 0.2) longStrength += 10;
        if (longStrength < 70) return null;
        return { index: i, candle: c3, name: 'threeSoldiers', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'threeSoldiersDesc', priority: longStrength > 80 ? 4 : 3, strengthScore: { long: Math.min(100, longStrength), short: 10 } };
    },
    (candles, i, context) => { // Three Black Crows
        if (i < 2) return null;
        const c1 = candles[i-2], c2 = candles[i-1], c3 = candles[i];
        if (c1.isBullish || c2.isBullish || c3.isBullish || c2.close >= c1.close || c3.close >= c2.close) return null;
        let shortStrength = 60;
        if (isLongCandle(c1) && isLongCandle(c2) && isLongCandle(c3)) shortStrength += 15;
        if (c2.open < c1.open && c2.open > c1.close && c3.open < c2.open && c3.open > c2.close) shortStrength += 15;
        if ((c3.low - c3.close) / getRange(c3) < 0.2) shortStrength += 10;
        if (shortStrength < 70) return null;
        return { index: i, candle: c3, name: 'threeCrows', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'threeCrowsDesc', priority: shortStrength > 80 ? 4 : 3, strengthScore: { long: 10, short: Math.min(100, shortStrength) } };
    },
    (candles, i, context) => { // Bullish/Bearish Breakout
        if (i < 1) return null;
        const current = candles[i], prev = candles[i - 1];
        if (current.isBullish && context.trend !== 'DOWNTREND') {
            const relevantSwingHighs = context.swingHighs.filter(sh => sh.index < i && sh.index > i - 50);
            if (relevantSwingHighs.length > 0) {
                const highToBreak = relevantSwingHighs.reduce((p, c) => (p.price > c.price) ? p : c);
                if (prev.close < highToBreak.price && current.close > highToBreak.price) {
                    let longStrength = 60;
                    if (isLongCandle(current)) longStrength += 15;
                    if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]! * 1.5) longStrength += 20;
                    return { index: i, candle: current, name: 'bullishBreakout', type: PatternType.Trend, direction: SignalDirection.Bullish, description: 'bullishBreakoutDesc', priority: longStrength > 80 ? 4 : 3, strengthScore: { long: Math.min(100, longStrength), short: 10 } };
                }
            }
        } else if (!current.isBullish && context.trend !== 'UPTREND') {
            const relevantSwingLows = context.swingLows.filter(sl => sl.index < i && sl.index > i - 50);
            if (relevantSwingLows.length > 0) {
                const lowToBreak = relevantSwingLows.reduce((p, c) => (p.price < c.price) ? p : c);
                if (prev.close > lowToBreak.price && current.close < lowToBreak.price) {
                    let shortStrength = 60;
                    if (isLongCandle(current)) shortStrength += 15;
                    if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]! * 1.5) shortStrength += 20;
                    return { index: i, candle: current, name: 'bearishBreakout', type: PatternType.Trend, direction: SignalDirection.Bearish, description: 'bearishBreakoutDesc', priority: shortStrength > 80 ? 4 : 3, strengthScore: { long: 10, short: Math.min(100, shortStrength) } };
                }
            }
        }
        return null;
    },
    (candles, i, context) => { // Trendline Breakouts
        if (i < 1) return null;
        const prev = candles[i-1], current = candles[i];
        for (const tl of [...context.trendlines, ...context.htfTrendlines]) {
            const linePricePrev = tl.slope * prev.time + tl.intercept;
            const linePriceCurr = tl.slope * current.time + tl.intercept;
            const isHtf = !!tl.timeframe;
            if (tl.type === 'DOWN' && current.isBullish && prev.close < linePricePrev && current.close > linePriceCurr) {
                let strength = 50 + tl.strength * 5;
                if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]! * 1.5) strength += 15;
                if (isLongCandle(current)) strength += 15;
                const name = isHtf ? 'htfTrendlineBreakoutUp' : 'trendlineBreakoutUp';
                return { index: i, candle: current, name, type: PatternType.Trend, direction: SignalDirection.Bullish, description: `${name}Desc`, priority: isHtf ? 4 : 3, strengthScore: { long: Math.min(100, strength), short: 10 }, trendlineId: tl.id };
            }
            if (tl.type === 'UP' && !current.isBullish && prev.close > linePricePrev && current.close < linePriceCurr) {
                let strength = 50 + tl.strength * 5;
                if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]! * 1.5) strength += 15;
                if (isLongCandle(current)) strength += 15;
                const name = isHtf ? 'htfTrendlineBreakoutDown' : 'trendlineBreakoutDown';
                return { index: i, candle: current, name, type: PatternType.Trend, direction: SignalDirection.Bearish, description: `${name}Desc`, priority: isHtf ? 4 : 3, strengthScore: { long: 10, short: Math.min(100, strength) }, trendlineId: tl.id };
            }
        }
        return null;
    },
    (candles, i, context) => { // Trendline Bounces
        const current = candles[i];
        for (const tl of [...context.trendlines, ...context.htfTrendlines]) {
            const linePrice = tl.slope * current.time + tl.intercept;
            const isHtf = !!tl.timeframe;
            if (tl.type === 'UP' && current.isBullish && current.low <= linePrice && current.close > linePrice) {
                let strength = 40 + tl.strength * 6 + ((Math.min(current.open, current.close) - current.low > getBody(current)) ? 20 : 0);
                const name = isHtf ? 'htfTrendlineBounceBullish' : 'trendlineBounceBullish';
                return { index: i, candle: current, name, type: PatternType.Trend, direction: SignalDirection.Bullish, description: `${name}Desc`, priority: isHtf ? 4 : 3, strengthScore: { long: Math.min(100, strength), short: 10 }, trendlineId: tl.id };
            }
            if (tl.type === 'DOWN' && !current.isBullish && current.high >= linePrice && current.close < linePrice) {
                let strength = 40 + tl.strength * 6 + ((current.high - Math.max(current.open, current.close) > getBody(current)) ? 20 : 0);
                const name = isHtf ? 'htfTrendlineBounceBearish' : 'trendlineBounceBearish';
                return { index: i, candle: current, name, type: PatternType.Trend, direction: SignalDirection.Bearish, description: `${name}Desc`, priority: isHtf ? 4 : 3, strengthScore: { long: 10, short: Math.min(100, strength) }, trendlineId: tl.id };
            }
        }
        return null;
    }
);
rangeDetectors.push(
    (candles, i, context) => { // Failed Breakout (Trap)
        if (i < 1 || context.trend !== 'RANGE') return null;
        const prev = candles[i-1], current = candles[i];
        if (!current.isBullish && isLongCandle(current)) {
            const relevantHighs = context.swingHighs.filter(sh => sh.index < i - 1 && sh.index > i - 30);
            if (relevantHighs.length > 0) {
                const swingHigh = relevantHighs.reduce((p, c) => (p.price > c.price) ? p : c);
                if (prev.high > swingHigh.price && current.close < swingHigh.price) {
                    let strength = 70 + ((context.volumeSma20[i] && current.volume > context.volumeSma20[i]!) ? 15 : 0);
                    return { index: i, candle: current, name: 'failedBullishBreakout', type: PatternType.Range, direction: SignalDirection.Bearish, description: 'failedBullishBreakoutDesc', priority: 4, strengthScore: { long: 5, short: Math.min(100, strength) } };
                }
            }
        } else if (current.isBullish && isLongCandle(current)) {
            const relevantLows = context.swingLows.filter(sl => sl.index < i - 1 && sl.index > i - 30);
            if (relevantLows.length > 0) {
                const swingLow = relevantLows.reduce((p, c) => (p.price < c.price) ? p : c);
                if (prev.low < swingLow.price && current.close > swingLow.price) {
                    let strength = 70 + ((context.volumeSma20[i] && current.volume > context.volumeSma20[i]!) ? 15 : 0);
                    return { index: i, candle: current, name: 'failedBearishBreakout', type: PatternType.Range, direction: SignalDirection.Bullish, description: 'failedBearishBreakoutDesc', priority: 4, strengthScore: { long: Math.min(100, strength), short: 5 } };
                }
            }
        }
        return null;
    }
);
