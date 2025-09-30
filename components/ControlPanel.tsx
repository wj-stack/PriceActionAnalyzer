
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TIMEFRAMES, ALL_PATTERNS } from '../constants';
import { RefreshIcon } from './icons/RefreshIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { FilterIcon } from './icons/FilterIcon';
import { CalculatorIcon } from './icons/CalculatorIcon';
import { PriorityFilterIcon } from './icons/PriorityFilterIcon';
import { PatternType, PriceAlert } from '../types';
import { BrainIcon } from './icons/BrainIcon';
import { AlertIcon } from './icons/AlertIcon';
import { CloseIcon } from './icons/CloseIcon';
import { LayersIcon } from './icons/LayersIcon';
import { IndicatorIcon } from './icons/IndicatorIcon';
import { PencilIcon } from './icons/PencilIcon';
import { SettingsIcon } from './icons/SettingsIcon';
import { SparklesIcon } from './icons/SparklesIcon';

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
    selectedPriorities: Set<number>;
    setSelectedPriorities: (priorities: Set<number>) => void;
    secondaryTimeframes: Set<string>;
    setSecondaryTimeframes: (timeframes: Set<string>) => void;
    onRunBacktest: () => void;
    onOpenDecisionMakerModal: () => void;
    onPredictSignal: () => void;
    alerts: Record<string, PriceAlert[]>;
    addAlert: (symbol: string, price: number) => void;
    removeAlert: (symbol: string, id: string) => void;
    indicators: Record<string, boolean>;
    setIndicators: (indicators: Record<string, boolean>) => void;
    drawingMode: 'hline' | null;
    setDrawingMode: (mode: 'hline' | null) => void;
    showSwingLines: boolean;
    setShowSwingLines: (show: boolean) => void;
    showTrendlines: boolean;
    setShowTrendlines: (show: boolean) => void;
    maxTrendlineLength: number;
    setMaxTrendlineLength: (length: number) => void;
}

const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const CoinPairIcons: React.FC<{ baseSrc?: string; quoteSrc?: string }> = ({ baseSrc, quoteSrc }) => {
    return (
        <div className="relative w-8 h-5 flex-shrink-0 items-center justify-center flex">
            <div className="w-5 h-5 rounded-full bg-gray-600 z-10" />
            <div className="w-5 h-5 rounded-full bg-gray-500 absolute left-3 top-0 border-2 border-gray-800" />
        </div>
    );
};

const Popover: React.FC<{ children: React.ReactNode; isOpen: boolean; targetRef: React.RefObject<HTMLDivElement> }> = ({ children, isOpen, targetRef }) => {
    if (!isOpen) return null;
    return (
        <div ref={targetRef} className="absolute top-full mt-2 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 animate-fade-in-right origin-top-left">
            {children}
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
    selectedPriorities, setSelectedPriorities,
    secondaryTimeframes, setSecondaryTimeframes,
    onRunBacktest,
    onOpenDecisionMakerModal,
    onPredictSignal,
    alerts, addAlert, removeAlert,
    indicators, setIndicators,
    drawingMode, setDrawingMode,
    showSwingLines, setShowSwingLines,
    showTrendlines, setShowTrendlines,
    maxTrendlineLength, setMaxTrendlineLength
}) => {
    const { locale, setLocale, t } = useLanguage();
    const [openPopover, setOpenPopover] = useState<string | null>(null);
    
    const [newAlertPrice, setNewAlertPrice] = useState('');
    const [isSymbolDropdownOpen, setIsSymbolDropdownOpen] = useState(false);
    const [symbolSearch, setSymbolSearch] = useState('');
    const [visibleSymbolCount, setVisibleSymbolCount] = useState(50);

    const popoverRefs = {
        filter: useRef<HTMLDivElement>(null),
        priority: useRef<HTMLDivElement>(null),
        multiTimeframe: useRef<HTMLDivElement>(null),
        indicator: useRef<HTMLDivElement>(null),
        alert: useRef<HTMLDivElement>(null),
        chartSettings: useRef<HTMLDivElement>(null),
    };
    const symbolDropdownRef = useRef<HTMLDivElement>(null);
    const symbolListRef = useRef<HTMLUListElement>(null);

    const baseSelectorClasses = "bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all duration-200 text-sm";
    const disabledClasses = "disabled:opacity-50 disabled:cursor-not-allowed";

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            let isClickInside = false;
            if (symbolDropdownRef.current && symbolDropdownRef.current.contains(event.target as Node)) isClickInside = true;
            Object.values(popoverRefs).forEach(ref => {
                if (ref.current && ref.current.contains(event.target as Node)) isClickInside = true;
            });
            
            const targetEl = event.target as Element;
            if (targetEl.closest('[data-popover-toggle]')) {
                isClickInside = true;
            }

            if (!isClickInside) {
                setOpenPopover(null);
                setIsSymbolDropdownOpen(false);
                setSymbolSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const togglePopover = (name: string) => {
        setOpenPopover(prev => (prev === name ? null : name));
    };
    
    const handleFilterChange = (patternName: string, checked: boolean) => {
        const newSet = new Set(selectedPatterns);
        if (checked) newSet.add(patternName); else newSet.delete(patternName);
        setSelectedPatterns(newSet);
    };

    const handleSelectAll = () => setSelectedPatterns(new Set(ALL_PATTERNS.map(p => p.name)));
    // FIX: Explicitly type `new Set()` to `new Set<string>()` to avoid type inference issues.
    const handleDeselectAll = () => setSelectedPatterns(new Set<string>());

    const handleToggleType = (type: PatternType) => {
        const typePatterns = ALL_PATTERNS.filter(p => p.type === type).map(p => p.name);
        const allSelectedForType = typePatterns.every(name => selectedPatterns.has(name));
        const newSet = new Set(selectedPatterns);
        if (allSelectedForType) typePatterns.forEach(name => newSet.delete(name));
        else typePatterns.forEach(name => newSet.add(name));
        setSelectedPatterns(newSet);
    }
    
    const priorityLevels = useMemo(() => [
        { level: 4, labelKey: 'priorityVeryHigh' }, { level: 3, labelKey: 'priorityHigh' },
        { level: 2, labelKey: 'priorityMedium' }, { level: 1, labelKey: 'priorityLow' },
    ], []);

    const handlePriorityFilterChange = (level: number, checked: boolean) => {
        const newSet = new Set(selectedPriorities);
        if (checked) newSet.add(level); else newSet.delete(level);
        setSelectedPriorities(newSet);
    };

    const handleSelectAllPriorities = () => setSelectedPriorities(new Set([1, 2, 3, 4]));
    // FIX: Explicitly type `new Set()` to `new Set<number>()` to fix the TypeScript error.
    const handleDeselectAllPriorities = () => setSelectedPriorities(new Set<number>());

    const handleSecondaryTimeframeChange = (tf: string, checked: boolean) => {
        const newSet = new Set(secondaryTimeframes);
        if (checked) newSet.add(tf); else newSet.delete(tf);
        setSecondaryTimeframes(newSet);
    };

    const CONTEXT_TIMEFRAMES = useMemo(() => TIMEFRAMES.filter(tf => ['4h', '6h', '8h', '12h', '1d', '3d', '1w', '1mo'].includes(tf.value)), []);

    // FIX: Replaced a potentially unsafe .reduce() with a type-safe for...of loop to group patterns by type.
    // This ensures `patternsByType` is correctly typed as Record<PatternType, Pattern[]>, resolving
    // the downstream error where `.map` could not be found on a variable of type 'unknown'.
    const patternsByType = useMemo(() => {
        const result: Record<PatternType, typeof ALL_PATTERNS> = {
            [PatternType.Reversal]: [],
            [PatternType.Trend]: [],
            [PatternType.Range]: [],
        };
        for (const pattern of ALL_PATTERNS) {
            result[pattern.type].push(pattern);
        }
        return result;
    }, []);

    const filteredSymbols = useMemo(() => {
        if (!symbolSearch) return symbols;
        const searchLower = symbolSearch.toLowerCase();
        return symbols.filter(s => s.label.toLowerCase().includes(searchLower) || s.value.toLowerCase().includes(searchLower));
    }, [symbolSearch, symbols]);

    const paginatedSymbols = useMemo(() => filteredSymbols.slice(0, visibleSymbolCount), [filteredSymbols, visibleSymbolCount]);
    const hasMoreSymbols = useMemo(() => visibleSymbolCount < filteredSymbols.length, [visibleSymbolCount, filteredSymbols.length]);

    useEffect(() => { setVisibleSymbolCount(50); if (symbolListRef.current) symbolListRef.current.scrollTop = 0; }, [symbolSearch]);
    useEffect(() => { if (isSymbolDropdownOpen) setVisibleSymbolCount(50); }, [isSymbolDropdownOpen]);

    const handleScroll = () => {
        if (symbolListRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = symbolListRef.current;
            if (scrollHeight - scrollTop - clientHeight < 50 && hasMoreSymbols) setVisibleSymbolCount(prev => Math.min(prev + 50, filteredSymbols.length));
        }
    };

    const selectedSymbolData = useMemo(() => symbols.find(s => s.value === symbol), [symbols, symbol]);
    
    const handleAddAlert = () => {
        const price = parseFloat(newAlertPrice);
        if (!isNaN(price) && price > 0) {
            addAlert(symbol, price);
            setNewAlertPrice('');
        }
    };

    const handleIndicatorChange = (key: string, checked: boolean) => {
        setIndicators({ ...indicators, [key]: checked });
    };

    const currentAlerts = alerts[symbol] || [];

    return (
        <div className="bg-gray-800/40 p-2 rounded-lg border border-gray-700 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Group 1: Chart Definition */}
            <div className="flex items-center gap-2">
                <div ref={symbolDropdownRef} className="relative">
                    <button onClick={() => setIsSymbolDropdownOpen(p => !p)} disabled={isLoading || isSymbolsLoading} className={`${baseSelectorClasses} ${disabledClasses} flex items-center gap-2 min-w-[180px]`}>
                        {isSymbolsLoading ? (<><div className="w-5 h-5 border-2 border-gray-500 border-t-white rounded-full animate-spin"></div><span>{t('loadingSymbols')}</span></>) : (<><CoinPairIcons /><span className="flex-grow text-left">{selectedSymbolData?.label ?? symbol}</span><svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg></>)}
                    </button>
                    {isSymbolDropdownOpen && (<div className="absolute top-full mt-2 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20"><div className="p-2 border-b border-gray-700"><input type="text" placeholder={t('searchSymbol')} value={symbolSearch} onChange={(e) => setSymbolSearch(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm" /></div><ul ref={symbolListRef} onScroll={handleScroll} className="max-h-60 overflow-y-auto">{paginatedSymbols.length > 0 ? paginatedSymbols.map(s => (<li key={s.value} onClick={() => { setSymbol(s.value); setIsSymbolDropdownOpen(false); setSymbolSearch(''); }} className="px-3 py-2 text-sm hover:bg-gray-700 cursor-pointer flex items-center gap-2"><CoinPairIcons /><span>{s.label}</span></li>)) : <li className="px-3 py-2 text-sm text-gray-500">{t('noSymbolsFound')}</li>}{hasMoreSymbols && <li className="px-3 py-2 text-sm text-center text-gray-500">{t('loadingMore')}</li>}</ul></div>)}
                </div>
                <select id="timeframe-select" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses}`}>{TIMEFRAMES.map(tf => <option key={tf.value} value={tf.value}>{tf.label}</option>)}</select>
            </div>
            
            <div className="h-6 w-px bg-gray-700 hidden lg:block"></div>

            {/* Group 2: Tools */}
            <div className="flex items-center gap-1">
                 <div className="relative"><button title={t('filterPatterns')} data-popover-toggle onClick={() => togglePopover('filter')} className={`${baseSelectorClasses} ${disabledClasses} p-2`}><FilterIcon className="w-5 h-5" /></button><Popover isOpen={openPopover === 'filter'} targetRef={popoverRefs.filter}><div className="p-3 space-y-3 max-h-80 overflow-y-auto"><div className="flex justify-between items-center text-xs"><button onClick={handleSelectAll} className="text-cyan-400 hover:underline">{t('selectAll')}</button><button onClick={handleDeselectAll} className="text-cyan-400 hover:underline">{t('deselectAll')}</button></div>{Object.entries(patternsByType).map(([type, patterns]) => (<div key={type}><h4 onClick={() => handleToggleType(type as PatternType)} className="font-semibold text-gray-300 text-sm mb-2 cursor-pointer">{t(`patternType${type}`)}</h4><div className="space-y-1 text-sm">{patterns.map(p => (<label key={p.name} className="flex items-center gap-2 text-gray-400 cursor-pointer"><input type="checkbox" checked={selectedPatterns.has(p.name)} onChange={(e) => handleFilterChange(p.name, e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />{t(p.labelKey)}</label>))}</div></div>))}</div></Popover></div>
                <div className="relative"><button title={t('filterByPriority')} data-popover-toggle onClick={() => togglePopover('priority')} className={`${baseSelectorClasses} ${disabledClasses} p-2`}><PriorityFilterIcon className="w-5 h-5" /></button><Popover isOpen={openPopover === 'priority'} targetRef={popoverRefs.priority}><div className="p-3 space-y-2"><div className="flex justify-between items-center text-xs"><button onClick={handleSelectAllPriorities} className="text-cyan-400 hover:underline">{t('selectAll')}</button><button onClick={handleDeselectAllPriorities} className="text-cyan-400 hover:underline">{t('deselectAll')}</button></div>{priorityLevels.map(p => (<label key={p.level} className="flex items-center gap-2 text-gray-400 cursor-pointer text-sm"><input type="checkbox" checked={selectedPriorities.has(p.level)} onChange={(e) => handlePriorityFilterChange(p.level, e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />{t(p.labelKey)}</label>))}</div></Popover></div>
                <div className="relative"><button title={t('selectTimeframes')} data-popover-toggle onClick={() => togglePopover('multiTimeframe')} className={`${baseSelectorClasses} ${disabledClasses} p-2`}><LayersIcon className="w-5 h-5" /></button><Popover isOpen={openPopover === 'multiTimeframe'} targetRef={popoverRefs.multiTimeframe}><div className="p-3 space-y-2"><h4 className="font-semibold text-gray-300 text-sm">{t('selectTimeframes')}</h4>{CONTEXT_TIMEFRAMES.map(tf => (<label key={tf.value} className="flex items-center gap-2 text-gray-400 cursor-pointer text-sm"><input type="checkbox" checked={secondaryTimeframes.has(tf.value)} onChange={e => handleSecondaryTimeframeChange(tf.value, e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />{tf.label}</label>))}</div></Popover></div>
                <div className="relative"><button title={t('indicators')} data-popover-toggle onClick={() => togglePopover('indicator')} className={`${baseSelectorClasses} ${disabledClasses} p-2`}><IndicatorIcon className="w-5 h-5" /></button><Popover isOpen={openPopover === 'indicator'} targetRef={popoverRefs.indicator}><div className="p-3 space-y-2"><h4 className="font-semibold text-gray-300 text-sm">{t('indicators')}</h4>{Object.entries(indicators).map(([key, value]) => (<label key={key} className="flex items-center gap-2 text-gray-400 cursor-pointer text-sm"><input type="checkbox" checked={value} onChange={e => handleIndicatorChange(key, e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />{t(`indicator-${key}`)}</label>))}</div></Popover></div>
                <div className="relative"><button title={t('setPriceAlert')} data-popover-toggle onClick={() => togglePopover('alert')} className={`${baseSelectorClasses} ${disabledClasses} p-2`}><AlertIcon className="w-5 h-5" /></button><Popover isOpen={openPopover === 'alert'} targetRef={popoverRefs.alert}><div className="p-3 space-y-3"><h4 className="font-semibold text-gray-300 text-sm">{t('setPriceAlertFor', { symbol })}</h4><div className="flex gap-2"><input type="number" placeholder={t('targetPrice')} value={newAlertPrice} onChange={e => setNewAlertPrice(e.target.value)} className="flex-grow bg-gray-900 border border-gray-600 rounded-md px-2 py-1 text-sm" /><button onClick={handleAddAlert} className="px-3 py-1 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-md">{t('add')}</button></div>{currentAlerts.length > 0 && (<div className="space-y-1"><h5 className="text-xs text-gray-400">{t('activeAlerts')}</h5><ul className="text-sm text-gray-300">{currentAlerts.map(a => (<li key={a.id} className="flex justify-between items-center"><span className="font-mono">{a.price}</span><button onClick={() => removeAlert(symbol, a.id)}><CloseIcon className="w-4 h-4 text-gray-500 hover:text-red-400" /></button></li>))}</ul></div>)}</div></Popover></div>
                <button title={t('drawingTools')} onClick={() => setDrawingMode(drawingMode === 'hline' ? null : 'hline')} className={`${baseSelectorClasses} ${disabledClasses} p-2 ${drawingMode === 'hline' ? 'bg-cyan-600 text-white' : ''}`}><PencilIcon className="w-5 h-5" /></button>
                <div className="relative"><button title={t('chartDisplaySettings')} data-popover-toggle onClick={() => togglePopover('chartSettings')} className={`${baseSelectorClasses} ${disabledClasses} p-2`}><SettingsIcon className="w-5 h-5" /></button>
                    <Popover isOpen={openPopover === 'chartSettings'} targetRef={popoverRefs.chartSettings}>
                        <div className="p-3 space-y-3">
                            <h4 className="font-semibold text-gray-300 text-sm">{t('chartDisplaySettings')}</h4>
                            <label className="flex items-center gap-2 text-gray-400 cursor-pointer text-sm">
                                <input type="checkbox" checked={showSwingLines} onChange={e => setShowSwingLines(e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />
                                {t('showSwingPoints')}
                            </label>
                            <label className="flex items-center gap-2 text-gray-400 cursor-pointer text-sm">
                                <input type="checkbox" checked={showTrendlines} onChange={e => setShowTrendlines(e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />
                                {t('showTrendlines')}
                            </label>
                            <div className="space-y-1 pt-2 border-t border-gray-700/50">
                                <label htmlFor="max-trendline-length" className="text-gray-400 text-sm flex justify-between">
                                  <span>{t('maxTrendlineLength')}</span>
                                  <span className="font-mono text-gray-200">{maxTrendlineLength}</span>
                                </label>
                                <input
                                    type="range"
                                    id="max-trendline-length"
                                    min="10"
                                    max="500"
                                    step="10"
                                    value={maxTrendlineLength}
                                    onChange={(e) => setMaxTrendlineLength(parseInt(e.target.value, 10))}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>
                    </Popover>
                </div>
            </div>

            <div className="flex-grow"></div>

            {/* Group 3: Date Range & Actions */}
            <div className="flex items-center gap-2">
                <input type="datetime-local" id="start-date" value={formatDateForInput(startDate)} onChange={(e) => setStartDate(new Date(e.target.value))} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses} w-44`} />
                <input type="datetime-local" id="end-date" value={formatDateForInput(endDate)} onChange={(e) => setEndDate(new Date(e.target.value))} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses} w-44`} />
                <button onClick={onRefresh} disabled={isLoading} aria-label={t('refreshAriaLabel')} className={`${baseSelectorClasses} ${disabledClasses} p-2`}><RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} /></button>
                <button title={t('predictSignalTooltip')} onClick={onPredictSignal} className="bg-purple-600 text-white px-3 py-2 rounded-md font-semibold text-sm hover:bg-purple-500 transition-colors flex items-center gap-2"><SparklesIcon className="w-5 h-5" /><span>{t('predictSignal')}</span></button>
                <button onClick={onRunBacktest} className="bg-yellow-500 text-gray-900 px-3 py-2 rounded-md font-semibold text-sm hover:bg-yellow-400 transition-colors flex items-center gap-2"><CalculatorIcon className="w-5 h-5" /><span>{t('runBacktest')}</span></button>
                <button onClick={onOpenDecisionMakerModal} className="bg-cyan-600 text-white px-3 py-2 rounded-md font-semibold text-sm hover:bg-cyan-500 transition-colors flex items-center gap-2"><BrainIcon className="w-5 h-5" /><span>{t('openAiAdvisor')}</span></button>
                <select id="language-select" value={locale} onChange={(e) => setLocale(e.target.value as 'en' | 'zh')} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses}`}><option value="en">English</option><option value="zh">中文</option></select>
            </div>
        </div>
    );
};
