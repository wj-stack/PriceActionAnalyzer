
import React, { useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { OpenPosition, Candle } from '../types';
import { PlayIcon } from './icons/PlayIcon';
import { PauseIcon } from './icons/PauseIcon';
import { StopIcon } from './icons/StopIcon';

interface SimulationPanelProps {
    isSimulating: boolean;
    equity: number;
    openPosition: OpenPosition | null;
    simulationSpeed: number;
    setSimulationSpeed: (speed: number) => void;
    onStart: () => void;
    onPause: () => void;
    onReset: () => void;
}

const StatDisplay: React.FC<{ label: string; value: string; valueColor?: string }> = ({ label, value, valueColor = 'text-gray-100' }) => (
    <div>
        <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
        <p className={`text-lg font-semibold font-mono ${valueColor}`}>{value}</p>
    </div>
);

export const SimulationPanel: React.FC<SimulationPanelProps> = ({
    isSimulating,
    equity,
    openPosition,
    simulationSpeed,
    setSimulationSpeed,
    onStart,
    onPause,
    onReset,
}) => {
    const { t } = useLanguage();

    const unrealizedPnl = useMemo(() => {
        if (!openPosition) return { pnl: 0, pnlPercentage: 0 };
        // Note: In a real scenario, you'd use the *current* price.
        // Since we don't pass the current candle here, this is a simplified view.
        // A more advanced version could update this in the App.tsx loop.
        const currentPrice = openPosition.entryPrice; // Placeholder
        const pnl = openPosition.type === 'LONG'
            ? (currentPrice - openPosition.entryPrice) * openPosition.size
            : (openPosition.entryPrice - currentPrice) * openPosition.size;
        const pnlPercentage = (pnl / (openPosition.entryPrice * openPosition.size)) * 100;
        return { pnl, pnlPercentage };
    }, [openPosition]);

    const pnlColor = unrealizedPnl.pnl >= 0 ? 'text-green-400' : 'text-red-400';

    return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-2xl border border-gray-700">
            <h3 className="text-lg font-bold text-cyan-400 mb-4 border-b border-gray-700 pb-2">{t('simulationPanelTitle')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Column 1: Controls */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <button onClick={isSimulating ? onPause : onStart} className="p-3 bg-cyan-600 text-white rounded-md hover:bg-cyan-500 transition-colors flex-grow flex items-center justify-center gap-2">
                            {isSimulating ? <><PauseIcon className="w-5 h-5" /> {t('pauseSimulation')}</> : <><PlayIcon className="w-5 h-5" /> {t('startSimulation')}</>}
                        </button>
                        <button onClick={onReset} className="p-3 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition-colors">
                            <StopIcon className="w-5 h-5" />
                        </button>
                    </div>
                    <div>
                        <label htmlFor="speed-slider" className="block text-sm text-gray-400 mb-1">{t('simulationSpeed')}</label>
                        <input
                            id="speed-slider"
                            type="range"
                            min="50"
                            max="2000"
                            step="50"
                            value={simulationSpeed}
                            onChange={(e) => setSimulationSpeed(2050 - parseInt(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                </div>

                {/* Column 2: Equity & P/L */}
                <div className="bg-gray-900/50 p-4 rounded-md flex flex-col justify-center gap-4">
                    <StatDisplay label={t('equity')} value={`$${equity.toFixed(2)}`} />
                    {openPosition && (
                         <StatDisplay 
                            label={t('unrealizedPnl')} 
                            value={`${unrealizedPnl.pnl.toFixed(2)} (${unrealizedPnl.pnlPercentage.toFixed(2)}%)`} 
                            valueColor={pnlColor}
                         />
                    )}
                </div>

                {/* Column 3: Position Details */}
                <div className="bg-gray-900/50 p-4 rounded-md">
                     <h4 className="text-sm text-gray-400 uppercase tracking-wider mb-2">{t('openPosition')}</h4>
                     {openPosition ? (
                        <div className="space-y-2">
                            <div className={`text-lg font-bold ${openPosition.type === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>{openPosition.type}</div>
                            <div className="text-xs grid grid-cols-2 gap-1">
                                <span className="text-gray-400">{t('entry')}:</span>
                                <span className="font-mono">{openPosition.entryPrice.toFixed(4)}</span>
                                <span className="text-gray-400">{t('size')}:</span>
                                <span className="font-mono">{openPosition.size.toFixed(4)}</span>
                            </div>
                        </div>
                     ) : (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-gray-500">{t('noOpenPosition')}</p>
                        </div>
                     )}
                </div>
            </div>
        </div>
    );
};
