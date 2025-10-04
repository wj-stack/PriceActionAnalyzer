

import type { Candle, MACDValue, SwingPoint, Imbalance } from '../types';

export interface BBands {
    middle: number | null;
    upper: number | null;
    lower: number | null;
}

const getLastValidValue = (values: (number | null)[]): number | null => {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null && !isNaN(values[i])) {
      return values[i];
    }
  }
  return null;
};

export const findSwingPoints = (candles: Candle[], lookback: number): SwingPoint[] => {
    const swingPoints: SwingPoint[] = [];
    if (candles.length < lookback * 2 + 1) return swingPoints;

    for (let i = lookback; i < candles.length - lookback; i++) {
        const currentCandle = candles[i];
        let isHigh = true;
        let isLow = true;

        for (let j = 1; j <= lookback; j++) {
            if (candles[i - j].high > currentCandle.high || candles[i + j].high > currentCandle.high) {
                isHigh = false;
            }
            if (candles[i - j].low < currentCandle.low || candles[i + j].low < currentCandle.low) {
                isLow = false;
            }
        }

        if (isHigh) {
            swingPoints.push({ time: currentCandle.time, price: currentCandle.high, type: 'high', index: i });
        }
        if (isLow) {
            swingPoints.push({ time: currentCandle.time, price: currentCandle.low, type: 'low', index: i });
        }
    }
    return swingPoints;
};

export const isPinbar = (candle: Candle, minWickBodyRatio = 2.0): 'bullish' | 'bearish' | null => {
    const body = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const totalRange = candle.high - candle.low;

    if (totalRange === 0 || body === 0) return null;

    // Bullish Pinbar: long lower wick, small body at the top of the range
    if (lowerWick / body >= minWickBodyRatio && upperWick / totalRange < 0.3) {
        return 'bullish';
    }
    // Bearish Pinbar: long upper wick, small body at the bottom of the range
    if (upperWick / body >= minWickBodyRatio && lowerWick / totalRange < 0.3) {
        return 'bearish';
    }

    return null;
};


export const findCHOCH = (candles: Candle[], index: number, lookback = 5): 'bullish' | 'bearish' | null => {
    if (index < lookback * 2) return null;

    const recentCandles = candles.slice(index - lookback, index + 1);
    const lastCandle = recentCandles[recentCandles.length - 1];
    
    // Simplified trend check
    const isUptrend = recentCandles.slice(0, -1).every((c, i, arr) => i === 0 || c.high >= arr[i-1].high);
    const isDowntrend = recentCandles.slice(0, -1).every((c, i, arr) => i === 0 || c.low <= arr[i-1].low);

    // Look for bullish CHoCH: was in downtrend, now broke a recent high
    if (isDowntrend) {
        const lastMinorHigh = Math.max(...recentCandles.slice(0, -1).map(c => c.high));
        if (lastCandle.close > lastMinorHigh) {
            return 'bullish';
        }
    }

    // Look for bearish CHoCH: was in uptrend, now broke a recent low
    if (isUptrend) {
        const lastMinorLow = Math.min(...recentCandles.slice(0, -1).map(c => c.low));
        if (lastCandle.close < lastMinorLow) {
            return 'bearish';
        }
    }

    return null;
};

export const findImbalances = (candles: Candle[], currentIndex: number, lookback = 10): Imbalance | null => {
    if (currentIndex < 2) return null;

    const startIndex = Math.max(2, currentIndex - lookback);

    for (let i = currentIndex; i >= startIndex; i--) {
        const first = candles[i - 2];
        const second = candles[i - 1];
        const third = candles[i];
        
        // Bullish FVG (gap between 1st high and 3rd low)
        if (third.low > first.high) {
            // Check if current price is testing this imbalance
            if (candles[currentIndex].low <= third.low && candles[currentIndex].high >= first.high) {
                return { startPrice: first.high, endPrice: third.low, index: i-1 };
            }
        }

        // Bearish FVG (gap between 1st low and 3rd high)
        if (third.high < first.low) {
            if (candles[currentIndex].high >= third.high && candles[currentIndex].low <= first.low) {
                 return { startPrice: third.high, endPrice: first.low, index: i-1 };
            }
        }
    }
    
    return null;
};

export const findFibRetracementLevels = (swingPoints: SwingPoint[]): { price: number; level: number }[] => {
    // We want to find the most recent significant move. Let's look at the last 5 swings.
    const recentSwings = swingPoints.slice(-5);
    if (recentSwings.length < 2) return [];

    let highPoint = recentSwings[0];
    let lowPoint = recentSwings[0];

    for(const swing of recentSwings) {
        if(swing.price > highPoint.price) highPoint = swing;
        if(swing.price < lowPoint.price) lowPoint = swing;
    }

    const high = highPoint.price;
    const low = lowPoint.price;
    const range = high - low;
    if (range === 0) return [];

    const levels = [0.382, 0.5, 0.618, 0.786];
    // Trend is determined by which came last, the high or the low
    const isUptrend = highPoint.time > lowPoint.time; 

    return levels.map(level => ({
        level,
        price: isUptrend ? high - range * level : low + range * level,
    }));
};

export const findMacdZeroCross = (macdValues: (MACDValue | null)[]): { index: number; type: 'bullish' | 'bearish' }[] => {
    const crosses: { index: number; type: 'bullish' | 'bearish' }[] = [];
    for (let i = 1; i < macdValues.length; i++) {
        const prev = macdValues[i - 1];
        const curr = macdValues[i];

        if (prev && curr && prev.histogram !== null && curr.histogram !== null) {
            // Bullish cross: from negative to positive
            if (prev.histogram < 0 && curr.histogram >= 0) {
                crosses.push({ index: i, type: 'bullish' });
            }
            // Bearish cross: from positive to negative
            else if (prev.histogram > 0 && curr.histogram <= 0) {
                crosses.push({ index: i, type: 'bearish' });
            }
        }
    }
    return crosses;
};

export const findMacdDivergence = (
    candles: Candle[],
    macdValues: (MACDValue | null)[],
    currentIndex: number,
    lookback: number = 30
): 'bullish' | 'bearish' | null => {
    if (currentIndex < lookback * 2) return null;

    const priceSlice = candles.slice(currentIndex - lookback, currentIndex + 1);
    const macdSlice = macdValues.slice(currentIndex - lookback, currentIndex + 1);

    // Find last two swing highs for bearish divergence
    const highPoints: { index: number; price: number }[] = [];
    for (let i = lookback - 2; i >= 2; i--) {
        if (
            priceSlice[i].high > priceSlice[i - 1].high &&
            priceSlice[i].high > priceSlice[i - 2].high &&
            priceSlice[i].high > priceSlice[i + 1].high &&
            priceSlice[i].high > priceSlice[i + 2].high
        ) {
            highPoints.push({ index: i, price: priceSlice[i].high });
            if (highPoints.length === 2) break;
        }
    }

    if (highPoints.length === 2) {
        const [h2, h1] = highPoints; // h2 is more recent, h1 is older
        const macd1 = macdSlice[h1.index]?.histogram;
        const macd2 = macdSlice[h2.index]?.histogram;
        if (macd1 !== null && macd2 !== null && typeof macd1 !== 'undefined' && typeof macd2 !== 'undefined') {
            // Price: Higher High, MACD: Lower High
            if (priceSlice[h2.index].high > priceSlice[h1.index].high && macd2 < macd1) {
                return 'bearish';
            }
        }
    }

    // Find last two swing lows for bullish divergence
    const lowPoints: { index: number; price: number }[] = [];
    for (let i = lookback - 2; i >= 2; i--) {
        if (
            priceSlice[i].low < priceSlice[i - 1].low &&
            priceSlice[i].low < priceSlice[i - 2].low &&
            priceSlice[i].low < priceSlice[i + 1].low &&
            priceSlice[i].low < priceSlice[i + 2].low
        ) {
            lowPoints.push({ index: i, price: priceSlice[i].low });
            if (lowPoints.length === 2) break;
        }
    }

    if (lowPoints.length === 2) {
        const [l2, l1] = lowPoints; // l2 is more recent
        const macd1 = macdSlice[l1.index]?.histogram;
        const macd2 = macdSlice[l2.index]?.histogram;
        if (macd1 !== null && macd2 !== null && typeof macd1 !== 'undefined' && typeof macd2 !== 'undefined') {
            // Price: Lower Low, MACD: Higher Low
            if (priceSlice[l2.index].low < priceSlice[l1.index].low && macd2 > macd1) {
                return 'bullish';
            }
        }
    }

    return null;
};


export const calculateSMA = (values: number[], period: number): (number | null)[] => {
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

export const calculateEMA = (candles: Candle[], period: number): (number | null)[] => {
    const emaValues: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period) return emaValues;
    const closes = candles.map(c => c.close);
    let sma = closes.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    emaValues[period - 1] = sma;
    const multiplier = 2 / (period + 1);
    for (let i = period; i < candles.length; i++) {
        const prevEma = emaValues[i - 1] ?? sma;
        const ema = (closes[i] - prevEma) * multiplier + prevEma;
        emaValues[i] = ema;
    }
    return emaValues;
};

export const calculateRSI = (candles: Candle[], period: number): (number | null)[] => {
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


export const calculateBollingerBands = (candles: Candle[], period: number, stdDev: number): (BBands | null)[] => {
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

export const calculateATR = (candles: Candle[], period: number): (number | null)[] => {
    const atrValues: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period) return atrValues;

    const trValues: number[] = [];
    trValues.push(candles[0].high - candles[0].low); // First TR is just H-L

    for (let i = 1; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = candles[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trValues.push(tr);
    }

    // Calculate initial ATR as SMA of TR
    let sumTR = 0;
    for (let i = 0; i < period; i++) {
        sumTR += trValues[i];
    }
    atrValues[period - 1] = sumTR / period;

    // Calculate subsequent ATRs using smoothing
    for (let i = period; i < candles.length; i++) {
        atrValues[i] = (atrValues[i - 1]! * (period - 1) + trValues[i]) / period;
    }

    return atrValues;
};

const wildersSmoothing = (values: number[], period: number): (number | null)[] => {
    const smoothed: (number | null)[] = new Array(values.length).fill(null);
    if (values.length < period) return smoothed;

    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += values[i];
    }
    smoothed[period - 1] = sum;

    for (let i = period; i < values.length; i++) {
        smoothed[i] = smoothed[i - 1]! - (smoothed[i - 1]! / period) + values[i];
    }

    return smoothed.map(val => val !== null ? val / period : null);
};

export const calculateADX = (candles: Candle[], period: number): (number | null)[] => {
    const adxValues: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period * 2) return adxValues;

    const trs: number[] = [];
    const plusDMs: number[] = [];
    const minusDMs: number[] = [];

    for (let i = 1; i < candles.length; i++) {
        const prev = candles[i - 1];
        const curr = candles[i];

        const tr = Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close));
        trs.push(tr);

        const upMove = curr.high - prev.high;
        const downMove = prev.low - curr.low;

        const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
        const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
        plusDMs.push(plusDM);
        minusDMs.push(minusDM);
    }

    const smoothedTRs = wildersSmoothing(trs, period);
    const smoothedPlusDMs = wildersSmoothing(plusDMs, period);
    const smoothedMinusDMs = wildersSmoothing(minusDMs, period);

    const dxs: number[] = [];
    for (let i = period - 1; i < smoothedTRs.length; i++) {
        const sTR = smoothedTRs[i];
        const sPlusDM = smoothedPlusDMs[i];
        const sMinusDM = smoothedMinusDMs[i];

        if (sTR !== null && sPlusDM !== null && sMinusDM !== null && sTR > 0) {
            const plusDI = (sPlusDM / sTR) * 100;
            const minusDI = (sMinusDM / sTR) * 100;
            const diSum = plusDI + minusDI;
            const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
            dxs.push(dx);
        } else {
            dxs.push(0);
        }
    }

    const adxResult = wildersSmoothing(dxs, period);

    for (let i = 0; i < adxResult.length; i++) {
        adxValues[i + (period - 1) * 2 + 1] = adxResult[i];
    }
    
    return adxValues;
};

const emaOnValues = (values: (number | null)[], period: number): (number | null)[] => {
    const results: (number | null)[] = new Array(values.length).fill(null);
    const firstValidIndex = values.findIndex(v => v !== null);

    if (firstValidIndex === -1 || values.length - firstValidIndex < period) {
        return results;
    }

    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += values[firstValidIndex + i]!;
    }
    let ema = sum / period;
    results[firstValidIndex + period - 1] = ema;

    const multiplier = 2 / (period + 1);
    for (let i = firstValidIndex + period; i < values.length; i++) {
        if (values[i] !== null) {
            ema = (values[i]! - ema) * multiplier + ema;
            results[i] = ema;
        }
    }
    return results;
};

export const calculateMACD = (candles: Candle[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): (MACDValue | null)[] => {
    const macdValues: (MACDValue | null)[] = new Array(candles.length).fill(null);
    if (candles.length < slowPeriod) return macdValues;

    const fastEMA = calculateEMA(candles, fastPeriod);
    const slowEMA = calculateEMA(candles, slowPeriod);

    const macdLine: (number | null)[] = new Array(candles.length).fill(null);
    for (let i = slowPeriod - 1; i < candles.length; i++) {
        if (fastEMA[i] !== null && slowEMA[i] !== null) {
            macdLine[i] = fastEMA[i]! - slowEMA[i]!;
        }
    }

    const signalLine = emaOnValues(macdLine, signalPeriod);

    for (let i = 0; i < candles.length; i++) {
        if (macdLine[i] !== null && signalLine[i] !== null) {
            const macd = macdLine[i]!;
            const signal = signalLine[i]!;
            const histogram = macd - signal;
            macdValues[i] = { macd, signal, histogram };
        }
    }
    return macdValues;
};

export const getTrend = (candles: Candle[]): 'Uptrend' | 'Downtrend' | 'Range' => {
  if (candles.length < 52) return 'Range';
  const ema20 = calculateEMA(candles, 20);
  const ema52 = calculateEMA(candles, 52);
  
  const lastEma20 = getLastValidValue(ema20);
  const lastEma52 = getLastValidValue(ema52);
  
  if (lastEma20 === null || lastEma52 === null) return 'Range';
  
  const diffPercent = (lastEma20 - lastEma52) / lastEma52;

  if (diffPercent > 0.002) { // EMA20 is 0.2% above EMA52 to filter chop
      return 'Uptrend';
  } else if (diffPercent < -0.002) {
      return 'Downtrend';
  }
  return 'Range';
};

export const getRsiStatus = (candles: Candle[], rsiPeriod = 14, upper = 70, lower = 30): 'Overbought' | 'Oversold' | 'Neutral' => {
  if (candles.length < rsiPeriod + 1) return 'Neutral';
  const rsi = calculateRSI(candles, rsiPeriod);
  const lastRsi = getLastValidValue(rsi);

  if (lastRsi === null) return 'Neutral';
  if (lastRsi >= upper) return 'Overbought';
  if (lastRsi <= lower) return 'Oversold';
  return 'Neutral';
};