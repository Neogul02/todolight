import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notify } from '@/lib/push';
import { todayKST } from '@/lib/utils';

/**
 * 아침 9시(KST) 오늘 마감 알림. Supabase pg_cron이 부른다(20261123130507_push_notifications.sql).
 * 비밀값은 Vault의 `cron_secret` = 환경 변수 `CRON_SECRET`.
 * 기기를 등록한 사람만 본다 — 앱을 안 쓰는 사람 몫까지 할 일을 읽을 이유가 없다.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 });
  }
  const db = getSupabaseAdmin();
  const { data: devices } = await db.from('push_devices').select('user_id');
  const users = [...new Set((devices ?? []).map(d => d.user_id))];
  if (users.length === 0) return Response.json({ sent: 0 });

  const { data: todos, error } = await db
    .from('todos')
    .select('owner_id, title, created_at')
    .in('owner_id', users)
    .eq('due_date', todayKST())
    .neq('status', 'done')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const byUser = new Map<string, string[]>();
  for (const t of todos ?? []) byUser.set(t.owner_id, [...(byUser.get(t.owner_id) ?? []), t.title]);

  await Promise.all(
    [...byUser].map(([userId, titles]) =>
      notify({
        kind: 'digest',
        to: [userId],
        params: { title: titles[0], count: titles.length },
        refId: todayKST(),
      })
    )
  );
  return Response.json({ sent: byUser.size });
}
