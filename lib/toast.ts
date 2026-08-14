import { toast } from 'sonner';

export function showMsg(message: string, type: 'success' | 'error' | 'info' = 'info') {
  if (type === 'success') return toast.success(message);
  if (type === 'error') return toast.error(message);
  return toast(message);
}
