import type { Candle, MACDValue } from '../types';

export interface BBands {
    middle: number | null;
    upper: number | null;
    lower: number | null;
}

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
    let sma = candles.slice(0, period).reduce((sum, candle) => sum + candle.close, 0) / period;
    emaValues[period - 1] = sma;
    const multiplier = 2 / (period + 1);
    for (let i = period; i < candles.length; i++) {
        const ema = (candles[i].close - (emaValues[i - 1] ?? 0)) * multiplier + (emaValues[i - 1] ?? 0);
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
