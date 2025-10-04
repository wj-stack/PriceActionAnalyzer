

import React, { useState } from 'react';
import type { BacktestSettings, BacktestStrategy } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { PlayIcon } from './icons/PlayIcon';

interface BacktestSettingsPanelProps {
    onRunBacktest: (settings: BacktestSettings) => void;
    isLoading: boolean;
}

export const defaultSettings: BacktestSettings = {
    strategy: 'MTF_BUFF',
    initialCapital: 1000,
    commissionRate: 0.1,
    leverage: 10,
    riskPerTradePercent: 10,
    minRiskReward: 2,
    followHtfTrend: true,
    allowRangeTrading: true,

    // Layer 1
    srWeight: 1,
    macdWeight: 0.5,
    fibWeight: 0.5,
    zoneScoreThreshold: 2,
    useMacdDivergence: true,

    // Layer 2
    useSMC: true,
    useCHOCH: true,
    usePinbar: true,

    // Shared Indicators
    atrPeriod: 14,
    atrMultiplier: 2,
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <details className="border-b border-gray-700/60 pb-4" open>
        <summary className="text-sm font-semibold text-gray-300 mb-3 cursor-pointer select-none">{title}</summary>
        <div className="space-y-3 pl-2">{children}</div>
    </details>
);

const NumberInput: React.FC<{ label: string; value: number; onChange: (val: number) => void; step?: number; min?: number; disabled?: boolean; }> = ({ label, value, onChange, step = 0.1, min = 0, disabled = false }) => (
    <label className="grid grid-cols-2 items-center gap-2">
        <span className={`text-sm ${disabled ? 'text-gray-500' : 'text-gray-400'}`}>{label}</span>
        <input 
            type="number"
            value={value}
            onChange={e => onChange(parseFloat(e.target.value))}
            step={step}
            min={min}
            disabled={disabled}
            className="w-full bg-gray-900 border border-gray-600 rounded-md px-2 py-1 text-sm text-right disabled:opacity-50"
        />
    </label>
);

const SliderInput: React.FC<{ label: string; value: number; onChange: (val: number) => void; disabled?: boolean }> = ({ label, value, onChange, disabled }) => (
    <label className="grid grid-cols-2 items-center gap-2">
        <span className={`text-sm ${disabled ? 'text-gray-500' : 'text-gray-400'}`}>{label}</span>
        <div className="flex items-center gap-2">
            <input 
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                disabled={disabled}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
            />
            <span className={`text-sm font-mono ${disabled ? 'text-gray-500' : 'text-gray-200'}`}>{value.toFixed(1)}</span>
        </div>
    </label>
);

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (val: boolean) => void; disabled?: boolean }> = ({ label, checked, onChange, disabled }) => (
    <label className="flex items-center justify-between">
        <span className={`text-sm ${disabled ? 'text-gray-500' : 'text-gray-400'}`}>{label}</span>
        <div className={`relative inline-flex items-center h-6 rounded-full w-11 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} className="sr-only" />
            <div className={`w-11 h-6 rounded-full ${checked ? 'bg-cyan-600' : 'bg-gray-600'}`}></div>
            <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${checked ? 'transform translate-x-5' : ''}`}></div>
        </div>
    </label>
);


export const BacktestSettingsPanel: React.FC<BacktestSettingsPanelProps> = ({ onRunBacktest, isLoading }) => {
    const { t } = useLanguage();
    const [settings, setSettings] = useState<BacktestSettings>(defaultSettings);

    const handleSettingChange = (key: keyof BacktestSettings, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };
    
    const handleRunClick = () => {
        onRunBacktest(settings);
    };

    return (
        <div className="p-4 space-y-4">
            <Section title={t('strategy')}>
                <select
                    value={settings.strategy}
                    onChange={e => handleSettingChange('strategy', e.target.value as BacktestStrategy)}
                    className="w-full bg-gray-900 border border-gray-600 rounded-md px-2 py-1.5 text-sm"
                >
                    <option value="MTF_BUFF">{t('strategy-MTF_BUFF')}</option>
                </select>
                <Toggle label={t('followHtfTrend')} checked={settings.followHtfTrend} onChange={v => handleSettingChange('followHtfTrend', v)} />
                <Toggle label={t('allowRangeTrading')} checked={settings.allowRangeTrading} onChange={v => handleSettingChange('allowRangeTrading', v)} />
            </Section>

            <Section title={t('backtestSettings')}>
                <NumberInput label={t('initialCapital')} value={settings.initialCapital} onChange={v => handleSettingChange('initialCapital', v)} step={1000} />
                <NumberInput label={t('commission')} value={settings.commissionRate} onChange={v => handleSettingChange('commissionRate', v)} step={0.01} />
                <NumberInput label={t('leverage')} value={settings.leverage} onChange={v => handleSettingChange('leverage', v)} step={1} min={1} />
                <NumberInput label={t('riskPerTrade')} value={settings.riskPerTradePercent} onChange={v => handleSettingChange('riskPerTradePercent', v)} step={0.1} />
                <NumberInput label={t('riskReward')} value={settings.minRiskReward} onChange={v => handleSettingChange('minRiskReward', v)} step={0.1} />
            </Section>

            <Section title={t('htfZoneIdentification')}>
                <h5 className="text-xs font-bold text-gray-500 uppercase">{t('confluenceFactors')}</h5>
                <SliderInput label={t('supportResistance')} value={settings.srWeight} onChange={v => handleSettingChange('srWeight', v)} />
                <SliderInput label={t('macd')} value={settings.macdWeight} onChange={v => handleSettingChange('macdWeight', v)} />
                <SliderInput label={t('fibonacci')} value={settings.fibWeight} onChange={v => handleSettingChange('fibWeight', v)} />
                 <NumberInput label={t('zoneScoreThreshold')} value={settings.zoneScoreThreshold} onChange={v => handleSettingChange('zoneScoreThreshold', v)} step={1} />
                <hr className="border-gray-700 my-2" />
                <Toggle label={t('macdDivergence')} checked={settings.useMacdDivergence} onChange={v => handleSettingChange('useMacdDivergence', v)} />
            </Section>
            
            <Section title={t('ltfEntryEngine')}>
                <h5 className="text-xs font-bold text-gray-500 uppercase">{t('entryModels')}</h5>
                <Toggle label={t('smcModel')} checked={settings.useSMC} onChange={v => handleSettingChange('useSMC', v)} />
                <Toggle label={t('chochModel')} checked={settings.useCHOCH} onChange={v => handleSettingChange('useCHOCH', v)} />
                <Toggle label={t('pinbarModel')} checked={settings.usePinbar} onChange={v => handleSettingChange('usePinbar', v)} />
            </Section>

            <Section title={t('stopLossSettings')}>
                <NumberInput label={t('atrPeriod')} value={settings.atrPeriod} onChange={v => handleSettingChange('atrPeriod', v)} step={1} />
                <NumberInput label={t('atrMultiplier')} value={settings.atrMultiplier} onChange={v => handleSettingChange('atrMultiplier', v)} step={0.1} />
            </Section>

            <div className="pt-4">
                <button
                    onClick={handleRunClick}
                    disabled={isLoading}
                    className="w-full bg-cyan-600 text-white font-semibold py-2.5 px-4 rounded-md hover:bg-cyan-500 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <div className="w-5 h-5 border-2 border-gray-400 border-t-white rounded-full animate-spin"></div>
                            {t('runningBacktest')}
                        </>
                    ) : (
                        <>
                           <PlayIcon className="w-5 h-5" />
                           {t('runBacktest')}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};