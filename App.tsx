
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { PriceChart } from './components/PriceChart';
import { ToastContainer } from './components/toast/ToastContainer';
import { fetchKlines, fetchExchangeInfo, subscribeToKlineStream } from './services/binanceService';
import { calculateEMA, calculateRSI, calculateBollingerBands, calculateMACD } from './services/indicatorService';
import { getTradingAnalysis } from './services/geminiService';
import { runBacktest, predictNextMove } from './services/backtestService';
import type { Candle, PriceAlert, IndicatorData, MultiTimeframeData, BacktestSettings, BacktestResult, PredictionResult } from './types';
import { FALLBACK_SYMBOLS } from './constants';
import { LogoIcon } from './components/icons/LogoIcon';
import { useLanguage } from './contexts/LanguageContext';
import { useToast } from './contexts/ToastContext';
import { AnalysisPanel } from './components/AnalysisPanel';
import { BacktestModal } from './components/BacktestModal';
import { getTrend, getRsiStatus } from './services/indicatorService';
import { defaultSettings } from './components/BacktestSettingsPanel';
import { PredictionPanel } from './components/PredictionPanel';


const App: React.FC = () => {
    const [symbolsList, setSymbolsList] = useState<{ value: string; label: string; baseAssetLogoUrl?: string; quoteAssetLogoUrl?: string; isAlpha?: boolean; }[]>([]);
    const [isSymbolsLoading, setIsSymbolsLoading] = useState<boolean>(true);
    const [symbol, setSymbol] = useState<string>('BTCUSDT');
    const [timeframe, setTimeframe] = useState<string>('15m');
    const [candles, setCandles] = useState<Candle[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const { t } = useLanguage();
    const { addToast } = useToast();

    const [endDate, setEndDate] = useState(() => new Date());
    const [startDate, setStartDate] = useState(() => {
        const date = new Date();
        date.setDate(date.getDate() - 30);
        return date;
    });

    // Price Alert State
    const [alerts, setAlerts] = useState<Record<string, PriceAlert[]>>({});

    // Indicators & Chart Display State
    const [indicators, setIndicators] = useState<Record<string, boolean>>({
        'ema-20': true,
        'ema-24': false,
        'ema-52': false,
        'bb-20-2': false,
        'rsi-14': true,
        'macd-12-26-9': true,
    });
    
    // AI Analysis Panel State
    const [isAnalysisPanelOpen, setIsAnalysisPanelOpen] = useState<boolean>(false);
    const [isAnalysisLoading, setIsAnalysisLoading] = useState<boolean>(false);
    const [analysisResult, setAnalysisResult] = useState<string | null>(null);
    const [multiTimeframeData, setMultiTimeframeData] = useState<MultiTimeframeData | null>(null);

    // Backtesting State
    const [isBacktestModalOpen, setIsBacktestModalOpen] = useState<boolean>(false);
    const [isBacktesting, setIsBacktesting] = useState<boolean>(false);
    const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);

    // Prediction State
    const [isPredictionPanelOpen, setIsPredictionPanelOpen] = useState<boolean>(false);
    const [isPredicting, setIsPredicting] = useState<boolean>(false);
    const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);

    const [refreshCount, setRefreshCount] = useState(0);

    const isHistorical = useMemo(() => {
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return endDate.getTime() < fiveMinutesAgo;
    }, [endDate]);

    const indicatorData = useMemo<IndicatorData>(() => {
        // The longest period needed is for EMA(52) and MACD(26). Give some buffer.
        if (candles.length < 60) return {};
        const data: IndicatorData = {};
        
        // Dynamic calculation based on state
        if (indicators['ema-20']) data.ema20 = calculateEMA(candles, 20);
        if (indicators['ema-24']) data.ema24 = calculateEMA(candles, 24);
        if (indicators['ema-52']) data.ema52 = calculateEMA(candles, 52);
        if (indicators['bb-20-2']) data.bb20 = calculateBollingerBands(candles, 20, 2);
        if (indicators['rsi-14']) data.rsi14 = calculateRSI(candles, 14);
        if (indicators['macd-12-26-9']) data.macd = calculateMACD(candles, 12, 26, 9);
        
        return data;
    }, [candles, indicators]);


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

    // Effect for fetching K-line data and handling WebSocket connection
    useEffect(() => {
        let isActive = true;
        let cleanupWebSocket: (() => void) | null = null;

        const loadDataAndSubscribe = async () => {
            setIsLoading(true);
            setError(null);
            
            try {
                // 1. Fetch historical/initial data
                const klineData = await fetchKlines(symbol, timeframe, 1500, startDate.getTime(), endDate.getTime());
                
                if (!isActive) return;

                if (klineData.length === 0) {
                    setCandles([]);
                    addToast({ message: t('noData'), type: 'error' });
                } else {
                    setCandles(klineData);
                }

                // 2. After data is set, connect WebSocket ONLY if in live mode
                if (!isHistorical) {
                    cleanupWebSocket = subscribeToKlineStream(symbol, timeframe, (updatedCandle, streamSymbol) => {
                        // This check is important to prevent updates from a previous symbol's stream
                        if (!isActive || streamSymbol.toLowerCase() !== symbol.toLowerCase()) return;
                        
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

            } catch (err) {
                if (isActive) {
                    console.error("Failed to fetch k-line data:", err);
                    const errorMessage = err instanceof Error ? err.message : String(err);
                    setError(errorMessage);
                    setCandles([]);
                }
            } finally {
                if (isActive) {
                    setIsLoading(false);
                }
            }
        };

        loadDataAndSubscribe();

        // 3. Return a cleanup function
        return () => {
            isActive = false;
            // When dependencies change, this function is called first, closing any active socket.
            if (cleanupWebSocket) {
                cleanupWebSocket();
            }
        };
    }, [symbol, timeframe, startDate, endDate, refreshCount, isHistorical, addToast, t]);


    const addAlert = (symbol: string, price: number) => {
        const newAlert = { id: `alert-${Date.now()}`, price };
        setAlerts(prev => ({
            ...prev,
            [symbol]: [...(prev[symbol] || []), newAlert]
        }));
        addToast({ message: t('setPriceAlertFor', { symbol: `${symbol} @ ${price}`}), type: 'success' });
    };

    const removeAlert = (symbol: string, id: string) => {
        setAlerts(prev => ({
            ...prev,
            [symbol]: (prev[symbol] || []).filter(a => a.id !== id)
        }));
    };
    
    // Check for triggered alerts
    useEffect(() => {
        const currentAlerts = alerts[symbol] || [];
        if (candles.length > 0 && currentAlerts.length > 0) {
            const lastCandle = candles[candles.length - 1];
            const triggeredAlerts: PriceAlert[] = [];
            
            const remainingAlerts = currentAlerts.filter(alert => {
                const triggered = (lastCandle.low <= alert.price && lastCandle.high >= alert.price);
                if (triggered) {
                    triggeredAlerts.push(alert);
                }
                return !triggered;
            });

            if (triggeredAlerts.length > 0) {
                triggeredAlerts.forEach(alert => {
                    addToast({ message: t('alertTriggeredMessage', { symbol, price: alert.price }), type: 'info' });
                });
                setAlerts(prev => ({ ...prev, [symbol]: remainingAlerts }));
            }
        }
    }, [candles, alerts, symbol, addToast, t]);

    const handleRunAnalysis = useCallback(async () => {
        setIsAnalysisLoading(true);
        setIsAnalysisPanelOpen(true);
        setAnalysisResult(null);
        setMultiTimeframeData(null);

        try {
            const analysisTimeframes = [
                { name: timeframe, data: candles },
                { name: '4h', data: await fetchKlines(symbol, '4h', 200) },
                { name: '1d', data: await fetchKlines(symbol, '1d', 200) },
            ];

            const analysisContext = analysisTimeframes.map(tf => ({
                name: tf.name,
                trend: getTrend(tf.data),
                rsi: getRsiStatus(tf.data),
            }));

            setMultiTimeframeData({ timeframes: analysisContext });

            const result = await getTradingAnalysis({ symbol, timeframes: analysisContext });
            setAnalysisResult(result);

        } catch (error) {
            console.error('AI Analysis failed:', error);
            addToast({ message: t('aiAnalysisFailed'), type: 'error' });
            setAnalysisResult(t('aiAnalysisFailed'));
        } finally {
            setIsAnalysisLoading(false);
        }
    }, [symbol, timeframe, candles, addToast, t]);

    const handleRunBacktest = useCallback(async (settings: BacktestSettings) => {
        setIsBacktesting(true);
        setBacktestResult(null);
        try {
            if (candles.length < 200) { // Increased requirement for HTF analysis
                addToast({ message: t('notEnoughDataForBacktest'), type: 'error'});
                setIsBacktesting(false);
                return;
            }
            // For MTF strategies, we need the higher timeframe data.
            const htfCandles = await fetchKlines(symbol, '4h', 1500, startDate.getTime(), endDate.getTime());

            // The backtest service is now a promise to handle complex calculations without blocking UI thread
            const result = await runBacktest(candles, htfCandles, settings);
            setBacktestResult(result);

        } catch (err) {
            console.error("Backtest failed:", err);
            const errorMessage = err instanceof Error ? err.message : t('backtestFailed');
            addToast({ message: errorMessage, type: 'error' });
        } finally {
            setIsBacktesting(false);
        }
    }, [symbol, candles, startDate, endDate, addToast, t]);

    const handleRunPrediction = useCallback(async () => {
        setIsPredicting(true);
        setIsPredictionPanelOpen(true);
        setPredictionResult(null);
        try {
            if (candles.length < 50) {
                addToast({ message: 'Not enough recent data to make a prediction.', type: 'error' });
                return;
            }
            const htfCandles = await fetchKlines(symbol, '4h', 1500, startDate.getTime(), endDate.getTime());
            const settings = defaultSettings; // Use default settings from the backtest panel
            const result = await predictNextMove(candles, htfCandles, settings);
            setPredictionResult(result);
        } catch (err) {
            console.error("Prediction failed:", err);
            const errorMessage = err instanceof Error ? err.message : 'Prediction failed';
            addToast({ message: errorMessage, type: 'error' });
        } finally {
            setIsPredicting(false);
        }
    }, [symbol, candles, startDate, endDate, addToast, t]);


    return (
        <div className="flex flex-col h-screen bg-gray-900 text-gray-100 font-sans p-4 gap-4">
            <header className="flex-shrink-0 flex items-center gap-3">
                 <LogoIcon />
                <h1 className="text-xl font-bold text-cyan-400">{t('appTitle')}</h1>
            </header>

            <main className="flex-grow flex gap-4 overflow-hidden">
                <div className="flex-grow flex flex-col gap-4 overflow-hidden">
                    <div className="flex-shrink-0">
                        <ControlPanel
                            symbols={symbolsList}
                            isSymbolsLoading={isSymbolsLoading}
                            symbol={symbol}
                            setSymbol={setSymbol}
                            timeframe={timeframe}
                            setTimeframe={setTimeframe}
                            isLoading={isLoading}
                            onRefresh={() => setRefreshCount(c => c + 1)}
                            startDate={startDate}
                            setStartDate={setStartDate}
                            endDate={endDate}
                            setEndDate={setEndDate}
                            alerts={alerts}
                            addAlert={addAlert}
                            removeAlert={removeAlert}
                            indicators={indicators}
                            setIndicators={setIndicators}
                            onRunAnalysis={handleRunAnalysis}
                            isAnalysisLoading={isAnalysisLoading}
                            onOpenBacktest={() => setIsBacktestModalOpen(true)}
                            onRunPrediction={handleRunPrediction}
                            isPredicting={isPredicting}
                        />
                    </div>

                    <div className="flex-grow min-h-0">
                        <PriceChart
                            data={candles}
                            isHistorical={isHistorical}
                            indicatorData={indicatorData}
                            predictionResult={predictionResult}
                        />
                    </div>
                </div>
                
                {isAnalysisPanelOpen && (
                    <AnalysisPanel
                        symbol={symbol}
                        isLoading={isAnalysisLoading}
                        result={analysisResult}
                        mtfData={multiTimeframeData}
                        onRunAnalysis={handleRunAnalysis}
                        onClose={() => setIsAnalysisPanelOpen(false)}
                    />
                )}

                {isPredictionPanelOpen && (
                    <PredictionPanel
                        isLoading={isPredicting}
                        result={predictionResult}
                        onClose={() => {
                            setIsPredictionPanelOpen(false);
                            setPredictionResult(null);
                        }}
                    />
                )}
            </main>

            {isBacktestModalOpen && (
                <BacktestModal
                    isOpen={isBacktestModalOpen}
                    onClose={() => setIsBacktestModalOpen(false)}
                    onRunBacktest={handleRunBacktest}
                    isLoading={isBacktesting}
                    result={backtestResult}
                    candles={candles}
                />
            )}

            <ToastContainer />

            <footer className="text-center text-xs text-gray-600 flex-shrink-0">
               {t('footerText')}
            </footer>
        </div>
    );
};

export default App;
