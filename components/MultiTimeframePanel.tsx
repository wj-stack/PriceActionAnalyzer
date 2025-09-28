
import React, { useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { MultiTimeframeAnalysis, SignalDirection, DetectedPattern } from '../types';
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


const TimeframeSignalItem: React.FC<{
    pattern: DetectedPattern;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
}> = ({ pattern, onMouseEnter, onMouseLeave }) => {
    const { t } = useLanguage();
    const [isExpanded, setIsExpanded] = useState(false);

    const isBullish = pattern.direction === SignalDirection.Bullish;
    const colorClass = isBullish ? 'text-green-400' : 'text-red-400';

    const handleInfoClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
    };

    return (
        <li
            className="p-1 rounded-md hover:bg-gray-700/50"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className="flex items-center gap-2 cursor-pointer">
                {isBullish 
                    ? <ArrowUpIcon className={`w-4 h-4 ${colorClass} flex-shrink-0`} /> 
                    : <ArrowDownIcon className={`w-4 h-4 ${colorClass} flex-shrink-0`} />
                }
                <span className="flex-grow text-gray-300">{t(pattern.name)}</span>
                <span className="text-xs text-gray-500 flex-shrink-0">{new Date(pattern.candle.time * 1000).toLocaleString()}</span>
                 <button onClick={handleInfoClick} className="text-gray-400 hover:text-cyan-400 transition-colors flex-shrink-0" aria-label={t('showCalculationDetails')}>
                    <InfoIcon className="w-4 h-4" />
                </button>
            </div>
            {isExpanded && <SignalDetail patternName={pattern.name} />}
        </li>
    );
};

export const MultiTimeframePanel: React.FC<MultiTimeframePanelProps> = ({ analysis, isLoading, setHoveredMultiTimeframePattern }) => {
    const { t } = useLanguage();
    const timeframeLabels = useMemo(() => new Map(TIMEFRAMES.map(tf => [tf.value, tf.label])), []);

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
                {analysis.map(({ timeframe, patterns }) => {
                    const recentPatterns = patterns.slice(-5).reverse();
                    return (
                        <div key={timeframe} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                            <h4 className="font-bold text-gray-200 border-b border-gray-600 pb-2 mb-3">
                                {timeframeLabels.get(timeframe) || timeframe} - <span className="text-gray-400">{t('recentSignals')}</span>
                            </h4>
                            {recentPatterns.length > 0 ? (
                                <ul className="space-y-1 text-sm">
                                    {recentPatterns.map((p, index) => (
                                         <TimeframeSignalItem 
                                            key={`${p.index}-${index}`}
                                            pattern={p}
                                            onMouseEnter={() => setHoveredMultiTimeframePattern(p)}
                                            onMouseLeave={() => setHoveredMultiTimeframePattern(null)}
                                        />
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-gray-500 text-center py-4">{t('noContextSignals')}</p>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    );
};
