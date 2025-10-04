import React from 'react';
import type { BacktestResult, BacktestKPIs, TradeLogEvent, Candle } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { EquityChart } from './EquityChart';
import { ChartBarIcon } from './icons/ChartBarIcon';
import { PriceChart } from './PriceChart';

interface BacktestResultsPanelProps {
    isLoading: boolean;
    result: BacktestResult | null;
    candles: Candle[];
}

const formatNumber = (num: number | null | undefined, isPercent = false, decimals = 2) => {
    if (num === null || typeof num === 'undefined' || isNaN(num)) return '-';
    const formatted = num.toFixed(decimals);
    return isPercent ? `${formatted}%` : formatted;
};

const KPIGrid: React.FC<{ kpis: BacktestKPIs }> = ({ kpis }) => {
    const { t } = useLanguage();
    const metrics = [
        { label: t('kpi-netProfit'), value: `$${formatNumber(kpis.netProfit)}`, isPositive: kpis.netProfit > 0, isNegative: kpis.netProfit < 0 },
        { label: t('kpi-netProfitPercent'), value: `${formatNumber(kpis.netProfitPercent, true)}`, isPositive: kpis.netProfitPercent > 0, isNegative: kpis.netProfitPercent < 0 },
        { label: t('kpi-maxDrawdown'), value: `$${formatNumber(kpis.maxDrawdown)}` },
        { label: t('kpi-maxDrawdownPercent'), value: `${formatNumber(kpis.maxDrawdownPercent, true)}` },
        { label: t('kpi-totalTrades'), value: kpis.totalTrades },
        { label: t('kpi-winRate'), value: `${formatNumber(kpis.winRate, true)}` },
        { label: t('kpi-profitFactor'), value: formatNumber(kpis.profitFactor), isPositive: (kpis.profitFactor ?? 0) > 1, isNegative: (kpis.profitFactor ?? 0) < 1 },
        { label: t('kpi-expectancy'), value: `$${formatNumber(kpis.expectancy)}` },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {metrics.map(metric => (
                <div key={metric.label} className="bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                    <p className="text-sm text-gray-400">{metric.label}</p>
                    <p className={`text-xl font-semibold font-mono ${metric.isPositive ? 'text-green-400' : metric.isNegative ? 'text-red-400' : 'text-gray-200'}`}>{metric.value}</p>
                </div>
            ))}
        </div>
    );
};

const TradeLogTable: React.FC<{ log: TradeLogEvent[] }> = ({ log }) => {
    const { t } = useLanguage();
    
    if (!log || log.length === 0) {
        return <div className="p-4 text-center text-gray-500">{t('noTrades')}</div>;
    }

    const headers = ['type', 'direction', 'time', 'price', 'positionSize', 'zoneScore', 'rr', 'sl', 'tp', 'profit', 'equity', 'reason'];

    const renderScoreCell = (scoreDetails?: TradeLogEvent['zoneScoreDetails']) => {
        if (!scoreDetails) return '-';
        return (
            <div className="flex flex-col text-xs font-mono">
                <span className="font-bold text-gray-300">T: {scoreDetails.total.toFixed(2)}</span>
                <span className="text-gray-500">S/R: {scoreDetails.sr.toFixed(1)}</span>
                <span className="text-gray-500">Fib: {scoreDetails.fib.toFixed(1)}</span>
                <span className="text-gray-500">MACD: {scoreDetails.macd.toFixed(1)}</span>
            </div>
        );
    };

    const renderReasonCell = (reason?: string) => {
        if (!reason) return '-';

        const individualReasons = reason.split(',');

        if (individualReasons.length === 1 && !individualReasons[0].includes('|')) {
            const reasonKey = `reason-${reason.replace(/\s+/g, '_')}`;
            return t(reasonKey as any) || reason;
        }

        return (
            <div className="flex flex-col gap-1">
                {individualReasons.map((singleReason, index) => {
                    const trimmedReason = singleReason.trim();
                    if (!trimmedReason.includes('|')) {
                         const reasonKey = `reason-${trimmedReason.replace(/\s+/g, '_')}`;
                        return <div key={index}>{t(reasonKey as any) || trimmedReason}</div>;
                    }

                    const parts = trimmedReason.split('|').map(p => p.trim());
                    if (parts.length < 3) return <div key={index}>{trimmedReason}</div>;

                    const htfTrend = parts[0];
                    const htfZoneCombined = parts[1];
                    const ltfModelCombined = parts[2];

                    // Part 1: HTF Zone and Confluence
                    const htfZoneParts = htfZoneCombined.split(':');
                    const htfZoneKey = htfZoneParts[0];
                    const confluenceDetails = htfZoneParts.length > 1 ? htfZoneParts[1].split('&') : [];
                    
                    // Part 2: LTF Model
                    const ltfModelParts = ltfModelCombined.split(':');
                    const modelKey = ltfModelParts[0];
                    const detailKey = ltfModelParts[1];

                    const translatedTrend = t(htfTrend.toLowerCase() as any) || htfTrend;
                    const translatedZone = t(htfZoneKey as any) || htfZoneKey;
                    const translatedModel = t(modelKey as any) || modelKey;
                    const translatedDetail = detailKey ? t(detailKey as any) : '';

                    return (
                        <div key={index} className="flex flex-col text-left">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`font-semibold ${
                                    htfTrend === 'Uptrend' ? 'text-green-400' :
                                    htfTrend === 'Downtrend' ? 'text-red-400' : 'text-gray-300'
                                }`}>{translatedTrend}</span>
                                <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded">{translatedZone}</span>
                                {confluenceDetails.map(detail => {
                                    const [dKey, dValue] = detail.split(':');
                                    const translatedDKey = t(dKey as any);
                                    return (
                                        <span key={dKey} className="text-xs bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded">
                                            {translatedDKey}{dValue ? `: ${dValue}` : ''}
                                        </span>
                                    );
                                })}
                            </div>
                            {modelKey && (
                                <div className="text-xs text-gray-400 mt-1">
                                    <span className="font-medium text-gray-300">{translatedModel}</span>
                                    {translatedDetail && <span>: {t(translatedDetail as any) || translatedDetail}</span>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };


    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-400 uppercase bg-gray-700/30">
                    <tr>{headers.map(h => <th key={h} scope="col" className="px-4 py-2">{t(`log-${h}`)}</th>)}</tr>
                </thead>
                <tbody>
                    {log.map((item, index) => (
                        <tr key={index} className={`border-b border-gray-700 hover:bg-gray-700/50 ${item.type === 'ENTRY' ? 'bg-gray-800/20' : ''}`}>
                            <td className={`px-4 py-2 font-medium ${item.type === 'ENTRY' ? 'text-blue-400' : 'text-yellow-400'}`}>{t(`type-${item.type}`)}</td>
                            <td className={`px-4 py-2 font-semibold ${item.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>{t(`direction-${item.direction}`)}</td>
                            <td className="px-4 py-2 text-gray-400">{new Date(item.time * 1000).toLocaleString()}</td>
                            <td className="px-4 py-2 font-mono">{formatNumber(item.price, false, 4)}</td>
                            <td className="px-4 py-2 font-mono">{formatNumber(item.positionSize, false, 6)}</td>
                            <td className="px-4 py-2">{renderScoreCell(item.zoneScoreDetails)}</td>
                            <td className="px-4 py-2 font-mono">{item.riskRewardRatio ? `1:${item.riskRewardRatio}` : '-'}</td>
                            <td className="px-4 py-2 font-mono">{formatNumber(item.stopLoss, false, 4)}</td>
                            <td className="px-4 py-2 font-mono">{formatNumber(item.takeProfit, false, 4)}</td>
                            <td className={`px-4 py-2 font-mono ${item.profit && item.profit > 0 ? 'text-green-400' : item.profit && item.profit < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                {typeof item.profit === 'number' ? formatNumber(item.profit) : '-'}
                            </td>
                            <td className="px-4 py-2 font-mono">{formatNumber(item.equity)}</td>
                            <td className="px-4 py-2">{renderReasonCell(item.reason)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


export const BacktestResultsPanel: React.FC<BacktestResultsPanelProps> = ({ isLoading, result, candles }) => {
    const { t } = useLanguage();

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <div className="w-8 h-8 border-4 border-gray-600 border-t-cyan-400 rounded-full animate-spin mb-4"></div>
                <p>{t('runningBacktest')}</p>
            </div>
        );
    }

    if (!result) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center px-4">
                <ChartBarIcon className="w-16 h-16 mb-4 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-300">{t('backtestResults')}</h3>
                <p>{t('runASimulation')}</p>
            </div>
        );
    }
    
    return (
        <div className="p-4 space-y-6">
            <div>
                <h3 className="text-base font-semibold text-gray-300 mb-3">{t('performanceOverview')}</h3>
                <KPIGrid kpis={result.kpis} />
            </div>

            <div className="h-96 bg-gray-900/50 p-2 rounded-lg border border-gray-700">
                 <PriceChart 
                    data={candles}
                    isHistorical={true}
                    indicatorData={{}} // Indicators not needed on result chart for clarity
                    srZones={result.srZones}
                    tradeLog={result.tradeLog}
                    isInteractive={false}
                />
            </div>

            <div>
                <h3 className="text-base font-semibold text-gray-300 mb-3">{t('equityCurve')}</h3>
                <div className="h-64 bg-gray-900/50 p-2 rounded-lg border border-gray-700">
                    <EquityChart data={result.equityCurve} />
                </div>
            </div>
             <div>
                <h3 className="text-base font-semibold text-gray-300 mb-3">{t('tradeLog')}</h3>
                <div className="max-h-96 overflow-y-auto bg-gray-900/50 rounded-lg border border-gray-700">
                   <TradeLogTable log={result.tradeLog} />
                </div>
            </div>
        </div>
    );
};