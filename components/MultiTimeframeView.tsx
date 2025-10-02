
import React from 'react';
import type { MultiTimeframeData, MultiTimeframeDataPoint } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface MultiTimeframeViewProps {
    data: MultiTimeframeData;
}

const getStatusColor = (status: string, type: 'trend' | 'rsi'): string => {
    if (type === 'trend') {
        switch (status) {
            case 'Uptrend': return 'bg-green-500/20 text-green-400 border-green-500/30';
            case 'Downtrend': return 'bg-red-500/20 text-red-400 border-red-500/30';
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        }
    }
    if (type === 'rsi') {
        switch (status) {
            case 'Overbought': return 'bg-red-500/20 text-red-400 border-red-500/30';
            case 'Oversold': return 'bg-green-500/20 text-green-400 border-green-500/30';
            default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
        }
    }
    return 'bg-gray-600';
};

const StatusBadge: React.FC<{ status: string, type: 'trend' | 'rsi' }> = ({ status, type }) => {
    const { t } = useLanguage();
    const translationKey = status.charAt(0).toLowerCase() + status.slice(1);
    
    return (
        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${getStatusColor(status, type)}`}>
            {t(translationKey) || status}
        </span>
    );
};

export const MultiTimeframeView: React.FC<MultiTimeframeViewProps> = ({ data }) => {
    const { t } = useLanguage();
    
    return (
        <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
            <h4 className="font-semibold text-gray-300 text-sm mb-3">{t('mtfTitle')}</h4>
            <div className="space-y-2">
                <div className="grid grid-cols-3 text-xs text-gray-500 font-bold">
                    <div className="text-left">TF</div>
                    <div className="text-center">{t('trend')}</div>
                    <div className="text-center">{t('rsi')}</div>
                </div>
                {data.timeframes.map((tf) => (
                    <div key={tf.name} className="grid grid-cols-3 items-center text-sm text-gray-300">
                        <div className="font-mono font-semibold">{tf.name}</div>
                        <div className="flex justify-center"><StatusBadge status={tf.trend} type="trend" /></div>
                        <div className="flex justify-center"><StatusBadge status={tf.rsi} type="rsi" /></div>
                    </div>
                ))}
            </div>
        </div>
    );
};
