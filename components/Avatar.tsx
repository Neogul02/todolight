import { getAvatarColor } from '@/lib/avatar';
import { cn, initialOf } from '@/lib/utils';

/**
 * 프로필 사진이 있으면 사진, 없으면 이름 첫 글자 + 색.
 * 색을 고르지 않았으면 seed(보통 user id)에서 결정적으로 하나 뽑아 쓴다.
 *
 * "남의 사진 숨기기" 취향은 두지 않는다 — 아바타는 사람을 구분하려고 있는 것이고,
 * 사진을 지우면 구분이 오히려 흐려진다. 그 설정 하나 때문에 이 컴포넌트가 앱 컨텍스트를
 * 읽어야 했고, 그래서 아바타 하나 그리는 데 클라이언트 컴포넌트가 필요했다.
 */
export function Avatar({
  name,
  color,
  imageUrl,
  seed,
  size = 'md',
  className,
}: {
  name: string;
  color?: string | null;
  imageUrl?: string | null;
  seed?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'size-6 text-[11px]',
    md: 'size-8 text-[13px]',
    lg: 'size-11 text-[17px]',
  };

  if (imageUrl) {
    return (
      // next/image를 쓰지 않는다 — Storage 도메인마다 remotePatterns를 등록해야 하는데
      // 아바타는 이미 256px webp로 줄여서 올리므로 최적화할 여지가 없다.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={cn('inline-block shrink-0 rounded-full object-cover', sizes[size], className)}
      />
    );
  }

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
