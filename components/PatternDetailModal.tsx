

import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { InfoIcon } from './icons/InfoIcon';
import { ALL_PATTERNS } from '../constants';

interface PatternDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    patternName: string | null;
}

const PatternDetailModalComponent: React.FC<PatternDetailModalProps> = ({ isOpen, onClose, patternName }) => {
    const { t } = useLanguage();
    if (!isOpen || !patternName) return null;

    const patternInfo = ALL_PATTERNS.find(p => p.name === patternName);

    const ruleKeys = ['rule1', 'rule2', 'rule3', 'rule4', 'rule5'];
    const rules = ruleKeys
        .map(key => t(`calc_${patternName}_${key}`))
        .filter(rule => !rule.startsWith('calc_')); // Filter out untranslated keys

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <InfoIcon className="w-6 h-6 text-cyan-400" />
                        <h2 className="text-lg font-bold text-gray-100">{t('patternDetailsTitle')}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <main className="p-6 overflow-y-auto">
                    <h3 className="text-xl font-semibold text-cyan-400 mb-2">{patternInfo ? t(patternInfo.labelKey) : ''}</h3>
                    <p className="text-gray-300 mb-4 italic">{t(`calc_${patternName}_desc`)}</p>
                    
                    <ul className="space-y-2 list-inside text-gray-300">
                        {rules.map((rule, index) => (
                            <li key={index} className="p-2 bg-gray-900/50 rounded-md border-l-4 border-cyan-500/50">
                                {rule}
                            </li>
                        ))}
                    </ul>
                </main>
            </div>
        </div>
    );
};

export const PatternDetailModal = React.memo(PatternDetailModalComponent);