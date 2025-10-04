import type { Candle, BacktestSettings, BacktestResult, EquityDataPoint, TradeLogEvent, BacktestKPIs, OpenPosition, TradeOpenReason, SwingPoint, SRZone, PredictionResult } from '../types';
import { calculateRSI, calculateATR, findSwingPoints, calculateMACD, findMacdDivergence, findFibRetracementLevels, isPinbar, findCHOCH, findImbalances, calculateEMA, getTrend } from './indicatorService';

// --- Reusable Helper Functions (Refactored from Engine) ---

const identifyHTFZones = (htfCandles: Candle[], settings: Pick<BacktestSettings, 'srWeight' | 'fibWeight' | 'macdWeight' | 'zoneScoreThreshold' | 'useMacdDivergence'>): SRZone[] => {
    const majorSwings = findSwingPoints(htfCandles, 20);
    const fibLevels = findFibRetracementLevels(majorSwings);
    const htfMacd = calculateMACD(htfCandles);
    const swingPoints = findSwingPoints(htfCandles, 5);
    const zones: { points: SwingPoint[], type: 'support' | 'resistance' }[] = [];

    // Pre-calculate MACD extremes once for efficiency
    const allHistValues = htfMacd.map(m => m?.histogram).filter(h => h !== null && !isNaN(h)) as number[];
    const maxHist = Math.max(...allHistValues);
    const minHist = Math.min(...allHistValues);
    const overboughtThreshold = maxHist * 0.85;
    const oversoldThreshold = minHist * 0.85;

    for (const point of swingPoints) {
        let placed = false;
        const pointZoneType = point.type === 'high' ? 'resistance' : 'support';

        for (const zone of zones) {
            if (zone.type === pointZoneType) {
                const avgPrice = zone.points.reduce((sum, p) => sum + p.price, 0) / zone.points.length;
                if (Math.abs(point.price - avgPrice) / avgPrice < 0.015) { // 1.5% tolerance for clustering
                    zone.points.push(point);
                    placed = true;
                    break;
                }
            }
        }
        if (!placed) {
            zones.push({ points: [point], type: pointZoneType });
        }
    }

    return zones.map(zone => {
        const prices = zone.points.map(p => p.price);
        const startPrice = Math.min(...prices);
        const endPrice = Math.max(...prices);
        const touches = zone.points.length;
        
        let fibScore = 0;
        let fibConfluence: { hasFib?: boolean; fibLevel?: number; } = {};
        for (const level of fibLevels) {
            if (level.price >= startPrice && level.price <= endPrice) {
                fibScore = Math.max(fibScore, (level.level === 0.618 || level.level === 0.5) ? 1.0 : 0.5);
                fibConfluence.hasFib = true;
                fibConfluence.fibLevel = level.level;
                break;
            }
        }
        
        let macdScore = 0;
        const confluence: SRZone['confluence'] = { ...fibConfluence };
        const touchIndices = zone.points.map(p => p.index);

        // 1. Divergence Score
        if (settings.useMacdDivergence) {
            const mostRecentTouch = zone.points.reduce((latest, p) => p.index > latest.index ? p : latest, zone.points[0]);
            const divergenceType = findMacdDivergence(htfCandles, htfMacd, mostRecentTouch.index, 30);
            if ((divergenceType === 'bullish' && zone.type === 'support') || (divergenceType === 'bearish' && zone.type === 'resistance')) {
                macdScore += 1.5; // High score for strong signal
                confluence.hasMacdDiv = true;
            }
        }

        // 2. Zero-Line Interaction & Extreme Reading Scores
        for (const index of touchIndices) {
            if (!htfMacd[index]) continue;

            const currHist = htfMacd[index]?.histogram;
            const prevHist = index > 0 ? htfMacd[index - 1]?.histogram : null;

            // Zero-Line Bounce/Rejection
            if (prevHist !== null && currHist !== null) {
                if (zone.type === 'support' && prevHist < 0 && currHist >= 0) {
                    macdScore += 1.0;
                    confluence.hasMacdZeroCross = 'bullish';
                }
                if (zone.type === 'resistance' && prevHist > 0 && currHist <= 0) {
                    macdScore += 1.0;
                    confluence.hasMacdZeroCross = 'bearish';
                }
            }
            
            // Extreme Reading (Overbought/Oversold)
            if (currHist !== null) {
                if (zone.type === 'resistance' && currHist >= overboughtThreshold) {
                    macdScore += 0.75;
                    confluence.isMacdExtreme = 'overbought';
                }
                if (zone.type === 'support' && currHist <= oversoldThreshold) {
                    macdScore += 0.75;
                    confluence.isMacdExtreme = 'oversold';
                }
            }
        }

        const srScoreValue = touches * settings.srWeight;
        const fibScoreValue = fibScore * settings.fibWeight;
        const macdScoreValue = macdScore * settings.macdWeight;
        const totalScore = srScoreValue + fibScoreValue + macdScoreValue;

        return { 
            startPrice, 
            endPrice, 
            type: zone.type, 
            touches, 
            score: totalScore, 
            confluence,
            scoreDetails: {
                srScore: srScoreValue,
                fibScore: fibScoreValue,
                macdScore: macdScoreValue,
            }
        };
    }).filter(z => z.score >= settings.zoneScoreThreshold);
};

const precomputeHtfTrend = (htfCandles: Candle[]): ('Uptrend' | 'Downtrend' | 'Range')[] => {
    const ema20 = calculateEMA(htfCandles, 20);
    const ema52 = calculateEMA(htfCandles, 52);
    return htfCandles.map((_, i) => {
        const lastEma20 = ema20[i];
        const lastEma52 = ema52[i];
        if (lastEma20 === null || lastEma52 === null) return 'Range';
        const diffPercent = (lastEma20 - lastEma52) / lastEma52;
        if (diffPercent > 0.002) return 'Uptrend';
        if (diffPercent < -0.002) return 'Downtrend';
        return 'Range';
    });
};

const buildHtfReason = (htfTrend: string, zone: SRZone): string => {
    let htfReasonPart = `${htfTrend}|zone-${zone.type}`;
    const confluenceDetails: string[] = [];
    if (zone.confluence?.hasFib && typeof zone.confluence.fibLevel !== 'undefined') {
        confluenceDetails.push(`detail-fib:${zone.confluence.fibLevel.toFixed(3)}`);
    }
    if (zone.confluence?.hasMacdDiv) {
        confluenceDetails.push(`detail-macd-div`);
    }
    if (zone.confluence?.hasMacdZeroCross) {
        confluenceDetails.push(`detail-macd-zerocross-${zone.confluence.hasMacdZeroCross}`);
    }
    if (zone.confluence?.isMacdExtreme) {
        confluenceDetails.push(`detail-macd-extreme-${zone.confluence.isMacdExtreme}`);
    }
    if (confluenceDetails.length > 0) {
        htfReasonPart += `:${confluenceDetails.join('&')}`;
    }
    return htfReasonPart;
};

// --- Backtest Engine Class ---

class BacktestEngine {
    private ltfCandles: Candle[];
    private htfCandles: Candle[];
    private settings: BacktestSettings;
    
    private equity: number;
    private equityCurve: EquityDataPoint[] = [];
    private tradeLog: TradeLogEvent[] = [];
    
    private peakEquity: number;
    private maxDrawdown: number;
    
    private position: {
        type: 'LONG' | 'SHORT';
        entryPrice: number;
        sizeInQuote: number;
        sizeInBase: number;
        stopLoss: number;
        takeProfit: number;
        entryTime: number;
        liquidationPrice: number;
    } | null = null;
    
    private srZones: SRZone[] = [];
    private htfTrendData: ('Uptrend' | 'Downtrend' | 'Range')[] = [];

    constructor(ltfCandles: Candle[], htfCandles: Candle[], settings: BacktestSettings) {
        this.ltfCandles = ltfCandles;
        this.htfCandles = htfCandles;
        this.settings = settings;
        this.equity = settings.initialCapital;
        this.peakEquity = settings.initialCapital;
        this.maxDrawdown = 0;
    }

    public run = async (): Promise<BacktestResult> => {
        this.srZones = identifyHTFZones(this.htfCandles, this.settings);
        this.htfTrendData = precomputeHtfTrend(this.htfCandles);
        
        const ltfAtr = calculateATR(this.ltfCandles, this.settings.atrPeriod);
        
        for (let i = 1; i < this.ltfCandles.length; i++) {
            const candle = this.ltfCandles[i];
            
            if (this.position) {
                if ((this.position.type === 'LONG' && candle.low <= this.position.liquidationPrice) || (this.position.type === 'SHORT' && candle.high >= this.position.liquidationPrice)) {
                    this.closePosition(this.position.liquidationPrice, candle.time, 'LIQUIDATION');
                    continue;
                }

                let closeReason: 'STOP_LOSS' | 'TAKE_PROFIT' | null = null;
                if (this.position.type === 'LONG') {
                    if (candle.low <= this.position.stopLoss) closeReason = 'STOP_LOSS';
                    else if (candle.high >= this.position.takeProfit) closeReason = 'TAKE_PROFIT';
                } else {
                    if (candle.high >= this.position.stopLoss) closeReason = 'STOP_LOSS';
                    else if (candle.low <= this.position.takeProfit) closeReason = 'TAKE_PROFIT';
                }
                
                if (closeReason) {
                    const exitPrice = closeReason === 'STOP_LOSS' ? this.position.stopLoss : this.position.takeProfit;
                    this.closePosition(exitPrice, candle.time, closeReason);
                }
            }
            
            if (!this.position) {
                const atrVal = ltfAtr[i];
                if (atrVal === null) continue;

                let currentHtfCandleIndex = -1;
                for (let j = this.htfCandles.length - 1; j >= 0; j--) {
                    if (this.htfCandles[j].time <= candle.time) { currentHtfCandleIndex = j; break; }
                }
                const htfTrend = currentHtfCandleIndex !== -1 ? this.htfTrendData[currentHtfCandleIndex] : 'Range';

                if (htfTrend === 'Range' && !this.settings.allowRangeTrading) continue;
                
                const canGoLong = this.settings.followHtfTrend ? htfTrend === 'Uptrend' || htfTrend === 'Range' : true;
                const canGoShort = this.settings.followHtfTrend ? htfTrend === 'Downtrend' || htfTrend === 'Range' : true;

                const activeSupportZone = this.srZones.find(z => z.type === 'support' && candle.close >= z.startPrice && candle.close <= z.endPrice);
                const activeResistanceZone = this.srZones.find(z => z.type === 'resistance' && candle.close >= z.startPrice && candle.close <= z.endPrice);
                
                const reasons: string[] = [];
                let direction: 'LONG' | 'SHORT' | null = null;
                let stopLossPrice: number | null = null;
                const stopLossCandidates: number[] = [];
                let activeZone: SRZone | null = null;


                if (activeSupportZone && canGoLong) {
                    const htfReason = buildHtfReason(htfTrend, activeSupportZone);
                    direction = 'LONG';
                    activeZone = activeSupportZone;
                    if (this.settings.usePinbar && isPinbar(candle) === 'bullish') {
                        reasons.push(`${htfReason}|model-pinbar:detail-pinbar-bullish`);
                        stopLossCandidates.push(candle.low - atrVal * this.settings.atrMultiplier);
                    }
                    if (this.settings.useCHOCH && findCHOCH(this.ltfCandles, i) === 'bullish') {
                        reasons.push(`${htfReason}|model-choch:detail-choch-bullish`);
                        stopLossCandidates.push(candle.close - atrVal * this.settings.atrMultiplier);
                    }
                    if (this.settings.useSMC && findImbalances(this.ltfCandles, i) !== null) {
                        reasons.push(`${htfReason}|model-smc:detail-smc-bullish`);
                        stopLossCandidates.push(candle.low - atrVal * this.settings.atrMultiplier);
                    }
                    if (stopLossCandidates.length > 0) stopLossPrice = Math.min(...stopLossCandidates);
                } 
                else if (activeResistanceZone && canGoShort) {
                    const htfReason = buildHtfReason(htfTrend, activeResistanceZone);
                    direction = 'SHORT';
                    activeZone = activeResistanceZone;
                     if (this.settings.usePinbar && isPinbar(candle) === 'bearish') {
                        reasons.push(`${htfReason}|model-pinbar:detail-pinbar-bearish`);
                        stopLossCandidates.push(candle.high + atrVal * this.settings.atrMultiplier);
                    }
                    if (this.settings.useCHOCH && findCHOCH(this.ltfCandles, i) === 'bearish') {
                        reasons.push(`${htfReason}|model-choch:detail-choch-bearish`);
                        stopLossCandidates.push(candle.close + atrVal * this.settings.atrMultiplier);
                    }
                    if (this.settings.useSMC && findImbalances(this.ltfCandles, i) !== null) {
                        reasons.push(`${htfReason}|model-smc:detail-smc-bearish`);
                        stopLossCandidates.push(candle.high + atrVal * this.settings.atrMultiplier);
                    }
                    if (stopLossCandidates.length > 0) stopLossPrice = Math.max(...stopLossCandidates);
                }

                if (reasons.length > 0 && direction && stopLossPrice !== null && activeZone) {
                    const scoreDetails = activeZone.scoreDetails ? {
                        total: activeZone.score,
                        sr: activeZone.scoreDetails.srScore,
                        fib: activeZone.scoreDetails.fibScore,
                        macd: activeZone.scoreDetails.macdScore,
                    } : undefined;
                    this.openPosition(direction, candle.close, stopLossPrice, candle.time, reasons.join(', '), scoreDetails);
                }
            }
            
            this.updateEquity(candle.time);
        }

        if (this.position) {
            this.closePosition(this.ltfCandles[this.ltfCandles.length - 1].close, this.ltfCandles[this.ltfCandles.length - 1].time, 'END_OF_DATA');
        }

        return {
            kpis: this.calculateKPIs(),
            equityCurve: this.equityCurve,
            tradeLog: this.tradeLog,
            srZones: this.srZones,
        };
    }
    
    private openPosition(
        type: 'LONG' | 'SHORT', 
        entryPrice: number, 
        stopLoss: number, 
        time: number, 
        reason: string,
        zoneScoreDetails?: TradeLogEvent['zoneScoreDetails']
    ) {
        const riskPerUnit = Math.abs(entryPrice - stopLoss);
        if (riskPerUnit === 0) return;

        const takeProfit = type === 'LONG'
            ? entryPrice + riskPerUnit * this.settings.minRiskReward
            : entryPrice - riskPerUnit * this.settings.minRiskReward;

        const riskAmount = this.equity * (this.settings.riskPerTradePercent / 100);
        const sizeInBase = riskAmount / riskPerUnit;
        const sizeInQuote = sizeInBase * entryPrice;
        
        const { leverage } = this.settings;
        let liquidationPrice = type === 'LONG' ? entryPrice * (1 - (1 / leverage)) : entryPrice * (1 + (1 / leverage));

        this.position = { type, entryPrice, sizeInQuote, sizeInBase, stopLoss, takeProfit, entryTime: time, liquidationPrice };
        
        this.tradeLog.push({ type: 'ENTRY', direction: type, time, price: entryPrice, positionSize: sizeInBase, equity: this.equity, reason, riskRewardRatio: this.settings.minRiskReward, stopLoss, takeProfit, leverage, liquidationPrice, zoneScoreDetails });
    }
    
    private closePosition(exitPrice: number, time: number, reason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'END_OF_DATA' | 'LIQUIDATION') {
        if (!this.position) return;
        const { sizeInBase, sizeInQuote, entryPrice, type } = this.position;
        const pnl = type === 'LONG' ? (exitPrice - entryPrice) * sizeInBase : (entryPrice - exitPrice) * sizeInBase;
        const commission = (sizeInQuote + (sizeInBase * exitPrice)) * (this.settings.commissionRate / 100);
        const netPnl = pnl - commission;
        const profitPercent = (netPnl / this.equity) * 100;
        this.equity += netPnl;
        this.tradeLog.push({ type: 'EXIT', direction: type, time, price: exitPrice, positionSize: sizeInBase, equity: this.equity, reason, profit: netPnl, profitPercent });
        this.position = null;
    }
    
    private updateEquity(time: number) {
        let currentEquity = this.equity;
        if (this.position) {
            const currentPrice = this.ltfCandles.find(c => c.time === time)!.close;
            const unrealizedPnl = this.position.type === 'LONG'
                ? (currentPrice - this.position.entryPrice) * this.position.sizeInBase
                : (this.position.entryPrice - currentPrice) * this.position.sizeInBase;
            currentEquity += unrealizedPnl;
        }

        if (currentEquity > this.peakEquity) this.peakEquity = currentEquity;
        const drawdown = this.peakEquity - currentEquity;
        if (drawdown > this.maxDrawdown) this.maxDrawdown = drawdown;
        this.equityCurve.push({ time, equity: this.equity });
    }

    private calculateKPIs(): BacktestKPIs {
        const initialCapital = this.settings.initialCapital;
        const netProfit = this.equity - initialCapital;
        const exitTrades = this.tradeLog.filter(t => t.type === 'EXIT');
        if (exitTrades.length === 0) return { netProfit, netProfitPercent: (netProfit / initialCapital) * 100, totalTrades: 0, winRate: 0, profitFactor: null, maxDrawdown: 0, maxDrawdownPercent: 0, avgTradePnl: 0, avgWin: null, avgLoss: null, expectancy: 0 };
        const winningTrades = exitTrades.filter(t => t.profit! > 0);
        const totalWinAmount = winningTrades.reduce((sum, t) => sum + t.profit!, 0);
        const totalLossAmount = Math.abs(exitTrades.filter(t => t.profit! <= 0).reduce((sum, t) => sum + t.profit!, 0));
        const winRate = (winningTrades.length / exitTrades.length) * 100;
        const avgWin = winningTrades.length > 0 ? totalWinAmount / winningTrades.length : null;
        const avgLoss = (exitTrades.length - winningTrades.length) > 0 ? totalLossAmount / (exitTrades.length - winningTrades.length) : null;
        return {
            netProfit,
            netProfitPercent: (netProfit / initialCapital) * 100,
            totalTrades: exitTrades.length,
            winRate,
            profitFactor: totalLossAmount > 0 ? totalWinAmount / totalLossAmount : null,
            maxDrawdown: this.maxDrawdown,
            maxDrawdownPercent: (this.maxDrawdown / this.peakEquity) * 100,
            avgTradePnl: netProfit / exitTrades.length,
            avgWin,
            avgLoss,
            expectancy: (avgWin !== null && avgLoss !== null) ? ((winRate / 100) * avgWin) - ((1 - (winRate / 100)) * avgLoss) : 0,
        };
    }
}

export const runBacktest = (ltfCandles: Candle[], htfCandles: Candle[], settings: BacktestSettings): Promise<BacktestResult> => {
    return new Promise((resolve, reject) => {
        try {
            const engine = new BacktestEngine(ltfCandles, htfCandles, settings);
            resolve(engine.run());
        } catch(error) {
            console.error("Error during backtest execution: ", error);
            reject(error);
        }
    });
};

export const predictNextMove = async (ltfCandles: Candle[], htfCandles: Candle[], settings: BacktestSettings): Promise<PredictionResult> => {
    const LOOKBACK_FOR_SIGNAL = 3; // Look for a signal in the last 3 candles.

    if (ltfCandles.length < settings.atrPeriod + LOOKBACK_FOR_SIGNAL) {
        return { status: 'SKIP_SIGNAL', reason: 'Not enough LTF data.', pattern: null };
    }

    const srZones = identifyHTFZones(htfCandles, settings);
    const htfTrendData = precomputeHtfTrend(htfCandles);
    const ltfAtr = calculateATR(ltfCandles, settings.atrPeriod);

    const latestCandle = ltfCandles[ltfCandles.length - 1];
    const latestAtr = ltfAtr[ltfCandles.length - 1];

    if (latestAtr === null) {
        return { status: 'SKIP_SIGNAL', reason: 'ATR not available for the latest candle.', pattern: null, srZones };
    }

    // Find HTF trend context for the current time
    let currentHtfCandleIndex = -1;
    for (let j = htfCandles.length - 1; j >= 0; j--) {
        if (htfCandles[j].time <= latestCandle.time) { currentHtfCandleIndex = j; break; }
    }
    const htfTrend = currentHtfCandleIndex !== -1 ? htfTrendData[currentHtfCandleIndex] : 'Range';

    if (htfTrend === 'Range' && !settings.allowRangeTrading) {
        return { status: 'SKIP_SIGNAL', reason: 'Trading in range is disabled.', pattern: null, srZones };
    }
    
    // Check the last few candles for a signal, starting with the most recent
    for (let i = ltfCandles.length - 1; i >= Math.max(0, ltfCandles.length - LOOKBACK_FOR_SIGNAL); i--) {
        const signalCandle = ltfCandles[i];
        
        const canGoLong = settings.followHtfTrend ? htfTrend === 'Uptrend' || htfTrend === 'Range' : true;
        const canGoShort = settings.followHtfTrend ? htfTrend === 'Downtrend' || htfTrend === 'Range' : true;

        const activeSupportZone = srZones.find(z => z.type === 'support' && signalCandle.close >= z.startPrice && signalCandle.close <= z.endPrice);
        const activeResistanceZone = srZones.find(z => z.type === 'resistance' && signalCandle.close >= z.startPrice && signalCandle.close <= z.endPrice);
        
        const reasons: string[] = [];
        let direction: 'LONG' | 'SHORT' | null = null;
        let slAnchorPrice: number | null = null; // The price level to base the SL from (e.g., pinbar low)

        if (activeSupportZone && canGoLong) {
            const htfReason = buildHtfReason(htfTrend, activeSupportZone);
            direction = 'LONG';
            if (settings.usePinbar && isPinbar(signalCandle) === 'bullish') {
                reasons.push(`${htfReason}|model-pinbar:detail-pinbar-bullish`);
                slAnchorPrice = signalCandle.low;
            }
            if (settings.useCHOCH && findCHOCH(ltfCandles, i) === 'bullish') {
                reasons.push(`${htfReason}|model-choch:detail-choch-bullish`);
                slAnchorPrice = signalCandle.low;
            }
            if (settings.useSMC && findImbalances(ltfCandles, i) !== null) {
                reasons.push(`${htfReason}|model-smc:detail-smc-bullish`);
                slAnchorPrice = signalCandle.low;
            }
        } 
        else if (activeResistanceZone && canGoShort) {
            const htfReason = buildHtfReason(htfTrend, activeResistanceZone);
            direction = 'SHORT';
             if (settings.usePinbar && isPinbar(signalCandle) === 'bearish') {
                reasons.push(`${htfReason}|model-pinbar:detail-pinbar-bearish`);
                slAnchorPrice = signalCandle.high;
            }
            if (settings.useCHOCH && findCHOCH(ltfCandles, i) === 'bearish') {
                reasons.push(`${htfReason}|model-choch:detail-choch-bearish`);
                slAnchorPrice = signalCandle.high;
            }
            if (settings.useSMC && findImbalances(ltfCandles, i) !== null) {
                reasons.push(`${htfReason}|model-smc:detail-smc-bearish`);
                slAnchorPrice = signalCandle.high;
            }
        }

        // If a signal was found on this past candle...
        if (reasons.length > 0 && direction && slAnchorPrice !== null) {
            // ...validate if it's still a good entry based on the CURRENT price
            const entryPrice = latestCandle.close;
            let stopLossPrice;
            
            if (direction === 'LONG') {
                stopLossPrice = slAnchorPrice - latestAtr * settings.atrMultiplier;
                // Invalidation conditions: price has moved too far away, or below SL anchor
                if (entryPrice > slAnchorPrice + latestAtr * 1.5 || entryPrice < stopLossPrice) {
                    continue; // Signal is stale, check older candle
                }
            } else { // SHORT
                stopLossPrice = slAnchorPrice + latestAtr * settings.atrMultiplier;
                // Invalidation conditions: price has moved too far away, or above SL anchor
                if (entryPrice < slAnchorPrice - latestAtr * 1.5 || entryPrice > stopLossPrice) {
                    continue; // Signal is stale, check older candle
                }
            }

            const riskPerUnit = Math.abs(entryPrice - stopLossPrice);
            if (riskPerUnit === 0) continue;

            const takeProfitPrice = direction === 'LONG'
                ? entryPrice + riskPerUnit * settings.minRiskReward
                : entryPrice - riskPerUnit * settings.minRiskReward;

            // Found a valid, recent signal. Return it.
            return {
                status: 'PLAN_TRADE',
                reason: reasons.join(', '),
                pattern: null, // Pattern detection is implicit in the reason
                direction,
                entryPrice,
                slPrice: stopLossPrice,
                tpPrice: takeProfitPrice,
                rr: settings.minRiskReward,
                srZones,
            };
        }
    }
    
    // If loop finishes with no valid signal found in the lookback window
    return { status: 'SKIP_SIGNAL', reason: 'No valid entry signal found in recent candles.', pattern: null, srZones };
};