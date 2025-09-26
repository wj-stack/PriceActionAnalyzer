
import React from 'react';
import { ResponsiveContainer, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Area } from 'recharts';
import { useLanguage } from '../contexts/LanguageContext';
import { EquityDataPoint } from '../types';

interface EquityChartProps {
    data: EquityDataPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-gray-700/80 backdrop-blur-sm p-2 border border-gray-600 rounded-md shadow-lg text-sm">
        <p className="label text-gray-300">{new Date(data.time * 1000).toLocaleString()}</p>
        <p className="text-cyan-400 font-bold">Equity: ${data.equity.toFixed(2)}</p>
      </div>
    );
  }
  return null;
};

export const EquityChart: React.FC<EquityChartProps> = ({ data }) => {
    const { t } = useLanguage();

    if (data.length <= 1) {
        return (
            <div>
                 <h3 className="text-base font-bold text-cyan-400 mb-2">{t('equityCurve')}</h3>
                <div className="h-[100px] flex items-center justify-center text-gray-500 text-sm">
                    <p>{t('notEnoughDataForChart')}</p>
                </div>
            </div>
        );
    }
    
    const chartColor = data[data.length-1].equity >= data[0].equity ? '#10B981' : '#EF4444';

    return (
        <div>
            <h3 className="text-base font-bold text-cyan-400 mb-2">{t('equityCurve')}</h3>
            <div style={{ width: '100%', height: 100 }}>
                <ResponsiveContainer>
                    <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="equity" stroke={chartColor} strokeWidth={2} fillOpacity={0.4} fill={chartColor} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
