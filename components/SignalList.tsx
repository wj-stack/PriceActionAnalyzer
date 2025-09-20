
import React from 'react';
import type { DetectedPattern } from '../types';
import { SignalDirection, PatternType } from '../types';
import { ArrowUpIcon } from './icons/ArrowUpIcon';
import { ArrowDownIcon } from './icons/ArrowDownIcon';
import { InfoIcon } from './icons/InfoIcon';
import { useLanguage } from '../contexts/LanguageContext';

interface SignalListProps {
    patterns: DetectedPattern[];
    isLoading: boolean;
    setHoveredPatternIndex: (index: number | null) => void;
    onSignalClick: (pattern: DetectedPattern) => void;
    onShowPatternDetails: (patternName: string) => void;
}

interface SignalItemProps {
    pattern: DetectedPattern;
    t: (key: string) => string;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onClick: () => void;
    onShowDetails: () => void;
}

const SignalItem: React.FC<SignalItemProps> = ({ pattern, t, onMouseEnter, onMouseLeave, onClick, onShowDetails }) => {
    const isBullish = pattern.direction === SignalDirection.Bullish;
    const colorClass = isBullish ? 'text-green-400' : 'text-red-400';
    const bgClass = isBullish ? 'bg-green-500/10' : 'bg-red-500/10';
    const borderClass = isBullish ? 'border-green-500/30' : 'border-red-500/30';

    const contextStyles = {
        [PatternType.Reversal]: 'bg-purple-500/20 text-purple-300',
        [PatternType.Trend]: 'bg-blue-500/20 text-blue-300',
        [PatternType.Range]: 'bg-yellow-500/20 text-yellow-300',
    };

    const handleInfoClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onShowDetails();
    };

    return (
        <div onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className={`p-3 rounded-lg border ${borderClass} ${bgClass} transition-all hover:shadow-cyan-500/20 hover:shadow-lg hover:border-cyan-500/50 cursor-pointer`}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    {isBullish 
                        ? <ArrowUpIcon className={`w-5 h-5 ${colorClass} flex-shrink-0`} /> 
                        : <ArrowDownIcon className={`w-5 h-5 ${colorClass} flex-shrink-0`} />
                    }
                    <h4 className={`font-semibold ${colorClass}`}>{t(pattern.name)}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${contextStyles[pattern.type]}`}>
                        {t(`patternContext${pattern.type}`)}
                    </span>
                     <button onClick={handleInfoClick} className="text-gray-400 hover:text-cyan-400 transition-colors" aria-label={t('showCalculationDetails')}>
                        <InfoIcon className="w-4 h-4" />
                    </button>
                </div>
                <span className="text-xs text-gray-400 text-right flex-shrink-0">{new Date(pattern.candle.time * 1000).toLocaleString()}</span>
            </div>
            <p className="text-sm text-gray-300 mt-1 pl-7">{t(pattern.description)}</p>
        </div>
    );
}

export const SignalList: React.FC<SignalListProps> = ({ patterns, isLoading, setHoveredPatternIndex, onSignalClick, onShowPatternDetails }) => {
    const { t } = useLanguage();
    const sortedPatterns = [...patterns].sort((a, b) => b.candle.time - a.candle.time);

    return (
        <div className="h-full">
            <h3 className="text-lg font-bold text-cyan-400 mb-4 border-b border-gray-700 pb-2">{t('detectedSignals')}</h3>
            <div className="space-y-3 max-h-[550px] overflow-y-auto pr-2">
                {isLoading && <p className="text-gray-400 animate-pulse">{t('scanning')}</p>}
                {!isLoading && sortedPatterns.length === 0 && (
                    <div className="text-center text-gray-500 pt-10">
                        <p>{t('noSignals')}</p>
                    </div>
                )}
                {!isLoading && sortedPatterns.map((p, index) => (
                    <SignalItem 
                        key={`${p.index}-${index}`} 
                        pattern={p} 
                        t={t}
                        onMouseEnter={() => setHoveredPatternIndex(p.index)}
                        onMouseLeave={() => setHoveredPatternIndex(null)}
                        onClick={() => onSignalClick(p)}
                        onShowDetails={() => onShowPatternDetails(p.name)}
                    />
                ))}
            </div>
        </div>
    );
};
