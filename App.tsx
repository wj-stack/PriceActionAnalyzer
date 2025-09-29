

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { PriceChart } from './components/PriceChart';
import { SignalList } from './components/SignalList';
import { StrategyModal } from './components/StrategyModal';
import { BacktestModal } from './components/BacktestModal';
import { AIDecisionMakerModal } from './components/AIDecisionMakerModal';
import { ToastContainer } from './components/toast/ToastContainer';
import { fetchKlines, fetchExchangeInfo, subscribeToKlineStream } from './services/binanceService';
import { analyzeCandles } from './services/patternRecognizer';
import { getTradingStrategy } from './services/aiService';
import { runBacktest, BacktestResult } from './services/backtestService';
import type { Candle, DetectedPattern, BacktestStrategy, PriceAlert, MultiTimeframeAnalysis, TrendLine } from './types';
import { FALLBACK_SYMBOLS, ALL_PATTERNS, BACKTEST_INITIAL_CAPITAL, BACKTEST_COMMISSION_RATE, TIMEFRAMES } from './constants';
import { LogoIcon } from './components/icons/LogoIcon';
import { useLanguage } from './contexts/LanguageContext';
import { useToast } from './contexts/ToastContext';
import { MultiTimeframePanel } from './components/MultiTimeframePanel';

const App: React.FC = () => {
    const [symbolsList, setSymbolsList] = useState<{ value: string; label: string; baseAssetLogoUrl?: string; quoteAssetLogoUrl?: string; isAlpha?: boolean; }[]>([]);
    const [isSymbolsLoading, setIsSymbolsLoading] = useState<boolean>(true);
    const [symbol, setSymbol] = useState<string>('BTCUSDT');
    const [timeframe, setTimeframe] = useState<string>('4h');
    const [candles, setCandles] = useState<Candle[]>([]);
    const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
    const [trendlines, setTrendlines] = useState<TrendLine[]>([]);
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

    // Backtest State
    const [isBacktestModalOpen, setIsBacktestModalOpen] = useState<boolean>(false);
    const [isBacktestRunning, setIsBacktestRunning] = useState<boolean>(false);
    const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
    const [initialCapital, setInitialCapital] = useState<number>(BACKTEST_INITIAL_CAPITAL);
    const [stopLoss, setStopLoss] = useState<number>(2);
    const [takeProfit, setTakeProfit] = useState<number>(4);
    const [leverage, setLeverage] = useState<number>(1);
    const [positionSizePercent, setPositionSizePercent] = useState<number>(10);
    const [backtestStrategy, setBacktestStrategy] = useState<BacktestStrategy>('SIGNAL_ONLY');
    const [rsiPeriod, setRsiPeriod] = useState<number>(14);
    const [rsiOversold, setRsiOversold] = useState<number>(30);
    const [rsiOverbought, setRsiOverbought] = useState<number>(70);
    const [bbPeriod, setBbPeriod] = useState<number>(20);
    const [bbStdDev, setBbStdDev] = useState<number>(2);
    const [useVolumeFilter, setUseVolumeFilter] = useState<boolean>(false);
    const [volumeMaPeriod, setVolumeMaPeriod] = useState<number>(20);
    const [volumeThreshold, setVolumeThreshold] = useState<number>(1.5);
    const [atrPeriod, setAtrPeriod] = useState<number>(14);
    const [atrMultiplierSL, setAtrMultiplierSL] = useState<number>(2);
    const [atrMultiplierTP, setAtrMultiplierTP] = useState<number>(3);
    const [useAtrPositionSizing, setUseAtrPositionSizing] = useState<boolean>(false);
    const [riskPerTradePercent, setRiskPerTradePercent] = useState<number>(1);

    // Price Alert State
    const [alerts, setAlerts] = useState<Record<string, PriceAlert[]>>({});

    // Multi-Timeframe State
    const [secondaryTimeframes, setSecondaryTimeframes] = useState<Set<string>>(() => new Set(['1d']));
    const [multiTimeframeAnalysis, setMultiTimeframeAnalysis] = useState<MultiTimeframeAnalysis[]>([]);
    const [isMultiTimeframeLoading, setIsMultiTimeframeLoading] = useState<boolean>(false);
    const [hoveredMultiTimeframePattern, setHoveredMultiTimeframePattern] = useState<DetectedPattern | null>(null);

    // WebSocket and Data Caching Refs
    const wsCleanupRef = useRef<(() => void) | null>(null);
    const klineCacheRef = useRef<Map<string, Candle[]>>(new Map());
    const symbolRef = useRef(symbol);
    const [refreshCount, setRefreshCount] = useState(0);

    const isHistorical = useMemo(() => {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return endDate.getTime() < fiveMinutesAgo;
    }, [endDate]);

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

    // Effect for running analysis whenever candles change
    useEffect(() => {
        if (candles.length > 0) {
            const { patterns: newPatterns, trendlines: newTrendlines } = analyzeCandles(candles);
            setPatterns(newPatterns);
            setTrendlines(newTrendlines);
        } else {
            setPatterns([]);
            setTrendlines([]);
        }
    }, [candles]);

    // Effect for multi-timeframe analysis
    useEffect(() => {
        const analyzeSecondaryTimeframes = async () => {
            if (secondaryTimeframes.size === 0) {
                setMultiTimeframeAnalysis([]);
                return;
            }
            setIsMultiTimeframeLoading(true);
            const analysisPromises = Array.from(secondaryTimeframes).map(async (tf) => {
                try {
                    const tfCandles = await fetchKlines(symbol, tf, 500, startDate.getTime(), endDate.getTime());
                    const { patterns } = analyzeCandles(tfCandles);
                    return { timeframe: tf, patterns };
                } catch (e) {
                    console.error(`Failed to analyze secondary timeframe ${tf}:`, e);
                    return { timeframe: tf, patterns: [] };
                }
            });
            const results = await Promise.all(analysisPromises);
            setMultiTimeframeAnalysis(results);
            setIsMultiTimeframeLoading(false);
        };
        analyzeSecondaryTimeframes();
    }, [symbol, secondaryTimeframes, startDate, endDate, refreshCount]);

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
                // FIX: Argument of type 'unknown' is not assignable to parameter of type 'string'.
                // Convert the unknown error to a string before using it.
                setAiStrategy(String(err));
            } finally {
                setIsAiLoading(false);
            }
        };
        generateStrategy();
    }, [selectedSignalForAI, isModalOpen, candles, t, locale, strategyCache]);

    const handleAddAlert = useCallback((symbol: string, price: number) => {
        const newAlert = { id: Date.now().toString(), price };
        setAlerts(prev => ({ ...prev, [symbol]: [...(prev[symbol] || []), newAlert] }));
        addToast({ message: t('alertTriggeredMessage', { symbol, price: price.toString() }), type: 'info' });
    }, [addToast, t]);

    const handleRemoveAlert = useCallback((symbol: string, id: string) => {
        setAlerts(prev => ({ ...prev, [symbol]: (prev[symbol] || []).filter(a => a.id !== id) }));
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

    const handleRunBacktest = useCallback(() => {
        if (candles.length < 2) {
            // FIX: Expected 1 arguments, but got 2.
            // The addToast function now expects a single object argument.
            addToast({ message: 'Not enough data to run backtest', type: 'error' });
            return;
        }
        setIsBacktestRunning(true);
        setTimeout(() => {
            try {
                const settings = {
                    initialCapital,
                    commissionRate: BACKTEST_COMMISSION_RATE,
                    stopLoss,
                    takeProfit,
                    strategy: backtestStrategy,
                    leverage,
                    positionSizePercent,
                    rsiPeriod, rsiOversold, rsiOverbought,
                    bbPeriod, bbStdDev,
                    useVolumeFilter, volumeMaPeriod, volumeThreshold,
                    atrPeriod, atrMultiplierSL, atrMultiplierTP,
                    useAtrPositionSizing, riskPerTradePercent,
                };
                const result = runBacktest(
                    candles, 
                    patterns.filter(p => selectedPatterns.has(p.name) && selectedPriorities.has(p.priority)),
                    settings,
                    t
                );
                setBacktestResult(result);
                setIsBacktestModalOpen(true);
            } catch (error) {
                console.error("Backtest failed:", error);
                // FIX: Expected 1 arguments, but got 2.
                // The addToast function now expects a single object argument.
                addToast({ message: 'Backtest failed. See console for details.', type: 'error' });
            } finally {
                setIsBacktestRunning(false);
            }
        }, 50);
    }, [
        candles, patterns, selectedPatterns, selectedPriorities, t, addToast,
        initialCapital, stopLoss, takeProfit, backtestStrategy, leverage, positionSizePercent,
        rsiPeriod, rsiOversold, rsiOverbought, bbPeriod, bbStdDev, useVolumeFilter,
        volumeMaPeriod, volumeThreshold, atrPeriod, atrMultiplierSL, atrMultiplierTP,
        useAtrPositionSizing, riskPerTradePercent,
    ]);
    
    const handleSignalClick = (pattern: DetectedPattern) => {
        setSelectedSignalForAI(pattern);
        setIsModalOpen(true);
    };

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
                        alerts={alerts} addAlert={handleAddAlert} removeAlert={handleRemoveAlert}
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
                        trendlines={trendlines}
                        hoveredPatternIndex={hoveredPatternIndex}
                        multiTimeframeAnalysis={multiTimeframeAnalysis}
                        hoveredMultiTimeframePattern={hoveredMultiTimeframePattern}
                        isHistorical={isHistorical}
                    />
                     <MultiTimeframePanel
                        analysis={multiTimeframeAnalysis}
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
                onClose={() => setIsBacktestModalOpen(false)}
                result={backtestResult}
                isBacktestRunning={isBacktestRunning}
                onRerun={handleRunBacktest}
                initialCapital={initialCapital} setInitialCapital={setInitialCapital}
                stopLoss={stopLoss} setStopLoss={setStopLoss}
                takeProfit={takeProfit} setTakeProfit={setTakeProfit}
                leverage={leverage} setLeverage={setLeverage}
                positionSizePercent={positionSizePercent} setPositionSizePercent={setPositionSizePercent}
                backtestStrategy={backtestStrategy} setBacktestStrategy={setBacktestStrategy}
                rsiPeriod={rsiPeriod} setRsiPeriod={setRsiPeriod}
                rsiOversold={rsiOversold} setRsiOversold={setRsiOversold}
                rsiOverbought={rsiOverbought} setRsiOverbought={setRsiOverbought}
                bbPeriod={bbPeriod} setBbPeriod={setBbPeriod}
                bbStdDev={bbStdDev} setBbStdDev={setBbStdDev}
                useVolumeFilter={useVolumeFilter} setUseVolumeFilter={setUseVolumeFilter}
                volumeMaPeriod={volumeMaPeriod} setVolumeMaPeriod={setVolumeMaPeriod}
                volumeThreshold={volumeThreshold} setVolumeThreshold={setVolumeThreshold}
                atrPeriod={atrPeriod} setAtrPeriod={setAtrPeriod}
                atrMultiplierSL={atrMultiplierSL} setAtrMultiplierSL={setAtrMultiplierSL}
                atrMultiplierTP={atrMultiplierTP} setAtrMultiplierTP={setAtrMultiplierTP}
                useAtrPositionSizing={useAtrPositionSizing} setUseAtrPositionSizing={setUseAtrPositionSizing}
                riskPerTradePercent={riskPerTradePercent} setRiskPerTradePercent={setRiskPerTradePercent}
            />
            
            <AIDecisionMakerModal
                isOpen={isDecisionMakerModalOpen}
                onClose={() => setIsDecisionMakerModalOpen(false)}
                candles={candles}
                symbol={symbol}
                timeframe={timeframe}
            />

            <ToastContainer />
        </div>
    );
};

export default App;
