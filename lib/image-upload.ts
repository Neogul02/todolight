import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

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
 * 정사각형 이미지를 올리고 공개 URL을 돌려준다.
 * 경로는 대상마다 하나로 고정하고 덮어쓴다 — 파일이 쌓이지 않는 대신 브라우저가 옛 이미지를
 * 캐시하므로, 돌려주는 URL 끝에 버전 쿼리를 붙여 무효화한다.
 */
async function uploadSquare(bucket: string, path: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있어요.');

  const blob = await toSquareWebp(file);
  const supabase = createSupabaseBrowserClient();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: 'image/webp', upsert: true });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

async function removeFile(bucket: string, path: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  // 파일이 이미 없어도 DB의 URL은 지워야 하므로 실패를 삼킨다
  if (error) console.error('[storage]', error.message);
}

export const uploadAvatar = (userId: string, file: File) =>
  uploadSquare('avatars', `${userId}/avatar.webp`, file);

export const removeAvatar = (userId: string) => removeFile('avatars', `${userId}/avatar.webp`);

export const uploadOrgImage = (orgId: string, file: File) =>
  uploadSquare('org-images', `${orgId}/icon.webp`, file);

export const removeOrgImage = (orgId: string) => removeFile('org-images', `${orgId}/icon.webp`);
