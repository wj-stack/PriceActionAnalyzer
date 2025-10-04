
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, IChartApi, ISeriesApi, SeriesType, UTCTimestamp, LineStyle, LogicalRange, TickMarkType, LineWidth, CreatePriceLineOptions } from 'lightweight-charts';
import type { Candle, IndicatorData, SRZone, TradeLogEvent, PredictionResult } from '../types';
import { ZoomInIcon } from './icons/ZoomInIcon';
import { ZoomOutIcon } from './icons/ZoomOutIcon';
import { ChevronLeftIcon } from './icons/ChevronLeftIcon';
import { ChevronRightIcon } from './icons/ChevronRightIcon';
import { ExpandIcon } from './icons/ExpandIcon';
import { useLanguage } from '../contexts/LanguageContext';

interface PriceChartProps {
    data: Candle[];
    isHistorical: boolean;
    indicatorData: IndicatorData;
    focusedTime?: number | null;
    srZones?: SRZone[];
    tradeLog?: TradeLogEvent[];
    isInteractive?: boolean;
    predictionResult?: PredictionResult | null;
}

const chartOptions = {
    layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
        fontSize: 12,
    },
    grid: {
        vertLines: { color: 'rgba(75, 85, 99, 0.5)' },
        horzLines: { color: 'rgba(75, 85, 99, 0.5)' },
    },
    rightPriceScale: {
        borderColor: '#4B5563',
    },
    timeScale: {
        borderColor: '#4B5563',
        timeVisible: true,
        secondsVisible: false,
    },
    crosshair: {
        mode: CrosshairMode.Normal,
    },
    handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
    },
    handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
    },
    watermark: {
        visible: false,
    },
};

const PriceChartComponent: React.FC<PriceChartProps> = ({ data, isHistorical, indicatorData, srZones = [], tradeLog = [], isInteractive = true, predictionResult }) => {
    const { t } = useLanguage();
    
    const mainChartContainerRef = useRef<HTMLDivElement>(null);
    const rsiChartContainerRef = useRef<HTMLDivElement>(null);
    const macdChartContainerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const [isUserScrolledBack, setIsUserScrolledBack] = useState(false);
    const isUserScrolledBackRef = useRef(isUserScrolledBack);
    useEffect(() => {
        isUserScrolledBackRef.current = isUserScrolledBack;
    }, [isUserScrolledBack]);


    const chartRefs = useRef<{
        main?: IChartApi;
        rsi?: IChartApi;
        macd?: IChartApi;
        candleSeries?: ISeriesApi<"Candlestick">;
        volumeSeries?: ISeriesApi<"Histogram">;
        ema20?: ISeriesApi<"Line">;
        ema24?: ISeriesApi<"Line">;
        ema52?: ISeriesApi<"Line">;
        bbUpper?: ISeriesApi<"Line">;
        bbLower?: ISeriesApi<"Line">;
        rsiSeries?: ISeriesApi<"Line">;
        macdLine?: ISeriesApi<"Line">;
        macdSignal?: ISeriesApi<"Line">;
        macdHist?: ISeriesApi<"Histogram">;
        priceLines: any[];
    }>({ priceLines: [] });
    
    const formatPrice = useCallback((price: number): string => {
        if (typeof price !== 'number' || isNaN(price)) return '';
        if (price >= 100) return price.toFixed(2);
        if (price >= 0.1) return price.toFixed(4);
        if (price >= 0.001) return price.toFixed(6);
        return price.toFixed(8);
    }, []);

    const { hasRsi, hasMacd } = useMemo(() => {
        const hasRsi = indicatorData.rsi14 && indicatorData.rsi14.some(d => d !== null);
        const hasMacd = indicatorData.macd && indicatorData.macd.some(d => d !== null);
        return { hasRsi, hasMacd };
    }, [indicatorData]);

    // Tooltip logic
    const updateTooltip = useCallback((param: any, chart: IChartApi) => {
        const tooltip = tooltipRef.current;
        if (!tooltip || !param.time || !param.point || !chartRefs.current.candleSeries) {
            tooltip?.style.setProperty('display', 'none');
            return;
        }

        const candleData = param.seriesData.get(chartRefs.current.candleSeries);
        
        if (!candleData) {
            tooltip?.style.setProperty('display', 'none');
            return;
        }

        tooltip.style.setProperty('display', 'block');
        
        let content = `<div class="text-gray-300 font-semibold">${new Date(candleData.time * 1000).toLocaleString()}</div>`;
        content += `<div class="text-${candleData.close >= candleData.open ? 'green-400' : 'red-400'}"><strong>O:</strong> ${formatPrice(candleData.open)} <strong>H:</strong> ${formatPrice(candleData.high)} <strong>L:</strong> ${formatPrice(candleData.low)} <strong>C:</strong> ${formatPrice(candleData.close)}</div>`;
        
        const volumeData = param.seriesData.get(chartRefs.current.volumeSeries);
        if (volumeData) {
            content += `<div class="text-gray-400"><strong>Vol:</strong> ${volumeData.value.toFixed(2)}</div>`;
        }

        tooltip.innerHTML = content;

        const y = param.point.y;
        const x = param.point.x;

        tooltip.style.left = x + 20 + 'px';
        tooltip.style.top = y + 20 + 'px';

        if (mainChartContainerRef.current) {
            if (x > mainChartContainerRef.current.clientWidth - tooltip.clientWidth - 20) {
               tooltip.style.left = x - tooltip.clientWidth - 20 + 'px';
            }
            if (y > mainChartContainerRef.current.clientHeight - tooltip.clientHeight - 20) {
                tooltip.style.top = y - tooltip.clientHeight - 20 + 'px';
            }
        }

    }, [formatPrice]);


    // Initialization and Synchronization
    useEffect(() => {
        const mainContainer = mainChartContainerRef.current;
        if (!mainContainer) return;

        const chartInstances: IChartApi[] = [];
        const chartMap = new Map<Element, IChartApi>();
        const { current: refs } = chartRefs;

        const createAndSyncChart = (container: HTMLDivElement) => {
            const chart = createChart(container, { ...chartOptions, width: container.clientWidth, height: container.clientHeight, timeScale: { ...chartOptions.timeScale, tickMarkFormatter: (time: UTCTimestamp, tickMarkType: TickMarkType, locale: string) => {
                const date = new Date(time * 1000);
                 if (tickMarkType === TickMarkType.Year) return date.getFullYear().toString();
                 if (tickMarkType === TickMarkType.Month) return new Intl.DateTimeFormat(locale, { month: 'short' }).format(date);
                 if (tickMarkType === TickMarkType.DayOfMonth) return date.getDate().toString();
                 return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
            }}});
            chartInstances.push(chart);
            chartMap.set(container, chart);
            return chart;
        };
        
        refs.main = createAndSyncChart(mainContainer);
        if (hasRsi && rsiChartContainerRef.current) refs.rsi = createAndSyncChart(rsiChartContainerRef.current);
        if (hasMacd && macdChartContainerRef.current) refs.macd = createAndSyncChart(macdChartContainerRef.current);
        
        // Sync time scales and crosshairs
        chartInstances.forEach(chart => {
            chart.timeScale().subscribeVisibleLogicalRangeChange((range: LogicalRange | null) => {
                chartInstances.filter(c => c !== chart).forEach(c => c.timeScale().setVisibleLogicalRange(range!));

                if (chart === refs.main && range) {
                    const barsInfo = refs.candleSeries?.barsInLogicalRange(range);
                    if (barsInfo) {
                        // If there are less than 5 bars off-screen to the right, consider user at the live edge.
                        if (barsInfo.barsAfter < 5) {
                            if (isUserScrolledBackRef.current) setIsUserScrolledBack(false);
                        } else {
                            if (!isUserScrolledBackRef.current) setIsUserScrolledBack(true);
                        }
                    }
                }
            });
            chart.subscribeCrosshairMove(param => {
                // If the crosshair is moved off the chart, param.point will be undefined.
                // This guard prevents errors and hides the tooltip.
                if (!param.point || !param.time) {
                    if (chart === refs.main) {
                        const tooltip = tooltipRef.current;
                        if (tooltip) {
                            tooltip.style.display = 'none';
                        }
                    }
                    return;
                }

                // Sync crosshair with other charts.
                chartInstances.filter(c => c !== chart).forEach(c => {
                    // FIX: Add a defensive check for the existence of the `moveCrosshair` method.
                    // This prevents a runtime crash if the library version has an incomplete API.
                    if (typeof (c as any).moveCrosshair === 'function') {
                        (c as any).moveCrosshair(param.point);
                    }
                });
                
                // Update tooltip on the main chart.
                if (chart === refs.main) {
                    updateTooltip(param, chart);
                }
            });
        });

        const resizeObserver = new ResizeObserver(entries => {
            window.requestAnimationFrame(() => {
                if (!Array.isArray(entries) || !entries.length) {
                    return;
                }
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    const chart = chartMap.get(entry.target);
                    // Check if chart is still mounted and has a valid size
                    if (chart && width > 0 && height > 0) {
                        chart.applyOptions({ width, height });
                    }
                }
            });
        });
        
        chartMap.forEach((_, element) => resizeObserver.observe(element));

        // Create Series
        if (refs.main) {
            // FIX: Cast to 'any' to bypass TS error, assuming method exists at runtime.
            refs.candleSeries = (refs.main as any).addCandlestickSeries({ upColor: '#10B981', downColor: '#EF4444', borderVisible: false, wickUpColor: '#10B981', wickDownColor: '#EF4444' });
            // FIX: Cast to 'any' to bypass TS error, assuming method exists at runtime.
            refs.volumeSeries = (refs.main as any).addHistogramSeries({ color: '#26a69a', priceFormat: { type: 'volume' }, priceScaleId: 'volume_scale' });
            refs.main.priceScale('volume_scale').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false });

            // FIX: Cast to 'any' to bypass TS error, assuming method exists at runtime.
            if (indicatorData.ema20) refs.ema20 = (refs.main as any).addLineSeries({ color: '#06B6D4', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
            // FIX: Cast to 'any' to bypass TS error, assuming method exists at runtime.
            if (indicatorData.ema24) refs.ema24 = (refs.main as any).addLineSeries({ color: '#FBBF24', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
            // FIX: Cast to 'any' to bypass TS error, assuming method exists at runtime.
            if (indicatorData.ema52) refs.ema52 = (refs.main as any).addLineSeries({ color: '#EC4899', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
            if (indicatorData.bb20) {
                // FIX: Cast to 'any' to bypass TS error, assuming method exists at runtime.
                refs.bbUpper = (refs.main as any).addLineSeries({ color: '#FBBF24', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
                // FIX: Cast to 'any' to bypass TS error, assuming method exists at runtime.
                refs.bbLower = (refs.main as any).addLineSeries({ color: '#FBBF24', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
            }
        }
        if (refs.rsi) {
            // FIX: Cast to 'any' to bypass TS error, assuming method exists at runtime.
            refs.rsiSeries = (refs.rsi as any).addLineSeries({ color: '#A78BFA', lineWidth: 2, lastValueVisible: true, title: 'RSI(14)' });
            refs.rsiSeries.createPriceLine({ price: 70, color: 'rgba(239, 68, 68, 0.5)', lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '70' });
            refs.rsiSeries.createPriceLine({ price: 30, color: 'rgba(16, 185, 129, 0.5)', lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '30' });
        }
        if (refs.macd) {
            // FIX: Cast to 'any' to bypass TS error, assuming method exists at runtime.
            refs.macdLine = (refs.macd as any).addLineSeries({ color: '#4f46e5', lineWidth: 2, title: 'MACD' });
            // FIX: Cast to 'any' to bypass TS error, assuming method exists at runtime.
            refs.macdSignal = (refs.macd as any).addLineSeries({ color: '#f97316', lineWidth: 2, title: 'Signal' });
            // FIX: Cast to 'any' to bypass TS error, assuming method exists at runtime.
            refs.macdHist = (refs.macd as any).addHistogramSeries({ title: 'Hist' });
        }


        return () => {
            resizeObserver.disconnect();
            chartInstances.forEach(chart => chart.remove());
            chartRefs.current = { priceLines: [] };
        };
    }, [hasRsi, hasMacd, updateTooltip]); // Re-init if indicators presence changes
    
    // Data update effect
    useEffect(() => {
        const { current: refs } = chartRefs;
        if (!refs.main || !refs.candleSeries || data.length === 0) return;

        const candleData = data.map(d => ({ time: d.time as UTCTimestamp, open: d.open, high: d.high, low: d.low, close: d.close }));
        refs.candleSeries.setData(candleData);

        const volumeData = data.map(d => ({ time: d.time as UTCTimestamp, value: d.volume, color: d.isBullish ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)' }));
        refs.volumeSeries?.setData(volumeData);

        const mapIndicator = (indicator: (number | null)[] | undefined) => (indicator || []).map((value, index) => ({ time: data[index].time as UTCTimestamp, value: value ?? undefined })).filter(item => typeof item.value === 'number');
        
        if (refs.ema20) refs.ema20.setData(mapIndicator(indicatorData.ema20));
        if (refs.ema24) refs.ema24.setData(mapIndicator(indicatorData.ema24));
        if (refs.ema52) refs.ema52.setData(mapIndicator(indicatorData.ema52));
        if (refs.bbUpper && refs.bbLower && indicatorData.bb20) {
            const bbUpperData = indicatorData.bb20.map((d, i) => ({ time: data[i].time as UTCTimestamp, value: d?.upper ?? undefined })).filter(item => typeof item.value === 'number');
            const bbLowerData = indicatorData.bb20.map((d, i) => ({ time: data[i].time as UTCTimestamp, value: d?.lower ?? undefined })).filter(item => typeof item.value === 'number');
            refs.bbUpper.setData(bbUpperData);
            refs.bbLower.setData(bbLowerData);
        }

        if (refs.rsiSeries) refs.rsiSeries.setData(mapIndicator(indicatorData.rsi14));
        
        if (refs.macdLine && refs.macdSignal && refs.macdHist && indicatorData.macd) {
            const macdLineData = indicatorData.macd.map((d, i) => ({ time: data[i].time as UTCTimestamp, value: d?.macd ?? undefined })).filter(item => typeof item.value === 'number');
            const macdSignalData = indicatorData.macd.map((d, i) => ({ time: data[i].time as UTCTimestamp, value: d?.signal ?? undefined })).filter(item => typeof item.value === 'number');
            const macdHistData = indicatorData.macd.map((d, i) => ({ time: data[i].time as UTCTimestamp, value: d?.histogram ?? undefined, color: d && d.histogram >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)' })).filter(item => typeof item.value === 'number');
            refs.macdLine.setData(macdLineData);
            refs.macdSignal.setData(macdSignalData);
            refs.macdHist.setData(macdHistData);
        }

        if (isInteractive && !isHistorical && !isUserScrolledBackRef.current) {
            refs.main.timeScale().scrollToRealTime();
        } else if(isInteractive && isHistorical) {
             refs.main.timeScale().fitContent();
        }

        // Clear previous markers & lines
        // FIX: `clearMarkers` is deprecated. Use `setMarkers([])`. Cast to 'any' to bypass TS error.
        (refs.candleSeries as any).setMarkers([]);
        // FIX: Cast to 'any' to handle potential missing method on type.
        refs.priceLines.forEach(line => (refs.candleSeries as any)?.removePriceLine(line));
        refs.priceLines = [];

        // Draw Trade Logs
        if (tradeLog.length > 0) {
            const markers = tradeLog.map(log => ({
                time: log.time as UTCTimestamp,
                position: log.direction === 'LONG' ? 'belowBar' : 'aboveBar',
                color: log.type === 'ENTRY' ? (log.direction === 'LONG' ? '#22C55E' : '#EF4444') : (log.profit && log.profit > 0 ? '#22C55E' : '#EF4444'),
                shape: log.type === 'ENTRY' ? (log.direction === 'LONG' ? 'arrowUp' : 'arrowDown') : 'circle',
                text: log.type === 'ENTRY' ? log.direction[0] : (log.profit && log.profit > 0 ? 'TP' : 'SL'),
                size: 1,
            } as const));
            // FIX: Cast to 'any' to bypass TS error, assuming method exists at runtime.
            (refs.candleSeries as any).setMarkers(markers);
        }

        // Draw prediction lines
        if(predictionResult && predictionResult.status === 'PLAN_TRADE' && refs.candleSeries){
            // FIX: Use `1 as const` to ensure the type is inferred as literal `1`, which is assignable to `LineWidth`.
            const lineOptions = {
                lineWidth: 1 as const,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                axisLabelColor: '#ffffff',
                axisLabelBackgroundColor: '#00000000',
            };
            if(predictionResult.entryPrice) refs.priceLines.push(refs.candleSeries.createPriceLine({ price: predictionResult.entryPrice, color: '#f59e0b', ...lineOptions, title: ` Entry: ${formatPrice(predictionResult.entryPrice)} ` }));
            if(predictionResult.slPrice) refs.priceLines.push(refs.candleSeries.createPriceLine({ price: predictionResult.slPrice, color: '#ef4444', ...lineOptions, title: ` SL: ${formatPrice(predictionResult.slPrice)} ` }));
            if(predictionResult.tpPrice) refs.priceLines.push(refs.candleSeries.createPriceLine({ price: predictionResult.tpPrice, color: '#22c55e', ...lineOptions, title: ` TP: ${formatPrice(predictionResult.tpPrice)} ` }));
        }


    }, [data, indicatorData, srZones, tradeLog, isHistorical, isInteractive, predictionResult, formatPrice, hasRsi, hasMacd]);
    
    // Pan/Zoom controls
    const handlePan = (direction: 'left' | 'right') => {
        const chart = chartRefs.current.main;
        if (!chart) return;
        const visibleRange = chart.timeScale().getVisibleLogicalRange();
        if(!visibleRange) return;
        const panAmount = (visibleRange.to - visibleRange.from) * 0.2;
        const move = direction === 'left' ? -panAmount : panAmount;
        chart.timeScale().scrollToPosition(visibleRange.from + move, true);
    };

    const handleZoom = (factor: number) => {
        const chart = chartRefs.current.main;
        if (!chart) return;
        const timeScale = chart.timeScale();
        const visibleRange = timeScale.getVisibleLogicalRange();
        if (!visibleRange) return;
        const newSpan = (visibleRange.to - visibleRange.from) * factor;
        const middle = (visibleRange.from + visibleRange.to) / 2;
        timeScale.setVisibleLogicalRange({
            from: middle - newSpan / 2,
            to: middle + newSpan / 2,
        });
    };

    const handleReset = () => {
        chartRefs.current.main?.timeScale().fitContent();
    };

    const handleScrollToRealTime = () => {
        chartRefs.current.main?.timeScale().scrollToRealTime();
        setIsUserScrolledBack(false);
    };


    if (!data || data.length === 0) {
        return <div className="h-full flex items-center justify-center text-gray-500">{t('noData')}</div>;
    }

    let mainChartHeight = '100%';
    if (hasRsi && hasMacd) mainChartHeight = '60%';
    else if (hasRsi || hasMacd) mainChartHeight = '70%';
    
    return (
        <div className="relative w-full h-full flex flex-col">
            {isInteractive && (
                 <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-gray-800/50 backdrop-blur-sm p-1 rounded-md border border-gray-700">
                    <button title={t('panLeft')} onClick={() => handlePan('left')} className="p-1.5 rounded hover:bg-gray-700 transition-colors"><ChevronLeftIcon className="w-5 h-5" /></button>
                    <button title={t('panRight')} onClick={() => handlePan('right')} className="p-1.5 rounded hover:bg-gray-700 transition-colors"><ChevronRightIcon className="w-5 h-5" /></button>
                    <button title={t('zoomIn')} onClick={() => handleZoom(0.8)} className="p-1.5 rounded hover:bg-gray-700 transition-colors"><ZoomInIcon className="w-5 h-5" /></button>
                    <button title={t('zoomOut')} onClick={() => handleZoom(1.2)} className="p-1.5 rounded hover:bg-gray-700 transition-colors"><ZoomOutIcon className="w-5 h-5" /></button>
                    <button title={t('resetZoom')} onClick={handleReset} className="p-1.5 rounded hover:bg-gray-700 transition-colors"><ExpandIcon className="w-5 h-5" /></button>
                </div>
            )}

            <div className="relative" style={{ height: mainChartHeight }}>
                <div ref={mainChartContainerRef} className="w-full h-full" />
                {isUserScrolledBack && !isHistorical && (
                    <button
                        onClick={handleScrollToRealTime}
                        className="absolute bottom-4 right-20 z-10 bg-cyan-600/80 hover:bg-cyan-500 text-white font-semibold py-1 px-3 rounded-full shadow-lg transition-all duration-300 flex items-center gap-2 animate-fade-in-right"
                        title={t('scrollToLatest')}
                    >
                        <ChevronRightIcon className="w-4 h-4" />
                        <span>{t('scrollToLatest')}</span>
                    </button>
                )}
            </div>
            
            {hasRsi && <div ref={rsiChartContainerRef} className="flex-grow border-t border-gray-700" />}
            {hasMacd && <div ref={macdChartContainerRef} className="flex-grow border-t border-gray-700" />}
            <div ref={tooltipRef} className="absolute z-20 pointer-events-none hidden bg-gray-700/80 backdrop-blur-sm p-2 border border-gray-600 rounded-md shadow-lg text-sm w-max"></div>
        </div>
    );
};

export const PriceChart = React.memo(PriceChartComponent);
