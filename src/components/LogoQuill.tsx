import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  accentColor?: string;
}

export const LogoQuill: React.FC<LogoProps> = ({ 
  size = 24, 
  className = '',
  accentColor = '#38BDF8' 
}) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 32 32" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-all ${className}`}
    >
      {/* Outer Card Silhouette Frame */}
      <rect 
        x="3" 
        y="3" 
        width="26" 
        height="26" 
        rx="5" 
        stroke={accentColor} 
        strokeWidth="2" 
        strokeOpacity="0.4"
        fill={`${accentColor}10`}
      />
      {/* Stylized Rules-Text Arc Quill */}
      <path 
        d="M22 7C16 11 12 17 10 24C12 21 16 18 21 16C17 19 14 23 13 25" 
        stroke={accentColor} 
        strokeWidth="2.2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      {/* Rhystic Feather Nib Accent */}
      <circle cx="22" cy="7" r="2" fill={accentColor} />
      {/* Subtle Arc Spark Line */}
      <path 
        d="M7 22C10 17 15 13 22 10" 
        stroke={accentColor} 
        strokeWidth="1.2" 
        strokeDasharray="2 2" 
        strokeOpacity="0.7"
      />
    </svg>
  );
};
