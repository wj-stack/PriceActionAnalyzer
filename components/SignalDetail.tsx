
import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { ALL_PATTERNS } from '../constants';

interface SignalDetailProps {
    patternName: string;
}

export const SignalDetail: React.FC<SignalDetailProps> = ({ patternName }) => {
    const { t } = useLanguage();

    const patternInfo = ALL_PATTERNS.find(p => p.name === patternName);

    const ruleKeys = ['rule1', 'rule2', 'rule3', 'rule4', 'rule5'];
    const rules = ruleKeys
        .map(key => t(`calc_${patternName}_${key}`))
        .filter(rule => !rule.startsWith('calc_')); // Filter out untranslated keys

    const strengthFactors = ['location', 'volume', 'shape', 'context', 'opposition']
        .map(key => t(`strengthFactor_${key}`))
        .filter(factor => !factor.startsWith('strengthFactor_'));

    if (!patternInfo) return null;

    return (
        <div className="mt-2 p-3 bg-gray-900/50 rounded-md border-l-4 border-cyan-700 text-sm space-y-4">
            {/* Pattern Calculation */}
            <div>
                <p className="text-gray-400 mb-3 italic">{t(`calc_${patternName}_desc`)}</p>
                <ul className="space-y-1.5 list-inside text-gray-300">
                    {rules.map((rule, index) => (
                        <li key={index} className="flex items-start">
                             <span className="text-cyan-400 font-bold mr-2">›</span>
                             <span>{rule}</span>
                        </li>
                    ))}
                </ul>
            </div>

            <hr className="border-gray-700/50" />

            {/* Strength Score Calculation */}
            <div>
                <h4 className="font-semibold text-gray-200 mb-2">{t('strengthScoreCalculationTitle')}</h4>
                <p className="text-gray-400 mb-3 italic">{t('strengthScoreCalculationDesc')}</p>
                 <ul className="space-y-1.5 list-inside text-gray-300">
                    {strengthFactors.map((factor, index) => (
                         <li key={index} className="flex items-start">
                             <span className="text-cyan-400 font-bold mr-2">›</span>
                             <span>{factor}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};