import React, { useMemo, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { BacktestResult, TradeLogEvent } from '../services/backtestService';
import { CalculatorIcon } from './icons/CalculatorIcon';
import { RefreshIcon } from './icons/RefreshIcon';
import { ResponsiveContainer, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Area } from 'recharts';
import type { BacktestStrategy } from '../types';


interface BacktestModalProps {
    isOpen: boolean;
    onClose: () => void;
    result: BacktestResult | null;
    isBacktestRunning: boolean;
    onRerun: () => void;
    initialCapital: number;
    setInitialCapital: (value: number) => void;
    stopLoss: number;
    setStopLoss: (value: number) => void;
    takeProfit: number;
    setTakeProfit: (value: number) => void;
    leverage: number;
    setLeverage: (value: number) => void;
    positionSizePercent: number;
    setPositionSizePercent: (value: number) => void;
    backtestStrategy: BacktestStrategy;
    setBacktestStrategy: (strategy: BacktestStrategy) => void;
    rsiPeriod: number;
    setRsiPeriod: (value: number) => void;
    rsiOversold: number;
    setRsiOversold: (value: number) => void;
    rsiOverbought: number;
    setRsiOverbought: (value: number) => void;
    bbPeriod: number;
    setBbPeriod: (value: number) => void;
    bbStdDev: number;
    setBbStdDev: (value: number) => void;
    useVolumeFilter: boolean;
    setUseVolumeFilter: (value: boolean) => void;
    volumeMaPeriod: number;
    setVolumeMaPeriod: (value: number) => void;
    volumeThreshold: number;
    setVolumeThreshold: (value: number) => void;
    atrPeriod: number;
    setAtrPeriod: (value: number) => void;
    atrMultiplierSL: number;
    setAtrMultiplierSL: (value: number) => void;
    atrMultiplierTP: number;
    setAtrMultiplierTP: (value: number) => void;
    useAtrPositionSizing: boolean;
    setUseAtrPositionSizing: (value: boolean) => void;
    riskPerTradePercent: number;
    setRiskPerTradePercent: (value: number) => void;
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

const LogEntry: React.FC<{ entry: TradeLogEvent }> = ({ entry }) => {
    const { t } = useLanguage();
    const time = new Date(entry.time * 1000).toLocaleString();

    const formatCurrency = (value: number, sign: boolean = false) => {
        const signChar = value >= 0 ? '+' : '';
        return `${sign ? signChar : ''}$${value.toFixed(2)}`;
    };

    const renderContent = () => {
        switch (entry.type) {
            case 'START':
                return <span>{t('log_start').replace('{{capital}}', `$${entry.capital.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`)}</span>;
            case 'ENTER_LONG':
                return <span>{t('log_enter_long')
                    .replace('{{price}}', entry.price.toFixed(4))
                    .replace('{{size}}', entry.size.toFixed(4))
                    .replace('{{value}}', entry.value.toFixed(2))
                    .replace('{{capital}}', entry.capital.toFixed(2))
                    .replace('{{signal}}', entry.signal)
                }</span>;
            case 'ENTER_SHORT':
                return <span>{t('log_enter_short')
                    .replace('{{price}}', entry.price.toFixed(4))
                    .replace('{{size}}', entry.size.toFixed(4))
                    .replace('{{value}}', entry.value.toFixed(2))
                    .replace('{{capital}}', entry.capital.toFixed(2))
                    .replace('{{signal}}', entry.signal)
                }</span>;
            case 'CLOSE_LONG':
            case 'CLOSE_SHORT': {
                const isProfit = entry.netPnl >= 0;
                const netPnlText = formatCurrency(entry.netPnl, true);
                const pnlColor = isProfit ? 'text-green-400' : 'text-red-400';
                
                const messageKey = entry.type === 'CLOSE_LONG' ? 'log_close_long' : 'log_close_short';
                const reasonText = t(`tradeCloseReason${entry.reason}`);
                
                let message = t(messageKey)
                    .replace('{{price}}', entry.price.toFixed(4))
                    .replace('{{entryPrice}}', entry.entryPrice.toFixed(4))
                    .replace('{{reason}}', reasonText)
                    .replace('{{duration}}', entry.duration.toString())
                    .replace('{{grossPnl}}', formatCurrency(entry.grossPnl, true))
                    .replace('{{commission}}', entry.commission.toFixed(2))
                    .replace('{{capital}}', entry.capital.toFixed(2));
                
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
                let message = t('log_update_pnl')
                    .replace('{{price}}', entry.price.toFixed(4))
                    .replace('{{equity}}', formatCurrency(entry.equity));

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
            case 'FINISH':
                 return <span className="text-gray-500">{t('log_finish')}</span>;
            default:
                return null;
        }
    };

    return (
        <li className="flex flex-col sm:flex-row sm:gap-4 leading-relaxed">
            <span className="text-gray-500 sm:min-w-[180px] flex-shrink-0">{time}</span>
            <span className="flex-1">{renderContent()}</span>
        </li>
    );
};


const BacktestModalComponent: React.FC<BacktestModalProps> = (props) => {
    const { 
        isOpen, onClose, result, isBacktestRunning, onRerun,
        initialCapital, setInitialCapital,
        stopLoss, setStopLoss, takeProfit, setTakeProfit, leverage, setLeverage,
        positionSizePercent, setPositionSizePercent,
        backtestStrategy, setBacktestStrategy, rsiPeriod, setRsiPeriod, rsiOversold, setRsiOversold,
        rsiOverbought, setRsiOverbought, bbPeriod, setBbPeriod, bbStdDev, setBbStdDev,
        useVolumeFilter, setUseVolumeFilter, volumeMaPeriod, setVolumeMaPeriod,
        volumeThreshold, setVolumeThreshold,
        atrPeriod, setAtrPeriod, atrMultiplierSL, setAtrMultiplierSL,
        atrMultiplierTP, setAtrMultiplierTP, useAtrPositionSizing, setUseAtrPositionSizing,
        riskPerTradePercent, setRiskPerTradePercent
     } = props;
    const { t } = useLanguage();

    const maxStopLoss = useMemo(() => {
        if (leverage <= 1) return 99;
        const theoreticalMax = (100 / leverage) * 0.98;
        return parseFloat(Math.max(0.1, theoreticalMax).toFixed(2));
    }, [leverage]);

    useEffect(() => {
        if (stopLoss > maxStopLoss) {
            setStopLoss(maxStopLoss);
        }
    }, [maxStopLoss, stopLoss, setStopLoss]);

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

    const { pnl, pnlPercentage, totalTrades, winRate, maxDrawdown, profitFactor, avgTradeDurationBars, equityCurve, settings } = result;
    const isProfit = pnl >= 0;
    const pnlColor = isProfit ? 'text-green-400' : 'text-red-400';
    const chartColor = isProfit ? '#10B981' : '#EF4444';
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm p-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <CalculatorIcon className="w-6 h-6 text-cyan-400" />
                        <h2 className="text-lg font-bold text-gray-100">{t('backtestResults')}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>

                <main className="flex-grow flex p-6 gap-6 overflow-hidden">
                    {/* Left: Settings Panel */}
                    <div className="w-80 flex-shrink-0 flex flex-col text-sm">
                        <div className="flex-grow overflow-y-auto pr-4 space-y-4">
                            <h3 className="text-base font-semibold text-cyan-400 -mb-2">{t('backtestSettings')}</h3>
                             <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between items-center mb-1.5">
                                        <label htmlFor="initial-capital" className="text-gray-300">{t('initialCapital')}</label>
                                        <input 
                                            type="number" 
                                            id="initial-capital" 
                                            value={initialCapital} 
                                            onChange={(e) => setInitialCapital(parseFloat(e.target.value) || 0)}
                                            min="1"
                                            step="100"
                                            className="w-32 bg-gray-900 border border-gray-600 rounded-md px-2 py-1 text-right focus:ring-cyan-500 focus:border-cyan-500"
                                        />
                                    </div>
                                    <input
                                        type="range"
                                        aria-label="Initial Capital Slider"
                                        min="100"
                                        max="100000"
                                        step="100"
                                        value={initialCapital}
                                        onChange={(e) => setInitialCapital(parseFloat(e.target.value) || 0)}
                                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                                <hr className="border-gray-600" />

                                <div>
                                    <label htmlFor="backtest-strategy" className="block text-gray-300 mb-1">{t('backtestStrategy')}</label>
                                    <select id="backtest-strategy" value={backtestStrategy} onChange={(e) => setBacktestStrategy(e.target.value as BacktestStrategy)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 focus:ring-cyan-500 focus:border-cyan-500">
                                        <option value="SIGNAL_ONLY">{t('strategySignalOnly')}</option>
                                        <option value="RSI_FILTER">{t('strategyRsiFilter')}</option>
                                        <option value="BOLLINGER_BANDS">{t('strategyBBFilter')}</option>
                                        <option value="ATR_TRAILING_STOP">{t('strategyAtrTrailingStop')}</option>
                                    </select>
                                </div>

                                {backtestStrategy === 'RSI_FILTER' && (
                                    <div className="pl-2 border-l-2 border-gray-700 space-y-3">
                                        <div>
                                            <label htmlFor="rsi-period" className="block text-gray-300 mb-1">{t('rsiPeriod')}</label>
                                            <input type="number" id="rsi-period" value={rsiPeriod} onChange={(e) => setRsiPeriod(parseInt(e.target.value) || 1)} min="1" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1" />
                                        </div>
                                        <div>
                                            <label htmlFor="rsi-oversold" className="block text-gray-300 mb-1">{t('rsiOversold')}</label>
                                            <input type="number" id="rsi-oversold" value={rsiOversold} onChange={(e) => setRsiOversold(parseInt(e.target.value) || 0)} min="0" max="100" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1" />
                                        </div>
                                        <div>
                                            <label htmlFor="rsi-overbought" className="block text-gray-300 mb-1">{t('rsiOverbought')}</label>
                                            <input type="number" id="rsi-overbought" value={rsiOverbought} onChange={(e) => setRsiOverbought(parseInt(e.target.value) || 0)} min="0" max="100" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1" />
                                        </div>
                                    </div>
                                )}

                                {backtestStrategy === 'BOLLINGER_BANDS' && (
                                    <div className="pl-2 border-l-2 border-gray-700 space-y-3">
                                        <div>
                                            <label htmlFor="bb-period" className="block text-gray-300 mb-1">{t('bbPeriod')}</label>
                                            <input type="number" id="bb-period" value={bbPeriod} onChange={(e) => setBbPeriod(parseInt(e.target.value) || 1)} min="1" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1" />
                                        </div>
                                        <div>
                                            <label htmlFor="bb-stddev" className="block text-gray-300 mb-1">{t('bbStdDev')}</label>
                                            <input type="number" id="bb-stddev" value={bbStdDev} onChange={(e) => setBbStdDev(parseFloat(e.target.value) || 0)} min="0" step="0.1" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1" />
                                        </div>
                                    </div>
                                )}
                                
                                {backtestStrategy === 'ATR_TRAILING_STOP' && (
                                    <div className="pl-2 border-l-2 border-gray-700 space-y-3">
                                        <div>
                                            <label htmlFor="atr-period" className="block text-gray-300 mb-1">{t('atrPeriod')}</label>
                                            <input type="number" id="atr-period" value={atrPeriod} onChange={(e) => setAtrPeriod(parseInt(e.target.value) || 1)} min="1" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1" />
                                        </div>
                                        <div>
                                            <label htmlFor="atr-multiplier-sl" className="block text-gray-300 mb-1">{t('atrMultiplierSL')}</label>
                                            <input type="number" id="atr-multiplier-sl" value={atrMultiplierSL} onChange={(e) => setAtrMultiplierSL(parseFloat(e.target.value) || 0)} min="0.1" step="0.1" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1" />
                                        </div>
                                        <div>
                                            <label htmlFor="atr-multiplier-tp" className="block text-gray-300 mb-1">{t('atrMultiplierTP')}</label>
                                            <input type="number" id="atr-multiplier-tp" value={atrMultiplierTP} onChange={(e) => setAtrMultiplierTP(parseFloat(e.target.value) || 0)} min="0.1" step="0.1" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1" />
                                        </div>
                                    </div>
                                )}


                                <hr className="border-gray-600" />
                                <div>
                                    <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={useVolumeFilter} 
                                            onChange={(e) => setUseVolumeFilter(e.target.checked)}
                                            className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" 
                                        />
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
                                <hr className="border-gray-600" />
                                <div>
                                    <label htmlFor="leverage" className="block text-gray-300 mb-1">{t('leverage')} (x)</label>
                                    <input type="number" id="leverage" value={leverage} onChange={(e) => setLeverage(parseFloat(e.target.value) || 1)} min="1" max="125" className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 focus:ring-cyan-500 focus:border-cyan-500" />
                                </div>
                                 <div className={`${backtestStrategy === 'ATR_TRAILING_STOP' ? 'opacity-50' : ''}`}>
                                    <div className="flex justify-between items-center mb-1.5">
                                        <label htmlFor="stop-loss" className="text-gray-300">{t('stopLoss')} (%)</label>
                                        <input type="number" id="stop-loss" value={stopLoss} onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)} min="0" max={maxStopLoss} step="0.1" disabled={backtestStrategy === 'ATR_TRAILING_STOP'} className="w-24 bg-gray-900 border border-gray-600 rounded-md px-2 py-1 text-right focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-50" />
                                    </div>
                                    <input type="range" aria-label="Stop Loss Slider" min="0" max={maxStopLoss} step="0.1" value={stopLoss} onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)} disabled={backtestStrategy === 'ATR_TRAILING_STOP'} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                                    {leverage > 1 && <p className="text-xs text-cyan-400 mt-1">{t('maxStopLossLeverageWarning').replace('{{leverage}}', leverage.toString()).replace('{{maxStopLoss}}', maxStopLoss.toFixed(2))}</p>}
                                </div>
                                 <div className={`${backtestStrategy === 'ATR_TRAILING_STOP' ? 'opacity-50' : ''}`}>
                                    <div className="flex justify-between items-center mb-1.5">
                                        <label htmlFor="take-profit" className="text-gray-300">{t('takeProfit')} (%)</label>
                                        <input type="number" id="take-profit" value={takeProfit} onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 0)} min="0" max="100" step="0.1" disabled={backtestStrategy === 'ATR_TRAILING_STOP'} className="w-24 bg-gray-900 border border-gray-600 rounded-md px-2 py-1 text-right focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-50" />
                                    </div>
                                    <input type="range" aria-label="Take Profit Slider" min="0" max="100" step="0.1" value={takeProfit} onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 0)} disabled={backtestStrategy === 'ATR_TRAILING_STOP'} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                                </div>
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
                    <div className="flex-grow flex flex-col gap-6 overflow-y-auto relative">
                        {isBacktestRunning && (
                            <div className="absolute inset-0 bg-gray-800/70 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
                            </div>
                        )}
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

                        <div>
                            <h3 className="text-base font-semibold text-cyan-400 mb-3">{t('tradeLog')}</h3>
                            <div className="bg-gray-900/50 rounded-lg flex-grow h-48 p-4 border border-gray-700">
                            {result.totalTrades > 0 ? (
                                    <ul className="text-sm font-mono text-gray-300 space-y-2 h-full overflow-y-auto">
                                        {result.tradeLog.map((entry, index) => (
                                            <LogEntry key={index} entry={entry} />
                                        ))}
                                    </ul>
                            ) : (
                                    <div className="flex items-center justify-center h-full text-gray-500">
                                        <p>{t('noTrades')}</p>
                                    </div>
                            )}
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export const BacktestModal = React.memo(BacktestModalComponent);