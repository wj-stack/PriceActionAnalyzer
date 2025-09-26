


import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { BacktestResult, TradeLogEvent } from '../services/backtestService';
import { CalculatorIcon } from './icons/CalculatorIcon';
import { ResponsiveContainer, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Area } from 'recharts';


interface BacktestModalProps {
    isOpen: boolean;
    onClose: () => void;
    result: BacktestResult | null;
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
                return <span>{t('log_enter_long').replace('{{signal}}', entry.signal).replace('{{price}}', entry.price.toFixed(4))}</span>;
            case 'ENTER_SHORT':
                return <span>{t('log_enter_short').replace('{{signal}}', entry.signal).replace('{{price}}', entry.price.toFixed(4))}</span>;
            case 'CLOSE_LONG':
            case 'CLOSE_SHORT': {
                const isProfit = entry.netPnl >= 0;
                const netPnlText = formatCurrency(entry.netPnl, true);
                const pnlColor = isProfit ? 'text-green-400' : 'text-red-400';
                
                const messageKey = entry.type === 'CLOSE_LONG' ? 'log_close_long' : 'log_close_short';

                const reasonText = t(`tradeCloseReason${entry.reason}`);
                let message = t(messageKey)
                    .replace('{{price}}', entry.price.toFixed(4))
                    .replace('{{reason}}', reasonText)
                    .replace('{{grossPnl}}', formatCurrency(entry.grossPnl, true))
                    .replace('{{commission}}', entry.commission.toFixed(2));
                
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


const BacktestModalComponent: React.FC<BacktestModalProps> = ({ isOpen, onClose, result }) => {
    const { t } = useLanguage();
    if (!isOpen || !result) return null;

    const { pnl, pnlPercentage, totalTrades, winRate, maxDrawdown, profitFactor, avgTradeDurationBars, equityCurve, settings } = result;
    const isProfit = pnl >= 0;
    const pnlColor = isProfit ? 'text-green-400' : 'text-red-400';
    const chartColor = isProfit ? '#10B981' : '#EF4444';
    
    const strategyKeyMap = {
        'SIGNAL_ONLY': 'strategySignalOnly',
        'RSI_FILTER': 'strategyRsiFilter',
        'BOLLINGER_BANDS': 'strategyBBFilter',
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <CalculatorIcon className="w-6 h-6 text-cyan-400" />
                        <h2 className="text-lg font-bold text-gray-100">{t('backtestResults')}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>

                <main className="p-6 flex flex-col gap-6 overflow-y-auto">
                    {/* Top Row: Summary & Settings */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        <StatCard small label={t('initialCapital')} value={`$${settings.initialCapital.toLocaleString()}`} />
                        <StatCard small label={t('finalCapital')} value={`$${result.finalCapital.toFixed(2)}`} />
                        <StatCard small label={t('netProfit')} value={`${isProfit ? '+' : ''}$${pnl.toFixed(2)}`} valueColor={pnlColor} />
                        <StatCard small label={t('pnl')} value={`${isProfit ? '+' : ''}${pnlPercentage.toFixed(2)}%`} valueColor={pnlColor} />
                        <StatCard small label={t('maxDrawdown')} value={`${(maxDrawdown * 100).toFixed(2)}%`} valueColor="text-red-400" />
                        <StatCard small label={t('totalTrades')} value={totalTrades.toString()} />
                        <StatCard small label={t('winRate')} value={`${winRate.toFixed(2)}%`} />
                        <StatCard small label={t('profitFactor')} value={isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞'} />
                        <StatCard small label={t('avgTradeDuration')} value={`${avgTradeDurationBars.toFixed(1)} bars`} />
                        <StatCard small label={t('leverage')} value={`${settings.leverage}x`} />
                        <StatCard small label={t('backtestStrategy')} value={t(strategyKeyMap[settings.strategy])} />

                        {settings.strategy === 'RSI_FILTER' && (
                             <>
                                <StatCard small label={t('rsiPeriod')} value={settings.rsiPeriod!.toString()} />
                                <StatCard small label={t('rsiOversold')} value={settings.rsiOversold!.toString()} />
                                <StatCard small label={t('rsiOverbought')} value={settings.rsiOverbought!.toString()} />
                             </>
                        )}
                        {settings.strategy === 'BOLLINGER_BANDS' && (
                            <>
                                <StatCard small label={t('bbPeriod')} value={settings.bbPeriod!.toString()} />
                                <StatCard small label={t('bbStdDev')} value={settings.bbStdDev!.toString()} />
                            </>
                        )}
                        
                        <StatCard small label={t('volumeFilter')} value={t(settings.useVolumeFilter ? 'enabled' : 'disabled')} />
                        {settings.useVolumeFilter && (
                            <>
                                <StatCard small label={t('volumeMaPeriod')} value={settings.volumeMaPeriod!.toString()} />
                                <StatCard small label={t('volumeThreshold')} value={`${settings.volumeThreshold!}x`} />
                            </>
                        )}

                        <StatCard small label={t('stopLoss')} value={settings.stopLoss > 0 ? `${settings.stopLoss}%` : 'N/A'} />
                        <StatCard small label={t('takeProfit')} value={settings.takeProfit > 0 ? `${settings.takeProfit}%` : 'N/A'} />
                         <StatCard small label={t('commissionPerTrade')} value={`${(settings.commissionRate * 100).toFixed(2)}%`} />
                    </div>

                    {/* P/L Curve */}
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

                    {/* Trade Log */}
                    <div>
                        <h3 className="text-base font-semibold text-cyan-400 mb-3">{t('tradeLog')}</h3>
                        <div className="bg-gray-900/50 rounded-lg h-[30vh] max-h-[300px] overflow-y-auto p-4 border border-gray-700">
                           {result.totalTrades > 0 ? (
                                <ul className="text-sm font-mono text-gray-300 space-y-2">
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
                </main>
            </div>
        </div>
    );
};

export const BacktestModal = React.memo(BacktestModalComponent);