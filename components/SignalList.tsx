

import React, { useState } from 'react';
import type { DetectedPattern } from '../types';
import { SignalDirection, PatternType } from '../types';
import { ArrowUpIcon } from './icons/ArrowUpIcon';
import { ArrowDownIcon } from './icons/ArrowDownIcon';
import { InfoIcon } from './icons/InfoIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { SignalDetail } from './SignalDetail';
import { StarIcon } from './icons/StarIcon';

interface SignalListProps {
    patterns: DetectedPattern[];
    isLoading: boolean;
    setHoveredPatternIndex: (index: number | null) => void;
    onSignalClick: (pattern: DetectedPattern) => void;
}

const PriorityIndicator: React.FC<{ level: number }> = ({ level }) => {
    const { t } = useLanguage();
    const priorityLabels = [t('priorityLow'), t('priorityMedium'), t('priorityHigh'), t('priorityVeryHigh')];
    const title = `${t('priority')}: ${priorityLabels[level - 1] || ''}`;

    return (
        <div className="flex items-end gap-0.5 h-4" title={title}>
            {Array.from({ length: 4 }).map((_, i) => (
                <div
                    key={i}
                    className={`w-1 rounded-full transition-colors ${i < level ? 'bg-cyan-400' : 'bg-gray-600'}`}
                    style={{ height: `${(i + 1) * 25}%` }}
                />
            ))}
        </div>
    );
};

interface SignalItemProps {
    pattern: DetectedPattern;
    t: (key: string) => string;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onClick: () => void;
}

const SignalItem: React.FC<SignalItemProps> = ({ pattern, t, onMouseEnter, onMouseLeave, onClick }) => {
    const [isExpanded, setIsExpanded] = useState(false);
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
        setIsExpanded(!isExpanded);
    };
    
    return (
        <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className={`rounded-lg border ${borderClass} ${bgClass} transition-all duration-300 ease-in-out ${pattern.isKeySignal ? 'shadow-cyan-500/20 shadow-lg border-cyan-500/50' : 'hover:shadow-lg hover:border-cyan-500/50'}`}>
            <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-grow">
                         <div className="cursor-pointer" onClick={onClick}>
                            <div className="flex items-center gap-2 flex-wrap">
                                {isBullish 
                                    ? <ArrowUpIcon className={`w-5 h-5 ${colorClass} flex-shrink-0`} /> 
                                    : <ArrowDownIcon className={`w-5 h-5 ${colorClass} flex-shrink-0`} />
                                }
                                <h4 className={`font-semibold ${colorClass}`}>{t(pattern.name)}</h4>
                                <PriorityIndicator level={pattern.priority} />
                                {pattern.isKeySignal && (
                                    <div className="flex items-center gap-1 text-xs text-yellow-400 font-semibold" title={t('keySignalTooltip')}>
                                        <StarIcon className="w-4 h-4" />
                                        <span>{t('keySignal')}</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-sm text-gray-300 mt-1 pl-7">{t(pattern.description)}</p>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-400">{new Date(pattern.candle.time * 1000).toLocaleString()}</span>
                        <div className="flex items-center gap-2">
                             <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${contextStyles[pattern.type]}`}>
                                {t(`patternContext${pattern.type}`)}
                            </span>
                            <button onClick={handleInfoClick} className="text-gray-400 hover:text-cyan-400 transition-colors" aria-label={t('showCalculationDetails')}>
                                <InfoIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
                 {/* Scores Section */}
                <div className="px-3 pt-3 mt-2 border-t border-gray-700/50">
                    <div className="space-y-2 text-xs">
                        <div title={t('strengthScoreLongTooltip')}>
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-medium text-gray-400">{t('strengthScoreLong')}</span>
                                <span className="font-mono text-green-400">{pattern.strengthScore.long}%</span>
                            </div>
                            <div className="w-full bg-gray-600 rounded-full h-1.5">
                                <div className="bg-green-400 h-1.5 rounded-full" style={{ width: `${pattern.strengthScore.long}%` }}></div>
                            </div>
                        </div>
                        <div title={t('strengthScoreShortTooltip')}>
                            <div className="flex justify-between items-center mb-1">
                                <span className="font-medium text-gray-400">{t('strengthScoreShort')}</span>
                                <span className="font-mono text-red-400">{pattern.strengthScore.short}%</span>
                            </div>
                            <div className="w-full bg-gray-600 rounded-full h-1.5">
                                <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${pattern.strengthScore.short}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {isExpanded && (
                <div className="px-3 pb-3">
                    <SignalDetail patternName={pattern.name} />
                </div>
            )}
        </div>
    );
}

const SignalListComponent: React.FC<SignalListProps> = ({ patterns, isLoading, setHoveredPatternIndex, onSignalClick }) => {
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
                    />
                ))}
            </div>
        </div>
    );
};

export const SignalList = React.memo(SignalListComponent);