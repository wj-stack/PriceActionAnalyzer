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
    alerts: Record<string, PriceAlert[]>;
    addAlert: (symbol: string, price: number) => void;
    removeAlert: (symbol: string, id: string) => void;
    indicators: Record<string, boolean>;
    setIndicators: (indicators: Record<string, boolean>) => void;
    drawingMode: 'hline' | null;
    setDrawingMode: (mode: 'hline' | null) => void;
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
    // As logos are removed, we always show a fallback.
    // This component is kept for potential future re-integration with a valid logo source.
    return (
        <div className="relative w-8 h-5 flex-shrink-0 items-center justify-center flex">
            <div className="w-5 h-5 rounded-full bg-gray-600 z-10" />
            <div className="w-5 h-5 rounded-full bg-gray-500 absolute left-3 top-0 border-2 border-gray-800" />
        </div>
    );
};

const ControlPanelComponent: React.FC<ControlPanelProps> = ({ 
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
    alerts, addAlert, removeAlert,
    indicators, setIndicators,
    drawingMode, setDrawingMode
}) => {
    const { locale, setLocale, t } = useLanguage();
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isPriorityFilterOpen, setIsPriorityFilterOpen] = useState(false);
    const [isAlertPopoverOpen, setIsAlertPopoverOpen] = useState(false);
    const [isMultiTimeframeOpen, setIsMultiTimeframeOpen] = useState(false);
    const [isIndicatorOpen, setIsIndicatorOpen] = useState(false);
    const [newAlertPrice, setNewAlertPrice] = useState('');
    const [isSymbolDropdownOpen, setIsSymbolDropdownOpen] = useState(false);
    const [symbolSearch, setSymbolSearch] = useState('');
    const [visibleSymbolCount, setVisibleSymbolCount] = useState(50);

    const filterMenuRef = useRef<HTMLDivElement>(null);
    const priorityFilterMenuRef = useRef<HTMLDivElement>(null);
    const alertPopoverRef = useRef<HTMLDivElement>(null);
    const symbolDropdownRef = useRef<HTMLDivElement>(null);
    const symbolListRef = useRef<HTMLUListElement>(null);
    const multiTimeframeMenuRef = useRef<HTMLDivElement>(null);
    const indicatorMenuRef = useRef<HTMLDivElement>(null);
    
    const isDateRangeValid = useMemo(() => {
        return endDate.getTime() > startDate.getTime();
    }, [startDate, endDate]);

    const baseSelectorClasses = "bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all duration-200 text-sm";
    const disabledClasses = "disabled:opacity-50 disabled:cursor-not-allowed";

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) setIsFilterOpen(false);
            if (priorityFilterMenuRef.current && !priorityFilterMenuRef.current.contains(event.target as Node)) setIsPriorityFilterOpen(false);
            if (symbolDropdownRef.current && !symbolDropdownRef.current.contains(event.target as Node)) { setIsSymbolDropdownOpen(false); setSymbolSearch(''); }
            if (alertPopoverRef.current && !alertPopoverRef.current.contains(event.target as Node)) setIsAlertPopoverOpen(false);
            if (multiTimeframeMenuRef.current && !multiTimeframeMenuRef.current.contains(event.target as Node)) setIsMultiTimeframeOpen(false);
            if (indicatorMenuRef.current && !indicatorMenuRef.current.contains(event.target as Node)) setIsIndicatorOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const handleFilterChange = (patternName: string, checked: boolean) => {
        const newSet = new Set(selectedPatterns);
        if (checked) newSet.add(patternName);
        else newSet.delete(patternName);
        setSelectedPatterns(newSet);
    };

    const handleSelectAll = () => setSelectedPatterns(new Set(ALL_PATTERNS.map(p => p.name)));
    const handleDeselectAll = () => setSelectedPatterns(new Set());

    const handleToggleType = (type: PatternType) => {
        const typePatterns = ALL_PATTERNS.filter(p => p.type === type).map(p => p.name);
        const allSelectedForType = typePatterns.every(name => selectedPatterns.has(name));
        const newSet = new Set(selectedPatterns);
        if (allSelectedForType) typePatterns.forEach(name => newSet.delete(name));
        else typePatterns.forEach(name => newSet.add(name));
        setSelectedPatterns(newSet);
    }
    
    const priorityLevels = useMemo(() => [
        { level: 4, labelKey: 'priorityVeryHigh' },
        { level: 3, labelKey: 'priorityHigh' },
        { level: 2, labelKey: 'priorityMedium' },
        { level: 1, labelKey: 'priorityLow' },
    ], []);

    const handlePriorityFilterChange = (level: number, checked: boolean) => {
        const newSet = new Set(selectedPriorities);
        if (checked) newSet.add(level);
        else newSet.delete(level);
        setSelectedPriorities(newSet);
    };

    const handleSelectAllPriorities = () => setSelectedPriorities(new Set([1, 2, 3, 4]));
    const handleDeselectAllPriorities = () => setSelectedPriorities(new Set());

    const handleSecondaryTimeframeChange = (tf: string, checked: boolean) => {
        const newSet = new Set(secondaryTimeframes);
        if (checked) newSet.add(tf);
        else newSet.delete(tf);
        setSecondaryTimeframes(newSet);
    };

    const CONTEXT_TIMEFRAMES = useMemo(() => TIMEFRAMES.filter(tf => ['4h', '6h', '8h', '12h', '1d', '3d', '1w', '1mo'].includes(tf.value)), []);

    const patternsByType = useMemo(() => {
        return ALL_PATTERNS.reduce((acc, pattern) => {
            if (!acc[pattern.type]) acc[pattern.type] = [];
            acc[pattern.type].push(pattern);
            return acc;
        }, {} as Record<PatternType, typeof ALL_PATTERNS>);
    }, []);

    const filteredSymbols = useMemo(() => {
        if (!symbolSearch) return symbols;
        const searchLower = symbolSearch.toLowerCase();
        return symbols.filter(s => s.label.toLowerCase().includes(searchLower) || s.value.toLowerCase().includes(searchLower));
    }, [symbolSearch, symbols]);

    const paginatedSymbols = useMemo(() => filteredSymbols.slice(0, visibleSymbolCount), [filteredSymbols, visibleSymbolCount]);
    const hasMoreSymbols = useMemo(() => visibleSymbolCount < filteredSymbols.length, [visibleSymbolCount, filteredSymbols.length]);

    useEffect(() => {
        setVisibleSymbolCount(50);
        if (symbolListRef.current) symbolListRef.current.scrollTop = 0;
    }, [symbolSearch]);

    useEffect(() => {
        if (isSymbolDropdownOpen) setVisibleSymbolCount(50);
    }, [isSymbolDropdownOpen]);

    const handleScroll = () => {
        if (symbolListRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = symbolListRef.current;
            if (scrollHeight - scrollTop - clientHeight < 50 && hasMoreSymbols) {
                setVisibleSymbolCount(prev => Math.min(prev + 50, filteredSymbols.length));
            }
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
        <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
                <label htmlFor="language-select" className="text-sm font-medium text-gray-400 sr-only">{t('language')}</label>
                <select id="language-select" value={locale} onChange={(e) => setLocale(e.target.value as 'en' | 'zh')} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses}`}>
                    <option value="en">English</option>
                    <option value="zh">中文</option>
                </select>
            </div>
            <div className="flex items-center gap-2">
                <label htmlFor="start-date" className="text-sm font-medium text-gray-400 sr-only">{t('from')}</label>
                <input type="datetime-local" id="start-date" value={formatDateForInput(startDate)} onChange={(e) => setStartDate(new Date(e.target.value))} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses}`} />
            </div>
            <div className="flex items-center gap-2">
                <label htmlFor="end-date" className="text-sm font-medium text-gray-400 sr-only">{t('to')}</label>
                <input type="datetime-local" id="end-date" value={formatDateForInput(endDate)} onChange={(e) => setEndDate(new Date(e.target.value))} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses}`} />
            </div>
            
            <div className="relative" ref={symbolDropdownRef}>
                <button id="symbol-search-button" type="button" onClick={() => setIsSymbolDropdownOpen(!isSymbolDropdownOpen)} disabled={isLoading || isSymbolsLoading} className={`${baseSelectorClasses} ${disabledClasses} w-44 text-left flex justify-between items-center`} aria-haspopup="listbox" aria-expanded={isSymbolDropdownOpen}>
                     <div className="flex items-center gap-2 truncate">
                        {isSymbolsLoading ? <span className="truncate">{t('loadingSymbols')}</span> : selectedSymbolData ? (<> <CoinPairIcons baseSrc={selectedSymbolData.baseAssetLogoUrl} quoteSrc={selectedSymbolData.quoteAssetLogoUrl} /> <span className="truncate">{selectedSymbolData.label}</span> </>) : <span className="truncate">{symbol}</span>}
                    </div>
                    <svg className={`w-4 h-4 ml-2 flex-shrink-0 transition-transform ${isSymbolDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                {isSymbolDropdownOpen && (
                    <div className="absolute left-0 mt-2 w-full min-w-[200px] bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-40 text-sm">
                        <div className="p-2 border-b border-gray-700">
                            <input type="text" placeholder={t('searchSymbol')} value={symbolSearch} onChange={(e) => setSymbolSearch(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-md px-2 py-1.5 focus:ring-cyan-500 focus:border-cyan-500" autoFocus />
                        </div>
                        <ul ref={symbolListRef} onScroll={handleScroll} className="max-h-60 overflow-y-auto" role="listbox">
                            {paginatedSymbols.length > 0 ? paginatedSymbols.map(s => (
                                <li key={s.value} role="option" aria-selected={s.value === symbol}>
                                    <button type="button" onClick={() => { setSymbol(s.value); setIsSymbolDropdownOpen(false); setSymbolSearch(''); }} className="w-full text-left px-3 py-2 hover:bg-gray-700/50 transition-colors text-gray-200 flex items-center gap-2"> <CoinPairIcons baseSrc={s.baseAssetLogoUrl} quoteSrc={s.quoteAssetLogoUrl} /> {s.label} </button>
                                </li>
                            )) : <li className="px-3 py-2 text-gray-500">{t('noSymbolsFound')}</li>}
                            {hasMoreSymbols && <li className="px-3 py-2 text-center text-gray-500 text-xs animate-pulse">{t('loadingMore')}</li>}
                        </ul>
                    </div>
                )}
            </div>
           
            <label htmlFor="timeframe-select" className="text-sm font-medium text-gray-400 sr-only">{t('timeframe')}</label>
            <select id="timeframe-select" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses}`}>
                {TIMEFRAMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            
            <div className="relative" ref={filterMenuRef}>
                <button onClick={() => setIsFilterOpen(!isFilterOpen)} disabled={isLoading} className={`p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses}`} aria-label={t('filterPatterns')}><FilterIcon className="w-5 h-5" /></button>
                {isFilterOpen && (
                    <div className="absolute right-0 mt-2 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-30 p-4 text-sm">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="font-bold text-base text-cyan-400">{t('filterPatterns')}</h4>
                            <div className="flex gap-2"><button onClick={handleSelectAll} className="text-cyan-400 hover:text-cyan-300 text-xs font-medium">{t('selectAll')}</button><button onClick={handleDeselectAll} className="text-gray-400 hover:text-gray-300 text-xs font-medium">{t('deselectAll')}</button></div>
                        </div>
                        <div className="space-y-4">{Object.keys(patternsByType).map(type => (<div key={type}><h5 onClick={() => handleToggleType(type as PatternType)} className="font-semibold text-gray-300 mb-2 cursor-pointer hover:text-white transition-colors">{t(`patternType${type}`)}</h5><ul className="space-y-1 pl-2">{patternsByType[type as PatternType].map(p => (<li key={p.name}><label className="flex items-center gap-2 text-gray-400 hover:text-gray-200 cursor-pointer"><input type="checkbox" checked={selectedPatterns.has(p.name)} onChange={(e) => handleFilterChange(p.name, e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />{t(p.labelKey)}</label></li>))}</ul></div>))}</div>
                    </div>
                )}
            </div>

            <div className="relative" ref={priorityFilterMenuRef}>
                <button onClick={() => setIsPriorityFilterOpen(!isPriorityFilterOpen)} disabled={isLoading} className={`p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses}`} aria-label={t('filterByPriority')}><PriorityFilterIcon className="w-5 h-5" /></button>
                {isPriorityFilterOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-30 p-4 text-sm">
                        <div className="flex justify-between items-center mb-3"><h4 className="font-bold text-base text-cyan-400">{t('filterByPriority')}</h4><div className="flex gap-2"><button onClick={handleSelectAllPriorities} className="text-cyan-400 hover:text-cyan-300 text-xs font-medium">{t('selectAll')}</button><button onClick={handleDeselectAllPriorities} className="text-gray-400 hover:text-gray-300 text-xs font-medium">{t('deselectAll')}</button></div></div>
                        <ul className="space-y-2">{priorityLevels.map(p => (<li key={p.level}><label className="flex items-center gap-2 text-gray-400 hover:text-gray-200 cursor-pointer"><input type="checkbox" checked={selectedPriorities.has(p.level)} onChange={(e) => handlePriorityFilterChange(p.level, e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />{t(p.labelKey)}</label></li>))}</ul>
                    </div>
                )}
            </div>

            <div className="relative" ref={multiTimeframeMenuRef}>
                <button onClick={() => setIsMultiTimeframeOpen(!isMultiTimeframeOpen)} disabled={isLoading} className={`p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses}`} aria-label={t('selectTimeframes')}><LayersIcon className="w-5 h-5" /></button>
                {isMultiTimeframeOpen && (<div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-30 p-4 text-sm"><h4 className="font-bold text-base text-cyan-400 mb-3">{t('selectTimeframes')}</h4><ul className="space-y-2">{CONTEXT_TIMEFRAMES.map(tf => (<li key={tf.value}><label className="flex items-center gap-2 text-gray-400 hover:text-gray-200 cursor-pointer"><input type="checkbox" disabled={tf.value === timeframe} checked={secondaryTimeframes.has(tf.value)} onChange={(e) => handleSecondaryTimeframeChange(tf.value, e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500 disabled:opacity-50" />{tf.label}</label></li>))}</ul></div>)}
            </div>
            
            <div className="relative" ref={indicatorMenuRef}>
                <button onClick={() => setIsIndicatorOpen(!isIndicatorOpen)} disabled={isLoading} className={`p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses}`} aria-label={t('indicators')}><IndicatorIcon className="w-5 h-5" /></button>
                {isIndicatorOpen && (<div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-30 p-4 text-sm"><h4 className="font-bold text-base text-cyan-400 mb-3">{t('indicators')}</h4><ul className="space-y-2">{Object.keys(indicators).map(key => (<li key={key}><label className="flex items-center gap-2 text-gray-400 hover:text-gray-200 cursor-pointer"><input type="checkbox" checked={indicators[key]} onChange={(e) => handleIndicatorChange(key, e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />{t(`indicator-${key}`)}</label></li>))}</ul></div>)}
            </div>

            <div className="relative" ref={alertPopoverRef}>
                <button onClick={() => setIsAlertPopoverOpen(!isAlertPopoverOpen)} disabled={isLoading} className={`relative p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses}`} aria-label={t('setPriceAlert')}><AlertIcon className="w-5 h-5" />{currentAlerts.length > 0 && (<span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-xs font-bold text-white ring-2 ring-gray-800">{currentAlerts.length}</span>)}</button>
                {isAlertPopoverOpen && (<div className="absolute right-0 mt-2 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-30 p-4 text-sm"><h4 className="font-bold text-base text-cyan-400 mb-3">{t('setPriceAlertFor').replace('{{symbol}}', symbol)}</h4><div className="flex gap-2 mb-4"><input type="number" value={newAlertPrice} onChange={e => setNewAlertPrice(e.target.value)} placeholder={t('targetPrice')} className="flex-grow bg-gray-900 border border-gray-600 rounded-md px-2 py-1.5 focus:ring-cyan-500 focus:border-cyan-500" /><button onClick={handleAddAlert} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-md transition-colors">{t('add')}</button></div><h5 className="text-xs uppercase text-gray-400 font-semibold mb-2">{t('activeAlerts')}</h5><ul className="space-y-2 max-h-40 overflow-y-auto">{currentAlerts.length > 0 ? currentAlerts.map(alert => (<li key={alert.id} className="flex justify-between items-center bg-gray-700/50 p-2 rounded-md"><span className="font-mono text-gray-200">${alert.price.toLocaleString()}</span><button onClick={() => removeAlert(symbol, alert.id)} className="text-gray-500 hover:text-red-400" aria-label={t('removeAlert')}><CloseIcon className="w-4 h-4" /></button></li>)) : (<p className="text-gray-500 text-center py-4">{t('noActiveAlerts')}</p>)}</ul></div>)}
            </div>
             <button onClick={onRunBacktest} disabled={isLoading || !isDateRangeValid} className={`p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses}`} aria-label={t('runBacktest')}><CalculatorIcon className="w-5 h-5" /></button>
             <button onClick={() => setDrawingMode(drawingMode === 'hline' ? null : 'hline')} disabled={isLoading} className={`p-2 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses} ${drawingMode === 'hline' ? 'bg-cyan-600 text-white' : 'bg-gray-700'}`} aria-label={t('drawHLine')}><PencilIcon className="w-5 h-5" /></button>
             <button onClick={onOpenDecisionMakerModal} disabled={isLoading || !isDateRangeValid} className={`p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses}`} aria-label={t('openAiAdvisor')}><BrainIcon className="w-5 h-5" /></button>
            <button onClick={onRefresh} disabled={isLoading || !isDateRangeValid} className={`p-2 bg-gray-700 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200 ${disabledClasses}`} aria-label={t('refreshAriaLabel')}><RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} /></button>
        </div>
    );
};

export const ControlPanel = React.memo(ControlPanelComponent);
