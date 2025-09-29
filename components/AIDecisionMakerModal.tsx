

import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTradingDecision } from '../services/aiService';
import type { Candle, MarketType, RiskAppetite, AIDecision, MultiTimeframeData } from '../types';
import { BrainIcon } from './icons/BrainIcon';
import { TIMEFRAMES } from '../constants';
import { fetchKlines } from '../services/binanceService';
import { analyzeCandles } from '../services/patternRecognizer';

interface AIDecisionMakerModalProps {
    isOpen: boolean;
    onClose: () => void;
    candles: Candle[];
    symbol: string;
    timeframe: string;
}

const DecisionDisplay: React.FC<{ result: AIDecision, t: (key: string) => string }> = ({ result, t }) => {
    const decisionColorClasses = {
        'LONG': 'bg-green-500/20 text-green-300 border-green-500/50',
        'SHORT': 'bg-red-500/20 text-red-300 border-red-500/50',
        'WAIT': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
    };

    const confidenceMeterColor = (score: number) => {
        if (score <= 3) return 'bg-red-500';
        if (score <= 7) return 'bg-yellow-500';
        return 'bg-green-500';
    }

    if (result.decision === 'WAIT') {
        return (
            <div className="space-y-4">
                <div className={`p-4 rounded-lg text-center ${decisionColorClasses.WAIT}`}>
                    <h3 className="text-2xl font-bold">{result.decision}</h3>
                    <p className="text-sm">{t('waitMessage')}</p>
                </div>
                <div>
                    <h4 className="font-semibold text-cyan-400 mb-1">{t('reasoning')}</h4>
                    <p className="text-sm text-gray-300 bg-gray-900/50 p-3 rounded-md">{result.reasoning}</p>
                </div>
                 <div>
                    <h4 className="font-semibold text-cyan-400 mb-1">{t('riskWarning')}</h4>
                    <p className="text-sm text-yellow-400 bg-yellow-900/30 p-3 rounded-md">{result.riskWarning}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                 <div className={`p-3 rounded-lg text-center ${decisionColorClasses[result.decision]}`}>
                    <p className="text-xs uppercase tracking-wider">{t('decision')}</p>
                    <p className="text-3xl font-bold">{result.decision}</p>
                </div>
                <div className="bg-gray-900/50 p-3 rounded-lg text-center">
                    <p className="text-xs uppercase tracking-wider">{t('confidence')}</p>
                    <div className="flex items-center justify-center gap-2 mt-2">
                        <p className="text-3xl font-bold">{result.confidenceScore}<span className="text-base text-gray-400">/10</span></p>
                        <div className="w-full bg-gray-700 rounded-full h-2.5">
                            <div className={`${confidenceMeterColor(result.confidenceScore)} h-2.5 rounded-full`} style={{ width: `${result.confidenceScore * 10}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
                <div className="bg-gray-900/50 p-2 rounded-md">
                    <p className="text-xs text-gray-400">{t('entryPrice')}</p>
                    <p className="font-semibold">{result.entryPrice}</p>
                </div>
                <div className="bg-gray-900/50 p-2 rounded-md">
                    <p className="text-xs text-gray-400">{t('stopLossPrice')}</p>
                    <p className="font-semibold text-red-400">{result.stopLoss.toFixed(4)}</p>
                </div>
                <div className="bg-gray-900/50 p-2 rounded-md">
                    <p className="text-xs text-gray-400">{t('takeProfitTargets')}</p>
                    <p className="font-semibold text-green-400">{result.takeProfitLevels.map(p => p.toFixed(4)).join(' / ')}</p>
                </div>
            </div>
            <div>
                <h4 className="font-semibold text-cyan-400 mb-1">{t('reasoning')}</h4>
                <p className="text-sm text-gray-300 bg-gray-900/50 p-3 rounded-md">{result.reasoning}</p>
            </div>
             <div>
                <h4 className="font-semibold text-cyan-400 mb-1">{t('riskWarning')}</h4>
                <p className="text-sm text-yellow-400 bg-yellow-900/30 p-3 rounded-md">{result.riskWarning}</p>
            </div>
        </div>
    )
}

const FUTURES_TIMEFRAMES = ['5m', '15m', '30m', '1h'];

const AIDecisionMakerModalComponent: React.FC<AIDecisionMakerModalProps> = ({ isOpen, onClose, candles, symbol, timeframe }) => {
    const { t, locale } = useLanguage();
    const [marketType, setMarketType] = useState<MarketType>('SPOT');
    const [riskAppetite, setRiskAppetite] = useState<RiskAppetite>('MEDIUM');
    const [positionSize, setPositionSize] = useState<number>(1000);
    const [leverage, setLeverage] = useState<number>(10);
    const [futuresTimeframe, setFuturesTimeframe] = useState<string>('15m');
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aiDecision, setAiDecision] = useState<AIDecision | null>(null);
    
    const handleGetAdvice = async () => {
        setIsLoading(true);
        setError(null);
        setAiDecision(null);
        try {
            let timeframesToAnalyzeConfigs: { tf: string; isPrimary: boolean }[];

            if (marketType === 'FUTURES') {
                const futuresContextMap: { [key: string]: [string, string, string] } = {
                    '5m': ['15m', '5m', '1m'],
                    '15m': ['1h', '15m', '5m'],
                    '30m': ['2h', '30m', '15m'],
                    '1h': ['4h', '1h', '15m'],
                };
                const [higher, primary, lower] = futuresContextMap[futuresTimeframe];
                timeframesToAnalyzeConfigs = [
                    { tf: higher, isPrimary: false },
                    { tf: primary, isPrimary: true },
                    { tf: lower, isPrimary: false },
                ];
            } else { // SPOT logic
                const primaryTimeframeIndex = TIMEFRAMES.findIndex(tf => tf.value === timeframe);
                timeframesToAnalyzeConfigs = [{ tf: timeframe, isPrimary: true }];
                // Get one higher timeframe for trend context
                if (primaryTimeframeIndex < TIMEFRAMES.length - 1) {
                    timeframesToAnalyzeConfigs.push({ tf: TIMEFRAMES[primaryTimeframeIndex + 1].value, isPrimary: false });
                }
                // Get one lower timeframe for entry precision, unshift to keep order from high to low for prompt
                if (primaryTimeframeIndex > 0) {
                    timeframesToAnalyzeConfigs.unshift({ tf: TIMEFRAMES[primaryTimeframeIndex - 1].value, isPrimary: false });
                }
            }
            
            const multiTimeframeDataPromises = timeframesToAnalyzeConfigs.map(async ({ tf, isPrimary }) => {
                // For SPOT mode, if it's the primary timeframe, we use the candles already loaded in the app.
                if (marketType === 'SPOT' && isPrimary) {
                    // FIX: Destructure patterns from analyzeCandles result to match MultiTimeframeData type.
                    const { patterns } = analyzeCandles(candles);
                    return { timeframe: tf, candles, patterns, isPrimary };
                }
                
                // For FUTURES mode (all TFs) or contextual TFs in SPOT mode, fetch fresh data.
                const fetchedCandles = await fetchKlines(symbol, tf, 200);
                // FIX: Destructure patterns from analyzeCandles result to match MultiTimeframeData type.
                const { patterns } = analyzeCandles(fetchedCandles);
                return { timeframe: tf, candles: fetchedCandles, patterns, isPrimary };
            });
    
            const multiTimeframeData: MultiTimeframeData[] = await Promise.all(multiTimeframeDataPromises);
            
            const decision = await getTradingDecision(
                multiTimeframeData, 
                symbol, 
                marketType, 
                riskAppetite, 
                positionSize, 
                marketType === 'SPOT' ? 1 : leverage, 
                locale
            );
            setAiDecision(decision);
        } catch (err) {
            setError(t('aiDecisionError'));
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };
    
    if (!isOpen) return null;

    return (
         <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center backdrop-blur-sm p-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <BrainIcon className="w-6 h-6 text-cyan-400" />
                        <h2 className="text-lg font-bold text-gray-100">{t('aiDecisionMakerTitle')}</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>

                <main className="p-6 overflow-y-auto space-y-6">
                    {/* --- CONTROLS --- */}
                    <div className="space-y-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">{t('marketType')}</label>
                            <div className="flex gap-2">
                                {(['SPOT', 'FUTURES'] as MarketType[]).map(type => (
                                    <button key={type} onClick={() => setMarketType(type)} className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-colors ${marketType === type ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>{t(type.toLowerCase())}</button>
                                ))}
                            </div>
                        </div>

                        {marketType === 'FUTURES' && (
                             <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">{t('analysisTimeframe')}</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {FUTURES_TIMEFRAMES.map(tf => (
                                        <button key={tf} onClick={() => setFuturesTimeframe(tf)} className={`py-2 px-2 rounded-md text-sm font-semibold transition-colors ${futuresTimeframe === tf ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>{tf}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">{t('riskAppetite')}</label>
                            <div className="flex gap-2">
                                {(['LOW', 'MEDIUM', 'HIGH'] as RiskAppetite[]).map(risk => (
                                    <button key={risk} onClick={() => setRiskAppetite(risk)} className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-colors ${riskAppetite === risk ? 'bg-cyan-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>{t(risk.toLowerCase())}</button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div>
                                <label htmlFor="position-size" className="block text-sm font-medium text-gray-300 mb-1">{t('positionSize')}</label>
                                <input type="number" id="position-size" value={positionSize} onChange={e => setPositionSize(Number(e.target.value))} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-gray-200 focus:ring-cyan-500 focus:border-cyan-500" />
                            </div>
                             {marketType === 'FUTURES' && (
                                <div>
                                    <label htmlFor="leverage" className="block text-sm font-medium text-gray-300 mb-1">{t('leverage')} ({leverage}x)</label>
                                    <input type="range" id="leverage" min="1" max="125" step="1" value={leverage} onChange={e => setLeverage(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg" />
                                </div>
                             )}
                        </div>
                    </div>
                    
                    <div>
                        <button onClick={handleGetAdvice} disabled={isLoading || (marketType === 'SPOT' && candles.length < 50)} className="w-full py-3 px-4 rounded-lg bg-cyan-600 text-white font-bold hover:bg-cyan-500 transition-all disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                            {isLoading ? t('analyzing') : t('getAdvice')}
                        </button>
                        {(marketType === 'SPOT' && candles.length < 50) && <p className="text-xs text-yellow-400 text-center mt-2">Insufficient data for analysis.</p>}
                    </div>

                    <hr className="border-gray-700" />
                    
                    {/* --- RESULTS --- */}
                    <div>
                        {isLoading && (
                            <div className="flex flex-col items-center justify-center h-48">
                                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500 mb-4"></div>
                                <p className="text-gray-400">{t('analyzing')}</p>
                            </div>
                        )}
                        {error && (
                            <div className="text-center text-red-400 p-4 bg-red-500/10 border border-red-500/30 rounded-md">
                                <p>{error}</p>
                            </div>
                        )}
                        {aiDecision && !isLoading && <DecisionDisplay result={aiDecision} t={t}/>}
                    </div>

                </main>
                <footer className="p-3 bg-gray-900/50 text-center text-xs text-gray-500 border-t border-gray-700 flex-shrink-0">
                    {t('aiDisclaimer')}
                </footer>
            </div>
        </div>
    );
};

export const AIDecisionMakerModal = React.memo(AIDecisionMakerModalComponent);