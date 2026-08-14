import { cn, initialOf } from '@/lib/utils';

export function Avatar({
  name,
  emoji,
  size = 'md',
  className,
}: {
  name: string;
  emoji?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'size-6 text-[12px]',
    md: 'size-8 text-[14px]',
    lg: 'size-11 text-[18px]',
  };
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-hairline bg-canvas-soft font-semibold text-ink-secondary select-none',
        sizes[size],
        className
      )}
      aria-hidden
    >
      {emoji || initialOf(name)}
    </span>
  );
}
