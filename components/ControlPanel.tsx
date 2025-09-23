

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TIMEFRAMES, ALL_PATTERNS } from '../constants';
import { RefreshIcon } from './icons/RefreshIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { FilterIcon } from './icons/FilterIcon';
import { CalculatorIcon } from './icons/CalculatorIcon';
import { SettingsIcon } from './icons/SettingsIcon';
import { KeyIcon } from './icons/KeyIcon';
import { PatternType, BacktestStrategy } from '../types';
import { BrainIcon } from './icons/BrainIcon';

interface ControlPanelProps {
    symbols: { value: string; label: string; baseAssetLogoUrl?: string; quoteAssetLogoUrl?: string; isAlpha?: boolean; }[];
    isSymbolsLoading: boolean;
    symbol: string;
    setSymbol: (symbol: string) => void;
    timeframe: string;
    setTimeframe: (timeframe: string) => void;
    isLoading: boolean;
    onRefresh: () => void;
    startDate: Date;
    setStartDate: (date: Date) => void;
    endDate: Date;
    setEndDate: (date: Date) => void;
    selectedPatterns: Set<string>;
    setSelectedPatterns: (patterns: Set<string>) => void;
    onRunBacktest: () => void;
    onOpenApiKeyModal: () => void;
    onOpenDecisionMakerModal: () => void;
    stopLoss: number;
    setStopLoss: (value: number) => void;
    takeProfit: number;
    setTakeProfit: (value: number) => void;
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
}

const formatDateForInput = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

const CoinPairIcons: React.FC<{ baseSrc?: string; quoteSrc?: string }> = ({ baseSrc, quoteSrc }) => {
    // As logos are removed, we always show a fallback.
    // This component is kept for potential future re-integration with a valid logo source.
    return (
        <div className="relative w-8 h-5 flex-shrink-0 items-center justify-center flex">
            <div className="w-5 h-5 rounded-full bg-gray-600 z-10" />
            <div className="w-5 h-5 rounded-full bg-gray-500 absolute left-3 top-0 border-2 border-gray-800" />
        </div>
    );
};

export const ControlPanel: React.FC<ControlPanelProps> = ({ 
    symbols, isSymbolsLoading,
    symbol, setSymbol, 
    timeframe, setTimeframe, 
    isLoading, onRefresh,
    startDate, setStartDate,
    endDate, setEndDate,
    selectedPatterns, setSelectedPatterns,
    onRunBacktest,
    onOpenApiKeyModal,
    onOpenDecisionMakerModal,
    stopLoss, setStopLoss,
    takeProfit, setTakeProfit,
    backtestStrategy, setBacktestStrategy,
    rsiPeriod, setRsiPeriod,
    rsiOversold, setRsiOversold,
    rsiOverbought, setRsiOverbought,
    bbPeriod, setBbPeriod,
    bbStdDev, setBbStdDev,
    useVolumeFilter, setUseVolumeFilter,
    volumeMaPeriod, setVolumeMaPeriod,
    volumeThreshold, setVolumeThreshold,
}) => {
    const { locale, setLocale, t } = useLanguage();
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSymbolDropdownOpen, setIsSymbolDropdownOpen] = useState(false);
    const [symbolSearch, setSymbolSearch] = useState('');
    const [visibleSymbolCount, setVisibleSymbolCount] = useState(50);

    const filterMenuRef = useRef<HTMLDivElement>(null);
    const settingsMenuRef = useRef<HTMLDivElement>(null);
    const symbolDropdownRef = useRef<HTMLDivElement>(null);
    const symbolListRef = useRef<HTMLUListElement>(null);
    
    const baseSelectorClasses = "bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all duration-200 text-sm";
    const disabledClasses = "disabled:opacity-50 disabled:cursor-not-allowed";

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
            if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
                setIsSettingsOpen(false);
            }
            if (symbolDropdownRef.current && !symbolDropdownRef.current.contains(event.target as Node)) {
                setIsSymbolDropdownOpen(false);
                setSymbolSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    
    const handleFilterChange = (patternName: string, checked: boolean) => {
        const newSet = new Set(selectedPatterns);
        if (checked) {
            newSet.add(patternName);
        } else {
            newSet.delete(patternName);
        }
        setSelectedPatterns(newSet);
    };

    const handleSelectAll = () => setSelectedPatterns(new Set(ALL_PATTERNS.map(p => p.name)));
    const handleDeselectAll = () => setSelectedPatterns(new Set());

    const handleToggleType = (type: PatternType) => {
        const typePatterns = ALL_PATTERNS.filter(p => p.type === type).map(p => p.name);
        const allSelectedForType = typePatterns.every(name => selectedPatterns.has(name));
        const newSet = new Set(selectedPatterns);
        if (allSelectedForType) {
            typePatterns.forEach(name => newSet.delete(name));
        } else {
            typePatterns.forEach(name => newSet.add(name));
        }
        setSelectedPatterns(newSet);
    }
    
    const patternsByType = useMemo(() => {
        return ALL_PATTERNS.reduce((acc, pattern) => {
            const type = pattern.type;
            if (!acc[type]) {
                acc[type] = [];
            }
            acc[type].push(pattern);
            return acc;
        }, {} as Record<PatternType, typeof ALL_PATTERNS>);
    }, []);

    const filteredSymbols = useMemo(() => {
        if (!symbolSearch) {
            return symbols;
        }
        const searchLower = symbolSearch.toLowerCase();
        return symbols.filter(s =>
            s.label.toLowerCase().includes(searchLower) ||
            s.value.toLowerCase().includes(searchLower)
        );
    }, [symbolSearch, symbols]);

    const paginatedSymbols = useMemo(() => {
        return filteredSymbols.slice(0, visibleSymbolCount);
    }, [filteredSymbols, visibleSymbolCount]);

    const hasMoreSymbols = useMemo(() => {
        return visibleSymbolCount < filteredSymbols.length;
    }, [visibleSymbolCount, filteredSymbols.length]);

    useEffect(() => {
        // Reset scroll and visible count when search term changes
        setVisibleSymbolCount(50);
        if (symbolListRef.current) {
            symbolListRef.current.scrollTop = 0;
        }
    }, [symbolSearch]);

    useEffect(() => {
        // Also reset when dropdown is opened
        if (isSymbolDropdownOpen) {
            setVisibleSymbolCount(50);
        }
    }, [isSymbolDropdownOpen]);

    const handleScroll = () => {
        const listElement = symbolListRef.current;
        if (listElement) {
            const { scrollTop, scrollHeight, clientHeight } = listElement;
            // Load more when user is near the bottom (e.g., 50px from the end)
            if (scrollHeight - scrollTop - clientHeight < 50 && hasMoreSymbols) {
                setVisibleSymbolCount(prevCount => Math.min(prevCount + 50, filteredSymbols.length));
            }
        }
    };

    const selectedSymbolData = useMemo(() => symbols.find(s => s.value === symbol), [symbols, symbol]);


    return (
        <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
                <label htmlFor="language-select" className="text-sm font-medium text-gray-400">{t('language')}</label>
                <select id="language-select" value={locale} onChange={(e) => setLocale(e.target.value as 'en' | 'zh')} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses}`}>
                    <option value="en">English</option>
                    <option value="zh">中文</option>
                </select>
            </div>
            <div className="flex items-center gap-2">
                <label htmlFor="start-date" className="text-sm font-medium text-gray-400">{t('from')}</label>
                <input type="date" id="start-date" value={formatDateForInput(startDate)} onChange={(e) => setStartDate(new Date(e.target.value))} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses}`} />
            </div>
            <div className="flex items-center gap-2">
                <label htmlFor="end-date" className="text-sm font-medium text-gray-400">{t('to')}</label>
                <input type="date" id="end-date" value={formatDateForInput(endDate)} onChange={(e) => setEndDate(new Date(e.target.value))} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses}`} />
            </div>
            <div className="flex items-center gap-2">
                <label htmlFor="symbol-search-button" className="text-sm font-medium text-gray-400">{t('symbol')}</label>
                <div className="relative" ref={symbolDropdownRef}>
                    <button
                        id="symbol-search-button"
                        type="button"
                        onClick={() => setIsSymbolDropdownOpen(!isSymbolDropdownOpen)}
                        disabled={isLoading || isSymbolsLoading}
                        className={`${baseSelectorClasses} ${disabledClasses} w-44 text-left flex justify-between items-center`}
                        aria-haspopup="listbox"
                        aria-expanded={isSymbolDropdownOpen}
                    >
                         <div className="flex items-center gap-2 truncate">
                            {isSymbolsLoading ? (
                                <span className="truncate">{t('loadingSymbols')}</span>
                            ) : selectedSymbolData ? (
                                <>
                                    <CoinPairIcons baseSrc={selectedSymbolData.baseAssetLogoUrl} quoteSrc={selectedSymbolData.quoteAssetLogoUrl} />
                                    <span className="truncate">{selectedSymbolData.label}</span>
                                </>
                            ) : (
                                <span className="truncate">{symbol}</span>
                            )}
                        </div>
                        <svg className={`w-4 h-4 ml-2 flex-shrink-0 transition-transform ${isSymbolDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    {isSymbolDropdownOpen && (
                        <div className="absolute left-0 mt-2 w-full min-w-[200px] bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-40 text-sm">
                            <div className="p-2 border-b border-gray-700">
                                <input
                                    type="text"
                                    placeholder={t('searchSymbol')}
                                    value={symbolSearch}
                                    onChange={(e) => setSymbolSearch(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md px-2 py-1.5 focus:ring-cyan-500 focus:border-cyan-500"
                                    autoFocus
                                />
                            </div>
                            <ul ref={symbolListRef} onScroll={handleScroll} className="max-h-60 overflow-y-auto" role="listbox">
                                {paginatedSymbols.length > 0 ? paginatedSymbols.map(s => (
                                    <li key={s.value} role="option" aria-selected={s.value === symbol}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSymbol(s.value);
                                                setIsSymbolDropdownOpen(false);
                                                setSymbolSearch('');
                                            }}
                                            className="w-full text-left px-3 py-2 hover:bg-gray-700/50 transition-colors text-gray-200 flex items-center gap-2"
                                        >
                                            <CoinPairIcons baseSrc={s.baseAssetLogoUrl} quoteSrc={s.quoteAssetLogoUrl} />
                                            {s.label}
                                        </button>
                                    </li>
                                )) : (
                                    <li className="px-3 py-2 text-gray-500">{t('noSymbolsFound')}</li>
                                )}
                                {hasMoreSymbols && (
                                    <li className="px-3 py-2 text-center text-gray-500 text-xs animate-pulse">
                                        {t('loadingMore')}
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2">
                <label htmlFor="timeframe-select" className="text-sm font-medium text-gray-400">{t('timeframe')}</label>
                <select id="timeframe-select" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses}`}>
                    {TIMEFRAMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
            </div>
            
            <div className="relative" ref={filterMenuRef}>
                <button onClick={() => setIsFilterOpen(!isFilterOpen)} disabled={isLoading} className={`p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses}`} aria-label={t('filterPatterns')}>
                    <FilterIcon className="w-5 h-5" />
                </button>
                {isFilterOpen && (
                    <div className="absolute right-0 mt-2 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-30 p-4 text-sm">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="font-bold text-base text-cyan-400">{t('filterPatterns')}</h4>
                            <div className="flex gap-2">
                                <button onClick={handleSelectAll} className="text-cyan-400 hover:text-cyan-300 text-xs font-medium">{t('selectAll')}</button>
                                <button onClick={handleDeselectAll} className="text-gray-400 hover:text-gray-300 text-xs font-medium">{t('deselectAll')}</button>
                            </div>
                        </div>
                        <div className="space-y-4">
                            {/* FIX: Refactor to use Object.keys to avoid type inference issues with Object.entries that caused a crash. */}
                            {Object.keys(patternsByType).map(type => (
                                <div key={type}>
                                    <h5 onClick={() => handleToggleType(type as PatternType)} className="font-semibold text-gray-300 mb-2 cursor-pointer hover:text-white transition-colors">{t(`patternType${type}`)}</h5>
                                    <ul className="space-y-1 pl-2">
                                        {patternsByType[type as PatternType].map(p => (
                                            <li key={p.name}>
                                                <label className="flex items-center gap-2 text-gray-400 hover:text-gray-200 cursor-pointer">
                                                    <input type="checkbox" checked={selectedPatterns.has(p.name)} onChange={(e) => handleFilterChange(p.name, e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />
                                                    {t(p.labelKey)}
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
             <div className="relative" ref={settingsMenuRef}>
                 <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} disabled={isLoading} className={`p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses}`} aria-label={t('backtestSettings')}>
                    <SettingsIcon className="w-5 h-5" />
                </button>
                {isSettingsOpen && (
                    <div className="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-30 p-4 text-sm">
                        <h4 className="font-bold text-base text-cyan-400 mb-3">{t('backtestSettings')}</h4>
                        <div className="space-y-3">
                            <div>
                                <label htmlFor="backtest-strategy" className="block text-gray-300 mb-1">{t('backtestStrategy')}</label>
                                <select id="backtest-strategy" value={backtestStrategy} onChange={(e) => setBacktestStrategy(e.target.value as BacktestStrategy)} className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 focus:ring-cyan-500 focus:border-cyan-500">
                                    <option value="SIGNAL_ONLY">{t('strategySignalOnly')}</option>
                                    <option value="RSI_FILTER">{t('strategyRsiFilter')}</option>
                                    <option value="BOLLINGER_BANDS">{t('strategyBBFilter')}</option>
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
                            <div>
                                <label htmlFor="stop-loss" className="block text-gray-300 mb-1">{t('stopLoss')} (%)</label>
                                <input 
                                    type="number" 
                                    id="stop-loss" 
                                    value={stopLoss} 
                                    onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
                                    min="0"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 focus:ring-cyan-500 focus:border-cyan-500"
                                />
                                 <p className="text-xs text-gray-500 mt-1">{t('slTpHelpText')}</p>
                            </div>
                             <div>
                                <label htmlFor="take-profit" className="block text-gray-300 mb-1">{t('takeProfit')} (%)</label>
                                <input 
                                    type="number" 
                                    id="take-profit" 
                                    value={takeProfit} 
                                    onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 0)}
                                    min="0"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 focus:ring-cyan-500 focus:border-cyan-500"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
             <button onClick={onRunBacktest} disabled={isLoading} className={`p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses}`} aria-label={t('runBacktest')}>
                <CalculatorIcon className="w-5 h-5" />
            </button>
            <button onClick={onOpenDecisionMakerModal} disabled={isLoading} className={`p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses}`} aria-label={t('openAiAdvisor')}>
                <BrainIcon className="w-5 h-5" />
            </button>
            <button onClick={onOpenApiKeyModal} className={`p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200`} aria-label="Manage API Keys">
                <KeyIcon className="w-5 h-5" />
            </button>
            <button onClick={onRefresh} disabled={isLoading} className={`p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses}`} aria-label={t('refreshAriaLabel')}>
                <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
        </div>
    );
};
