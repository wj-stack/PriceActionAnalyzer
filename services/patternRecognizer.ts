import type { Candle, DetectedPattern, TrendPoint, TrendLine, TrendDirection, MultiTimeframeAnalysis } from '../types';
import { PatternType, SignalDirection } from '../types';
import { calculateEMA, calculateRSI, calculateSMA } from './indicatorService';

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

type AnalyzeCandlesResult = Omit<MultiTimeframeAnalysis, 'timeframe'>;

export const analyzeCandles = (candles: Candle[], htfTrendlines: TrendLine[] = []): AnalyzeCandlesResult => {
    if (candles.length === 0) {
        return { 
            patterns: [], 
            trendlines: [], 
            trend: 'RANGE', 
            rsi: { value: null, state: 'NEUTRAL' } 
        };
    }
    const ema20 = calculateEMA(candles, 20);
    const volumeSma20 = calculateSMA(candles.map(c => c.volume), 20);
    const { swingHighs, swingLows } = findMajorSwingPoints(candles);

    // Short-term trend for signal context
    let shortTermTrend: TrendDirection = 'RANGE';
    const lastEma = ema20[candles.length - 1];
    const prevEma = ema20[candles.length - 6];
    if (lastEma && prevEma && candles.length > 25) {
        if (lastEma > prevEma && isStrongTrend(ema20, candles.length - 1, 'up')) shortTermTrend = 'UPTREND';
        if (lastEma < prevEma && isStrongTrend(ema20, candles.length - 1, 'down')) shortTermTrend = 'DOWNTREND';
    }

    const context: AnalysisContext = { ema20, volumeSma20, swingHighs, swingLows, trend: shortTermTrend };
    
    // --- Trend Determination (using a long-term MA) ---
    const ema200 = calculateEMA(candles, 200);
    let overallTrend: TrendDirection = 'RANGE';
    const trendLookback = 10;
    if (candles.length > 200 + trendLookback) {
        const end = candles.length - 1;
        const start = end - trendLookback;
        const lastEma200 = ema200[end];
        const prevEma200 = ema200[start];
        if (lastEma200 && prevEma200) {
            const slope = (lastEma200 - prevEma200) / trendLookback;
            const price = candles[end].close;
            const threshold = price * 0.001 / trendLookback; // 0.1% price move over lookback
            if (slope > threshold) {
                overallTrend = 'UPTREND';
            } else if (slope < -threshold) {
                overallTrend = 'DOWNTREND';
            }
        }
    }

    // --- RSI Calculation ---
    const rsiValues = calculateRSI(candles, 14);
    const lastRsiValue = rsiValues[rsiValues.length - 1] ?? null;
    let rsiState: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' = 'NEUTRAL';
    if (lastRsiValue) {
        if (lastRsiValue > 70) rsiState = 'OVERBOUGHT';
        else if (lastRsiValue < 30) rsiState = 'OVERSOLD';
    }

    // --- Pattern Detection ---
    // This is a reconstruction of the truncated file based on the available patterns
    // and standard TA logic.
    const reversalDetectors: PatternDetector[] = [
    (candles, i, context) => { // Hammer
        const current = candles[i];
        const totalRange = getRange(current);
        if (totalRange === 0) return null;

        const bodySize = getBody(current);
        const lowerWick = Math.min(current.open, current.close) - current.low;
        const lowerWickRatio = bodySize > 0 ? lowerWick / bodySize : 10;
        if (lowerWickRatio < 2.0) return null;

        let longStrength = 0;
        longStrength += getProximityBonus(current.low, context.swingLows, i, totalRange);
        if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]! * 1.5) longStrength += 25;
        if ((current.close - current.low) / totalRange > 0.7) longStrength += 25;
        if (current.isBullish) longStrength += 20;

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
        const upperWickRatio = bodySize > 0 ? upperWick / bodySize : 10;
        if (upperWickRatio < 2.0) return null;

        let shortStrength = 0;
        shortStrength += getProximityBonus(current.high, context.swingHighs, i, totalRange);
        if (context.volumeSma20[i] && current.volume > context.volumeSma20[i]! * 1.5) shortStrength += 25;
        if ((current.high - current.close) / totalRange > 0.7) shortStrength += 25;
        if (!current.isBullish) shortStrength += 20;

        const priority = shortStrength > 75 ? 4 : (shortStrength > 50 ? 3 : (shortStrength > 25 ? 2 : 1));
        if (priority < 1) return null;

        return { index: i, candle: current, name: 'shootingStar', type: PatternType.Reversal, direction: SignalDirection.Bearish, description: 'shootingStarDesc', priority, strengthScore: { long: 10, short: Math.min(100, shortStrength) } };
    },
    // Other detectors would be here...
    ];
    const trendDetectors: PatternDetector[] = [];
    const rangeDetectors: PatternDetector[] = [];


    // --- Main Loop ---
    let detectedPatterns: DetectedPattern[] = [];
    const allDetectors = [...reversalDetectors, ...trendDetectors, ...rangeDetectors];
    for (let i = 1; i < candles.length; i++) {
        for (const detector of allDetectors) {
            const pattern = detector(candles, i, context);
            if (pattern) {
                detectedPatterns.push(pattern);
            }
        }
    }
    
    const finalPatterns = detectedPatterns; // Placeholder for more complex logic like filtering overlapping patterns
    const trendlines: TrendLine[] = []; // Placeholder for trendline logic

    return { 
        patterns: finalPatterns, 
        trendlines,
        trend: overallTrend,
        rsi: {
            value: lastRsiValue,
            state: rsiState,
        }
    };
};
