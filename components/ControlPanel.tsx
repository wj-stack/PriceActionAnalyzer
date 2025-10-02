
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TIMEFRAMES } from '../constants';
import { RefreshIcon } from './icons/RefreshIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { PriceAlert } from '../types';
import { AlertIcon } from './icons/AlertIcon';
import { CloseIcon } from './icons/CloseIcon';
import { IndicatorIcon } from './icons/IndicatorIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { CalculatorIcon } from './icons/CalculatorIcon';
import { LightBulbIcon } from './icons/LightBulbIcon';

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
    alerts: Record<string, PriceAlert[]>;
    addAlert: (symbol: string, price: number) => void;
    removeAlert: (symbol: string, id: string) => void;
    indicators: Record<string, boolean>;
    setIndicators: (indicators: Record<string, boolean>) => void;
    onRunAnalysis: () => void;
    isAnalysisLoading: boolean;
    onOpenBacktest: () => void;
    onRunPrediction: () => void;
    isPredicting: boolean;
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
    alerts, addAlert, removeAlert,
    indicators, setIndicators,
    onRunAnalysis, isAnalysisLoading,
    onOpenBacktest,
    onRunPrediction, isPredicting,
}) => {
    const { locale, setLocale, t } = useLanguage();
    const [openPopover, setOpenPopover] = useState<string | null>(null);
    
    // Draft state for date pickers
    const [draftStartDate, setDraftStartDate] = useState(startDate);
    const [draftEndDate, setDraftEndDate] = useState(endDate);

    const [newAlertPrice, setNewAlertPrice] = useState('');
    const [isSymbolDropdownOpen, setIsSymbolDropdownOpen] = useState(false);
    const [symbolSearch, setSymbolSearch] = useState('');
    const [visibleSymbolCount, setVisibleSymbolCount] = useState(50);

    const popoverRefs = {
        indicator: useRef<HTMLDivElement>(null),
        alert: useRef<HTMLDivElement>(null),
    };
    const symbolDropdownRef = useRef<HTMLDivElement>(null);
    const symbolListRef = useRef<HTMLUListElement>(null);

    const baseSelectorClasses = "bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all duration-200 text-sm";
    const disabledClasses = "disabled:opacity-50 disabled:cursor-not-allowed";

    useEffect(() => {
        // Sync draft dates if parent dates change (e.g., on symbol change or initial load)
        setDraftStartDate(startDate);
        setDraftEndDate(endDate);
    }, [startDate, endDate]);

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

    const handleApplyDateRange = () => {
        // Validate date range before applying
        if (draftEndDate <= draftStartDate) {
            alert(t('dateRangeError')); // Simple alert for now
            return;
        }
        setStartDate(draftStartDate);
        setEndDate(draftEndDate);
    };

    const hasDateChanged = draftStartDate.getTime() !== startDate.getTime() || draftEndDate.getTime() !== endDate.getTime();
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
                <div className="relative"><button title={t('indicators')} data-popover-toggle onClick={() => togglePopover('indicator')} className={`${baseSelectorClasses} ${disabledClasses} p-2`}><IndicatorIcon className="w-5 h-5" /></button><Popover isOpen={openPopover === 'indicator'} targetRef={popoverRefs.indicator}><div className="p-3 space-y-2"><h4 className="font-semibold text-gray-300 text-sm">{t('indicators')}</h4>{Object.entries(indicators).map(([key, value]) => (<label key={key} className="flex items-center gap-2 text-gray-400 cursor-pointer text-sm"><input type="checkbox" checked={value} onChange={e => handleIndicatorChange(key, e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 text-cyan-500 rounded focus:ring-cyan-500" />{t(`indicator-${key}`)}</label>))}</div></Popover></div>
                <div className="relative"><button title={t('setPriceAlert')} data-popover-toggle onClick={() => togglePopover('alert')} className={`${baseSelectorClasses} ${disabledClasses} p-2`}><AlertIcon className="w-5 h-5" /></button><Popover isOpen={openPopover === 'alert'} targetRef={popoverRefs.alert}><div className="p-3 space-y-3"><h4 className="font-semibold text-gray-300 text-sm">{t('setPriceAlertFor', { symbol })}</h4><div className="flex gap-2"><input type="number" placeholder={t('targetPrice')} value={newAlertPrice} onChange={e => setNewAlertPrice(e.target.value)} className="flex-grow bg-gray-900 border border-gray-600 rounded-md px-2 py-1 text-sm" /><button onClick={handleAddAlert} className="px-3 py-1 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-md">{t('add')}</button></div>{currentAlerts.length > 0 && (<div className="space-y-1"><h5 className="text-xs text-gray-400">{t('activeAlerts')}</h5><ul className="text-sm text-gray-300">{currentAlerts.map(a => (<li key={a.id} className="flex justify-between items-center"><span className="font-mono">{a.price}</span><button onClick={() => removeAlert(symbol, a.id)}><CloseIcon className="w-4 h-4 text-gray-500 hover:text-red-400" /></button></li>))}</ul></div>)}</div></Popover></div>
                <button title={t('predictNextMove')} onClick={onRunPrediction} disabled={isLoading || isPredicting} className={`${baseSelectorClasses} ${disabledClasses} p-2 ${isPredicting ? 'text-yellow-400 animate-pulse' : ''}`}><LightBulbIcon className="w-5 h-5" /></button>
                <button title={t('aiAnalysisTitle')} onClick={onRunAnalysis} disabled={isLoading || isAnalysisLoading} className={`${baseSelectorClasses} ${disabledClasses} p-2 ${isAnalysisLoading ? 'text-cyan-400 animate-pulse' : ''}`}><SparklesIcon className="w-5 h-5" /></button>
                <button title={t('backtestTitle')} onClick={onOpenBacktest} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses} p-2`}><CalculatorIcon className="w-5 h-5" /></button>
            </div>

            <div className="flex-grow"></div>

            {/* Group 3: Date Range & Actions */}
            <div className="flex items-center gap-2">
                <input type="datetime-local" id="start-date" value={formatDateForInput(draftStartDate)} onChange={(e) => setDraftStartDate(new Date(e.target.value))} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses} w-44`} />
                <input type="datetime-local" id="end-date" value={formatDateForInput(draftEndDate)} onChange={(e) => setDraftEndDate(new Date(e.target.value))} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses} w-44`} />
                <button onClick={handleApplyDateRange} disabled={!hasDateChanged || isLoading} className={`${baseSelectorClasses} ${disabledClasses} bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600`}>{t('applyDateRange')}</button>
                <button onClick={onRefresh} disabled={isLoading} aria-label={t('refreshAriaLabel')} className={`${baseSelectorClasses} ${disabledClasses} p-2`}><RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} /></button>
                <select id="language-select" value={locale} onChange={(e) => setLocale(e.target.value as 'en' | 'zh')} disabled={isLoading} className={`${baseSelectorClasses} ${disabledClasses}`}><option value="en">English</option><option value="zh">中文</option></select>
            </div>
        </div>
    );
};
