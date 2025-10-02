
import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { BrainIcon } from './icons/BrainIcon';
import { CloseIcon } from './icons/CloseIcon';
import { MultiTimeframeView } from './MultiTimeframeView';
import type { MultiTimeframeData } from '../types';

interface AnalysisPanelProps {
    symbol: string;
    isLoading: boolean;
    result: string | null;
    mtfData: MultiTimeframeData | null;
    onRunAnalysis: () => void;
    onClose: () => void;
}

const LoadingSpinner: React.FC = () => (
    <div className="flex justify-center items-center py-4">
        <div className="w-6 h-6 border-2 border-gray-500 border-t-cyan-400 rounded-full animate-spin"></div>
    </div>
);

const FormattedAnalysisResult: React.FC<{ text: string }> = ({ text }) => {
    const sections = text.split('**').filter(s => s.trim() !== '');
    
    return (
        <div className="text-sm text-gray-300 space-y-3 prose prose-invert prose-sm max-w-none">
            {sections.map((section, index) => {
                if (index % 2 === 0) {
                    const title = section.replace(/:/g, '').trim();
                    const content = sections[index + 1] || '';
                    return (
                        <div key={index}>
                            <h4 className="font-semibold text-cyan-400 text-base mb-1">{title}</h4>
                            <p className="text-gray-400 whitespace-pre-wrap">{content.trim()}</p>
                        </div>
                    );
                }
                return null;
            })}
        </div>
    );
};

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
    symbol,
    isLoading,
    result,
    mtfData,
    onRunAnalysis,
    onClose,
}) => {
    const { t } = useLanguage();

    return (
        <aside className="w-96 flex-shrink-0 bg-gray-800/60 rounded-lg border border-gray-700 flex flex-col overflow-hidden animate-fade-in-right">
            <header className="p-3 flex items-center justify-between border-b border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <BrainIcon className="w-5 h-5 text-cyan-400" />
                    <h3 className="font-semibold text-gray-200">{t('aiAnalysisTitle')}</h3>
                </div>
                <button onClick={onClose} aria-label="Close panel" className="text-gray-500 hover:text-white">
                    <CloseIcon className="w-5 h-5" />
                </button>
            </header>

            <div className="flex-grow p-4 overflow-y-auto space-y-4">
                {mtfData && <MultiTimeframeView data={mtfData} />}
                
                <div className="mt-auto">
                     {isLoading && !result && <LoadingSpinner />}
                     {result && <FormattedAnalysisResult text={result} />}
                </div>
            </div>
            
            <div className="p-3 border-t border-gray-700 flex-shrink-0">
                <button 
                    onClick={onRunAnalysis}
                    disabled={isLoading}
                    className="w-full bg-cyan-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-cyan-500 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-white rounded-full animate-spin"></div>
                            {t('analyzing')}
                        </>
                    ) : (
                        t('runAnalysis')
                    )}
                </button>
            </div>
        </aside>
    );
};
