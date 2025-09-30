
import React from 'react';
import { PredictionResult } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { SparklesIcon } from './icons/SparklesIcon';
import { ArrowUpIcon } from './icons/ArrowUpIcon';
import { ArrowDownIcon } from './icons/ArrowDownIcon';

const Stat: React.FC<{ label: string; value: string | number; color?: string; }> = ({ label, value, color = 'text-gray-100' }) => (
    <div className="bg-gray-900/50 p-3 rounded-md">
        <p className="text-sm text-gray-400">{label}</p>
        <p className={`text-lg font-semibold font-mono ${color}`}>{value}</p>
    </div>
);

const PredictionModalComponent: React.FC<{ isOpen: boolean; onClose: () => void; result: PredictionResult | null; }> = ({ isOpen, onClose, result }) => {
    const { t } = useLanguage();
    if (!isOpen || !result) return null;
    
    const isPlan = result.status === 'PLAN_TRADE';
    const statusColor = isPlan ? 'bg-green-500/20 text-green-300 border-green-500/50' : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
    const statusText = isPlan ? t('planTrade') : t('skipSignal');

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm p-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <SparklesIcon className="w-6 h-6 text-cyan-400" />
                        <h2 className="text-lg font-bold text-gray-100">{t('predictionResultTitle')}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <main className="p-6 overflow-y-auto space-y-4">
                    <div className={`p-4 rounded-lg text-center border ${statusColor}`}>
                        <p className="text-sm uppercase tracking-wider">{t('outcome')}</p>
                        <p className="text-2xl font-bold">{statusText}</p>
                    </div>

                    <div>
                        <h4 className="font-semibold text-gray-300 mb-1">{t('reason')}</h4>
                        <p className="text-sm text-gray-400 bg-gray-900/50 p-3 rounded-md">{result.reason}</p>
                    </div>

                    {result.pattern && (
                        <div>
                            <h4 className="font-semibold text-gray-300 mb-1">{t('signal')}</h4>
                            <div className="bg-gray-900/50 p-3 rounded-md flex items-center gap-3">
                                {result.direction === 'LONG'
                                    ? <ArrowUpIcon className="w-6 h-6 text-green-400 flex-shrink-0" />
                                    : <ArrowDownIcon className="w-6 h-6 text-red-400 flex-shrink-0" />
                                }
                                <div>
                                    <p className="font-semibold text-gray-100">{t(result.pattern.name)}</p>
                                    <p className="text-xs text-gray-400">{new Date(result.pattern.candle.time * 1000).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {(result.entryPrice !== undefined) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <Stat label={t('direction')} value={result.direction ?? 'N/A'} color={result.direction === 'LONG' ? 'text-green-400' : 'text-red-400'} />
                            <Stat label={t('entryPrice')} value={result.entryPrice?.toFixed(4) ?? 'N/A'} />
                            <Stat label={t('stopLoss')} value={result.slPrice?.toFixed(4) ?? 'N/A'} color="text-red-400" />
                            <Stat label={t('takeProfit')} value={result.tpPrice?.toFixed(4) ?? 'N/A'} color="text-green-400" />
                            <Stat label={t('riskRewardRatio')} value={result.rr?.toFixed(2) ?? 'N/A'} color={isPlan ? 'text-green-400' : 'text-yellow-400'} />
                        </div>
                    )}

                </main>
            </div>
        </div>
    );
};

export const PredictionModal = React.memo(PredictionModalComponent);
