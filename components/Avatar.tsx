'use client';

import { useApp } from '@/app/(app)/OrgContext';
import { getAvatarColor } from '@/lib/avatar';
import { cn, initialOf } from '@/lib/utils';

/**
 * 프로필 사진이 있으면 사진, 없으면 이름 첫 글자 + 색.
 * 색을 고르지 않았으면 seed(보통 user id)에서 결정적으로 하나 뽑아 쓴다.
 *
 * profiles.show_avatars가 꺼져 있으면(본인 취향) 사진 대신 색 아바타로 늘 떨어진다 —
 * 누구인지 구분은 색으로 여전히 되고, 사진만 안 보인다.
 * ignorePreference는 "내 설정" 화면의 사진 관리 카드처럼 지금 무슨 사진이 올라가 있는지
 * 직접 확인해야 하는 자리에서만 켠다.
 */
export function Avatar({
  name,
  color,
  imageUrl,
  seed,
  size = 'md',
  className,
  ignorePreference = false,
}: {
  name: string;
  color?: string | null;
  imageUrl?: string | null;
  seed?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  ignorePreference?: boolean;
}) {
  const { profile } = useApp();
  const showPhoto = ignorePreference || (profile?.show_avatars ?? true);

  const sizes = {
    sm: 'size-6 text-[11px]',
    md: 'size-8 text-[13px]',
    lg: 'size-11 text-[17px]',
  };

  if (imageUrl && showPhoto) {
    return (
      // next/image를 쓰지 않는다 — Storage 도메인마다 remotePatterns를 등록해야 하는데
      // 아바타는 이미 256px webp로 줄여서 올리므로 최적화할 여지가 없다.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={cn(
          'inline-block shrink-0 rounded-full object-cover',
          sizes[size],
          className
        )}
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
