

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Bar, ReferenceLine, Line, Cell } from 'recharts';
// FIX: Add missing imports for backtest visualization props.
import type { Candle, IndicatorData, PriceAlert, DetectedPattern, TrendPoint, TrendLine } from '../types';
import { TradeLogEvent } from '../services/backtestService';
import { ZoomInIcon } from './icons/ZoomInIcon';
import { ZoomOutIcon } from './icons/ZoomOutIcon';
import { ChevronLeftIcon } from './icons/ChevronLeftIcon';
import { ChevronRightIcon } from './icons/ChevronRightIcon';
import { ExpandIcon } from './icons/ExpandIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { CloseIcon } from './icons/CloseIcon';

interface PriceChartProps {
    data: Candle[];
    isHistorical: boolean;
    indicatorData: IndicatorData;
    focusedTime?: number | null;
    // FIX: Add props for backtest visualization to resolve type error in BacktestModal.
    swingHighs?: TrendPoint[];
    swingLows?: TrendPoint[];
    trendlines?: TrendLine[];
    showSwingLines?: boolean;
    showTrendlines?: boolean;
    patterns?: DetectedPattern[];
    tradeLog?: TradeLogEvent[];
    executedTradePatternIndices?: Set<number>;
    skippedTradePatternIndices?: Set<number>;
}

const CustomCandlestick = (props: any) => {
    const { x, y, width, height, payload } = props;
    if (!payload) return null;
    const { open, close, high, low, isBullish } = payload;

    const fill = isBullish ? '#10B981' : '#EF4444';
    const stroke = fill;

    const getY = (price: number): number => {
        if (high === low) return y + height / 2;
        return y + ((high - price) / (high - low)) * height;
    };

    const bodyYValue = getY(Math.max(open, close));
    const bodyHeightValue = Math.abs(getY(close) - getY(open));
    
    const finalBodyHeight = Math.max(1, bodyHeightValue);
    const wickCenterX = x + width / 2;

    return (
        <g>
            {/* Wick */}
            <line x1={wickCenterX} y1={y} x2={wickCenterX} y2={y + height} stroke={stroke} strokeWidth={1} />
            {/* Body */}
            <rect x={x} y={bodyYValue} width={width} height={finalBodyHeight} fill={fill} />
        </g>
    );
};

const CustomTooltip = ({ active, payload, label, t, formatPrice }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;

    return (
      <div className="bg-gray-700/80 backdrop-blur-sm p-3 border border-gray-600 rounded-md shadow-lg text-sm">
        <p className="label text-gray-300">{new Date(data.time * 1000).toLocaleString()}</p>
        <p className={`text-${data.isBullish ? 'green' : 'red'}-400`}>
            <span className="font-bold">{t('tooltipOpen')}:</span> {formatPrice(data.open)} <span className="font-bold ml-2">{t('tooltipHigh')}:</span> {formatPrice(data.high)}
        </p>
         <p className={`text-${data.isBullish ? 'green' : 'red'}-400`}>
            <span className="font-bold">{t('tooltipLow')}:</span> {formatPrice(data.low)} <span className="font-bold ml-2">{t('tooltipClose')}:</span> {formatPrice(data.close)}
        </p>
        <p className="text-gray-400"><span className="font-bold">{t('tooltipVolume')}:</span> {data.volume.toFixed(2)}</p>
        {data.ema20 && <p className="text-cyan-400">EMA(20): {formatPrice(data.ema20)}</p>}
        {data.ema24 && <p className="text-yellow-400">EMA(24): {formatPrice(data.ema24)}</p>}
        {data.ema52 && <p className="text-pink-400">EMA(52): {formatPrice(data.ema52)}</p>}
        {data.rsi14 && <p className="text-purple-400">RSI(14): {data.rsi14.toFixed(2)}</p>}
        {data.macd && (
            <>
                <p className="text-indigo-400">MACD: {data.macd.macd?.toFixed(4)}</p>
                <p className="text-orange-400">Signal: {data.macd.signal?.toFixed(4)}</p>
                <p className={data.macd.histogram >= 0 ? "text-green-400" : "text-red-400"}>Hist: {data.macd.histogram?.toFixed(4)}</p>
            </>
        )}
      </div>
    );
  }
  return null;
};

const PriceChartComponent: React.FC<PriceChartProps> = ({ data, isHistorical, indicatorData, focusedTime }) => {
    const { t } = useLanguage();
    const [range, setRange] = useState({ start: 0, end: data.length });
    const prevDataRef = useRef<Candle[] | null>(null);
    const [mousePrice, setMousePrice] = useState<number | null>(null);

    useEffect(() => {
        const prevData = prevDataRef.current;
        const isFullReload = !prevData || data.length === 0 || prevData.length === 0 || prevData[0].time !== data[0].time;
        if (isFullReload) {
            setRange({ start: Math.max(0, data.length - 200), end: data.length });
        } else {
            const wasAtTheEnd = range.end === prevData.length;
            if (wasAtTheEnd && !isHistorical) {
                setRange(currentRange => {
                    const numVisibleCandles = currentRange.end - currentRange.start;
                    const newEnd = data.length;
                    const newStart = Math.max(0, newEnd - numVisibleCandles);
                    return { start: newStart, end: newEnd };
                });
            }
        }
        prevDataRef.current = data;
    }, [data, isHistorical]);

    useEffect(() => {
        if (focusedTime && data.length > 0) {
            const targetIndex = data.findIndex(d => d.time >= focusedTime);
            if (targetIndex !== -1) {
                const currentSpan = range.end - range.start;
                const halfSpan = Math.floor(currentSpan / 2);
                let newStart = targetIndex - halfSpan;
                let newEnd = targetIndex + halfSpan;

                if (newStart < 0) {
                    newStart = 0;
                    newEnd = Math.min(data.length, currentSpan);
                }
                if (newEnd > data.length) {
                    newEnd = data.length;
                    newStart = Math.max(0, newEnd - currentSpan);
                }
                setRange({ start: newStart, end: newEnd });
            }
        }
    }, [focusedTime, data]);


    const combinedData = useMemo(() => {
        return data.map((candle, index) => ({
            ...candle,
            wick: [candle.low, candle.high],
            ema20: indicatorData.ema20?.[index] ?? null,
            ema24: indicatorData.ema24?.[index] ?? null,
            ema52: indicatorData.ema52?.[index] ?? null,
            bb20: indicatorData.bb20?.[index] ?? null,
            rsi14: indicatorData.rsi14?.[index] ?? null,
            macd: indicatorData.macd?.[index] ?? null,
        }));
    }, [data, indicatorData]);

    const visibleData = useMemo(() => combinedData.slice(range.start, range.end), [combinedData, range]);
    
    const { hasRsi, hasMacd, mainChartHeight, subChartHeight } = useMemo(() => {
        const hasRsi = indicatorData.rsi14 && indicatorData.rsi14.some(d => d !== null);
        const hasMacd = indicatorData.macd && indicatorData.macd.some(d => d !== null);
        const subChartCount = (hasRsi ? 1 : 0) + (hasMacd ? 1 : 0);
        let mainChartHeight = '100%';
        let subChartHeight = '0%';
        if (subChartCount === 1) {
            mainChartHeight = '70%';
            subChartHeight = '30%';
        } else if (subChartCount === 2) {
            mainChartHeight = '60%';
            subChartHeight = '20%';
        }
        return { hasRsi, hasMacd, mainChartHeight, subChartHeight };
    }, [indicatorData]);


    const { yDomain } = useMemo(() => {
        if (visibleData.length === 0) return { yDomain: [0, 1] as [number, number] };
        const prices = visibleData.flatMap(d => [d.low, d.high]);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;
        const offset = priceRange * 0.1 || 1;
        return { yDomain: [minPrice - offset, maxPrice + offset] as [number, number] };
    }, [visibleData]);

    const formatPrice = useCallback((price: number): string => {
        if (typeof price !== 'number' || isNaN(price)) return '';
        if (price >= 100) return price.toFixed(2);
        if (price >= 0.1) return price.toFixed(4);
        if (price >= 0.001) return price.toFixed(6);
        return price.toFixed(8);
    }, []);

    const handleZoom = (factor: number) => {
        const middleIndex = Math.floor((range.start + range.end) / 2);
        const currentSpan = range.end - range.start;
        const newSpan = Math.max(20, Math.floor(currentSpan * factor));
        let newStart = middleIndex - Math.floor(newSpan / 2);
        let newEnd = newStart + newSpan;
        if (newStart < 0) { newStart = 0; newEnd = Math.min(data.length, newSpan); }
        if (newEnd > data.length) { newEnd = data.length; newStart = Math.max(0, newEnd - newSpan); }
        setRange({ start: newStart, end: newEnd });
    };

    const handlePan = (direction: 'left' | 'right') => {
        const panAmount = Math.floor((range.end - range.start) * 0.2);
        const move = direction === 'left' ? -panAmount : panAmount;
        let newStart = range.start + move;
        let newEnd = range.end + move;
        if (newStart < 0) { newStart = 0; newEnd = range.end - range.start; }
        if (newEnd > data.length) { newEnd = data.length; newStart = newEnd - (range.end - range.start); }
        setRange({ start: newStart, end: newEnd });
    };

    const handleReset = () => setRange({ start: Math.max(0, data.length - 200), end: data.length });
    const handleMouseMove = (e: any) => { if (e?.chartY && e.yAxisMap) { const yAxisKey = Object.keys(e.yAxisMap)[0]; if(e.yAxisMap[yAxisKey]) setMousePrice(e.yAxisMap[yAxisKey].scale.invert(e.chartY)); } };
    const handleMouseLeave = () => setMousePrice(null);
    
    const tickFormatter = useCallback((time: number) => new Date(time * 1000).toLocaleString(), []);
    const isZoomedIn = range.start > 0 || range.end < data.length;
    const canPanLeft = range.start > 0;
    const canPanRight = range.end < data.length;
    const canZoomIn = range.end - range.start > 20;
    const latestPrice = data.length > 0 ? data[data.length - 1].close : null;

    if (!data || data.length === 0) {
        return <div className="h-[600px] flex items-center justify-center text-gray-500">{t('noData')}</div>;
    }

    return (
        <div className="relative" style={{ width: '100%', height: '100%', cursor: 'default' }}>
             <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-gray-800/50 backdrop-blur-sm p-1 rounded-md border border-gray-700">
                <button title={t('panLeft')} onClick={() => handlePan('left')} disabled={!canPanLeft} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ChevronLeftIcon className="w-5 h-5" /></button>
                <button title={t('panRight')} onClick={() => handlePan('right')} disabled={!canPanRight} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ChevronRightIcon className="w-5 h-5" /></button>
                <button title={t('zoomIn')} onClick={() => handleZoom(0.8)} disabled={!canZoomIn} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ZoomInIcon className="w-5 h-5" /></button>
                <button title={t('zoomOut')} onClick={() => handleZoom(1.2)} disabled={range.end-range.start >= data.length} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ZoomOutIcon className="w-5 h-5" /></button>
                <button title={t('resetZoom')} onClick={handleReset} disabled={!isZoomedIn} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ExpandIcon className="w-5 h-5" /></button>
            </div>
            <ResponsiveContainer height={mainChartHeight}>
                <ComposedChart data={visibleData} margin={{ top: 20, right: 20, bottom: 0, left: 20 }} syncId="priceSync" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                    <XAxis dataKey="time" tickFormatter={tickFormatter} stroke="#9CA3AF" minTickGap={80} interval="preserveStartEnd" domain={['dataMin', 'dataMax']} type="number" scale="time" tick={false} />
                    <YAxis orientation="right" domain={yDomain} stroke="#9CA3AF" tickFormatter={(v) => formatPrice(Number(v))} allowDataOverflow={true} type="number" />
                    <Tooltip content={<CustomTooltip t={t} formatPrice={formatPrice} />} />

                    {indicatorData.ema20 && <Line type="monotone" dataKey="ema20" stroke="#06B6D4" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
                    {indicatorData.ema24 && <Line type="monotone" dataKey="ema24" stroke="#FBBF24" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
                    {indicatorData.ema52 && <Line type="monotone" dataKey="ema52" stroke="#EC4899" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
                    {indicatorData.bb20 && <Line dataKey="bb20.upper" stroke="#FBBF24" dot={false} strokeWidth={1} strokeDasharray="3 3" isAnimationActive={false} />}
                    {indicatorData.bb20 && <Line dataKey="bb20.lower" stroke="#FBBF24" dot={false} strokeWidth={1} strokeDasharray="3 3" isAnimationActive={false} />}
                    
                    {!isHistorical && latestPrice !== null && (<ReferenceLine y={latestPrice} stroke="rgb(252 211 77 / 0.9)" strokeDasharray="3 3" strokeWidth={1.5} ifOverflow="extendDomain" label={{ position: 'right', value: formatPrice(latestPrice), fill: 'rgb(252 211 77)', fontSize: 11, fontWeight: 'bold' }} />)}
                    {mousePrice !== null && (<ReferenceLine y={mousePrice} stroke="#9CA3AF" strokeDasharray="2 2" strokeWidth={1} ifOverflow="visible" label={{ position: 'right', value: formatPrice(mousePrice), fill: '#D1D5DB', fontSize: 11, }} />)}
                    {focusedTime && <ReferenceLine x={focusedTime} stroke="cyan" strokeOpacity={0.7} />}
                    <Bar dataKey="wick" shape={CustomCandlestick} isAnimationActive={false} />

                </ComposedChart>
            </ResponsiveContainer>
            {hasRsi && (
                <ResponsiveContainer height={subChartHeight}>
                    <ComposedChart data={visibleData} margin={{ top: 10, right: 20, bottom: 20, left: 20 }} syncId="priceSync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                        <XAxis dataKey="time" tickFormatter={tickFormatter} stroke="#9CA3AF" minTickGap={80} interval="preserveStartEnd" domain={['dataMin', 'dataMax']} type="number" scale="time" />
                        <YAxis orientation="right" domain={[0, 100]} stroke="#9CA3AF" type="number" ticks={[30, 50, 70]} label={{ value: t('rsiIndicator'), angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 12 }} />
                        <ReferenceLine y={70} stroke="rgba(239, 68, 68, 0.5)" strokeDasharray="4 4" />
                        <ReferenceLine y={30} stroke="rgba(16, 185, 129, 0.5)" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="rsi14" stroke="#A78BFA" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            )}
            {hasMacd && (
                <ResponsiveContainer height={subChartHeight}>
                    <ComposedChart data={visibleData} margin={{ top: 10, right: 20, bottom: 20, left: 20 }} syncId="priceSync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                        <XAxis dataKey="time" tickFormatter={tickFormatter} stroke="#9CA3AF" minTickGap={80} interval="preserveStartEnd" domain={['dataMin', 'dataMax']} type="number" scale="time" />
                        <YAxis orientation="right" domain={['auto', 'auto']} stroke="#9CA3AF" type="number" tickFormatter={(v) => Number(v).toExponential(2)} />
                        <Tooltip content={<CustomTooltip t={t} formatPrice={formatPrice} />} />
                        <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="2 2" />
                        <Bar dataKey="macd.histogram" isAnimationActive={false} >
                             {visibleData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.macd && entry.macd.histogram >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)'} />
                            ))}
                        </Bar>
                        <Line type="monotone" dataKey="macd.macd" stroke="#4f46e5" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                        <Line type="monotone" dataKey="macd.signal" stroke="#f97316" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            )}
        </div>
    );
};

export const PriceChart = React.memo(PriceChartComponent);
