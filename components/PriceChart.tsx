
import React, { useState, useEffect, useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Bar, ReferenceDot } from 'recharts';
import type { Candle, DetectedPattern } from '../types';
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

const CustomTooltip = ({ active, payload, label, t }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-gray-700/80 backdrop-blur-sm p-3 border border-gray-600 rounded-md shadow-lg text-sm">
        <p className="label text-gray-300">{new Date(data.time * 1000).toLocaleString()}</p>
        <p className={`text-${data.isBullish ? 'green' : 'red'}-400`}>
            <span className="font-bold">{t('tooltipOpen')}:</span> {data.open.toFixed(2)} <span className="font-bold ml-2">{t('tooltipHigh')}:</span> {data.high.toFixed(2)}
        </p>
         <p className={`text-${data.isBullish ? 'green' : 'red'}-400`}>
            <span className="font-bold">{t('tooltipLow')}:</span> {data.low.toFixed(2)} <span className="font-bold ml-2">{t('tooltipClose')}:</span> {data.close.toFixed(2)}
        </p>
        <p className="text-gray-400"><span className="font-bold">{t('tooltipVolume')}:</span> {data.volume.toFixed(2)}</p>
      </div>
    );
  }
  return null;
};

// Annotation component for patterns
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

export const PriceChart: React.FC<PriceChartProps> = ({ data, patterns, hoveredPatternIndex }) => {
    const { t } = useLanguage();

    if (!data || data.length === 0) {
        return <div className="h-[600px] flex items-center justify-center text-gray-500">{t('noData')}</div>;
    }

    const [range, setRange] = useState({ start: 0, end: data.length });

    // Reset zoom when data changes
    useEffect(() => {
        setRange({ start: 0, end: data.length });
    }, [data]);

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
                <ComposedChart data={visibleData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" />
                    <XAxis 
                        dataKey="time" 
                        tickFormatter={tickFormatter}
                        stroke="#9CA3AF"
                        minTickGap={80}
                        interval="preserveStartEnd"
                    />
                    <YAxis 
                        orientation="right" 
                        domain={yDomain}
                        stroke="#9CA3AF" 
                        tickFormatter={(value) => typeof value === 'number' ? value.toFixed(2) : ''}
                        allowDataOverflow={true}
                    />
                    <Tooltip content={<CustomTooltip t={t} />} />

                    <Bar dataKey="wick" shape={<CustomCandlestick />} />

                    {visiblePatterns.map((p, index) => (
                        <ReferenceDot 
                            key={`pattern-${index}`}
                            x={p.candle.time}
                            y={p.direction === SignalDirection.Bullish 
                                ? p.candle.low - annotationOffset 
                                : p.candle.high + annotationOffset
                            }
                            r={8}
                            shape={<PatternAnnotation direction={p.direction} isHovered={p.index === hoveredPatternIndex} />}
                        />
                    ))}
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};
