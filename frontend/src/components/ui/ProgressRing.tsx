import type { ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ProgressRingProps {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  variant?: 'primary' | 'accent' | 'warning' | 'success' | 'sand'
  className?: string
  trackClassName?: string
  showText?: boolean
  children?: ReactNode
  formatText?: (value: number, max: number) => string
}

const VARIANTS: Record<string, string> = {
  primary: 'text-primary',
  accent: 'text-accent',
  warning: 'text-warning',
  success: 'text-success',
  sand: 'text-sand-foreground',
}

/**
 * Circular progress ring matching the donut progress gauges in modern learning dashboards.
 */
export function ProgressRing({
  value,
  max = 100,
  size = 44,
  strokeWidth = 4,
  variant = 'primary',
  className,
  trackClassName,
  showText = false,
  children,
  formatText,
}: ProgressRingProps): ReactElement {
  const safeMax = max <= 0 ? 100 : max
  const clampedValue = Math.min(Math.max(0, value), safeMax)
  const percentage = Math.round((clampedValue / safeMax) * 100)

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (clampedValue / safeMax) * circumference

  const strokeColorClass = VARIANTS[variant] || 'text-primary'

  return (
    <div
      className={cn('relative inline-flex items-center justify-center shrink-0', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={safeMax}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 origin-center"
      >
        {/* Track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className={cn('text-border/60 dark:text-border/40', trackClassName)}
        />
        {/* Progress indicator circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={cn('transition-[stroke-dashoffset] duration-500 ease-out', strokeColorClass)}
        />
      </svg>

      {/* Centered label or content */}
      {(showText || children) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {children ? (
            children
          ) : (
            <span
              className="font-bold text-foreground tabular-nums leading-none"
              style={{ fontSize: Math.max(10, Math.round(size * 0.26)) }}
            >
              {formatText ? formatText(clampedValue, safeMax) : `${percentage}%`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
