
import React from 'react';
import { ResponsiveContainer, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Area } from 'recharts';
import type { EquityDataPoint } from '../types';

interface EquityChartProps {
    data: EquityDataPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-700/80 p-2 border border-gray-600 rounded-md text-sm">
        <p className="label text-gray-300">{`${new Date(label * 1000).toLocaleDateString()}`}</p>
        <p className="intro text-cyan-400">{`Equity: ${payload[0].value.toLocaleString(undefined, {style: 'currency', currency: 'USD'})}`}</p>
      </div>
    );
  }
  return null;
};

export const EquityChart: React.FC<EquityChartProps> = ({ data }) => {
    if (!data || data.length === 0) {
        return <div className="flex items-center justify-center h-full text-gray-500">No equity data available.</div>;
    }

    const yDomain = [Math.min(...data.map(d => d.equity)) * 0.98, Math.max(...data.map(d => d.equity)) * 1.02];

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart
                data={data}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
                <defs>
                    <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#06B6D4" stopOpacity={0}/>
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#4B5563" strokeOpacity={0.5} />
                <XAxis 
                    dataKey="time" 
                    tickFormatter={(time) => new Date(time * 1000).toLocaleDateString()}
                    stroke="#9CA3AF"
                    dy={5}
                    tick={{ fontSize: 10 }}
                    type="number"
                    domain={['dataMin', 'dataMax']}
                />
                <YAxis 
                    orientation="right" 
                    stroke="#9CA3AF"
                    tick={{ fontSize: 10 }}
                    domain={yDomain}
                    tickFormatter={(val) => `$${(val / 1000).toFixed(1)}k`}
                    type="number"
                />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                    type="monotone" 
                    dataKey="equity" 
                    stroke="#06B6D4" 
                    fillOpacity={1} 
                    fill="url(#colorEquity)"
                    isAnimationActive={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
};
