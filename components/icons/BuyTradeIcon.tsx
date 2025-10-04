
import React from 'react';

export const BuyTradeIcon: React.FC<React.SVGProps<SVGSVGElement> & { cx?: number, cy?: number }> = ({ cx = 0, cy = 0, ...props }) => (
    <g transform={`translate(${cx}, ${cy})`} {...props}>
        <circle cx="0" cy="0" r="8" fill="#22C55E" stroke="#1F2937" strokeWidth="1" />
        <text x="0" y="0" fill="#FFFFFF" textAnchor="middle" dy=".3em" fontSize="9" fontWeight="bold">B</text>
    </g>
);