import { toast } from 'sonner';

export function showMsg(message: string, type: 'success' | 'error' | 'info' = 'info') {
  if (type === 'success') return toast.success(message);
  if (type === 'error') return toast.error(message);
  return toast(message);
}

/**
 * 되돌릴 수 있는 동작을 알린다.
 * 지우기처럼 확인 창 없이 즉시 실행되는 동작은, 확인을 묻는 대신 되돌릴 기회를 준다.
 */
export function showUndo(message: string, onUndo: () => void) {
  return toast(message, {
    duration: 7000,
    action: { label: '실행취소', onClick: onUndo },
  });
}
