
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { PriceChart } from './components/PriceChart';
import { SignalList } from './components/SignalList';
import { StrategyModal } from './components/StrategyModal';
import { BacktestModal } from './components/BacktestModal';
import { PatternDetailModal } from './components/PatternDetailModal';
import { TokenListModal } from './components/TokenListModal';
import { fetchKlines, fetchExchangeInfo, fetchAlphaTokenList } from './services/binanceService';
import { analyzeCandles } from './services/patternRecognizer';
import { getTradingStrategy } from './services/aiService';
import { runBacktest, BacktestResult } from './services/backtestService';
import type { Candle, DetectedPattern, BacktestStrategy, AlphaToken } from './types';
import { FALLBACK_SYMBOLS, ALL_PATTERNS, BACKTEST_INITIAL_CAPITAL, BACKTEST_COMMISSION_RATE } from './constants';
import { LogoIcon } from './components/icons/LogoIcon';
import { useLanguage } from './contexts/LanguageContext';

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

    // Pattern Detail Modal State
    const [isPatternDetailModalOpen, setIsPatternDetailModalOpen] = useState<boolean>(false);
    const [selectedPatternForDetail, setSelectedPatternForDetail] = useState<string | null>(null);

    // Token List Modal State
    const [isTokenListModalOpen, setIsTokenListModalOpen] = useState<boolean>(false);
    const [alphaTokens, setAlphaTokens] = useState<AlphaToken[]>([]);

    // Backtest State
    const [isBacktestModalOpen, setIsBacktestModalOpen] = useState<boolean>(false);
    const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
    const [stopLoss, setStopLoss] = useState<number>(2);
    const [takeProfit, setTakeProfit] = useState<number>(4);
    const [backtestStrategy, setBacktestStrategy] = useState<BacktestStrategy>('SIGNAL_ONLY');
    const [rsiPeriod, setRsiPeriod] = useState<number>(14);
    const [rsiOversold, setRsiOversold] = useState<number>(30);
    const [rsiOverbought, setRsiOverbought] = useState<number>(70);
    const [bbPeriod, setBbPeriod] = useState<number>(20);
    const [bbStdDev, setBbStdDev] = useState<number>(2);
    const [useVolumeFilter, setUseVolumeFilter] = useState<boolean>(false);
    const [volumeMaPeriod, setVolumeMaPeriod] = useState<number>(20);
    const [volumeThreshold, setVolumeThreshold] = useState<number>(1.5);

    useEffect(() => {
        const loadSymbols = async () => {
            setIsSymbolsLoading(true);
            try {
                const { combinedSymbols, alphaTokenDetails } = await fetchExchangeInfo();
                setSymbolsList(combinedSymbols);
                setAlphaTokens(alphaTokenDetails);
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

    const fetchData = useCallback(async () => {
        if (!symbol) return; // Don't fetch if no symbol is selected yet
        setStrategyCache(new Map()); // Clear AI strategy cache on new data fetch
        setIsLoading(true);
        setError(null);
        try {
            const finalEndDate = new Date(endDate);
            finalEndDate.setHours(23, 59, 59, 999);

            const selectedSymbolData = symbolsList.find(s => s.value === symbol);
            const isAlpha = selectedSymbolData?.isAlpha ?? false;

            const klineData = await fetchKlines(
                symbol,
                timeframe,
                1000,
                startDate.getTime(),
                finalEndDate.getTime(),
                isAlpha
            );
            setCandles(klineData);
            const detectedPatterns = analyzeCandles(klineData);
            setPatterns(detectedPatterns);
        } catch (err) {
            setError(t('fetchError'));
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }, [symbol, timeframe, startDate, endDate, t, symbolsList]);

    useEffect(() => {
        if (!isSymbolsLoading) {
            fetchData();
        }
    }, [fetchData, isSymbolsLoading]);

    const filteredPatterns = useMemo(() => {
        return patterns.filter(p => selectedPatterns.has(p.name));
    }, [patterns, selectedPatterns]);

    const handleSignalClick = async (pattern: DetectedPattern) => {
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
    };

    const handleShowPatternDetails = (patternName: string) => {
        setSelectedPatternForDetail(patternName);
        setIsPatternDetailModalOpen(true);
    };

    const handleRunBacktest = () => {
        if (candles.length === 0) return;
        const result = runBacktest(
            candles,
            filteredPatterns,
            {
                initialCapital: BACKTEST_INITIAL_CAPITAL,
                commissionRate: BACKTEST_COMMISSION_RATE,
                stopLoss: stopLoss,
                takeProfit: takeProfit,
                strategy: backtestStrategy,
                rsiPeriod,
                rsiOversold,
                rsiOverbought,
                bbPeriod,
                bbStdDev,
                useVolumeFilter,
                volumeMaPeriod,
                volumeThreshold,
            },
            t
        );
        setBacktestResult(result);
        setIsBacktestModalOpen(true);
    };

    const handleTokenSelect = (selectedSymbol: string) => {
        setSymbol(selectedSymbol);
        setIsTokenListModalOpen(false);
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
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
                        onRefresh={fetchData}
                        startDate={startDate}
                        setStartDate={setStartDate}
                        endDate={endDate}
                        setEndDate={setEndDate}
                        selectedPatterns={selectedPatterns}
                        setSelectedPatterns={setSelectedPatterns}
                        onRunBacktest={handleRunBacktest}
                        onShowTokenList={() => setIsTokenListModalOpen(true)}
                        stopLoss={stopLoss}
                        setStopLoss={setStopLoss}
                        takeProfit={takeProfit}
                        setTakeProfit={setTakeProfit}
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
                    />
                </div>
            </header>

            <main className="container mx-auto p-4">
                {error && <div className="bg-red-500/20 border border-red-500 text-red-300 p-4 rounded-md mb-4">{error}</div>}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div className="lg:col-span-3 bg-gray-800 p-4 rounded-lg shadow-2xl border border-gray-700">
                        {isLoading || isSymbolsLoading ? (
                             <div className="flex items-center justify-center h-[600px]">
                                 <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-500"></div>
                             </div>
                        ) : (
                            <PriceChart data={candles} patterns={filteredPatterns} hoveredPatternIndex={hoveredPatternIndex} />
                        )}
                    </div>
                    <div className="lg:col-span-1 bg-gray-800 p-4 rounded-lg shadow-2xl border border-gray-700">
                        <SignalList 
                            patterns={filteredPatterns} 
                            isLoading={isLoading || isSymbolsLoading} 
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
                <BacktestModal
                    isOpen={isBacktestModalOpen}
                    onClose={() => setIsBacktestModalOpen(false)}
                    result={backtestResult}
                />
                <PatternDetailModal
                    isOpen={isPatternDetailModalOpen}
                    onClose={() => setIsPatternDetailModalOpen(false)}
                    patternName={selectedPatternForDetail}
                />
                <TokenListModal
                    isOpen={isTokenListModalOpen}
                    onClose={() => setIsTokenListModalOpen(false)}
                    tokens={alphaTokens}
                    isLoading={isSymbolsLoading}
                    symbols={symbolsList}
                    onTokenSelect={handleTokenSelect}
                />
            </main>
             <footer className="text-center p-4 text-gray-500 text-sm mt-8">
                <p>{t('footerText')}</p>
            </footer>
        </div>
    );
};

export default App;
