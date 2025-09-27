import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { PriceChart } from './components/PriceChart';
import { SignalList } from './components/SignalList';
import { StrategyModal } from './components/StrategyModal';
import { BacktestModal } from './components/BacktestModal';
import { PatternDetailModal } from './components/PatternDetailModal';
import { AIDecisionMakerModal } from './components/AIDecisionMakerModal';
import { ToastContainer } from './components/toast/ToastContainer';
import { fetchKlines, fetchExchangeInfo, subscribeToKlineStream } from './services/binanceService';
import { analyzeCandles } from './services/patternRecognizer';
import { getTradingStrategy } from './services/aiService';
import { runBacktest, BacktestResult } from './services/backtestService';
import type { Candle, DetectedPattern, BacktestStrategy, PriceAlert } from './types';
import { FALLBACK_SYMBOLS, ALL_PATTERNS, BACKTEST_INITIAL_CAPITAL, BACKTEST_COMMISSION_RATE } from './constants';
import { LogoIcon } from './components/icons/LogoIcon';
import { useLanguage } from './contexts/LanguageContext';
import { useToast } from './contexts/ToastContext';

const App: React.FC = () => {
    const [symbolsList, setSymbolsList] = useState<{ value: string; label: string; baseAssetLogoUrl?: string; quoteAssetLogoUrl?: string; isAlpha?: boolean; }[]>([]);
    const [isSymbolsLoading, setIsSymbolsLoading] = useState<boolean>(true);
    const [symbol, setSymbol] = useState<string>('BTCUSDT');
    const [timeframe, setTimeframe] = useState<string>('4h');
    const [candles, setCandles] = useState<Candle[]>([]);
    const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
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
    
    const [hoveredPatternIndex, setHoveredPatternIndex] = useState<number | null>(null);
    
    // AI Strategy State
    const [selectedSignalForAI, setSelectedSignalForAI] = useState<DetectedPattern | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
    const [aiStrategy, setAiStrategy] = useState<string | null>(null);
    const [strategyCache, setStrategyCache] = useState<Map<string, string>>(new Map());

    // AI Decision Maker State
    const [isDecisionMakerModalOpen, setIsDecisionMakerModalOpen] = useState<boolean>(false);

    // Pattern Detail Modal State
    const [isPatternDetailModalOpen, setIsPatternDetailModalOpen] = useState<boolean>(false);
    const [selectedPatternForDetail, setSelectedPatternForDetail] = useState<string | null>(null);

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

    // WebSocket and Data Caching Refs
    const wsCleanupRef = useRef<(() => void) | null>(null);
    const klineCacheRef = useRef<Map<string, Candle[]>>(new Map());
    const symbolRef = useRef(symbol);
    const [refreshCount, setRefreshCount] = useState(0);

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
                setError(t('symbolFetchError'));
            } finally {
                setIsSymbolsLoading(false);
            }
        };
        loadSymbols();
    }, [t]);

    const performAnalysis = useCallback((candlesToAnalyze: Candle[]) => {
        if (candlesToAnalyze.length > 0) {
            const detectedPatterns = analyzeCandles(candlesToAnalyze);
            setPatterns(detectedPatterns);
        }
    }, []);

    const handleWsUpdate = useCallback((newCandle: Candle, streamSymbol: string) => {
        if (streamSymbol.toUpperCase() !== symbolRef.current.toUpperCase()) {
            return; // Ignore updates from stale WebSockets for other symbols
        }

        setCandles(prevCandles => {
            const lastCandle = prevCandles.length > 0 ? prevCandles[prevCandles.length - 1] : null;
            let updatedCandles;

            if (lastCandle && newCandle.time === lastCandle.time) {
                updatedCandles = [...prevCandles.slice(0, -1), newCandle];
                if (newCandle.isClosed && !lastCandle.isClosed) {
                    performAnalysis(updatedCandles);
                }
                return updatedCandles;
            } else if (!lastCandle || newCandle.time > lastCandle.time) {
                updatedCandles = [...prevCandles, newCandle];
                return updatedCandles;
            }
            
            return prevCandles;
        });
    }, [performAnalysis]);

    // Main data fetching and WebSocket subscription effect
    useEffect(() => {
        if (isSymbolsLoading || !symbol) return;

        // Date range validation
        if (endDate.getTime() <= startDate.getTime()) {
            setError(t('dateRangeError'));
            setCandles([]);
            setPatterns([]);
            setIsLoading(false);
            wsCleanupRef.current?.();
            wsCleanupRef.current = null;
            return; // Abort fetch
        }
        
        // Clear previous state when symbol or timeframe changes to prevent showing stale data.
        setCandles([]);
        setPatterns([]);
        setBacktestResult(null);
        setIsModalOpen(false);
        setIsBacktestModalOpen(false);
        setIsPatternDetailModalOpen(false);
        setIsDecisionMakerModalOpen(false);

        wsCleanupRef.current?.();
        wsCleanupRef.current = null;

        const loadDataAndSubscribe = async () => {
            setIsLoading(true);
            setError(null);
            setStrategyCache(new Map());
            
            try {
                const cacheKey = `${symbol}-${timeframe}`;
                let historicalCandles: Candle[] = [];

                if (klineCacheRef.current.has(cacheKey) && refreshCount === 0) {
                    historicalCandles = klineCacheRef.current.get(cacheKey)!;
                } else {
                    const finalEndDate = new Date(endDate);
                    finalEndDate.setHours(23, 59, 59, 999);
                    historicalCandles = await fetchKlines(
                        symbol,
                        timeframe,
                        2000, 
                        startDate.getTime(),
                        finalEndDate.getTime()
                    );
                    klineCacheRef.current.set(cacheKey, historicalCandles);
                }

                setCandles(historicalCandles);
                performAnalysis(historicalCandles);

                wsCleanupRef.current = subscribeToKlineStream(symbol, timeframe, handleWsUpdate);

            } catch (err) {
                setError(t('fetchError'));
                console.error(err);
                setCandles([]);
            } finally {
                setIsLoading(false);
            }
        };

        loadDataAndSubscribe();

        return () => {
            wsCleanupRef.current?.();
        };

    }, [symbol, timeframe, startDate, endDate, t, isSymbolsLoading, refreshCount, handleWsUpdate, performAnalysis]);
    

    const displayedCandles = candles;
    const displayedPatterns = useMemo(() => {
        return patterns.filter(p => selectedPatterns.has(p.name));
    }, [patterns, selectedPatterns]);


    const addAlert = useCallback((symbol: string, price: number) => {
        const newAlert: PriceAlert = { id: `alert-${Date.now()}`, price };
        setAlerts(prev => ({
            ...prev,
            [symbol]: [...(prev[symbol] || []), newAlert]
        }));
    }, []);

    const removeAlert = useCallback((symbol: string, id: string) => {
        setAlerts(prev => {
            const symbolAlerts = (prev[symbol] || []).filter(alert => alert.id !== id);
            if (symbolAlerts.length === 0) {
                const newAlerts = { ...prev };
                delete newAlerts[symbol];
                return newAlerts;
            }
            return {
                ...prev,
                [symbol]: symbolAlerts
            };
        });
    }, []);

    // Effect to check for triggered price alerts
    useEffect(() => {
        if (candles.length === 0 || !symbol) return;
        const lastCandle = candles[candles.length - 1];
        const activeAlerts = alerts[symbol] || [];
        
        activeAlerts.forEach(alert => {
            if (
                (lastCandle.low <= alert.price && lastCandle.high >= alert.price) ||
                (lastCandle.close >= alert.price && lastCandle.open <= alert.price) ||
                (lastCandle.close <= alert.price && lastCandle.open >= alert.price)
            ) {
                addToast(t('alertTriggeredMessage').replace('{{symbol}}', symbol).replace('{{price}}', alert.price.toString()));
                removeAlert(symbol, alert.id);
            }
        });

    }, [candles, symbol, alerts, addToast, removeAlert, t]);


    const handleSignalClick = useCallback(async (pattern: DetectedPattern) => {
        setSelectedSignalForAI(pattern);
        setIsModalOpen(true);
        
        const cacheKey = `${symbol}-${timeframe}-${pattern.index}-${locale}`;
        if (strategyCache.has(cacheKey)) {
            setAiStrategy(strategyCache.get(cacheKey)!);
            setIsAiLoading(false);
            return;
        }

        setIsAiLoading(true);
        setAiStrategy(null);
        try {
            const strategy = await getTradingStrategy(candles, pattern, t, locale);
            setAiStrategy(strategy);
            setStrategyCache(prevCache => new Map(prevCache).set(cacheKey, strategy));
        } catch (err) {
            console.error(err);
            setAiStrategy(null);
        } finally {
            setIsAiLoading(false);
        }
    }, [symbol, timeframe, locale, strategyCache, candles, t]);

    const handleShowPatternDetails = useCallback((patternName: string) => {
        setSelectedPatternForDetail(patternName);
        setIsPatternDetailModalOpen(true);
    }, []);

    const runBacktestInternal = useCallback(() => {
         return runBacktest(
            candles,
            displayedPatterns,
            {
                initialCapital: initialCapital,
                commissionRate: BACKTEST_COMMISSION_RATE,
                stopLoss: stopLoss,
                takeProfit: takeProfit,
                leverage: leverage,
                positionSizePercent: positionSizePercent,
                strategy: backtestStrategy,
                rsiPeriod,
                rsiOversold,
                rsiOverbought,
                bbPeriod,
                bbStdDev,
                useVolumeFilter,
                volumeMaPeriod,
                volumeThreshold,
                atrPeriod,
                atrMultiplierSL,
                atrMultiplierTP,
                useAtrPositionSizing,
                riskPerTradePercent,
            },
            t
        );
    }, [candles, displayedPatterns, stopLoss, takeProfit, leverage, positionSizePercent, backtestStrategy, rsiPeriod, rsiOversold, rsiOverbought, bbPeriod, bbStdDev, useVolumeFilter, volumeMaPeriod, volumeThreshold, t, initialCapital, atrPeriod, atrMultiplierSL, atrMultiplierTP, useAtrPositionSizing, riskPerTradePercent]);

    const handleRunBacktest = useCallback(() => {
        if (candles.length === 0) return;
        setIsBacktestRunning(true);
        setTimeout(() => {
            const result = runBacktestInternal();
            setBacktestResult(result);
            setIsBacktestModalOpen(true);
            setIsBacktestRunning(false);
        }, 50);
    }, [candles, runBacktestInternal]);
    
    const handleRerunBacktest = useCallback(() => {
        if (candles.length === 0) return;
        setIsBacktestRunning(true);
        setTimeout(() => {
            const result = runBacktestInternal();
            setBacktestResult(result);
            setIsBacktestRunning(false);
        }, 50);
    }, [candles, runBacktestInternal]);


    const onRefresh = useCallback(() => setRefreshCount(c => c + 1), []);
    const onOpenDecisionMakerModal = useCallback(() => setIsDecisionMakerModalOpen(true), []);

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
            <ToastContainer />
            <header className="bg-gray-800/50 backdrop-blur-sm border-b border-gray-700 p-4 sticky top-0 z-20">
                <div className="container mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                         <LogoIcon />
                        <h1 className="text-xl font-bold text-cyan-400">{t('appTitle')}</h1>
                    </div>
                    <ControlPanel
                        symbols={symbolsList}
                        isSymbolsLoading={isSymbolsLoading}
                        symbol={symbol}
                        setSymbol={setSymbol}
                        timeframe={timeframe}
                        setTimeframe={setTimeframe}
                        isLoading={isLoading}
                        onRefresh={onRefresh}
                        startDate={startDate}
                        setStartDate={setStartDate}
                        endDate={endDate}
                        setEndDate={setEndDate}
                        selectedPatterns={selectedPatterns}
                        setSelectedPatterns={setSelectedPatterns}
                        onRunBacktest={handleRunBacktest}
                        onOpenDecisionMakerModal={onOpenDecisionMakerModal}
                        alerts={alerts}
                        addAlert={addAlert}
                        removeAlert={removeAlert}
                    />
                </div>
            </header>

            <main className="container mx-auto p-4">
                {error && <div className="bg-red-500/20 border border-red-500 text-red-300 p-4 rounded-md mb-4">{error}</div>}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div className="lg:col-span-3 bg-gray-800 p-4 rounded-lg shadow-2xl border border-gray-700">
                        {isLoading && candles.length === 0 ? (
                             <div className="flex items-center justify-center h-[600px]">
                                 <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-500"></div>
                             </div>
                        ) : (
                            <PriceChart 
                                data={displayedCandles} 
                                patterns={displayedPatterns} 
                                hoveredPatternIndex={hoveredPatternIndex}
                            />
                        )}
                    </div>
                    <div className="lg:col-span-1 bg-gray-800 p-4 rounded-lg shadow-2xl border border-gray-700">
                        <SignalList 
                            patterns={displayedPatterns} 
                            isLoading={isLoading && candles.length === 0} 
                            setHoveredPatternIndex={setHoveredPatternIndex}
                            onSignalClick={handleSignalClick}
                            onShowPatternDetails={handleShowPatternDetails}
                        />
                    </div>
                </div>

                <StrategyModal 
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    strategy={aiStrategy}
                    isLoading={isAiLoading}
                    pattern={selectedSignalForAI}
                />
                <AIDecisionMakerModal
                    isOpen={isDecisionMakerModalOpen}
                    onClose={() => setIsDecisionMakerModalOpen(false)}
                    candles={candles}
                    symbol={symbol}
                    timeframe={timeframe}
                />
                <BacktestModal
                    isOpen={isBacktestModalOpen}
                    onClose={() => setIsBacktestModalOpen(false)}
                    result={backtestResult}
                    isBacktestRunning={isBacktestRunning}
                    onRerun={handleRerunBacktest}
                    initialCapital={initialCapital}
                    setInitialCapital={setInitialCapital}
                    stopLoss={stopLoss}
                    setStopLoss={setStopLoss}
                    takeProfit={takeProfit}
                    setTakeProfit={setTakeProfit}
                    leverage={leverage}
                    setLeverage={setLeverage}
                    positionSizePercent={positionSizePercent}
                    setPositionSizePercent={setPositionSizePercent}
                    backtestStrategy={backtestStrategy}
                    setBacktestStrategy={setBacktestStrategy}
                    rsiPeriod={rsiPeriod}
                    setRsiPeriod={setRsiPeriod}
                    rsiOversold={rsiOversold}
                    setRsiOversold={setRsiOversold}
                    rsiOverbought={rsiOverbought}
                    setRsiOverbought={setRsiOverbought}
                    bbPeriod={bbPeriod}
                    setBbPeriod={setBbPeriod}
                    bbStdDev={bbStdDev}
                    setBbStdDev={setBbStdDev}
                    useVolumeFilter={useVolumeFilter}
                    setUseVolumeFilter={setUseVolumeFilter}
                    volumeMaPeriod={volumeMaPeriod}
                    setVolumeMaPeriod={setVolumeMaPeriod}
                    volumeThreshold={volumeThreshold}
                    setVolumeThreshold={setVolumeThreshold}
                    atrPeriod={atrPeriod}
                    setAtrPeriod={setAtrPeriod}
                    atrMultiplierSL={atrMultiplierSL}
                    setAtrMultiplierSL={setAtrMultiplierSL}
                    atrMultiplierTP={atrMultiplierTP}
                    setAtrMultiplierTP={setAtrMultiplierTP}
                    useAtrPositionSizing={useAtrPositionSizing}
                    setUseAtrPositionSizing={setUseAtrPositionSizing}
                    riskPerTradePercent={riskPerTradePercent}
                    setRiskPerTradePercent={setRiskPerTradePercent}
                />
                <PatternDetailModal
                    isOpen={isPatternDetailModalOpen}
                    onClose={() => setIsPatternDetailModalOpen(false)}
                    patternName={selectedPatternForDetail}
                />
            </main>
             <footer className="text-center p-4 text-gray-500 text-sm mt-8">
                <p>{t('footerText')}</p>
            </footer>
        </div>
    );
};

export default App;