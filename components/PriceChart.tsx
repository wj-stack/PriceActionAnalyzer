import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Bar, ReferenceDot, ReferenceLine, Line } from 'recharts';
import type { Candle, DetectedPattern, MultiTimeframeAnalysis, TrendLine, IndicatorData, PriceAlert, TrendPoint } from '../types';
import { SignalDirection } from '../types';
import { TradeLogEvent } from '../services/backtestService';
import { ZoomInIcon } from './icons/ZoomInIcon';
import { ZoomOutIcon } from './icons/ZoomOutIcon';
import { ChevronLeftIcon } from './icons/ChevronLeftIcon';
import { ChevronRightIcon } from './icons/ChevronRightIcon';
import { ExpandIcon } from './icons/ExpandIcon';
import { useLanguage } from '../contexts/LanguageContext';
import { StarIcon } from './icons/StarIcon';
import { CloseIcon } from './icons/CloseIcon';
import { BuyTradeIcon } from './icons/BuyTradeIcon';
import { SellTradeIcon } from './icons/SellTradeIcon';
import { ArrowUpIcon } from './icons/ArrowUpIcon';
import { ArrowDownIcon } from './icons/ArrowDownIcon';

interface PriceChartProps {
    data: Candle[];
    patterns: DetectedPattern[];
    trendlines: TrendLine[];
    swingHighs: TrendPoint[];
    swingLows: TrendPoint[];
    timeframe: string;
    hoveredPatternIndex: number | null;
    multiTimeframeAnalysis: MultiTimeframeAnalysis[];
    hoveredMultiTimeframePattern: DetectedPattern | null;
    isHistorical: boolean;
    indicatorData: IndicatorData;
    tradeLog: TradeLogEvent[];
    horizontalLines: PriceAlert[];
    onAddHorizontalLine: (price: number) => void;
    onRemoveHorizontalLine: (id: string) => void;
    drawingMode: 'hline' | null;
    showSwingLines: boolean;
    showTrendlines: boolean;
    executedTradePatternIndices?: Set<number>;
    skippedTradePatternIndices?: Set<number>;
    focusedTime?: number | null;
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

const CustomTooltip = ({ active, payload, label, t, formatPrice, patterns }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const pattern = patterns.find((p: DetectedPattern) => p.candle.time === data.time);

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
        {data.rsi14 && <p className="text-purple-400">RSI(14): {data.rsi14.toFixed(2)}</p>}
        {pattern && (
          <>
            <hr className="my-2 border-gray-600" />
            <div className="flex items-center gap-2">
              <span className="font-bold text-cyan-400">{t('tooltipSignal')}:</span>
              <span className="font-semibold text-white">{t(pattern.name)}</span>
              {pattern.direction === SignalDirection.Bullish 
                ? <ArrowUpIcon className="w-4 h-4 text-green-400 flex-shrink-0" /> 
                : <ArrowDownIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
              }
            </div>
          </>
        )}
      </div>
    );
  }
  return null;
};

const PatternAnnotation = ({ cx, cy, direction, isHovered, isKeySignal, isExecuted, isSkipped }: any) => {
    let color = direction === SignalDirection.Bullish ? '#34D399' : '#F87171';
    let opacity = 1.0;
    let stroke = 'none';
    let strokeWidth = 0;

    if (isSkipped) {
        color = '#6B7280'; // gray-500
        opacity = 0.5;
    }
    
    if (isExecuted) {
        stroke = '#FBBF24'; // yellow-400
        strokeWidth = 1.5;
    }

    const glowColor = '#06B6D4'; // Cyan for glow
    const starColor = '#FBBF24'; // Tailwind's yellow-400
    const trianglePath = "M12 2L2 22h20L12 2z";
    const starPath = "M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404.433 2.082-5.006z";
    
    return (
        <g opacity={opacity}>
            {isHovered && (<circle cx={cx} cy={cy} r="12" fill={glowColor} fillOpacity="0.5"><animate attributeName="r" from="10" to="15" dur="1.5s" begin="0s" repeatCount="indefinite" /><animate attributeName="opacity" from="0.7" to="0" dur="1.5s" begin="0s" repeatCount="indefinite" /></circle>)}
            <path d={trianglePath} fill={color} stroke={stroke} strokeWidth={strokeWidth} transform={`translate(${cx - 6}, ${cy - 6}) scale(0.5) ` + (direction === SignalDirection.Bearish ? `rotate(180 12 12)` : '')} />
            {isKeySignal && <path d={starPath} fill={starColor} transform={`translate(${cx - 8}, ${cy + 5}) scale(0.66)`} />}
        </g>
    )
};


const HigherTimeframeAnnotation = ({ cx, cy, direction, timeframeLabel, patternName, t, isHovered }: any) => {
    const color = direction === SignalDirection.Bullish ? '#10B981' : '#EF4444';
    const glowColor = '#06B6D4';
    return (<g><title>{`${timeframeLabel} - ${t(patternName)}`}</title>{isHovered && (<circle cx={cx} cy={cy} r="12" fill={glowColor} fillOpacity="0.5"><animate attributeName="r" from="10" to="15" dur="1.5s" begin="0s" repeatCount="indefinite" /><animate attributeName="opacity" from="0.7" to="0" dur="1.5s" begin="0s" repeatCount="indefinite" /></circle>)}<circle cx={cx} cy={cy} r="9" fill={color} stroke="#1F2937" strokeWidth="2" /><text x={cx} y={cy + 1} fill="#FFFFFF" textAnchor="middle" dy=".3em" fontSize="9" fontWeight="bold">{timeframeLabel}</text></g>);
};

const SwingPointAnnotation = ({ stroke }: { stroke: string }) => (
    <circle r="3" fill="none" stroke={stroke} strokeWidth="1.5" opacity={0.7} />
);

const PriceChartComponent: React.FC<PriceChartProps> = ({ data, patterns, trendlines, swingHighs, swingLows, timeframe, hoveredPatternIndex, multiTimeframeAnalysis, hoveredMultiTimeframePattern, isHistorical, indicatorData, tradeLog, horizontalLines, onAddHorizontalLine, onRemoveHorizontalLine, drawingMode, showSwingLines, showTrendlines, executedTradePatternIndices, skippedTradePatternIndices, focusedTime }) => {
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
            bb20: indicatorData.bb20?.[index] ?? null,
            rsi14: indicatorData.rsi14?.[index] ?? null,
        }));
    }, [data, indicatorData]);

    const visibleData = useMemo(() => combinedData.slice(range.start, range.end), [combinedData, range]);
    const hasRsi = indicatorData.rsi14 && indicatorData.rsi14.some(d => d !== null);

    const { yDomain, annotationOffset } = useMemo(() => {
        if (visibleData.length === 0) return { yDomain: [0, 1] as [number, number], annotationOffset: 0.1 };
        const prices = visibleData.flatMap(d => [d.low, d.high]);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;
        const offset = priceRange * 0.1 || 1;
        return { yDomain: [minPrice - offset, maxPrice + offset] as [number, number], annotationOffset: priceRange * 0.04 };
    }, [visibleData]);
    
    const visiblePatterns = useMemo(() => patterns.filter(p => p.index >= range.start && p.index < range.end), [patterns, range]);
    const tradeMarkers = useMemo(() => {
      if (!tradeLog || tradeLog.length === 0) return [];
      return tradeLog
        .map(e => {
            if (e.type === 'ENTER_LONG' || e.type === 'ENTER_SHORT' || e.type === 'CLOSE_LONG' || e.type === 'CLOSE_SHORT') {
                const candleIndex = data.findIndex(c => c.time >= e.time);
                return { ...e, candleIndex };
            }
            return null;
        })
        .filter(e => e !== null && e.candleIndex >= range.start && e.candleIndex < range.end) as (TradeLogEvent & { candleIndex: number })[];
    }, [tradeLog, data, range]);
    
    const visibleSwingHighs = useMemo(() => showSwingLines ? swingHighs.filter(p => p.index >= range.start && p.index < range.end) : [], [showSwingLines, swingHighs, range.start, range.end]);
    const visibleSwingLows = useMemo(() => showSwingLines ? swingLows.filter(p => p.index >= range.start && p.index < range.end) : [], [showSwingLines, swingLows, range.start, range.end]);

    const getTimeframeLabel = (timeframe: string) => {
        if (timeframe.includes('m')) return timeframe.replace('m','');
        if (timeframe.includes('h')) return timeframe.toUpperCase();
        if (timeframe.includes('d')) return timeframe.toUpperCase();
        return timeframe;
    };

    const visibleHigherTimeframeSignals = useMemo(() => {
        if (!multiTimeframeAnalysis) return [];
        const visibleStartTime = visibleData[0]?.time;
        const visibleEndTime = visibleData[visibleData.length - 1]?.time;
        if (!visibleStartTime || !visibleEndTime) return [];
        return multiTimeframeAnalysis.flatMap(analysis => analysis.patterns.map(pattern => ({ ...pattern, timeframeLabel: getTimeframeLabel(analysis.timeframe), }))).filter(p => p.candle.time >= visibleStartTime && p.candle.time <= visibleEndTime);
    }, [multiTimeframeAnalysis, visibleData]);

    const formatPrice = (price: number): string => {
        if (typeof price !== 'number' || isNaN(price)) return '';
        if (price >= 100) return price.toFixed(2);
        if (price >= 0.1) return price.toFixed(4);
        if (price >= 0.001) return price.toFixed(6);
        return price.toFixed(8);
    };

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
    const handleChartClick = (e: any) => { if (drawingMode === 'hline' && e?.chartY && e.yAxisMap) { const yAxisKey = Object.keys(e.yAxisMap)[0]; if(e.yAxisMap[yAxisKey]) onAddHorizontalLine(e.yAxisMap[yAxisKey].scale.invert(e.chartY)); } };
    
    const getTickFormatter = (numVisible: number) => (time: number) => new Date(time * 1000).toLocaleString();
    const tickFormatter = getTickFormatter(range.end - range.start);
    const isZoomedIn = range.start > 0 || range.end < data.length;
    const canPanLeft = range.start > 0;
    const canPanRight = range.end < data.length;
    const canZoomIn = range.end - range.start > 20;
    const latestPrice = data.length > 0 ? data[data.length - 1].close : null;

    if (!data || data.length === 0) {
        return <div className="h-[600px] flex items-center justify-center text-gray-500">{t('noData')}</div>;
    }

    const chartHeight = 600;

    return (
        <div className="relative" style={{ width: '100%', height: '100%', cursor: drawingMode ? 'crosshair' : 'default' }}>
             <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-gray-800/50 backdrop-blur-sm p-1 rounded-md border border-gray-700">
                <button title={t('panLeft')} onClick={() => handlePan('left')} disabled={!canPanLeft} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ChevronLeftIcon className="w-5 h-5" /></button>
                <button title={t('panRight')} onClick={() => handlePan('right')} disabled={!canPanRight} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ChevronRightIcon className="w-5 h-5" /></button>
                <button title={t('zoomIn')} onClick={() => handleZoom(0.8)} disabled={!canZoomIn} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ZoomInIcon className="w-5 h-5" /></button>
                <button title={t('zoomOut')} onClick={() => handleZoom(1.2)} disabled={range.end-range.start >= data.length} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ZoomOutIcon className="w-5 h-5" /></button>
                <button title={t('resetZoom')} onClick={handleReset} disabled={!isZoomedIn} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ExpandIcon className="w-5 h-5" /></button>
            </div>
            <ResponsiveContainer height={hasRsi ? '70%' : '100%'}>
                <ComposedChart data={visibleData} margin={{ top: 20, right: 20, bottom: 0, left: 20 }} syncId="priceSync" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onClick={handleChartClick}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                    <XAxis dataKey="time" tickFormatter={tickFormatter} stroke="#9CA3AF" minTickGap={80} interval="preserveStartEnd" domain={['dataMin', 'dataMax']} type="number" scale="time" tick={false} />
                    <YAxis orientation="right" domain={yDomain} stroke="#9CA3AF" tickFormatter={(v) => formatPrice(Number(v))} allowDataOverflow={true} type="number" />
                    <Tooltip content={<CustomTooltip t={t} formatPrice={formatPrice} patterns={patterns} />} />
                    {indicatorData.ema20 && <Line type="monotone" dataKey="ema20" stroke="#06B6D4" dot={false} strokeWidth={1.5} />}
                    {indicatorData.bb20 && <Line dataKey="bb20.upper" stroke="#FBBF24" dot={false} strokeWidth={1} strokeDasharray="3 3" />}
                    {indicatorData.bb20 && <Line dataKey="bb20.lower" stroke="#FBBF24" dot={false} strokeWidth={1} strokeDasharray="3 3" />}
                    
                    {showTrendlines && trendlines.map(tl => {
                        if (!visibleData.length) return null;

                        const visibleEndTime = visibleData[visibleData.length - 1].time;
                        const startX = tl.p1.time;
                        const endX = visibleEndTime; // Extend line to the end of the visible chart
                
                        const startY = tl.slope * startX + tl.intercept;
                        const endY = tl.slope * endX + tl.intercept;
                
                        const color = tl.type === 'UP' ? '#22C55E' : '#EF4444';
                        const isHTF = !!tl.timeframe && tl.timeframe !== timeframe;
                        const strokeStyle = isHTF 
                            ? { strokeDasharray: "4 4", strokeWidth: 2, strokeOpacity: 0.7 } 
                            : { strokeWidth: 1.5, strokeOpacity: 0.9 };
                        
                        return (
                            <React.Fragment key={`tl-frag-${tl.id}`}>
                                <ReferenceLine 
                                    key={`tl-${tl.id}`}
                                    segment={[{ x: startX, y: startY }, { x: endX, y: endY }]} 
                                    stroke={color} 
                                    ifOverflow="hidden"
                                    {...strokeStyle} 
                                />
                                {tl.channelLine && (
                                    <ReferenceLine
                                        key={`tl-channel-${tl.id}`}
                                        segment={[
                                            { x: startX, y: tl.slope * startX + tl.channelLine.intercept },
                                            { x: endX, y: tl.slope * endX + tl.channelLine.intercept }
                                        ]}
                                        stroke={color}
                                        ifOverflow="hidden"
                                        strokeOpacity={0.5}
                                        strokeDasharray="5 5"
                                    />
                                )}
                            </React.Fragment>
                        );
                    })}

                    {!isHistorical && latestPrice !== null && (<ReferenceLine y={latestPrice} stroke="rgb(252 211 77 / 0.9)" strokeDasharray="3 3" strokeWidth={1.5} ifOverflow="extendDomain" label={{ position: 'right', value: formatPrice(latestPrice), fill: 'rgb(252 211 77)', fontSize: 11, fontWeight: 'bold' }} />)}
                    {mousePrice !== null && (<ReferenceLine y={mousePrice} stroke="#9CA3AF" strokeDasharray="2 2" strokeWidth={1} ifOverflow="visible" label={{ position: 'right', value: formatPrice(mousePrice), fill: '#D1D5DB', fontSize: 11, }} />)}
                    {horizontalLines.map(line => (<ReferenceLine y={line.price} key={line.id} stroke="orange" strokeDasharray="2 2" label={<foreignObject x="95%" y={-8} width="20" height="20"><button onClick={(e) => { e.stopPropagation(); onRemoveHorizontalLine(line.id); }} className="text-gray-500 hover:text-red-400"><CloseIcon className="w-4 h-4" /></button></foreignObject>} />))}
                    {focusedTime && <ReferenceLine x={focusedTime} stroke="cyan" strokeOpacity={0.7} />}
                    <Bar dataKey="wick" shape={<CustomCandlestick />} />

                    {visibleSwingHighs.map(p => (
                        <ReferenceDot 
                            key={`sh-dot-${p.index}`} 
                            x={p.time} 
                            y={p.price + annotationOffset * 0.5} 
                            r={3} 
                            shape={<SwingPointAnnotation stroke="#EF4444" />} 
                        />
                    ))}
                    {visibleSwingLows.map(p => (
                        <ReferenceDot 
                            key={`sl-dot-${p.index}`} 
                            x={p.time} 
                            y={p.price - annotationOffset * 0.5} 
                            r={3} 
                            shape={<SwingPointAnnotation stroke="#22C55E" />} 
                        />
                    ))}

                    {visiblePatterns.map(p => {
                        const isExecuted = executedTradePatternIndices?.has(p.index);
                        const isSkipped = skippedTradePatternIndices?.has(p.index);
                        return (<ReferenceDot 
                            key={`pattern-${p.index}-${p.name}`} 
                            x={p.candle.time} 
                            y={p.direction === SignalDirection.Bullish ? p.candle.low - annotationOffset : p.candle.high + annotationOffset } 
                            r={8} 
                            shape={<PatternAnnotation 
                                direction={p.direction} 
                                isHovered={p.index === hoveredPatternIndex} 
                                isKeySignal={p.isKeySignal}
                                isExecuted={isExecuted}
                                isSkipped={isSkipped}
                            />} 
                        />);
                    })}
                    {visibleHigherTimeframeSignals.map((p, index) => { const isHovered = hoveredMultiTimeframePattern ? p.candle.time === hoveredMultiTimeframePattern.candle.time && p.name === hoveredMultiTimeframePattern.name : false; return (<ReferenceDot key={`htf-pattern-${p.index}-${index}`} x={p.candle.time} y={p.direction === SignalDirection.Bullish ? p.candle.low - (annotationOffset * 1.5) : p.candle.high + (annotationOffset * 1.5)} r={9} shape={<HigherTimeframeAnnotation direction={p.direction} timeframeLabel={p.timeframeLabel} patternName={p.name} t={t} isHovered={isHovered} />} />);})}
                    {tradeMarkers.map((e, i) => {
                        const isBuy = e.type === 'ENTER_LONG' || e.type === 'CLOSE_SHORT';
                        const candle = data[e.candleIndex];
                        if (!candle) return null;
                        const yPosition = isBuy ? candle.low - annotationOffset * 1.5 : candle.high + annotationOffset * 1.5;
                        const Icon = isBuy ? BuyTradeIcon : SellTradeIcon;
                        return <ReferenceDot key={`trade-${i}`} x={e.time} y={yPosition} shape={<Icon />} />;
                    })}
                </ComposedChart>
            </ResponsiveContainer>
            {hasRsi && (
                <ResponsiveContainer height="30%">
                    <ComposedChart data={visibleData} margin={{ top: 10, right: 20, bottom: 20, left: 20 }} syncId="priceSync">
                        <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                        <XAxis dataKey="time" tickFormatter={tickFormatter} stroke="#9CA3AF" minTickGap={80} interval="preserveStartEnd" domain={['dataMin', 'dataMax']} type="number" scale="time" />
                        <YAxis orientation="right" domain={[0, 100]} stroke="#9CA3AF" type="number" ticks={[30, 50, 70]} label={{ value: t('rsiIndicator'), angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 12 }} />
                        <ReferenceLine y={70} stroke="rgba(239, 68, 68, 0.5)" strokeDasharray="4 4" />
                        <ReferenceLine y={30} stroke="rgba(16, 185, 129, 0.5)" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="rsi14" stroke="#A78BFA" dot={false} strokeWidth={1.5} />
                    </ComposedChart>
                </ResponsiveContainer>
            )}
        </div>
    );
};

export const PriceChart = React.memo(PriceChartComponent);