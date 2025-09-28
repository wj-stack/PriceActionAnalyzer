
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Bar, ReferenceDot, ReferenceLine } from 'recharts';
import type { Candle, DetectedPattern, MultiTimeframeAnalysis } from '../types';
import { SignalDirection } from '../types';
import { ZoomInIcon } from './icons/ZoomInIcon';
import { ZoomOutIcon } from './icons/ZoomOutIcon';
import { ChevronLeftIcon } from './icons/ChevronLeftIcon';
import { ChevronRightIcon } from './icons/ChevronRightIcon';
import { ExpandIcon } from './icons/ExpandIcon';
import { useLanguage } from '../contexts/LanguageContext';

interface PriceChartProps {
    data: Candle[];
    patterns: DetectedPattern[];
    hoveredPatternIndex: number | null;
    multiTimeframeAnalysis: MultiTimeframeAnalysis[];
    hoveredMultiTimeframePattern: DetectedPattern | null;
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
            <line 
              x1={wickCenterX} y1={y} 
              x2={wickCenterX} y2={y + height} 
              stroke={stroke} strokeWidth={1} 
            />
            {/* Body */}
            <rect 
              x={x} y={bodyYValue} 
              width={width} height={finalBodyHeight} 
              fill={fill} 
            />
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
      </div>
    );
  }
  return null;
};

// Annotation component for primary patterns
const PatternAnnotation = ({ cx, cy, payload, direction, isHovered }: any) => {
    const color = direction === SignalDirection.Bullish ? '#34D399' : '#F87171';
    const glowColor = '#06B6D4'; // Cyan for glow

    return (
       <g>
            {isHovered && (
                 <circle cx={cx} cy={cy} r="12" fill={glowColor} fillOpacity="0.5">
                    <animate 
                        attributeName="r" 
                        from="10" 
                        to="15" 
                        dur="1.5s" 
                        begin="0s" 
                        repeatCount="indefinite"
                    />
                    <animate 
                        attributeName="opacity" 
                        from="0.7" 
                        to="0" 
                        dur="1.5s" 
                        begin="0s" 
                        repeatCount="indefinite"
                    />
                </circle>
            )}
            <svg x={cx - 6} y={cy - 6} width="12" height="12" fill={color} viewBox="0 0 24 24">
                {direction === SignalDirection.Bullish ? <path d="M12 2L2 22h20L12 2z"/> : <path d="M12 2L2 22h20L12 2z" transform="rotate(180 12 12)"/>}
            </svg>
       </g>
    )
};

// Annotation component for higher timeframe signals
const HigherTimeframeAnnotation = ({ cx, cy, direction, timeframeLabel, patternName, t, isHovered }: any) => {
    const color = direction === SignalDirection.Bullish ? '#10B981' : '#EF4444';
    const glowColor = '#06B6D4'; // Cyan for glow
    
    return (
        <g>
            <title>{`${timeframeLabel} - ${t(patternName)}`}</title>
             {isHovered && (
                 <circle cx={cx} cy={cy} r="12" fill={glowColor} fillOpacity="0.5">
                    <animate 
                        attributeName="r" 
                        from="10" 
                        to="15" 
                        dur="1.5s" 
                        begin="0s" 
                        repeatCount="indefinite"
                    />
                    <animate 
                        attributeName="opacity" 
                        from="0.7" 
                        to="0" 
                        dur="1.5s" 
                        begin="0s" 
                        repeatCount="indefinite"
                    />
                </circle>
            )}
            <circle cx={cx} cy={cy} r="9" fill={color} stroke="#1F2937" strokeWidth="2" />
            <text x={cx} y={cy + 1} fill="#FFFFFF" textAnchor="middle" dy=".3em" fontSize="9" fontWeight="bold">
                {timeframeLabel}
            </text>
        </g>
    );
};


const PriceChartComponent: React.FC<PriceChartProps> = ({ data, patterns, hoveredPatternIndex, multiTimeframeAnalysis, hoveredMultiTimeframePattern }) => {
    const { t } = useLanguage();
    const [range, setRange] = useState({ start: 0, end: data.length });
    const prevDataRef = useRef<Candle[] | null>(null);
    const [mousePrice, setMousePrice] = useState<number | null>(null);

    // Smartly update the visible range on data changes
    useEffect(() => {
        const prevData = prevDataRef.current;
        const isFullReload = !prevData || data.length === 0 || prevData.length === 0 || prevData[0].time !== data[0].time;

        if (isFullReload) {
            setRange({ start: 0, end: data.length });
        } else {
            const wasAtTheEnd = range.end === prevData.length;
            if (wasAtTheEnd) {
                setRange(currentRange => {
                    const numVisibleCandles = currentRange.end - currentRange.start;
                    const newEnd = data.length;
                    const newStart = Math.max(0, newEnd - numVisibleCandles);
                    return { start: newStart, end: newEnd };
                });
            }
        }
        prevDataRef.current = data;
    }, [data, range.end]);

    const visibleData = useMemo(() => {
        return data.map(candle => ({
            ...candle,
            wick: [candle.low, candle.high],
        })).slice(range.start, range.end);
    }, [data, range]);

    const { yDomain, annotationOffset } = useMemo(() => {
        if (visibleData.length === 0) {
            return { yDomain: [0, 1] as [number, number], annotationOffset: 0.1 };
        }
        const prices = visibleData.flatMap(d => [d.low, d.high]);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;
        const offset = priceRange * 0.1 || 1; // Add a fallback for flat price
        
        return {
            yDomain: [minPrice - offset, maxPrice + offset] as [number, number],
            annotationOffset: priceRange * 0.04
        };
    }, [visibleData]);
    
    const visiblePatterns = useMemo(() => {
        return patterns.filter(p => p.index >= range.start && p.index < range.end);
    }, [patterns, range]);

    const getTimeframeLabel = (timeframe: string) => {
        if (timeframe.includes('m')) return timeframe.replace('m','');
        if (timeframe.includes('h')) return timeframe.toUpperCase();
        if (timeframe.includes('d')) return timeframe.toUpperCase();
        if (timeframe.includes('w')) return timeframe.toUpperCase();
        if (timeframe.includes('mo')) return 'M';
        return timeframe;
    };

    const visibleHigherTimeframeSignals = useMemo(() => {
        if (!multiTimeframeAnalysis) return [];
        
        const visibleStartTime = visibleData[0]?.time;
        const visibleEndTime = visibleData[visibleData.length - 1]?.time;
        if (!visibleStartTime || !visibleEndTime) return [];

        return multiTimeframeAnalysis.flatMap(analysis => 
            analysis.patterns.map(pattern => ({
                ...pattern,
                timeframeLabel: getTimeframeLabel(analysis.timeframe),
            }))
        ).filter(p => p.candle.time >= visibleStartTime && p.candle.time <= visibleEndTime);

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
        const newSpan = Math.max(10, Math.floor(currentSpan * factor));

        let newStart = middleIndex - Math.floor(newSpan / 2);
        let newEnd = newStart + newSpan;

        if (newStart < 0) {
            newStart = 0;
            newEnd = Math.min(data.length, newSpan);
        }
        if (newEnd > data.length) {
            newEnd = data.length;
            newStart = Math.max(0, newEnd - newSpan);
        }
        setRange({ start: newStart, end: newEnd });
    };

    const handlePan = (direction: 'left' | 'right') => {
        const panAmount = Math.floor((range.end - range.start) * 0.2);
        const move = direction === 'left' ? -panAmount : panAmount;
        let newStart = range.start + move;
        let newEnd = range.end + move;

        if (newStart < 0) {
            newStart = 0;
            newEnd = range.end - range.start;
        }
        if (newEnd > data.length) {
            newEnd = data.length;
            newStart = newEnd - (range.end - range.start);
        }
        setRange({ start: newStart, end: newEnd });
    };

    const handleReset = () => {
        setRange({ start: 0, end: data.length });
    };

    const handleMouseMove = (e: any) => {
        if (e?.chartY && e.yAxisMap) {
            const yAxisKey = Object.keys(e.yAxisMap)[0];
            const yAxis = e.yAxisMap[yAxisKey];
            if (yAxis) {
                const price = yAxis.scale.invert(e.chartY);
                setMousePrice(price);
            }
        }
    };

    const handleMouseLeave = () => {
        setMousePrice(null);
    };
    
    const getTickFormatter = (numVisible: number) => {
        if (numVisible <= 30) {
            return (time: number) => new Date(time * 1000).toLocaleString([], {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            });
        }
        if (numVisible <= 150) {
            return (time: number) => new Date(time * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }
        return (time: number) => new Date(time * 1000).toLocaleDateString();
    };

    const tickFormatter = getTickFormatter(range.end - range.start);
    const isZoomedIn = range.start > 0 || range.end < data.length;
    const canPanLeft = range.start > 0;
    const canPanRight = range.end < data.length;
    const canZoomIn = range.end - range.start > 10;
    const latestPrice = data.length > 0 ? data[data.length - 1].close : null;

    if (!data || data.length === 0) {
        return <div className="h-[600px] flex items-center justify-center text-gray-500">{t('noData')}</div>;
    }

    return (
        <div className="relative" style={{ width: '100%', height: 600 }}>
             <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-gray-800/50 backdrop-blur-sm p-1 rounded-md border border-gray-700">
                <button title={t('panLeft')} onClick={() => handlePan('left')} disabled={!canPanLeft} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ChevronLeftIcon className="w-5 h-5" /></button>
                <button title={t('panRight')} onClick={() => handlePan('right')} disabled={!canPanRight} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ChevronRightIcon className="w-5 h-5" /></button>
                <button title={t('zoomIn')} onClick={() => handleZoom(0.8)} disabled={!canZoomIn} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ZoomInIcon className="w-5 h-5" /></button>
                <button title={t('zoomOut')} onClick={() => handleZoom(1.2)} disabled={!isZoomedIn} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ZoomOutIcon className="w-5 h-5" /></button>
                <button title={t('resetZoom')} onClick={handleReset} disabled={!isZoomedIn} className="p-1.5 rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"><ExpandIcon className="w-5 h-5" /></button>
            </div>
            <ResponsiveContainer>
                <ComposedChart 
                    data={visibleData} 
                    margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                    <XAxis 
                        dataKey="time" 
                        tickFormatter={tickFormatter}
                        stroke="#9CA3AF"
                        minTickGap={80}
                        interval="preserveStartEnd"
                        domain={['dataMin', 'dataMax']}
                        type="number"
                        scale="time"
                    />
                    <YAxis 
                        orientation="right" 
                        domain={yDomain}
                        stroke="#9CA3AF" 
                        tickFormatter={(value) => formatPrice(Number(value))}
                        allowDataOverflow={true}
                        type="number"
                    />
                    <Tooltip content={<CustomTooltip t={t} formatPrice={formatPrice} />} />

                    {/* Latest Price Line */}
                    {latestPrice !== null && (
                        <ReferenceLine
                            y={latestPrice}
                            stroke="rgb(252 211 77 / 0.9)" // Amber color
                            strokeDasharray="3 3"
                            strokeWidth={1.5}
                            ifOverflow="extendDomain"
                            label={{
                                position: 'right',
                                value: formatPrice(latestPrice),
                                fill: 'rgb(252 211 77)',
                                fontSize: 11,
                                fontWeight: 'bold',
                            }}
                        />
                    )}

                    {/* Mouse Crosshair Price Line */}
                    {mousePrice !== null && (
                         <ReferenceLine
                            y={mousePrice}
                            stroke="#9CA3AF"
                            strokeDasharray="2 2"
                            strokeWidth={1}
                            ifOverflow="visible"
                            label={{
                                position: 'right',
                                value: formatPrice(mousePrice),
                                fill: '#D1D5DB',
                                fontSize: 11,
                            }}
                        />
                    )}

                    <Bar dataKey="wick" shape={<CustomCandlestick />} />

                    {/* Primary Timeframe Patterns */}
                    {visiblePatterns.map((p, index) => (
                        <ReferenceDot 
                            key={`pattern-${p.index}`}
                            x={p.candle.time}
                            y={p.direction === SignalDirection.Bullish 
                                ? p.candle.low - annotationOffset 
                                : p.candle.high + annotationOffset
                            }
                            r={8}
                            shape={<PatternAnnotation direction={p.direction} isHovered={p.index === hoveredPatternIndex} />}
                        />
                    ))}

                    {/* Higher Timeframe Patterns */}
                    {visibleHigherTimeframeSignals.map((p, index) => {
                        const isHovered = hoveredMultiTimeframePattern ? 
                            p.candle.time === hoveredMultiTimeframePattern.candle.time && p.name === hoveredMultiTimeframePattern.name : 
                            false;
                        return (
                            <ReferenceDot 
                                key={`htf-pattern-${p.index}-${index}`}
                                x={p.candle.time}
                                y={p.direction === SignalDirection.Bullish 
                                    ? p.candle.low - (annotationOffset * 1.5)
                                    : p.candle.high + (annotationOffset * 1.5)
                                }
                                r={9}
                                shape={<HigherTimeframeAnnotation 
                                    direction={p.direction} 
                                    timeframeLabel={p.timeframeLabel}
                                    patternName={p.name}
                                    t={t}
                                    isHovered={isHovered}
                                />}
                            />
                        );
                    })}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

export const PriceChart = React.memo(PriceChartComponent);