
import React from 'react';
import type { BacktestSettings, BacktestResult, Candle } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { CloseIcon } from './icons/CloseIcon';
import { BacktestSettingsPanel } from './BacktestSettingsPanel';
import { BacktestResultsPanel } from './BacktestResultsPanel';

interface BacktestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRunBacktest: (settings: BacktestSettings) => void;
    isLoading: boolean;
    result: BacktestResult | null;
    candles: Candle[];
}

export const BacktestModal: React.FC<BacktestModalProps> = ({
    isOpen,
    onClose,
    onRunBacktest,
    isLoading,
    result,
    candles,
}) => {
    const { t } = useLanguage();

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div 
                className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-screen-2xl h-[90vh] flex flex-col shadow-2xl animate-fade-in-right"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-cyan-400">{t('backtestTitle')}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                </header>
                <main className="flex-grow flex overflow-hidden">
                    <div className="w-[380px] flex-shrink-0 border-r border-gray-700 overflow-y-auto">
                        <BacktestSettingsPanel 
                            onRunBacktest={onRunBacktest}
                            isLoading={isLoading}
                        />
                    </div>
                    <div className="flex-grow overflow-y-auto">
                         <BacktestResultsPanel 
                            isLoading={isLoading}
                            result={result}
                            candles={candles}
                         />
                    </div>
                </main>
            </div>
        </div>
    );
};