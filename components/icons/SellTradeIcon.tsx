import React from 'react';

export const SellTradeIcon: React.FC<React.SVGProps<SVGSVGElement> & { cx?: number, cy?: number }> = ({ cx = 0, cy = 0, ...props }) => (
    <g transform={`translate(${cx}, ${cy})`} {...props}>
        <circle cx="0" cy="0" r="8" fill="#EF4444" stroke="#1F2937" strokeWidth="1" />
        <text x="0" y="0" fill="#FFFFFF" textAnchor="middle" dy=".3em" fontSize="9" fontWeight="bold">S</text>
    </g>
);
