

import React from 'react';
import { DetectedPattern } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { SparklesIcon } from './icons/SparklesIcon';

const SimpleMarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
    return (
        <div className="prose prose-sm prose-invert text-gray-300 max-w-none">
            {content.split('\n').map((line, index) => {
                if (line.startsWith('### ')) {
                    return <h3 key={index} className="text-base font-semibold mt-4 mb-1 text-cyan-400">{line.substring(4)}</h3>;
                }
                if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                    return <p key={index} className="ml-4">{line}</p>;
                }
                if(line.trim() === '') {
                    return <div key={index} className="h-2"></div>
                }
                return <p key={index} className="mb-2">{line}</p>;
            })}
        </div>
    );
};

interface StrategyModalProps {
    isOpen: boolean;
    onClose: () => void;
    strategy: string | null;
    isLoading: boolean;
    pattern: DetectedPattern | null;
}

const StrategyModalComponent: React.FC<StrategyModalProps> = ({ isOpen, onClose, strategy, isLoading, pattern }) => {
    const { t } = useLanguage();
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <SparklesIcon className="w-6 h-6 text-cyan-400" />
                        <h2 className="text-lg font-bold text-gray-100">{t('aiStrategyTitle')} for <span className="text-cyan-400">{pattern ? t(pattern.name) : ''}</span></h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <main className="p-6 overflow-y-auto">
                    {isLoading && (
                         <div className="flex flex-col items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mb-4"></div>
                            <p className="text-gray-400">{t('aiLoadingStrategy')}</p>
                        </div>
                    )}
                    {strategy && !isLoading && (
                         <SimpleMarkdownRenderer content={strategy} />
                    )}
                    {!strategy && !isLoading && (
                        <div className="text-center text-red-400 p-8">
                            <p>{t('aiError')}</p>
                        </div>
                    )}
                </main>
                 <footer className="p-3 bg-gray-900/50 text-center text-xs text-gray-500 border-t border-gray-700 flex-shrink-0">
                    {t('aiDisclaimer')}
                </footer>
            </div>
        </div>
    );
};

export const StrategyModal = React.memo(StrategyModalComponent);