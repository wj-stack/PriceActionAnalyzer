
import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { LightBulbIcon } from './icons/LightBulbIcon';
import { CloseIcon } from './icons/CloseIcon';
import type { PredictionResult } from '../types';
import { ArrowUpIcon } from './icons/ArrowUpIcon';
import { ArrowDownIcon } from './icons/ArrowDownIcon';

interface PredictionPanelProps {
    isLoading: boolean;
    result: PredictionResult | null;
    onClose: () => void;
}

const LoadingSpinner: React.FC = () => (
    <div className="flex justify-center items-center py-4">
        <div className="w-6 h-6 border-2 border-gray-500 border-t-yellow-400 rounded-full animate-spin"></div>
        <p className="ml-3 text-gray-400">Analyzing current market...</p>
    </div>
);

const TradeReason: React.FC<{ reason: string }> = ({ reason }) => {
    const { t } = useLanguage();
    if (!reason) return null;

    const parts = reason.split('|').map(p => p.trim());
    if (parts.length < 3) return <div className="text-xs text-gray-400">{reason}</div>;

    const [htfTrend, htfZoneCombined, ltfModelCombined] = parts;
    const htfZoneParts = htfZoneCombined.split(':');
    const htfZoneKey = htfZoneParts[0];
    const confluenceDetails = htfZoneParts.length > 1 ? htfZoneParts[1].split('&') : [];
    const ltfModelParts = ltfModelCombined.split(':');
    const modelKey = ltfModelParts[0];
    const detailKey = ltfModelParts[1];

    const translatedTrend = t(htfTrend.toLowerCase() as any) || htfTrend;
    const translatedZone = t(htfZoneKey as any) || htfZoneKey;
    const translatedModel = t(modelKey as any) || modelKey;
    const translatedDetail = detailKey ? t(detailKey as any) : '';

    return (
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700 space-y-2">
            <h4 className="text-sm font-semibold text-gray-300 mb-1">{t('tradeReason')}</h4>
            <div className="flex flex-col text-left text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`font-semibold ${ htfTrend === 'Uptrend' ? 'text-green-400' : htfTrend === 'Downtrend' ? 'text-red-400' : 'text-gray-300'}`}>{translatedTrend}</span>
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
                    <div className="text-gray-400 mt-1">
                         &rarr; <span className="font-medium text-gray-300">{translatedModel}</span>
                        {translatedDetail && <span>: {t(translatedDetail as any) || translatedDetail}</span>}
                    </div>
                )}
            </div>
        </div>
    );
};


const TradePlan: React.FC<{ result: PredictionResult }> = ({ result }) => {
    const { t } = useLanguage();
    const { direction, entryPrice, slPrice, tpPrice, rr, reason } = result;

    if (!direction || !entryPrice || !slPrice || !tpPrice) return null;

    const isLong = direction === 'LONG';
    const planItems = [
        { label: t('entryPrice'), value: entryPrice.toFixed(4), color: 'text-gray-200' },
        { label: t('stopLoss'), value: slPrice.toFixed(4), color: 'text-red-400' },
        { label: t('takeProfit'), value: tpPrice.toFixed(4), color: 'text-green-400' },
        { label: t('riskRewardRatio'), value: `1 : ${rr}`, color: 'text-gray-200' },
    ];

    return (
        <div className="space-y-4">
             <div className="flex items-center gap-3 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isLong ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                    {isLong ? <ArrowUpIcon className="w-6 h-6 text-green-400" /> : <ArrowDownIcon className="w-6 h-6 text-red-400" />}
                </div>
                <div>
                    <p className="text-sm text-gray-400">{t('tradeDirection')}</p>
                    <p className={`text-lg font-bold ${isLong ? 'text-green-400' : 'text-red-400'}`}>{t(`direction-${direction}`)}</p>
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
                {planItems.map(item => (
                    <div key={item.label} className="bg-gray-900/50 p-2 rounded-lg border border-gray-700">
                        <p className="text-xs text-gray-500">{item.label}</p>
                        <p className={`font-mono text-base font-semibold ${item.color}`}>{item.value}</p>
                    </div>
                ))}
            </div>

            {reason && <TradeReason reason={reason} />}
        </div>
    );
};


export const PredictionPanel: React.FC<PredictionPanelProps> = ({ isLoading, result, onClose }) => {
    const { t } = useLanguage();
    const status = result?.status || 'SKIP_SIGNAL';
    const statusText = t(`status-${status}`);
    const statusColor = status === 'PLAN_TRADE' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30';

    return (
        <aside className="w-96 flex-shrink-0 bg-gray-800/60 rounded-lg border border-gray-700 flex flex-col overflow-hidden animate-fade-in-right">
            <header className="p-3 flex items-center justify-between border-b border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <LightBulbIcon className="w-5 h-5 text-yellow-400" />
                    <h3 className="font-semibold text-gray-200">{t('predictionTitle')}</h3>
                </div>
                <button onClick={onClose} aria-label="Close panel" className="text-gray-500 hover:text-white">
                    <CloseIcon className="w-5 h-5" />
                </button>
            </header>

            <div className="flex-grow p-4 overflow-y-auto space-y-4">
                {isLoading && <LoadingSpinner />}
                {!isLoading && result && (
                    <>
                        <div>
                            <p className="text-xs text-gray-500 mb-1">{t('status')}</p>
                            <div className={`inline-block px-3 py-1 text-sm font-semibold rounded-full border ${statusColor}`}>
                               {statusText}
                            </div>
                        </div>

                        {result.status === 'PLAN_TRADE' ? (
                            <TradePlan result={result} />
                        ) : (
                            <div className="text-center py-8 text-gray-500 italic">
                                {t('noSignalFound')}
                            </div>
                        )}
                    </>
                )}
            </div>
        </aside>
    );
};
