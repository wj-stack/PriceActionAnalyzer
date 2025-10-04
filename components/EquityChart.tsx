import React, { useEffect, useRef } from 'react';
// FIX: Import CrosshairMode to fix a type inference issue with chart options.
import { createChart, ColorType, IChartApi, CrosshairMode } from 'lightweight-charts';
import type { EquityDataPoint } from '../types';

interface EquityChartProps {
    data: EquityDataPoint[];
}

export const EquityChart: React.FC<EquityChartProps> = ({ data }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);

    useEffect(() => {
        const chartContainer = chartContainerRef.current;
        if (!chartContainer || data.length === 0) {
            return;
        }

        // FIX: The explicit type annotation was causing a TypeScript inference error,
        // incorrectly flagging 'watermark' as an unknown property. By removing it,
        // we allow the type to be correctly inferred by the `createChart` function.
        const chartOptions = {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#9CA3AF',
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
                mode: CrosshairMode.Magnet,
            },
            watermark: {
                visible: false,
            },
        };

        const chart = createChart(chartContainer, chartOptions);
        chartRef.current = chart;

        // FIX: Cast to 'any' to bypass TS error, assuming method exists at runtime.
        const areaSeries = (chart as any).addAreaSeries({
            lineColor: '#06B6D4',
            topColor: 'rgba(6, 182, 212, 0.4)',
            bottomColor: 'rgba(6, 182, 212, 0)',
            priceLineVisible: false,
        });

        const chartData = data.map(d => ({
            time: d.time,
            value: d.equity,
        }));
        
        areaSeries.setData(chartData);
        chart.timeScale().fitContent();

        const resizeObserver = new ResizeObserver(entries => {
            window.requestAnimationFrame(() => {
                if (!Array.isArray(entries) || !entries.length) {
                    return;
                }
                const entry = entries[0];
                const { width, height } = entry.contentRect;
                // The chart might be removed before the animation frame fires.
                // Also check for valid size.
                if (chartRef.current && width > 0 && height > 0) {
                    chartRef.current.applyOptions({ width, height });
                }
            });
        });
        resizeObserver.observe(chartContainer);

        return () => {
            resizeObserver.disconnect();
            chart.remove();
            chartRef.current = null;
        };
    }, [data]);
    
    if (!data || data.length === 0) {
        return <div className="flex items-center justify-center h-full text-gray-500">No equity data available.</div>;
    }

    return <div ref={chartContainerRef} className="w-full h-full" />;
};
