import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { PriceChart } from './components/PriceChart';
import { SignalList } from './components/SignalList';
import { StrategyModal } from './components/StrategyModal';
import { BacktestModal } from './components/BacktestModal';
import { AIDecisionMakerModal } from './components/AIDecisionMakerModal';
import { PredictionModal } from './components/PredictionModal';
import { ToastContainer } from './components/toast/ToastContainer';
import { fetchKlines, fetchExchangeInfo, subscribeToKlineStream } from './services/binanceService';
import { analyzeCandles } from './services/patternRecognizer';
import { getTradingStrategy } from './services/aiService';
import { runBacktest, BacktestResult } from './services/backtestService';
import { calculateBollingerBands, calculateEMA, calculateRSI, calculateSMA, calculateADX } from './services/indicatorService';
import type { Candle, DetectedPattern, PriceAlert, MultiTimeframeAnalysis, TrendLine, IndicatorData, TrendDirection, TrendPoint, BacktestStrategy, PredictionResult } from './types';
import { SignalDirection } from './types';
import { FALLBACK_SYMBOLS, ALL_PATTERNS, BACKTEST_INITIAL_CAPITAL, BACKTEST_COMMISSION_RATE, TIMEFRAMES, TICK_SIZE } from './constants';
import { LogoIcon } from './components/icons/LogoIcon';
import { useLanguage } from './contexts/LanguageContext';
import { useToast } from './contexts/ToastContext';
import { MultiTimeframePanel } from './components/MultiTimeframePanel';

const App: React.FC = () => {
    const [symbolsList, setSymbolsList] = useState<{ value: string; label: string; baseAssetLogoUrl?: string; quoteAssetLogoUrl?: string; isAlpha?: boolean; }[]>([]);
    const [isSymbolsLoading, setIsSymbolsLoading] = useState<boolean>(true);
    const [symbol, setSymbol] = useState<string>('BTCUSDT');
    const [timeframe, setTimeframe] = useState<string>('15m');
    const [candles, setCandles] = useState<Candle[]>([]);
    const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
    const [trendlines, setTrendlines] = useState<TrendLine[]>([]);
    const [marketContext, setMarketContext] = useState<{ trend: TrendDirection; swingHighs: TrendPoint[]; swingLows: TrendPoint[] }>({ trend: 'RANGE', swingHighs: [], swingLows: []});
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const { t, locale } = useLanguage();
    const { addToast } = useToast();

    const [endDate, setEndDate] = useState(() => new Date());
    const [startDate, setStartDate] = useState(() => {
        const date = new Date();
        date.setDate(date.getDate() - 30);
        return date;
    });

    const [selectedPatterns, setSelectedPatterns] = useState<Set<string>>(
        () => new Set(ALL_PATTERNS.map(p => p.name))
    );
    const [selectedPriorities, setSelectedPriorities] = useState<Set<number>>(
        () => new Set([1, 2, 3, 4]) // Default to all priorities
    );
    
    const [hoveredPatternIndex, setHoveredPatternIndex] = useState<number | null>(null);
    
    // AI Strategy State
    const [selectedSignalForAI, setSelectedSignalForAI] = useState<DetectedPattern | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
    const [aiStrategy, setAiStrategy] = useState<string | null>(null);
    const [strategyCache, setStrategyCache] = useState<Map<string, string>>(new Map());

    // AI Decision Maker State
    const [isDecisionMakerModalOpen, setIsDecisionMakerModalOpen] = useState<boolean>(false);

    // Prediction State
    const [isPredictionModalOpen, setIsPredictionModalOpen] = useState<boolean>(false);
    const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);

    // Backtest State
    const [isBacktestModalOpen, setIsBacktestModalOpen] = useState<boolean>(false);
    const [isBacktestRunning, setIsBacktestRunning] = useState<boolean>(false);
    const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
    const [showTradesOnChart, setShowTradesOnChart] = useState<boolean>(false);
    const [backtestStrategy, setBacktestStrategy] = useState<BacktestStrategy>('STRUCTURAL');
    const [htfTimeframe, setHtfTimeframe] = useState<string>('1h');
    const [initialCapital, setInitialCapital] = useState<number>(BACKTEST_INITIAL_CAPITAL);
    const [leverage, setLeverage] = useState<number>(1);
    const [positionSizePercent, setPositionSizePercent] = useState<number>(1);
    const [minRiskReward, setMinRiskReward] = useState<number>(1.5);
    const [useAtrTrailingStop, setUseAtrTrailingStop] = useState<boolean>(false);
    const [rsiPeriod, setRsiPeriod] = useState<number>(14);
    const [rsiBullLevel, setRsiBullLevel] = useState<number>(40);
    const [rsiBearLevel, setRsiBearLevel] = useState<number>(60);
    const [useVolumeFilter, setUseVolumeFilter] = useState<boolean>(false);
    const [volumeMaPeriod, setVolumeMaPeriod] = useState<number>(20);
    const [volumeThreshold, setVolumeThreshold] = useState<number>(1.5);
    const [atrPeriod, setAtrPeriod] = useState<number>(14);
    const [atrMultiplier, setAtrMultiplier] = useState<number>(2);
    const [useAtrPositionSizing, setUseAtrPositionSizing] = useState<boolean>(false);
    const [riskPerTradePercent, setRiskPerTradePercent] = useState<number>(1);
    // New Advanced Filters State
    const [useEmaFilter, setUseEmaFilter] = useState<boolean>(true);
    const [emaFastPeriod, setEmaFastPeriod] = useState<number>(20);
    const [emaSlowPeriod, setEmaSlowPeriod] = useState<number>(50);
    const [useAdxFilter, setUseAdxFilter] = useState<boolean>(true);
    const [adxPeriod, setAdxPeriod] = useState<number>(14);
    const [adxThreshold, setAdxThreshold] = useState<number>(20);


    // Price Alert & Drawing State
    const [alerts, setAlerts] = useState<Record<string, PriceAlert[]>>({});
    const [drawingMode, setDrawingMode] = useState<'hline' | null>(null);
    const [horizontalLines, setHorizontalLines] = useState<PriceAlert[]>([]);

    // Multi-Timeframe State
    const [secondaryTimeframes, setSecondaryTimeframes] = useState<Set<string>>(() => new Set(['1d']));
    const [multiTimeframeAnalysis, setMultiTimeframeAnalysis] = useState<MultiTimeframeAnalysis[]>([]);
    const [multiTimeframeTrendlines, setMultiTimeframeTrendlines] = useState<TrendLine[]>([]);
    const [isMultiTimeframeLoading, setIsMultiTimeframeLoading] = useState<boolean>(false);
    const [hoveredMultiTimeframePattern, setHoveredMultiTimeframePattern] = useState<DetectedPattern | null>(null);

    // Indicators & Chart Display State
    const [indicators, setIndicators] = useState<Record<string, boolean>>({
        'ema-20': true,
        'bb-20-2': false,
        'rsi-14': true,
    });
    const [showSwingLines, setShowSwingLines] = useState<boolean>(true);
    const [showTrendlines, setShowTrendlines] = useState<boolean>(true);
    const [maxTrendlineLength, setMaxTrendlineLength] = useState<number>(250);
    
    // WebSocket and Data Caching Refs
    const wsCleanupRef = useRef<(() => void) | null>(null);
    const klineCacheRef = useRef<Map<string, Candle[]>>(new Map());
    const symbolRef = useRef(symbol);
    const [refreshCount, setRefreshCount] = useState(0);

    const isHistorical = useMemo(() => {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return endDate.getTime() < fiveMinutesAgo;
    }, [endDate]);

    const indicatorData = useMemo<IndicatorData>(() => {
        if (candles.length < 20) return {};
        const data: IndicatorData = {};
        if (indicators['ema-20']) {
            data.ema20 = calculateEMA(candles, 20);
        }
        if (indicators['bb-20-2']) {
            data.bb20 = calculateBollingerBands(candles, 20, 2);
        }
        if (indicators['rsi-14']) {
            data.rsi14 = calculateRSI(candles, 14);
        }
        return data;
    }, [candles, indicators]);


    useEffect(() => {
        symbolRef.current = symbol;
    }, [symbol]);

    
    useEffect(() => {
        const loadSymbols = async () => {
            setIsSymbolsLoading(true);
            try {
                const symbols = await fetchExchangeInfo();
                setSymbolsList(symbols);
            } catch (e) {
                console.error("Failed to fetch symbols from Binance API, using fallback list.", e);
                setSymbolsList(FALLBACK_SYMBOLS);
            } finally {
                setIsSymbolsLoading(false);
            }
        };

        loadSymbols();
    }, []);

    // Effect for fetching main K-line data and setting up WebSocket
    useEffect(() => {
        const loadKlines = async () => {
            setIsLoading(true);
            setError(null);
            
            try {
                const klineData = await fetchKlines(symbol, timeframe, 1500, startDate.getTime(), endDate.getTime());
                
                if (klineData.length === 0) {
                   setCandles([]);
                   addToast({ message: t('noData'), type: 'error' });
                } else {
                   setCandles(klineData);
                }
            } catch (err) {
                console.error("Failed to fetch k-line data:", err);
                const errorMessage = err instanceof Error ? err.message : String(err);
                setError(errorMessage);
                setCandles([]);
            } finally {
                setIsLoading(false);
            }
        };

        loadKlines();

        if (wsCleanupRef.current) {
            wsCleanupRef.current();
            wsCleanupRef.current = null;
        }

        if (!isHistorical) {
            wsCleanupRef.current = subscribeToKlineStream(symbol, timeframe, (updatedCandle, streamSymbol) => {
                if (streamSymbol !== symbolRef.current) return;
                setCandles(prevCandles => {
                    if (prevCandles.length === 0) return [updatedCandle];
                    const lastCandle = prevCandles[prevCandles.length - 1];
                    if (updatedCandle.time === lastCandle.time) {
                        const newCandles = [...prevCandles];
                        newCandles[newCandles.length - 1] = updatedCandle;
                        return newCandles;
                    } else if (updatedCandle.time > lastCandle.time) {
                        return [...prevCandles, updatedCandle];
                    }
                    return prevCandles;
                });
            });
        }

        return () => {
            if (wsCleanupRef.current) {
                wsCleanupRef.current();
                wsCleanupRef.current = null;
            }
        };
    }, [symbol, timeframe, startDate, endDate, refreshCount, isHistorical, addToast, t]);

    // Effect for running analysis whenever candles or HTF trendlines change
    useEffect(() => {
        if (candles.length > 0) {
            const analysisOptions = { maxTrendlineLength };
            const { patterns: newPatterns, trendlines: newTrendlines, trend, swingHighs, swingLows } = analyzeCandles(candles, multiTimeframeTrendlines, analysisOptions);
            const taggedTrendlines = newTrendlines.map(tl => ({ ...tl, timeframe: timeframe }));
            setPatterns(newPatterns);
            setTrendlines(taggedTrendlines);
            setMarketContext({ trend, swingHighs, swingLows });
        } else {
            setPatterns([]);
            setTrendlines([]);
             setMarketContext({ trend: 'RANGE', swingHighs: [], swingLows: [] });
        }
    }, [candles, multiTimeframeTrendlines, timeframe, maxTrendlineLength]);

    // Effect for multi-timeframe analysis
    useEffect(() => {
        const analyzeSecondaryTimeframes = async () => {
            if (secondaryTimeframes.size === 0) {
                setMultiTimeframeAnalysis([]);
                setMultiTimeframeTrendlines([]);
                return;
            }
            setIsMultiTimeframeLoading(true);
            const analysisOptions = { maxTrendlineLength };
            const analysisPromises = Array.from(secondaryTimeframes).map(async (tf) => {
                try {
                    const tfCandles = await fetchKlines(symbol, tf, 500, startDate.getTime(), endDate.getTime());
                    const { patterns, trendlines, trend, rsi } = analyzeCandles(tfCandles, [], analysisOptions);
                    const taggedTrendlines = trendlines.map(tl => ({ ...tl, timeframe: tf }));
                    return { timeframe: tf, patterns, trendlines: taggedTrendlines, trend, rsi };
                } catch (e) {
                    console.error(`Failed to analyze secondary timeframe ${tf}:`, e);
                    const fallbackRsi = { value: null, state: 'NEUTRAL' as const };
                    return { timeframe: tf, patterns: [], trendlines: [], trend: 'RANGE' as const, rsi: fallbackRsi };
                }
            });
            const results = await Promise.all(analysisPromises);
            setMultiTimeframeAnalysis(results);
            setMultiTimeframeTrendlines(results.flatMap(r => r.trendlines));
            setIsMultiTimeframeLoading(false);
        };
        analyzeSecondaryTimeframes();
    }, [symbol, secondaryTimeframes, startDate, endDate, refreshCount, maxTrendlineLength]);

    // Effect for handling AI strategy generation
    useEffect(() => {
        if (!selectedSignalForAI || !isModalOpen) return;

        const generateStrategy = async () => {
            const cacheKey = `${selectedSignalForAI.name}-${selectedSignalForAI.index}-${locale}`;
            if (strategyCache.has(cacheKey)) {
                setAiStrategy(strategyCache.get(cacheKey) ?? null);
                return;
            }

            setIsAiLoading(true);
            setAiStrategy(null);
            try {
                const strategy = await getTradingStrategy(candles, selectedSignalForAI, t, locale);
                setAiStrategy(strategy);
                setStrategyCache(prev => new Map(prev).set(cacheKey, strategy));
            } catch (err) {
                console.error("Error generating AI strategy:", err);
                // FIX: Refactored error handling to be more explicit for the type checker.
                // An if/else block is used to safely handle the 'unknown' type of the caught error variable.
                if (err instanceof Error) {
                    setAiStrategy(err.message);
                } else {
                    setAiStrategy(String(err));
                }
            } finally {
                setIsAiLoading(false);
            }
        };
        generateStrategy();
    }, [selectedSignalForAI, isModalOpen, candles, t, locale, strategyCache]);

    // Effect to clear backtest results when filters or data context change, as the results are now stale.
    useEffect(() => {
        setBacktestResult(null);
    }, [selectedPatterns, selectedPriorities, symbol, timeframe, startDate, endDate]);

    const handleAddAlert = useCallback((symbol: string, price: number) => {
        const newAlert = { id: Date.now().toString(), price };
        setAlerts(prev => ({ ...prev, [symbol]: [...(prev[symbol] || []), newAlert] }));
        addToast({ message: t('alertTriggeredMessage', { symbol, price: price.toString() }), type: 'info' });
    }, [addToast, t]);

    const handleRemoveAlert = useCallback((symbol: string, id: string) => {
        setAlerts(prev => ({ ...prev, [symbol]: (prev[symbol] || []).filter(a => a.id !== id) }));
    }, []);

    const handleAddHorizontalLine = useCallback((price: number) => {
        const newLine = { id: `hline-${Date.now()}`, price };
        setHorizontalLines(prev => [...prev, newLine]);
        setDrawingMode(null); // Exit drawing mode after adding one line
    }, []);

    const handleRemoveHorizontalLine = useCallback((id: string) => {
        setHorizontalLines(prev => prev.filter(l => l.id !== id));
    }, []);

    // Effect for checking price alerts
    useEffect(() => {
        if (candles.length === 0) return;
        const currentAlerts = alerts[symbol] || [];
        if (currentAlerts.length === 0) return;

        const lastCandle = candles[candles.length - 1];
        
        currentAlerts.forEach(alert => {
            const triggered = lastCandle.low <= alert.price && lastCandle.high >= alert.price;

            if (triggered) {
                addToast({ message: t('alertTriggeredMessage', { symbol, price: alert.price.toString() }), type: 'info' });
                handleRemoveAlert(symbol, alert.id);
            }
        });
    }, [candles, alerts, symbol, handleRemoveAlert, addToast, t]);

    const handleRunBacktest = useCallback(async () => {
        if (candles.length < 2) {
            addToast({ message: 'Not enough data to run backtest', type: 'error' });
            return;
        }
        setIsBacktestRunning(true);
        setBacktestResult(null);
        setShowTradesOnChart(false);

        let htfCandles: Candle[] | undefined = undefined;
        if (backtestStrategy === 'SHORT_TERM') {
            try {
                htfCandles = await fetchKlines(symbol, htfTimeframe, 1500, startDate.getTime(), endDate.getTime());
                 if (htfCandles.length === 0) {
                   addToast({ message: `No data for HTF (${htfTimeframe}), cannot run backtest.`, type: 'error' });
                   setIsBacktestRunning(false);
                   return;
                }
            } catch (e) {
                console.error("Failed to fetch HTF data for backtest:", e);
                addToast({ message: `Failed to fetch data for HTF (${htfTimeframe}).`, type: 'error' });
                setIsBacktestRunning(false);
                return;
            }
        }
        
        // Use a short timeout to allow the UI to update to the "running" state
        setTimeout(() => {
            try {
                const settings = {
                    strategy: backtestStrategy,
                    htfTimeframe,
                    initialCapital,
                    commissionRate: BACKTEST_COMMISSION_RATE,
                    leverage,
                    positionSizePercent,
                    minRiskReward,
                    useAtrTrailingStop,
                    useAtrPositionSizing,
                    riskPerTradePercent,
                    rsiPeriod, rsiBullLevel, rsiBearLevel,
                    useVolumeFilter, volumeMaPeriod, volumeThreshold,
                    atrPeriod, atrMultiplier,
                    useEmaFilter, emaFastPeriod, emaSlowPeriod,
                    useAdxFilter, adxPeriod, adxThreshold,
                };
                const result = runBacktest(
                    candles, 
                    patterns.filter(p => selectedPatterns.has(p.name) && selectedPriorities.has(p.priority)),
                    marketContext,
                    settings,
                    t,
                    htfCandles
                );
                setBacktestResult(result);
                setIsBacktestModalOpen(true);
                setShowTradesOnChart(true);
            } catch (error) {
                console.error("Backtest failed:", error);
                addToast({ message: 'Backtest failed. See console for details.', type: 'error' });
            } finally {
                setIsBacktestRunning(false);
            }
        }, 50);
    }, [
        candles, patterns, selectedPatterns, selectedPriorities, marketContext, t, addToast, symbol, timeframe, startDate, endDate,
        backtestStrategy, htfTimeframe,
        initialCapital, leverage, positionSizePercent, minRiskReward, useAtrTrailingStop,
        useAtrPositionSizing, riskPerTradePercent, rsiPeriod, rsiBullLevel, rsiBearLevel,
        useVolumeFilter, volumeMaPeriod, volumeThreshold, atrPeriod, atrMultiplier,
        useEmaFilter, emaFastPeriod, emaSlowPeriod, useAdxFilter, adxPeriod, adxThreshold
    ]);
    
    const handlePredictSignal = useCallback(() => {
        if (candles.length === 0) {
            setPredictionResult({ status: 'SKIP_SIGNAL', reason: t('noData') });
            setIsPredictionModalOpen(true);
            return;
        }

        const lastIndex = candles.length - 1;
        const lastCandle = candles[lastIndex];
        const lastPattern = patterns.find(p => p.index === lastIndex);

        if (!lastPattern) {
            setPredictionResult({ status: 'SKIP_SIGNAL', reason: t('noSignalOnLastCandle') });
            setIsPredictionModalOpen(true);
            return;
        }

        // Check if the signal is selected in the active filters
        if (!selectedPatterns.has(lastPattern.name) || !selectedPriorities.has(lastPattern.priority)) {
            setPredictionResult({
                status: 'SKIP_SIGNAL',
                reason: t('predictionReasonSignalFiltered', { signalName: t(lastPattern.name) }),
                pattern: lastPattern,
            });
            setIsPredictionModalOpen(true);
            return;
        }

        // --- Run all validation checks from backtester ---
        let skipReason = '';

        // 1. Technical Indicators Check
        if (useEmaFilter) {
            const emaFast = calculateEMA(candles, emaFastPeriod)[lastIndex];
            const emaSlow = calculateEMA(candles, emaSlowPeriod)[lastIndex];
            if (emaFast === null || emaSlow === null) skipReason = t('predictionReasonIndicatorError', { indicator: 'EMA' });
            else if (lastPattern.direction === SignalDirection.Bullish && emaFast <= emaSlow) skipReason = t('predictionReasonEma', { fast: emaFastPeriod, slow: emaSlowPeriod, comparison: '<=' });
            else if (lastPattern.direction === SignalDirection.Bearish && emaFast >= emaSlow) skipReason = t('predictionReasonEma', { fast: emaFastPeriod, slow: emaSlowPeriod, comparison: '>=' });
        }
        if (!skipReason && useAdxFilter) {
            const adx = calculateADX(candles, adxPeriod)[lastIndex];
            if (adx === null) skipReason = t('predictionReasonIndicatorError', { indicator: 'ADX' });
            else if (adx < adxThreshold) skipReason = t('predictionReasonAdx', { threshold: adxThreshold });
        }
        if (!skipReason && rsiPeriod > 0) {
            const rsi = calculateRSI(candles, rsiPeriod)[lastIndex];
            if (rsi === null) skipReason = t('predictionReasonIndicatorError', { indicator: 'RSI' });
            else if (lastPattern.direction === SignalDirection.Bullish && rsi < rsiBullLevel) skipReason = t('predictionReasonRsi', { level: rsiBullLevel, comparison: '<' });
            else if (lastPattern.direction === SignalDirection.Bearish && rsi > rsiBearLevel) skipReason = t('predictionReasonRsi', { level: rsiBearLevel, comparison: '>' });
        }
        if (!skipReason && useVolumeFilter) {
            const volumeMA = calculateSMA(candles.map(c => c.volume), volumeMaPeriod)[lastIndex];
            if (volumeMA === null) skipReason = t('predictionReasonIndicatorError', { indicator: 'Volume MA' });
            else if (lastCandle.volume <= volumeMA * volumeThreshold) skipReason = t('predictionReasonVolume', { threshold: volumeThreshold });
        }

        if (skipReason) {
            setPredictionResult({ status: 'SKIP_SIGNAL', reason: skipReason, pattern: lastPattern });
            setIsPredictionModalOpen(true);
            return;
        }

        // 2. Market Context Trend Check
        const direction = lastPattern.direction === SignalDirection.Bullish ? 'LONG' : 'SHORT';
        if ((marketContext.trend === 'UPTREND' && direction === 'SHORT') || (marketContext.trend === 'DOWNTREND' && direction === 'LONG')) {
            setPredictionResult({ status: 'SKIP_SIGNAL', reason: t('log_plan_skipped_trend', { direction, signal: t(lastPattern.name), trend: marketContext.trend }), pattern: lastPattern });
            setIsPredictionModalOpen(true);
            return;
        }

        // 3. R:R Check
        const signalCandle = lastPattern.candle;
        const entryPrice = direction === 'LONG' ? signalCandle.high + TICK_SIZE : signalCandle.low - TICK_SIZE;
        const slPrice = direction === 'LONG' ? signalCandle.low - TICK_SIZE : signalCandle.high + TICK_SIZE;
        
        const nextTarget = direction === 'LONG'
            ? [...marketContext.swingHighs].sort((a,b) => a.price - b.price).find(sh => sh.price > entryPrice)
            : [...marketContext.swingLows].sort((a,b) => b.price - a.price).find(sl => sl.price < entryPrice);

        if (!nextTarget) {
            setPredictionResult({ status: 'SKIP_SIGNAL', reason: t('log_plan_skipped_target', { direction, signal: t(lastPattern.name) }), pattern: lastPattern });
            setIsPredictionModalOpen(true);
            return;
        }
        
        const tpPrice = nextTarget.price;
        const risk = Math.abs(entryPrice - slPrice);
        if (risk === 0) {
            setPredictionResult({ status: 'SKIP_SIGNAL', reason: t('predictionReasonInvalidRisk'), pattern: lastPattern });
            setIsPredictionModalOpen(true);
            return;
        }
        const reward = Math.abs(tpPrice - entryPrice);
        const rr = reward / risk;

        if (rr < minRiskReward) {
            setPredictionResult({ 
                status: 'SKIP_SIGNAL', 
                reason: t('log_plan_skipped_rr', { direction, signal: t(lastPattern.name), rr: rr.toFixed(2), minRr: minRiskReward.toFixed(2) }), 
                pattern: lastPattern,
                direction, entryPrice, slPrice, tpPrice, rr
            });
            setIsPredictionModalOpen(true);
            return;
        }

        // If all checks pass:
        setPredictionResult({
            status: 'PLAN_TRADE',
            reason: t('predictionReasonValid', { rr: rr.toFixed(2), minRr: minRiskReward.toFixed(2) }),
            pattern: lastPattern,
            direction, entryPrice, slPrice, tpPrice, rr
        });
        setIsPredictionModalOpen(true);

    }, [candles, patterns, selectedPatterns, selectedPriorities, marketContext, t, minRiskReward, useEmaFilter, emaFastPeriod, emaSlowPeriod, useAdxFilter, adxPeriod, adxThreshold, rsiPeriod, rsiBullLevel, rsiBearLevel, useVolumeFilter, volumeMaPeriod, volumeThreshold]);
    
    const handleSignalClick = (pattern: DetectedPattern) => {
        setSelectedSignalForAI(pattern);
        setIsModalOpen(true);
    };

    const filteredMultiTimeframeAnalysis = useMemo(() => {
        return multiTimeframeAnalysis.map(analysis => ({
            ...analysis,
            patterns: analysis.patterns.filter(p => 
                selectedPatterns.has(p.name) && selectedPriorities.has(p.priority)
            )
        }));
    }, [multiTimeframeAnalysis, selectedPatterns, selectedPriorities]);

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans flex flex-col">
            <header className="p-4 border-b border-gray-700">
                <div className="flex items-center justify-between flex-wrap gap-y-4">
                    <div className="flex items-center gap-3">
                        <LogoIcon />
                        <h1 className="text-xl font-bold text-gray-100">{t('appTitle')}</h1>
                    </div>
                </div>
                <div className="mt-4">
                    <ControlPanel
                        symbols={symbolsList} isSymbolsLoading={isSymbolsLoading}
                        symbol={symbol} setSymbol={setSymbol}
                        timeframe={timeframe} setTimeframe={setTimeframe}
                        isLoading={isLoading} onRefresh={() => setRefreshCount(c => c + 1)}
                        startDate={startDate} setStartDate={setStartDate}
                        endDate={endDate} setEndDate={setEndDate}
                        selectedPatterns={selectedPatterns} setSelectedPatterns={setSelectedPatterns}
                        selectedPriorities={selectedPriorities} setSelectedPriorities={setSelectedPriorities}
                        secondaryTimeframes={secondaryTimeframes} setSecondaryTimeframes={setSecondaryTimeframes}
                        onRunBacktest={handleRunBacktest}
                        onOpenDecisionMakerModal={() => setIsDecisionMakerModalOpen(true)}
                        onPredictSignal={handlePredictSignal}
                        alerts={alerts} addAlert={handleAddAlert} removeAlert={handleRemoveAlert}
                        indicators={indicators} setIndicators={setIndicators}
                        drawingMode={drawingMode} setDrawingMode={setDrawingMode}
                        showSwingLines={showSwingLines} setShowSwingLines={setShowSwingLines}
                        showTrendlines={showTrendlines} setShowTrendlines={setShowTrendlines}
                        maxTrendlineLength={maxTrendlineLength} setMaxTrendlineLength={setMaxTrendlineLength}
                    />
                </div>
            </header>

            <main className="flex-grow p-6 grid grid-cols-1 xl:grid-cols-4 gap-6">
                <div className="xl:col-span-3 flex flex-col gap-6">
                     {error && (
                        <div className="p-4 bg-red-500/20 text-red-300 border border-red-500/50 rounded-md">
                            <p>{t('fetchError')}: {error}</p>
                        </div>
                    )}
                    <PriceChart
                        data={candles}
                        patterns={patterns.filter(p => selectedPatterns.has(p.name) && selectedPriorities.has(p.priority))}
                        trendlines={[...trendlines, ...multiTimeframeTrendlines]}
                        swingHighs={marketContext.swingHighs}
                        swingLows={marketContext.swingLows}
                        timeframe={timeframe}
                        hoveredPatternIndex={hoveredPatternIndex}
                        multiTimeframeAnalysis={filteredMultiTimeframeAnalysis}
                        hoveredMultiTimeframePattern={hoveredMultiTimeframePattern}
                        isHistorical={isHistorical}
                        indicatorData={indicatorData}
                        tradeLog={showTradesOnChart ? (backtestResult?.tradeLog ?? []) : []}
                        horizontalLines={horizontalLines}
                        onAddHorizontalLine={handleAddHorizontalLine}
                        onRemoveHorizontalLine={handleRemoveHorizontalLine}
                        drawingMode={drawingMode}
                        showSwingLines={showSwingLines}
                        showTrendlines={showTrendlines}
                    />
                     <MultiTimeframePanel
                        analysis={filteredMultiTimeframeAnalysis}
                        isLoading={isMultiTimeframeLoading}
                        setHoveredMultiTimeframePattern={setHoveredMultiTimeframePattern}
                    />
                </div>
                <div className="flex flex-col">
                     <SignalList
                        patterns={patterns.filter(p => selectedPatterns.has(p.name) && selectedPriorities.has(p.priority))}
                        isLoading={isLoading}
                        setHoveredPatternIndex={setHoveredPatternIndex}
                        onSignalClick={handleSignalClick}
                    />
                </div>
            </main>
            
            <StrategyModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                strategy={aiStrategy}
                isLoading={isAiLoading}
                pattern={selectedSignalForAI}
            />

             <BacktestModal
                isOpen={isBacktestModalOpen}
                onClose={() => {
                    setIsBacktestModalOpen(false);
                    setShowTradesOnChart(false);
                }}
                result={backtestResult}
                isBacktestRunning={isBacktestRunning}
                onRerun={handleRunBacktest}
                backtestStrategy={backtestStrategy} setBacktestStrategy={setBacktestStrategy}
                htfTimeframe={htfTimeframe} setHtfTimeframe={setHtfTimeframe}
                initialCapital={initialCapital} setInitialCapital={setInitialCapital}
                leverage={leverage} setLeverage={setLeverage}
                positionSizePercent={positionSizePercent} setPositionSizePercent={setPositionSizePercent}
                minRiskReward={minRiskReward} setMinRiskReward={setMinRiskReward}
                useAtrTrailingStop={useAtrTrailingStop} setUseAtrTrailingStop={setUseAtrTrailingStop}
                rsiPeriod={rsiPeriod} setRsiPeriod={setRsiPeriod}
                rsiBullLevel={rsiBullLevel} setRsiBullLevel={setRsiBullLevel}
                rsiBearLevel={rsiBearLevel} setRsiBearLevel={setRsiBearLevel}
                useVolumeFilter={useVolumeFilter} setUseVolumeFilter={setUseVolumeFilter}
                volumeMaPeriod={volumeMaPeriod} setVolumeMaPeriod={setVolumeMaPeriod}
                volumeThreshold={volumeThreshold} setVolumeThreshold={setVolumeThreshold}
                atrPeriod={atrPeriod} setAtrPeriod={setAtrPeriod}
                atrMultiplier={atrMultiplier} setAtrMultiplier={setAtrMultiplier}
                useAtrPositionSizing={useAtrPositionSizing} setUseAtrPositionSizing={setUseAtrPositionSizing}
                riskPerTradePercent={riskPerTradePercent} setRiskPerTradePercent={setRiskPerTradePercent}
                useEmaFilter={useEmaFilter} setUseEmaFilter={setUseEmaFilter}
                emaFastPeriod={emaFastPeriod} setEmaFastPeriod={setEmaFastPeriod}
                emaSlowPeriod={emaSlowPeriod} setEmaSlowPeriod={setEmaSlowPeriod}
                useAdxFilter={useAdxFilter} setUseAdxFilter={setUseAdxFilter}
                adxPeriod={adxPeriod} setAdxPeriod={setAdxPeriod}
                adxThreshold={adxThreshold} setAdxThreshold={setAdxThreshold}
                candles={candles}
                allPatternsForBacktest={patterns.filter(p => selectedPatterns.has(p.name) && selectedPriorities.has(p.priority))}
                marketContext={marketContext}
                trendlines={trendlines}
                timeframe={timeframe}
                indicatorData={indicatorData}
            />
            
            <AIDecisionMakerModal
                isOpen={isDecisionMakerModalOpen}
                onClose={() => setIsDecisionMakerModalOpen(false)}
                candles={candles}
                symbol={symbol}
                timeframe={timeframe}
            />

            <PredictionModal
                isOpen={isPredictionModalOpen}
                onClose={() => setIsPredictionModalOpen(false)}
                result={predictionResult}
            />

            <ToastContainer />
        </div>
    );
};

export default App;