

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { PriceChart } from './components/PriceChart';
import { ToastContainer } from './components/toast/ToastContainer';
import { fetchKlines, fetchExchangeInfo, subscribeToKlineStream } from './services/binanceService';
import { calculateBollingerBands, calculateEMA, calculateRSI, calculateSMA, calculateADX, calculateMACD } from './services/indicatorService';
import type { Candle, PriceAlert, IndicatorData } from './types';
import { FALLBACK_SYMBOLS } from './constants';
import { LogoIcon } from './components/icons/LogoIcon';
import { useLanguage } from './contexts/LanguageContext';
import { useToast } from './contexts/ToastContext';

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
    
    // WebSocket and Data Caching Refs
    const wsCleanupRef = useRef<(() => void) | null>(null);
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
        if (indicators['ema-24']) {
            data.ema24 = calculateEMA(candles, 24);
        }
        if (indicators['ema-52']) {
            data.ema52 = calculateEMA(candles, 52);
        }
        if (indicators['bb-20-2']) {
            data.bb20 = calculateBollingerBands(candles, 20, 2);
        }
        if (indicators['rsi-14']) {
            data.rsi14 = calculateRSI(candles, 14);
        }
        if (indicators['macd-12-26-9']) {
            data.macd = calculateMACD(candles, 12, 26, 9);
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

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-gray-100 font-sans p-4 gap-4">
            <header className="flex-shrink-0 flex items-center gap-3">
                 <LogoIcon />
                <h1 className="text-xl font-bold text-cyan-400">{t('appTitle')}</h1>
            </header>

            <main className="flex-grow flex flex-col gap-4 overflow-hidden">
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
                    />
                </div>

                <div className="flex-grow flex flex-col gap-4 overflow-hidden">
                     <div className="flex-grow min-h-0">
                        <PriceChart
                            data={candles}
                            isHistorical={isHistorical}
                            indicatorData={indicatorData}
                        />
                    </div>
                </div>
            </main>

            <ToastContainer />

            <footer className="text-center text-xs text-gray-600 flex-shrink-0">
               {t('footerText')}
            </footer>
        </div>
    );
};

export default App;