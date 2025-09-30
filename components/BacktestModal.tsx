import React, { useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { BacktestResult, TradeLogEvent } from '../services/backtestService';
import { PriceChart } from './PriceChart';
import { CalculatorIcon } from './icons/CalculatorIcon';
import { RefreshIcon } from './icons/RefreshIcon';
import { ResponsiveContainer, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Area } from 'recharts';
import type { BacktestStrategy, Candle, DetectedPattern, IndicatorData, TrendLine, TrendPoint } from '../types';
import { TIMEFRAMES } from '../constants';

interface BacktestModalProps {
    isOpen: boolean;
    onClose: () => void;
    result: BacktestResult | null;
    isBacktestRunning: boolean;
    onRerun: () => void;
    backtestStrategy: BacktestStrategy;
    setBacktestStrategy: (strategy: BacktestStrategy) => void;
    htfTimeframe: string;
    setHtfTimeframe: (timeframe: string) => void;
    initialCapital: number;
    setInitialCapital: (value: number) => void;
    leverage: number;
    setLeverage: (value: number) => void;
    positionSizePercent: number;
    setPositionSizePercent: (value: number) => void;
    minRiskReward: number;
    setMinRiskReward: (value: number) => void;
    useAtrTrailingStop: boolean;
    setUseAtrTrailingStop: (value: boolean) => void;
    rsiPeriod: number;
    setRsiPeriod: (value: number) => void;
    rsiBullLevel: number;
    setRsiBullLevel: (value: number) => void;
    rsiBearLevel: number;
    setRsiBearLevel: (value: number) => void;
    useVolumeFilter: boolean;
    setUseVolumeFilter: (value: boolean) => void;
    volumeMaPeriod: number;
    setVolumeMaPeriod: (value: number) => void;
    volumeThreshold: number;
    setVolumeThreshold: (value: number) => void;
    atrPeriod: number;
    setAtrPeriod: (value: number) => void;
    atrMultiplier: number;
    setAtrMultiplier: (value: number) => void;
    useAtrPositionSizing: boolean;
    setUseAtrPositionSizing: (value: boolean) => void;
    riskPerTradePercent: number;
    setRiskPerTradePercent: (value: number) => void;
    useEmaFilter: boolean;
    setUseEmaFilter: (value: boolean) => void;
    emaFastPeriod: number;
    setEmaFastPeriod: (value: number) => void;
    emaSlowPeriod: number;
    setEmaSlowPeriod: (value: number) => void;
    useAdxFilter: boolean;
    setUseAdxFilter: (value: boolean) => void;
    adxPeriod: number;
    setAdxPeriod: (value: number) => void;
    adxThreshold: number;
    setAdxThreshold: (value: number) => void;
    candles: Candle[];
    allPatternsForBacktest: DetectedPattern[];
    marketContext: { swingHighs: TrendPoint[]; swingLows: TrendPoint[] };
    trendlines: TrendLine[];
    timeframe: string;
    indicatorData: IndicatorData;
}

const StatCard: React.FC<{ label: string; value: string; valueColor?: string; small?: boolean }> = ({ label, value, valueColor = 'text-gray-100', small = false }) => (
    <div className="bg-gray-700/50 p-3 rounded-md">
        <p className={`text-gray-400 ${small ? 'text-xs' : 'text-sm'}`}>{label}</p>
        <p className={`font-bold ${valueColor} ${small ? 'text-lg' : 'text-xl'}`}>{value}</p>
    </div>
);


const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-gray-700/80 backdrop-blur-sm p-2 border border-gray-600 rounded-md shadow-lg text-sm">
        <p className="label text-gray-300">{new Date(data.time * 1000).toLocaleString()}</p>
        <p className="text-cyan-400 font-bold">Capital: ${data.capital.toFixed(2)}</p>
      </div>
    );
  }
  return null;
};

const LogEntry: React.FC<{ entry: TradeLogEvent; isFocused: boolean; onClick: () => void; }> = ({ entry, isFocused, onClick }) => {
    const { t } = useLanguage();
    const time = new Date(entry.time * 1000).toLocaleString();

    const formatCurrency = (value: number, sign: boolean = false) => {
        const signChar = value >= 0 ? '+' : '';
        return `${sign ? signChar : ''}$${value.toFixed(2)}`;
    };

    const isClickable = entry.type !== 'START' && entry.type !== 'FINISH';

    const renderContent = () => {
        switch (entry.type) {
            case 'START':
                return <span>{t('log_start', { capital: entry.capital.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})}</span>;
            case 'PLAN':
                return <span className="text-gray-500 italic">{t('log_plan', { direction: entry.direction, signal: entry.signal, entryPrice: entry.entryPrice.toFixed(4), slPrice: entry.slPrice.toFixed(4), tpPrice: entry.tpPrice.toFixed(4), rr: entry.rr.toFixed(2) })}</span>
            case 'PLAN_SKIPPED_RR':
                 return <span className="text-yellow-600 italic">{t('log_plan_skipped_rr', { direction: entry.direction, signal: entry.signal, rr: entry.rr.toFixed(2), minRr: entry.minRr.toFixed(2) })}</span>
            case 'PLAN_SKIPPED_TREND':
                 return <span className="text-yellow-600 italic">{t('log_plan_skipped_trend', { direction: entry.direction, signal: entry.signal, trend: entry.trend })}</span>
            case 'PLAN_SKIPPED_TARGET':
                 return <span className="text-yellow-600 italic">{t('log_plan_skipped_target', { direction: entry.direction, signal: entry.signal })}</span>
            case 'PLAN_CANCELLED':
                return <span className="text-gray-500 italic">{t('log_plan_cancelled', { direction: entry.direction, signal: entry.signal })}</span>
            case 'ENTER_LONG':
                return <span>{t('log_enter_long', { price: entry.price.toFixed(4), size: entry.size.toFixed(4), value: entry.value.toFixed(2), capital: entry.capital.toFixed(2), signal: entry.signal })}</span>;
            case 'ENTER_SHORT':
                return <span>{t('log_enter_short', { price: entry.price.toFixed(4), size: entry.size.toFixed(4), value: entry.value.toFixed(2), capital: entry.capital.toFixed(2), signal: entry.signal })}</span>;
            case 'CLOSE_LONG':
            case 'CLOSE_SHORT': {
                const isProfit = entry.netPnl >= 0;
                const netPnlText = formatCurrency(entry.netPnl, true);
                const pnlColor = isProfit ? 'text-green-400' : 'text-red-400';
                
                const messageKey = entry.type === 'CLOSE_LONG' ? 'log_close_long' : 'log_close_short';
                const reasonText = t(`tradeCloseReason${entry.reason}`);
                
                const message = t(messageKey, { 
                    price: entry.price.toFixed(4),
                    entryPrice: entry.entryPrice.toFixed(4),
                    reason: reasonText,
                    duration: entry.duration.toString(),
                    grossPnl: formatCurrency(entry.grossPnl, true),
                    commission: entry.commission.toFixed(2),
                    capital: entry.capital.toFixed(2),
                    netPnl: '{{netPnl}}' // placeholder
                });
                
                const messageParts = message.split('{{netPnl}}');
                
                return (
                    <span>
                        {messageParts[0]}
                        <span className={`font-semibold ${pnlColor}`}>{netPnlText}</span>
                        {messageParts[1]}
                    </span>
                );
            }
            case 'UPDATE_PNL': {
                const isProfit = entry.unrealizedPnl >= 0;
                const pnlColor = isProfit ? 'text-green-400' : 'text-red-400';
                const message = t('log_update_pnl', {
                    price: entry.price.toFixed(4),
                    equity: formatCurrency(entry.equity),
                    pnl: '{{pnl}}' // placeholder
                });

                const pnlText = formatCurrency(entry.unrealizedPnl, true);
                const messageParts = message.split('{{pnl}}');

                return (
                     <span className="text-gray-400">
                        {messageParts[0]}
                        <span className={`font-semibold ${pnlColor}`}>{pnlText}</span>
                        {messageParts[1]}
                    </span>
                );
            }
             case 'SHORT_TERM_ENTER_LONG':
                return <span className="text-green-400">{t('log_short_term_enter_long', { htfTrend: entry.htfTrend, price: entry.price.toFixed(4), slPrice: entry.slPrice.toFixed(4), tpPrice: entry.tpPrice.toFixed(4), rr: entry.rr.toFixed(2) })}</span>;
            case 'SHORT_TERM_ENTER_SHORT':
                return <span className="text-red-400">{t('log_short_term_enter_short', { htfTrend: entry.htfTrend, price: entry.price.toFixed(4), slPrice: entry.slPrice.toFixed(4), tpPrice: entry.tpPrice.toFixed(4), rr: entry.rr.toFixed(2) })}</span>;
            case 'SHORT_TERM_SKIPPED_TREND':
                return <span className="text-yellow-600 italic">{t('log_short_term_skipped_trend', { direction: entry.direction, htfTrend: entry.htfTrend })}</span>;
            case 'FINISH':
                 return <span className="text-gray-500">{t('log_finish')}</span>;
            default:
                return null;
        }
    };

    const baseClasses = "flex flex-col sm:flex-row sm:gap-4 leading-relaxed p-1 rounded-md transition-colors duration-200";
    const focusClasses = isFocused ? "bg-cyan-500/10" : "";
    const clickableClasses = isClickable ? "cursor-pointer hover:bg-gray-700/50" : "";

    return (
        <li onClick={isClickable ? onClick : undefined} className={`${baseClasses} ${focusClasses} ${clickableClasses}`}>
            <span className="text-gray-500 sm:min-w-[180px] flex-shrink-0">{time}</span>
            <span className="flex-1">{renderContent()}</span>
        </li>
    );
};


const BacktestModalComponent: React.FC<BacktestModalProps> = (props) => {
    const { 
        isOpen, onClose, result, isBacktestRunning, onRerun,
        backtestStrategy, setBacktestStrategy,
        htfTimeframe, setHtfTimeframe,
        initialCapital, setInitialCapital,
        leverage, setLeverage, positionSizePercent, setPositionSizePercent,
        minRiskReward, setMinRiskReward, useAtrTrailingStop, setUseAtrTrailingStop,
        rsiPeriod, setRsiPeriod, rsiBullLevel, setRsiBullLevel, rsiBearLevel, setRsiBearLevel,
        useVolumeFilter, setUseVolumeFilter, volumeMaPeriod, setVolumeMaPeriod, volumeThreshold, setVolumeThreshold,
        atrPeriod, setAtrPeriod, atrMultiplier, setAtrMultiplier,
        useAtrPositionSizing, setUseAtrPositionSizing, riskPerTradePercent, setRiskPerTradePercent,
        useEmaFilter, setUseEmaFilter, emaFastPeriod, setEmaFastPeriod, emaSlowPeriod, setEmaSlowPeriod,
        useAdxFilter, setUseAdxFilter, adxPeriod, setAdxPeriod, adxThreshold, setAdxThreshold,
        candles, allPatternsForBacktest, marketContext, trendlines, timeframe, indicatorData
     } = props;
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<'summary' | 'chartAndLog'>('summary');
    const [focusedTime, setFocusedTime] = useState<number | null>(null);
    
    const HTF_OPTIONS = useMemo(() => TIMEFRAMES.filter(tf => ['1h','2h','4h','6h','8h','12h','1d'].includes(tf.value)), []);
    
    const { executedTradePatternIndices, skippedTradePatternIndices } = useMemo(() => {
        // FIX: Explicitly type `new Set()` to `new Set<number>()` to avoid type inference issues when `result` is null.
        if (!result) return { executedTradePatternIndices: new Set<number>(), skippedTradePatternIndices: new Set<number>() };

        const executed = new Set<number>();
        const skipped = new Set<number>();

        for (const event of result.tradeLog) {
            if ('patternIndex' in event && event.patternIndex !== undefined) {
                if (event.type.startsWith('ENTER')) {
                    executed.add(event.patternIndex);
                } else if (event.type.startsWith('PLAN_SKIPPED') || event.type === 'PLAN_CANCELLED') {
                    skipped.add(event.patternIndex);
                }
            }
        }
        return { executedTradePatternIndices: executed, skippedTradePatternIndices: skipped };
    }, [result]);


    if (!isOpen) return null;

    if (!result) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm p-4" >
                <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                     <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <CalculatorIcon className="w-6 h-6 text-cyan-400" />
                            <h2 className="text-lg font-bold text-gray-100">{t('backtestResults')}</h2>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                    </header>
                    <div className="flex-grow flex items-center justify-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
                    </div>
                </div>
            </div>
        )
    }

    const { pnl, pnlPercentage, totalTrades, winRate, maxDrawdown, profitFactor, avgTradeDurationBars, equityCurve, settings, longestIdleDurationBars, skippedSignals } = result;
    const isProfit = pnl >= 0;
    const pnlColor = isProfit ? 'text-green-400' : 'text-red-400';
    const chartColor = isProfit ? '#10B981' : '#EF4444';
    
    const TabButton: React.FC<{tabName: 'summary' | 'chartAndLog', label: string}> = ({ tabName, label }) => (
        <button 
            onClick={() => { setActiveTab(tabName); setFocusedTime(null); }}
            className={`px-4 py-2 text-sm font-semibold rounded-t-md transition-colors ${activeTab === tabName ? 'bg-gray-800 text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:bg-gray-700/50'}`}
        >
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <CalculatorIcon className="w-6 h-6 text-cyan-400" />
                        <h2 className="text-lg font-bold text-gray-100">{t('backtestResults')}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                
                <div className="flex-shrink-0 border-b border-gray-700 px-6">
                    <nav className="flex gap-2">
                        <TabButton tabName="summary" label={t('summary')} />
                        <TabButton tabName="chartAndLog" label={t('backtestChartAndLog')} />
                    </nav>
                </div>


                <main className="flex-grow flex p-6 gap-6 overflow-hidden">
                    {/* Left: Settings Panel */}
                    <div className="w-80 flex-shrink-0 flex flex-col text-sm">
                        <div className="flex-grow overflow-y-auto pr-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">{t('selectBacktestStrategy')}</label>
                                <div className="flex gap-1 bg-gray-900 p-1 rounded-md">
                                    {(['STRUCTURAL', 'SHORT_TERM'] as BacktestStrategy[]).map(strategy => (
                                        <button key={strategy} onClick={() => setBacktestStrategy(strategy)} className={`flex-1 py-1.5 px-2 rounded text-xs font-semibold transition-colors ${backtestStrategy === strategy ? 'bg-cyan-600 text-white' : 'bg-transparent text-gray-300 hover:bg-gray-700'}`}>{t(`strategy_${strategy}`)}</button>
                                    ))}
                                </div>
                            </div>
                             <div className="space-y-3">
                                {backtestStrategy === 'SHORT_TERM' && (
                                <div>
                                    <label htmlFor="htf-timeframe" className="block text-gray-300 mb-1">{t('htfTimeframe')}</label>
                                     <select id="htf-timeframe" value={htfTimeframe} onChange={(e) => setHtfTimeframe(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 focus:ring-cyan-500 focus:border-cyan-500">
                                        {HTF_OPTIONS.map(tf => <option key={tf.value} value={tf.value}>{tf.label}</option>)}
                                    </select>
                                </div>
                                )}
                                <div>
                                    <div className="flex justify-between items-center mb-1.5">
                                        <label htmlFor="initial-capital" className="text-gray-300">{t('initialCapital')}</label>
                                        <input type="number" id="initial-capital" value={initialCapital} onChange={(e) => setInitialCapital(parseFloat(e.target.value) || 0)} min="1" step="100" className="w-32 bg-gray-900 border border-gray-600 rounded-md px-2 py-1 text-right focus:ring-cyan-500 focus:border-cyan-500" />
                                    </div>
                                    <input type="range" aria-label="Initial Capital Slider" min="100" max="100000" step="100" value={initialCapital} onChange={(e) => setInitialCapital(parseFloat(e.target.value) || 0)} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                                </div>
                                <hr className="border-gray-600" />
                                <h4 className="font-semibold text-gray-400 -mb-2">{t('positionSizing')}</h4>
                                <div>
                                    <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                                        <input type="checkbox" checked={useAtrPositionSizing} onChange={(e) => setUseAtrPositionSizing(e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />
                                        {t('useAtrPositionSizing')}
                                    </label>
                                    <p className="text-xs text-gray-500 mt-1 pl-6">{t('atrSizingHelpText')}</p>
                                </div>
                                {useAtrPositionSizing ? (
                                    <div>
                                        <label htmlFor="risk-per-trade" className="block text-gray-300 mb-1">{t('riskPerTradePercent')}</label>
                                        <input type="number" id="risk-per-trade" value={riskPerTradePercent} onChange={(e) => setRiskPerTradePercent(parseFloat(e.target.value) || 1)} min="0.1" max="100" step="0.1" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 focus:ring-cyan-500 focus:border-cyan-500" />
                                    </div>
                                ) : (
                                    <div>
                                        <label htmlFor="position-size-percent" className="block text-gray-300 mb-1">{t('positionSizePercent')}</label>
                                        <input type="number" id="position-size-percent" value={positionSizePercent} onChange={(e) => setPositionSizePercent(parseFloat(e.target.value) || 1)} min="1" max="100" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 focus:ring-cyan-500 focus:border-cyan-500" />
                                    </div>
                                )}
                                <div>
                                    <label htmlFor="leverage" className="block text-gray-300 mb-1">{t('leverage')} (x)</label>
                                    <input type="number" id="leverage" value={leverage} onChange={(e) => setLeverage(parseFloat(e.target.value) || 1)} min="1" max="125" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 focus:ring-cyan-500 focus:border-cyan-500" />
                                </div>
                                <hr className="border-gray-600" />
                                <h4 className="font-semibold text-gray-400 -mb-2">{t('tradeManagement')}</h4>
                                 <div>
                                    <div className="flex justify-between items-center mb-1.5">
                                        <label htmlFor="min-rr" className="text-gray-300">{t('minRiskRewardRatio')}</label>
                                        <input type="number" id="min-rr" value={minRiskReward} onChange={(e) => setMinRiskReward(parseFloat(e.target.value) || 0)} min="0.1" step="0.1" className="w-24 bg-gray-900 border border-gray-600 rounded-md px-2 py-1 text-right focus:ring-cyan-500 focus:border-cyan-500" />
                                    </div>
                                    <input type="range" aria-label="R:R Slider" min="0.5" max="5" step="0.1" value={minRiskReward} onChange={(e) => setMinRiskReward(parseFloat(e.target.value) || 0)} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                                </div>
                                 <div>
                                    <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                                        <input type="checkbox" checked={useAtrTrailingStop} onChange={(e) => setUseAtrTrailingStop(e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />
                                        {t('useAtrTrailingStop')}
                                    </label>
                                     <p className="text-xs text-gray-500 mt-1 pl-6">{t('atrHelpText')}</p>
                                </div>
                                {(useAtrTrailingStop || useAtrPositionSizing) && (
                                     <div className="pl-2 border-l-2 border-gray-700 space-y-3">
                                         <div>
                                            <label htmlFor="atr-period" className="block text-gray-300 mb-1">{t('atrPeriod')}</label>
                                            <input type="number" id="atr-period" value={atrPeriod} onChange={(e) => setAtrPeriod(parseInt(e.target.value) || 1)} min="1" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1" />
                                        </div>
                                        <div>
                                            <label htmlFor="atr-multiplier" className="block text-gray-300 mb-1">{t('atrMultiplier')}</label>
                                            <input type="number" id="atr-multiplier" value={atrMultiplier} onChange={(e) => setAtrMultiplier(parseFloat(e.target.value) || 0)} min="0.1" step="0.1" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1" />
                                        </div>
                                    </div>
                                )}
                                {backtestStrategy === 'STRUCTURAL' && (
                                    <>
                                        <hr className="border-gray-600" />
                                        <h4 className="font-semibold text-gray-400 -mb-2">{t('entryFilters')}</h4>
                                        
                                        {/* EMA Trend Filter */}
                                        <div>
                                            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                                                <input type="checkbox" checked={useEmaFilter} onChange={(e) => setUseEmaFilter(e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />
                                                {t('emaTrendFilter')}
                                            </label>
                                        </div>
                                        {useEmaFilter && (
                                            <div className="pl-2 border-l-2 border-gray-700 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <label htmlFor="ema-fast" className="text-gray-400 text-xs flex-1">{t('emaFastPeriod')}</label>
                                                    <input type="number" id="ema-fast" value={emaFastPeriod} onChange={(e) => setEmaFastPeriod(parseInt(e.target.value) || 1)} min="1" className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs" />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <label htmlFor="ema-slow" className="text-gray-400 text-xs flex-1">{t('emaSlowPeriod')}</label>
                                                    <input type="number" id="ema-slow" value={emaSlowPeriod} onChange={(e) => setEmaSlowPeriod(parseInt(e.target.value) || 1)} min="1" className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs" />
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* ADX Trend Strength Filter */}
                                        <div>
                                            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                                                <input type="checkbox" checked={useAdxFilter} onChange={(e) => setUseAdxFilter(e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />
                                                {t('adxStrengthFilter')}
                                            </label>
                                        </div>
                                        {useAdxFilter && (
                                            <div className="pl-2 border-l-2 border-gray-700 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <label htmlFor="adx-period" className="text-gray-400 text-xs flex-1">{t('adxPeriod')}</label>
                                                    <input type="number" id="adx-period" value={adxPeriod} onChange={(e) => setAdxPeriod(parseInt(e.target.value) || 1)} min="1" className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs" />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <label htmlFor="adx-threshold" className="text-gray-400 text-xs flex-1">{t('adxThreshold')}</label>
                                                    <input type="number" id="adx-threshold" value={adxThreshold} onChange={(e) => setAdxThreshold(parseInt(e.target.value) || 0)} min="0" className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs" />
                                                </div>
                                            </div>
                                        )}

                                        {/* RSI Momentum Filter */}
                                        <div>
                                            <label className="font-semibold text-gray-300 mt-2 block">{t('rsiMomentumFilter')}</label>
                                        </div>
                                         <div className="pl-2 border-l-2 border-gray-700 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <label htmlFor="rsi-period" className="text-gray-400 text-xs flex-1">{t('rsiPeriod')}</label>
                                                <input type="number" id="rsi-period" value={rsiPeriod} onChange={(e) => setRsiPeriod(parseInt(e.target.value) || 1)} min="1" className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs" />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label htmlFor="rsi-bull" className="text-gray-400 text-xs flex-1">{t('rsiBullLevel')}</label>
                                                <input type="number" id="rsi-bull" value={rsiBullLevel} onChange={(e) => setRsiBullLevel(parseInt(e.target.value) || 0)} min="0" max="100" className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs" />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label htmlFor="rsi-bear" className="text-gray-400 text-xs flex-1">{t('rsiBearLevel')}</label>
                                                <input type="number" id="rsi-bear" value={rsiBearLevel} onChange={(e) => setRsiBearLevel(parseInt(e.target.value) || 0)} min="0" max="100" className="w-16 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs" />
                                            </div>
                                        </div>

                                        {/* Volume Filter */}
                                        <div>
                                            <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                                                <input type="checkbox" checked={useVolumeFilter} onChange={(e) => setUseVolumeFilter(e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />
                                                {t('enableVolumeFilter')}
                                            </label>
                                        </div>
                                        {useVolumeFilter && (
                                            <div className="pl-2 border-l-2 border-gray-700 space-y-3">
                                                <div>
                                                    <label htmlFor="volume-ma-period" className="block text-gray-300 mb-1">{t('volumeMaPeriod')}</label>
                                                    <input type="number" id="volume-ma-period" value={volumeMaPeriod} onChange={(e) => setVolumeMaPeriod(parseInt(e.target.value) || 1)} min="1" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1" />
                                                </div>
                                                <div>
                                                    <label htmlFor="volume-threshold" className="block text-gray-300 mb-1">{t('volumeThreshold')}</label>
                                                    <input type="number" id="volume-threshold" value={volumeThreshold} onChange={(e) => setVolumeThreshold(parseFloat(e.target.value) || 0)} min="0" step="0.1" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1" />
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                            </div>
                        </div>

                        <div className="pt-4 mt-auto border-t border-gray-700">
                            <button onClick={onRerun} disabled={isBacktestRunning} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-md transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed">
                                <RefreshIcon className={`w-4 h-4 ${isBacktestRunning ? 'animate-spin' : ''}`} />
                                {t('rerunBacktest')}
                            </button>
                        </div>
                    </div>

                     {/* Right: Results */}
                    <div className="flex-grow flex flex-col gap-6 overflow-y-auto relative bg-gray-800 rounded-lg">
                        {isBacktestRunning && (
                            <div className="absolute inset-0 bg-gray-800/70 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
                            </div>
                        )}
                        
                        {activeTab === 'summary' && (
                            <div className="p-4 space-y-6 overflow-y-auto">
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                    <StatCard small label={t('initialCapital')} value={`$${settings.initialCapital.toLocaleString()}`} />
                                    <StatCard small label={t('finalCapital')} value={`$${result.finalCapital.toFixed(2)}`} />
                                    <StatCard small label={t('netProfit')} value={`${isProfit ? '+' : ''}$${pnl.toFixed(2)}`} valueColor={pnlColor} />
                                    <StatCard small label={t('pnl')} value={`${isProfit ? '+' : ''}${pnlPercentage.toFixed(2)}%`} valueColor={pnlColor} />
                                    <StatCard small label={t('maxDrawdown')} value={`${(maxDrawdown * 100).toFixed(2)}%`} valueColor="text-red-400" />
                                    <StatCard small label={t('totalTrades')} value={totalTrades.toString()} />
                                    <StatCard small label={t('winRate')} value={`${winRate.toFixed(2)}%`} />
                                    <StatCard small label={t('profitFactor')} value={isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞'} />
                                    <StatCard small label={t('avgTradeDuration')} value={`${avgTradeDurationBars.toFixed(1)} bars`} />
                                    <StatCard small label={t('commissionPerTrade')} value={`${(settings.commissionRate * 100).toFixed(2)}%`} />
                                    <StatCard small label={t('skippedSignals')} value={skippedSignals.toString()} />
                                    <StatCard small label={t('longestIdleTime')} value={`${longestIdleDurationBars} bars`} />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-cyan-400 mb-3">{t('pnlCurve')}</h3>
                                    <div className="h-[250px] bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                                        {equityCurve.length > 1 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={equityCurve} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" strokeOpacity={0.5} />
                                                    <XAxis 
                                                        dataKey="time" 
                                                        stroke="#9CA3AF"
                                                        tickFormatter={(time) => new Date(time * 1000).toLocaleDateString()}
                                                        minTickGap={80}
                                                    />
                                                    <YAxis 
                                                        orientation="right" 
                                                        stroke="#9CA3AF" 
                                                        domain={['dataMin', 'dataMax']}
                                                        tickFormatter={(value) => `$${Number(value).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`}
                                                    />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Area type="monotone" dataKey="capital" stroke={chartColor} strokeWidth={2} fillOpacity={0.4} fill={chartColor} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-gray-500">
                                                <p>{t('notEnoughTradesForChart')}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {activeTab === 'chartAndLog' && (
                           <div className="flex flex-col h-full overflow-hidden">
                                <div className="flex-grow min-h-0">
                                    <PriceChart
                                        data={candles}
                                        patterns={allPatternsForBacktest}
                                        swingHighs={marketContext.swingHighs}
                                        swingLows={marketContext.swingLows}
                                        trendlines={trendlines}
                                        timeframe={timeframe}
                                        hoveredPatternIndex={null}
                                        multiTimeframeAnalysis={[]}
                                        hoveredMultiTimeframePattern={null}
                                        isHistorical={true}
                                        indicatorData={indicatorData}
                                        tradeLog={result?.tradeLog ?? []}
                                        horizontalLines={[]}
                                        onAddHorizontalLine={() => {}}
                                        onRemoveHorizontalLine={() => {}}
                                        drawingMode={null}
                                        showSwingLines={true}
                                        showTrendlines={true}
                                        executedTradePatternIndices={executedTradePatternIndices}
                                        skippedTradePatternIndices={skippedTradePatternIndices}
                                        focusedTime={focusedTime}
                                    />
                                </div>
                                <div className="flex-shrink-0 h-1/3 bg-gray-900/50 p-4 border-t border-gray-700">
                                     <h3 className="text-base font-semibold text-cyan-400 mb-3">{t('tradeLog')}</h3>
                                     {result.tradeLog.length > 0 ? (
                                        <ul className="text-xs font-mono text-gray-300 space-y-1 h-[calc(100%-2rem)] overflow-y-auto pr-2">
                                            {[...result.tradeLog].reverse().map((entry, index) => (
                                                <LogEntry key={index} entry={entry} isFocused={focusedTime === entry.time} onClick={() => setFocusedTime(entry.time)} />
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-gray-500">
                                            <p>{t('noTrades')}</p>
                                        </div>
                                    )}
                                </div>
                           </div>
                        )}

                    </div>
                </main>
            </div>
        </div>
    );
};

export const BacktestModal = React.memo(BacktestModalComponent);