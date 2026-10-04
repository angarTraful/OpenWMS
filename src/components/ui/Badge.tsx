import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  size?: 'sm' | 'md';
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  pulse = false,
  className,
}) => {
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px] leading-tight gap-1',
    md: 'px-2.5 py-0.5 text-[11px] leading-tight gap-1.5',
  };

  const variantClasses = {
    default: 'bg-[#201f1f] text-[#cdc3d4] border-[#333333]',
    success: 'bg-[#0f241a] text-[#75d1ff] border-[#1d4d38]',
    warning: 'bg-[#281b0a] text-[#ffd27a] border-[#533914]',
    danger: 'bg-[#2a0e12] text-[#ffb4ab] border-[#690005]',
    info: 'bg-[#201330] text-[#dab9ff] border-[#4b4452]',
    outline: 'bg-transparent text-[#cdc3d4] border-[#333333]',
  };

  const dotColors = {
    default: 'bg-[#cdc3d4]',
    success: 'bg-[#75d1ff]',
    warning: 'bg-[#ffd27a]',
    danger: 'bg-[#ffb4ab]',
    info: 'bg-[#dab9ff]',
    outline: 'bg-[#cdc3d4]',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border tracking-tight transition-all',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <motion.span
              animate={{ scale: [1, 2, 1], opacity: [0.75, 0, 0.75] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              className={cn('absolute inline-flex h-full w-full rounded-full opacity-75', dotColors[variant])}
            />
          )}
          <span className={cn('relative inline-flex rounded-full h-1.5 w-1.5', dotColors[variant])} />
        </span>
      )}
      {children}
    </span>
  );
};
