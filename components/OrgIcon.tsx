import { getAvatarColor } from '@/lib/avatar';
import { cn, initialOf } from '@/lib/utils';

/**
 * 조직 아이콘. 사람 아바타와 구분되도록 원이 아니라 둥근 사각형으로 그린다.
 * 이미지가 없으면 조직 이름 첫 글자 + 조직 id에서 뽑은 색.
 */
export function OrgIcon({
  name,
  imageUrl,
  seed,
  size = 'md',
  className,
}: {
  name: string;
  imageUrl?: string | null;
  seed?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'size-6 rounded-md text-[11px]',
    md: 'size-8 rounded-lg text-[13px]',
    lg: 'size-12 rounded-xl text-[18px]',
  };

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={cn('inline-block shrink-0 object-cover', sizes[size], className)}
      />
    );
  }

  const c = getAvatarColor(null, seed ?? name);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold select-none',
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
