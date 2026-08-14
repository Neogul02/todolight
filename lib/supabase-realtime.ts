import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * 실시간 채널 전용 싱글턴.
 * 채널은 클라이언트 인스턴스에 붙기 때문에, 컴포넌트마다 새 클라이언트를 만들면
 * 웹소켓 연결이 중복으로 열린다 — 여기서 하나만 유지한다.
 */
export function getRealtimeClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { realtime: { params: { eventsPerSecond: 10 } } }
    );
  }
  return client;
}
