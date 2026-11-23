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
  if (!ctx) throw new Error('IMAGE_PROCESS_FAILED');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/webp', 0.85),
  );
  if (!blob) throw new Error('IMAGE_PROCESS_FAILED');
  return blob;
}

/**
 * 정사각형 이미지를 올리고 공개 URL을 돌려준다.
 * 경로는 대상마다 하나로 고정하고 덮어쓴다 — 파일이 쌓이지 않는 대신 브라우저가 옛 이미지를
 * 캐시하므로, 돌려주는 URL 끝에 버전 쿼리를 붙여 무효화한다.
 */
async function uploadSquare(bucket: string, path: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('IMAGE_ONLY');

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

/**
 * 업로드 실패를 화면 문구로. 이 모듈은 번역기를 모르므로 코드로 던지고, 부른 쪽이 `toast`
 * 네임스페이스로 옮긴다. 코드가 아닌 것(Storage 오류 등)은 그대로 보여 준다.
 */
export function uploadErrorMessage(
  err: unknown,
  t: (key: 'imageOnly' | 'imageProcessFailed') => string,
): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'IMAGE_ONLY') return t('imageOnly');
  if (message === 'IMAGE_PROCESS_FAILED') return t('imageProcessFailed');
  return message;
}
