import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

const BUCKET = 'avatars';
const SIZE = 256;

/**
 * 원본을 그대로 올리면 3~5MB짜리 폰 사진이 그대로 올라간다.
 * 정사각형으로 가운데를 잘라 256px webp로 줄인 뒤 올린다 (보통 20KB 안팎).
 */
async function toSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 처리할 수 없어요.');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/webp', 0.85)
  );
  if (!blob) throw new Error('이미지를 바꾸지 못했어요.');
  return blob;
}

/**
 * 아바타를 올리고 공개 URL을 돌려준다.
 * 경로는 사용자마다 하나로 고정(`{userId}/avatar.webp`)하고 덮어쓴다 —
 * 파일이 쌓이지 않고, 대신 URL 끝에 버전 쿼리를 붙여 브라우저 캐시를 무효화한다.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있어요.');

  const blob = await toSquareWebp(file);
  const path = `${userId}/avatar.webp`;
  const supabase = createSupabaseBrowserClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: true });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function removeAvatar(userId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from(BUCKET).remove([`${userId}/avatar.webp`]);
  // 파일이 이미 없어도 프로필의 URL은 지워야 하므로 실패를 삼킨다
  if (error) console.error('[avatar]', error.message);
}
