import 'server-only';

export interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

/** 베이지/블랙 팔레트에 맞춘 임베드 좌측 바 색 */
const EMBED_COLOR = 0x14120f;

/**
 * Discord 웹훅으로 알림을 쏜다.
 * 알림 실패가 본래 작업(할 일 추가 등)을 되돌리면 안 되므로 절대 throw하지 않는다.
 * 호출부는 next/server의 after()로 감싸 응답을 막지 않도록 할 것.
 */
export async function notifyDiscord(
  webhookUrl: string | null | undefined,
  title: string,
  description: string,
  fields?: DiscordField[]
): Promise<void> {
  const url = webhookUrl || process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title,
            description,
            color: EMBED_COLOR,
            fields: fields?.filter(f => f.value),
            timestamp: new Date().toISOString(),
          },
        ],
      }),
      // 웹훅이 느려도 서버리스 함수를 붙잡고 있지 않게 한다
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) console.error('[discord]', res.status, await res.text().catch(() => ''));
  } catch (e) {
    console.error('[discord]', e);
  }
}

/** 길이 제한이 있는 임베드에 넣기 전에 자른다 */
export function truncate(text: string, max = 200): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
