

import React, { useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { MultiTimeframeAnalysis, SignalDirection, DetectedPattern, TrendDirection } from '../types';
import { ArrowUpIcon } from './icons/ArrowUpIcon';
import { ArrowDownIcon } from './icons/ArrowDownIcon';
import { TIMEFRAMES } from '../constants';
import { InfoIcon } from './icons/InfoIcon';
import { SignalDetail } from './SignalDetail';

interface MultiTimeframePanelProps {
    analysis: MultiTimeframeAnalysis[];
    isLoading: boolean;
    setHoveredMultiTimeframePattern: (pattern: DetectedPattern | null) => void;
}

const SkeletonLoader: React.FC = () => (
    <div className="bg-gray-800 p-4 rounded-lg animate-pulse">
        <div className="h-5 bg-gray-700 rounded w-1/4 mb-4"></div>
        <div className="space-y-3">
            <div className="h-4 bg-gray-700 rounded w-full"></div>
            <div className="h-4 bg-gray-700 rounded w-5/6"></div>
            <div className="h-4 bg-gray-700 rounded w-3/4"></div>
        </div>
    </div>
);

const TimeframeContextCard: React.FC<{
    item: MultiTimeframeAnalysis;
    onPatternHover: (pattern: DetectedPattern | null) => void;
}> = ({ item, onPatternHover }) => {
    const { t } = useLanguage();
    const timeframeLabels = useMemo(() => new Map(TIMEFRAMES.map(tf => [tf.value, tf.label])), []);
    const recentPatterns = item.patterns.slice(-3).reverse();

    const trendClasses: Record<TrendDirection, string> = {
        UPTREND: 'bg-green-500/20 text-green-300',
        DOWNTREND: 'bg-red-500/20 text-red-300',
        RANGE: 'bg-yellow-500/20 text-yellow-300',
    };

    const rsiStateClasses: Record<MultiTimeframeAnalysis['rsi']['state'], string> = {
        OVERBOUGHT: 'text-red-400',
        OVERSOLD: 'text-green-400',
        NEUTRAL: 'text-gray-300',
    };
    
    const rsiBarColor = (value: number) => {
        if (value > 70) return 'bg-red-500';
        if (value < 30) return 'bg-green-500';
        return 'bg-cyan-500';
    };

    return (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex flex-col gap-3">
            <h4 className="font-bold text-gray-200">{timeframeLabels.get(item.timeframe) || item.timeframe}</h4>

            <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                    <span className="text-gray-400">{t('trend')}</span>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${trendClasses[item.trend]}`}>
                        {t(item.trend.toLowerCase())}
                    </span>
                </div>
                <div>
                     <div className="flex justify-between items-center mb-1">
                        <span className="text-gray-400">RSI (14)</span>
                        <span className={`font-semibold ${rsiStateClasses[item.rsi.state]}`}>
                             {item.rsi.value ? item.rsi.value.toFixed(1) : 'N/A'}
                        </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-1.5 relative">
                         {item.rsi.value !== null && (
                            <div className={`h-1.5 rounded-full ${rsiBarColor(item.rsi.value)}`} style={{ width: `${item.rsi.value}%` }} />
                         )}
                         <div className="absolute top-0 left-[30%] w-px h-1.5 bg-gray-600"></div>
                         <div className="absolute top-0 left-[70%] w-px h-1.5 bg-gray-600"></div>
                    </div>
                </div>
            </div>

            <div className="pt-3 border-t border-gray-700">
                <h5 className="text-xs text-gray-400 uppercase font-semibold mb-2">{t('recentSignals')}</h5>
                 {recentPatterns.length > 0 ? (
                    <ul className="space-y-1 text-sm">
                        {recentPatterns.map((p, index) => (
                            <li
                                key={`${p.index}-${index}`}
                                className="p-1 rounded-md hover:bg-gray-700/50 flex items-center gap-2 cursor-default"
                                onMouseEnter={() => onPatternHover(p)}
                                onMouseLeave={() => onPatternHover(null)}
                            >
                                {p.direction === SignalDirection.Bullish 
                                    ? <ArrowUpIcon className="w-4 h-4 text-green-400 flex-shrink-0" /> 
                                    : <ArrowDownIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
                                }
                                <span className="flex-grow text-gray-300 truncate">{t(p.name)}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500 text-center py-2">{t('noContextSignals')}</p>
                )}
            </div>
        </div>
    );
};


export const MultiTimeframePanel: React.FC<MultiTimeframePanelProps> = ({ analysis, isLoading, setHoveredMultiTimeframePattern }) => {
    const { t } = useLanguage();
    
    // Sort analysis from longer timeframe to shorter
    const sortedAnalysis = useMemo(() => {
        const timeframeOrder = TIMEFRAMES.map(tf => tf.value).reverse();
        return [...analysis].sort((a, b) => {
            return timeframeOrder.indexOf(a.timeframe) - timeframeOrder.indexOf(b.timeframe);
        });
    }, [analysis]);


    if (isLoading) {
        return (
            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                <h3 className="text-lg font-bold text-cyan-400 mb-4">{t('multiTimeframeContext')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <SkeletonLoader />
                    <SkeletonLoader />
                    <SkeletonLoader />
                </div>
            </div>
        );
    }
    
    if (analysis.length === 0) {
        return (
             <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                <h3 className="text-lg font-bold text-cyan-400 mb-4">{t('multiTimeframeContext')}</h3>
                <div className="text-center py-8 text-gray-500">
                    <p>{t('selectTimeframesPrompt')}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
            <h3 className="text-lg font-bold text-cyan-400 mb-4">{t('multiTimeframeContext')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedAnalysis.map((item) => (
                    <TimeframeContextCard 
                        key={item.timeframe}
                        item={item}
                        onPatternHover={setHoveredMultiTimeframePattern}
                    />
                ))}
            </div>
        </div>
    );
};