import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
    isNeutral?: boolean;
    label?: string;
  };
  icon: React.ElementType;
  highlight?: boolean;
  delay?: number;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  highlight = false,
  delay = 0,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={{
        y: -3,
        transition: { duration: 0.18 },
      }}
      className={cn(
        'group relative p-4 rounded-xl border transition-all duration-300',
        'bg-white dark:bg-[#1a1919]/90 backdrop-blur-sm',
        highlight
          ? 'border-violet-300 dark:border-[#dab9ff]/60 bg-violet-50/70 dark:bg-gradient-to-br dark:from-[#201330]/90 dark:to-[#1a1919] shadow-xs dark:shadow-[#dab9ff]/10'
          : 'border-slate-200 dark:border-[#333333] shadow-xs dark:shadow-md hover:border-violet-300 dark:hover:border-[#dab9ff]/40 hover:shadow-md dark:hover:shadow-[#dab9ff]/5'
      )}
    >
      {/* Ambient background hover flare */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-violet-500/5 dark:via-[#dab9ff]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="flex items-center justify-between gap-3 mb-2 relative z-10">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#cdc3d4] group-hover:text-slate-900 dark:group-hover:text-[#e5e2e1] transition-colors">
          {title}
        </span>
        <motion.div
          whileHover={{ rotate: 10, scale: 1.1 }}
          className={cn(
            'p-2 rounded-lg text-xs transition-colors shadow-xs',
            highlight
              ? 'bg-violet-600 dark:bg-[#dab9ff] text-white dark:text-[#460283] shadow-violet-500/20 dark:shadow-[#dab9ff]/20'
              : 'bg-slate-100 dark:bg-[#252424] text-slate-600 dark:text-[#cdc3d4] group-hover:text-violet-600 dark:group-hover:text-[#dab9ff] group-hover:bg-violet-50 dark:group-hover:bg-[#dab9ff]/10'
          )}
        >
          <Icon className="w-4 h-4 stroke-[2]" />
        </motion.div>
      </div>

      <div className="flex items-baseline justify-between gap-2 relative z-10">
        <div className="font-mono text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 dark:text-[#e5e2e1] tabular-nums">
          {value}
        </div>

        {trend && (
          <div
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border shadow-xs',
              trend.isNeutral
                ? 'bg-slate-100 dark:bg-[#252424] text-slate-600 dark:text-[#cdc3d4] border-slate-200 dark:border-[#333333]'
                : trend.isPositive
                ? 'bg-emerald-50 dark:bg-[#0f241a] text-emerald-700 dark:text-[#75d1ff] border-emerald-200 dark:border-[#1d4d38]'
                : 'bg-rose-50 dark:bg-[#2a0e12] text-rose-700 dark:text-[#ffb4ab] border-rose-200 dark:border-[#690005]'
            )}
          >
            {trend.isNeutral ? (
              <Minus className="w-3 h-3" />
            ) : trend.isPositive ? (
              <ArrowUpRight className="w-3 h-3 stroke-[2.5]" />
            ) : (
              <ArrowDownRight className="w-3 h-3 stroke-[2.5]" />
            )}
            <span>{trend.value}</span>
          </div>
        )}
      </div>

      {(subtitle || trend?.label) && (
        <p className="mt-2 text-xs text-slate-500 dark:text-[#978d9d] group-hover:text-slate-700 dark:group-hover:text-[#cdc3d4] truncate transition-colors relative z-10">
          {subtitle || trend?.label}
        </p>
      )}
    </motion.div>
  );
};
