'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'solid' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  solid: 'bg-accent text-accent-ink hover:opacity-90 active:opacity-80',
  outline: 'bg-surface text-ink border border-hairline-strong hover:bg-surface-alt',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-alt hover:text-ink',
  // 되돌릴 수 없는 동작 전용. 눌러도 되는 버튼처럼 보이면 안 되므로 채워서 쓴다.
  danger: 'bg-danger text-danger-ink hover:opacity-90 active:opacity-80',
};

// 모바일 우선 — 터치 타깃을 Apple HIG 최소치(44pt)에 가깝게 두고, sm 이상에서만 조밀하게 줄인다.
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-10 px-3.5 text-[13px] rounded-lg sm:h-8 sm:px-3',
  md: 'h-12 px-4 text-[15px] rounded-xl sm:h-10 sm:text-[14px]',
  lg: 'h-13 px-5 text-[16px] rounded-2xl sm:h-12 sm:text-[15px] sm:rounded-xl',
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
>(function Button({ className, variant = 'solid', size = 'md', ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 font-medium no-select',
        'transition-[opacity,background-color,color,transform] active:scale-[0.97]',
        'disabled:opacity-40 disabled:pointer-events-none disabled:active:scale-100',
        VARIANT[variant],
        SIZE[size],
        className
      )}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-12 w-full rounded-xl border border-hairline bg-surface px-3.5 text-[16px] text-ink sm:h-10 sm:px-3 sm:text-[14px]',
          'placeholder:text-ink-faint outline-none transition-colors',
          'focus:border-hairline-strong focus:ring-2 focus:ring-accent/10',
          className
        )}
        {...props}
      />
    );
  }
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full resize-none rounded-xl border border-hairline bg-surface px-3 py-2 text-[14px] text-ink',
        'placeholder:text-ink-faint outline-none transition-colors',
        'focus:border-hairline-strong focus:ring-2 focus:ring-accent/10',
        className
      )}
      {...props}
    />
  );
});

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-2xl border border-hairline bg-surface shadow-level-1', className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}) {
  const tones = {
    neutral: 'bg-canvas-soft text-ink-muted',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    accent: 'bg-accent text-accent-ink',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-hairline px-4 py-8 text-center">
      <p className="text-[14px] text-ink-muted">{title}</p>
      {hint && <p className="text-caption text-ink-faint">{hint}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-hairline-strong border-t-transparent',
        className
      )}
    />
  );
}
