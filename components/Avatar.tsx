import { getAvatarColor } from '@/lib/avatar';
import { cn, initialOf } from '@/lib/utils';

/**
 * 이름 첫 글자 + 색으로 사람을 구분한다.
 * 색을 고르지 않았으면 seed(보통 user id)에서 결정적으로 하나 뽑아 쓴다.
 */
export function Avatar({
  name,
  color,
  seed,
  size = 'md',
  className,
}: {
  name: string;
  color?: string | null;
  seed?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'size-6 text-[11px]',
    md: 'size-8 text-[13px]',
    lg: 'size-11 text-[17px]',
  };
  const c = getAvatarColor(color, seed ?? name);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        sizes[size],
        className
      )}
      style={{ background: c.bg, color: c.ink }}
      aria-hidden
    >
      {initialOf(name)}
    </span>
  );
}
