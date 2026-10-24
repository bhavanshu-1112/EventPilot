import React from 'react';
import { AlertTriangle, AlertOctagon, Info, CheckCircle2, Lock, Unlock } from 'lucide-react';

export type BadgeVariant =
  'danger' | 'warning' | 'info' | 'success' | 'locked' | 'unlocked' | 'neutral';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ variant, children, className = '', size = 'md' }) => {
  const getIcon = () => {
    const iconSize = size === 'sm' ? 12 : 14;
    switch (variant) {
      case 'danger':
        return <AlertOctagon size={iconSize} className="mr-1 shrink-0" aria-hidden="true" />;
      case 'warning':
        return <AlertTriangle size={iconSize} className="mr-1 shrink-0" aria-hidden="true" />;
      case 'info':
        return <Info size={iconSize} className="mr-1 shrink-0" aria-hidden="true" />;
      case 'success':
        return <CheckCircle2 size={iconSize} className="mr-1 shrink-0" aria-hidden="true" />;
      case 'locked':
        return <Lock size={iconSize} className="mr-1 shrink-0" aria-hidden="true" />;
      case 'unlocked':
        return <Unlock size={iconSize} className="mr-1 shrink-0" aria-hidden="true" />;
      default:
        return null;
    }
  };

  const getStyle = () => {
    switch (variant) {
      case 'danger':
        return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800';
      case 'warning':
        return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
      case 'info':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800';
      case 'success':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
      case 'locked':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800';
      case 'unlocked':
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center font-medium border rounded-full ${sizeClasses} ${getStyle()} ${className}`}
    >
      {getIcon()}
      <span>{children}</span>
    </span>
  );
};
