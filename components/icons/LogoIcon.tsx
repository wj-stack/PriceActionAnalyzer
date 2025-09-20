
import React from 'react';

export const LogoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg
        className="w-8 h-8 text-cyan-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <path d="M3 3v18h18" />
        <path d="M7 12l3-3 4 4 5-5" />
        <path d="M18 8h3v3" />
    </svg>
);
