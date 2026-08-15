import { toast } from 'sonner';

export function showMsg(message: string, type: 'success' | 'error' | 'info' = 'info') {
  if (type === 'success') return toast.success(message);
  if (type === 'error') return toast.error(message);
  return toast(message);
}

/**
 * 되돌릴 수 있는 동작을 알린다.
 * 지우기처럼 확인 창 없이 즉시 실행되는 동작은, 확인을 묻는 대신 되돌릴 기회를 준다.
 * undoLabel은 호출부에서 넘긴다 — sonner의 toast()는 imperative 호출이라 여기서
 * next-intl의 useTranslations를 직접 쓸 수 없다.
 */
export function showUndo(message: string, undoLabel: string, onUndo: () => void) {
  return toast(message, {
    duration: 7000,
    action: { label: undoLabel, onClick: onUndo },
  });
}
