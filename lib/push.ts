import { DEFAULT_LOCALE, isValidLocale, type Locale } from '@/lib/locales';
import 'server-only';
import { createPrivateKey, sign } from 'node:crypto';
import { connect, type ClientHttp2Session } from 'node:http2';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/*
  앱 푸시 알림 — APNs로 바로 보낸다(SDK 없이 JWT 서명 + HTTP/2 한 번).

  원칙(예전 Discord 알림과 같다):
  1. **알림 실패가 본래 작업을 되돌리면 안 된다.** `notify()`는 절대 throw하지 않는다.
  2. **응답을 막지 않는다.** 부르는 쪽은 `after(() => notify(...))`로 응답 뒤에 보낸다.
  3. **내가 한 일은 나에게 오지 않는다.** 행동한 사람은 받는 사람에서 늘 뺀다.

  APNs 키(APNS_KEY_ID · APNS_TEAM_ID · APNS_KEY)가 없으면 아무것도 보내지 않는다 —
  Apple 개발자 계정을 만들기 전에도 서버 코드는 그대로 배포할 수 있다.
*/

export type PushKind =
  | 'requested' // 1 누가 내 목록에 할 일을 넣음
  | 'given' // 2 누가 나에게 넘김
  | 'handled' // 3 누가 내 할 일을 대신 끝냄
  | 'noted' // 4 내 할 일에 메모
  | 'edited' // 5 내 할 일 제목·마감을 고침
  | 'deleted' // 6 내 할 일을 지움
  | 'joined' // 7 내 할 일에 같이하기
  | 'requestDone' // 8 내가 부탁한 일을 상대가 끝냄
  | 'eventNew' // 9 새 일정
  | 'eventChanged' // 10 일정 날짜가 바뀜
  | 'memberJoined' // 11 새 멤버(방장·관리자만)
  | 'teamTodo' // 12 팀원이 자기 할 일을 올림
  | 'teamTodoEdited' // 12 팀원이 자기 할 일을 고침
  | 'invited' // 13 초대를 받음
  | 'digest' // 14 아침 9시 오늘 마감
  | 'owner'; // 15 방장을 넘겨받음

/** 어떤 설정 칸이 이 알림을 켜고 끄나. always는 끌 수 없다(초대·방장 이양) */
const GROUP: Record<PushKind, 'my' | 'org' | 'team' | 'always'> = {
  requested: 'my',
  given: 'my',
  handled: 'my',
  noted: 'my',
  edited: 'my',
  deleted: 'my',
  joined: 'my',
  requestDone: 'my',
  digest: 'my',
  eventNew: 'org',
  eventChanged: 'org',
  memberJoined: 'org',
  teamTodo: 'team',
  teamTodoEdited: 'team',
  invited: 'always',
  owner: 'always',
};

/** 같은 대상에 대한 같은 알림을 이 시간 안에는 한 번만 — 연달아 고칠 때 알림이 쌓이지 않게 */
const DEDUPE_MINUTES: Partial<Record<PushKind, number>> = {
  edited: 5,
  eventChanged: 5,
  teamTodoEdited: 5,
  noted: 1,
};

export interface PushParams {
  actor?: string;
  org?: string;
  title?: string;
  note?: string | null;
  due?: string | null;
  range?: string;
  count?: number;
}

type Lang = Locale;

function quote(s?: string | null) {
  return s ? ` "${s.length > 80 ? `${s.slice(0, 80)}…` : s}"` : '';
}

function due(d: string | null | undefined, lang: Lang) {
  if (!d) return '';
  const [, m, day] = d.split('-').map(Number);
  return { ko: ` · ${m}월 ${day}일 마감`, en: ` · due ${m}/${day}`, ja: ` · ${m}月${day}日まで` }[
    lang
  ];
}

/** 받는 사람의 언어로 쓴다(`profiles.locale`) — 보내는 사람의 언어가 아니다 */
export function pushText(
  kind: PushKind,
  p: PushParams,
  lang: Lang
): { title: string; body: string } {
  const a = p.actor ?? { ko: '누군가', en: 'Someone', ja: '誰か' }[lang];
  const t = p.title ?? '';
  // 세 언어를 한 자리에 나란히 둔다 — 한 언어만 고치는 사고를 막는다
  const L = (ko: string, en: string, ja: string) => ({ ko, en, ja })[lang];
  switch (kind) {
    case 'requested':
      return {
        title: L(
          `${a}님이 할 일을 부탁했어요`,
          `${a} asked you to do something`,
          `${a}さんからタスクの依頼が届きました`
        ),
        body: t + due(p.due, lang),
      };
    case 'given':
      return {
        title: L(
          `${a}님이 할 일을 넘겼어요`,
          `${a} handed you a to-do`,
          `${a}さんからタスクが渡されました`
        ),
        body: t + quote(p.note),
      };
    case 'handled':
      return {
        title: L(
          `${a}님이 내 할 일을 끝냈어요`,
          `${a} finished your to-do`,
          `${a}さんがあなたのタスクを完了しました`
        ),
        body: t + quote(p.note),
      };
    case 'noted':
      return {
        title: L(`${a}님이 메모를 남겼어요`, `${a} left a note`, `${a}さんがメモを残しました`),
        body: `${t}: ${p.note ?? ''}`,
      };
    case 'edited':
      return {
        title: L(
          `${a}님이 내 할 일을 고쳤어요`,
          `${a} edited your to-do`,
          `${a}さんがあなたのタスクを編集しました`
        ),
        body: t + due(p.due, lang),
      };
    case 'deleted':
      return {
        title: L(
          `${a}님이 내 할 일을 지웠어요`,
          `${a} deleted your to-do`,
          `${a}さんがあなたのタスクを削除しました`
        ),
        body: t,
      };
    case 'joined':
      return {
        title: L(
          `${a}님이 같이하기로 했어요`,
          `${a} joined your to-do`,
          `${a}さんが一緒にやることになりました`
        ),
        body: t,
      };
    case 'requestDone':
      return {
        title: L(
          `${a}님이 부탁한 일을 끝냈어요`,
          `${a} finished what you asked`,
          `${a}さんが依頼したタスクを完了しました`
        ),
        body: t,
      };
    case 'eventNew':
      return {
        title: L('새 일정이 생겼어요', 'New event', '新しい予定ができました'),
        body: `${t} · ${p.range ?? ''}`,
      };
    case 'eventChanged':
      return {
        title: L('일정이 바뀌었어요', 'Event changed', '予定が変更されました'),
        body: `${t} · ${p.range ?? ''}`,
      };
    case 'memberJoined':
      return {
        title: L(
          `${a}님이 ${p.org}에 들어왔어요`,
          `${a} joined ${p.org}`,
          `${a}さんが${p.org}に参加しました`
        ),
        body: '',
      };
    case 'teamTodo':
      return {
        title: L(
          `${a}님이 할 일을 올렸어요`,
          `${a} added a to-do`,
          `${a}さんがタスクを追加しました`
        ),
        body: t + due(p.due, lang),
      };
    case 'teamTodoEdited':
      return {
        title: L(
          `${a}님이 할 일을 고쳤어요`,
          `${a} edited a to-do`,
          `${a}さんがタスクを編集しました`
        ),
        body: t,
      };
    case 'invited':
      return {
        title: L(
          `${p.org}에 초대받았어요`,
          `You're invited to ${p.org}`,
          `${p.org}に招待されました`
        ),
        body: L(
          `${a}님이 초대했어요. 눌러서 수락해요`,
          `${a} invited you. Tap to accept`,
          `${a}さんからの招待です。タップして参加できます`
        ),
      };
    case 'digest': {
      const n = p.count ?? 0;
      return {
        title: L(`오늘 마감 ${n}개`, `${n} due today`, `今日が期限のタスク ${n}件`),
        body: n > 1 ? L(`${t} 외 ${n - 1}개`, `${t} and ${n - 1} more`, `${t} ほか${n - 1}件`) : t,
      };
    }
    case 'owner':
      return {
        title: L(
          `${p.org}의 방장이 됐어요`,
          `You're now the owner of ${p.org}`,
          `${p.org}のオーナーになりました`
        ),
        body: '',
      };
  }
}

/** 날짜 범위 — 하루짜리면 하루만 */
export function rangeText(start: string, end: string): string {
  const f = (d: string) => {
    const [, m, day] = d.split('-').map(Number);
    return `${m}/${day}`;
  };
  return start === end ? f(start) : `${f(start)}~${f(end)}`;
}

// ─── APNs ──────────────────────────────────────────────

let cachedJwt: { value: string; at: number } | null = null;

function apnsJwt(): string | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  // Vercel 환경 변수에 넣으면 줄바꿈이 `\n` 글자로 들어온다
  const key = process.env.APNS_KEY?.replace(/\\n/g, '\n');
  if (!keyId || !teamId || !key) return null;
  // APNs는 같은 토큰을 20~60분 사이로 재사용하라고 한다
  if (cachedJwt && Date.now() - cachedJwt.at < 40 * 60_000) return cachedJwt.value;
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'ES256', kid: keyId })}.${b64({ iss: teamId, iat })}`;
  const sig = sign('sha256', Buffer.from(unsigned), {
    key: createPrivateKey(key),
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  cachedJwt = { value: `${unsigned}.${sig}`, at: Date.now() };
  return cachedJwt.value;
}

function post(session: ClientHttp2Session, token: string, jwt: string, payload: string) {
  return new Promise<number>(resolve => {
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': process.env.APNS_BUNDLE_ID ?? 'com.neogul02.todolight',
      'apns-push-type': 'alert',
      'content-type': 'application/json',
    });
    req.setTimeout(10_000, () => req.close());
    req.on('response', h => resolve(Number(h[':status'])));
    req.on('error', () => resolve(0));
    req.on('close', () => resolve(0));
    req.end(payload);
  });
}

/** 토큰들에 한 번에 보낸다. 410(앱 삭제됨)·400 BadDeviceToken은 지운다 */
async function deliver(tokens: string[], build: (token: string) => string): Promise<void> {
  const jwt = apnsJwt();
  if (!jwt || tokens.length === 0) return;
  const host =
    process.env.APNS_PRODUCTION === 'true'
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com';
  const session = connect(host);
  session.on('error', () => {});
  try {
    const statuses = await Promise.all(tokens.map(t => post(session, t, jwt, build(t))));
    const dead = tokens.filter((_, i) => statuses[i] === 410 || statuses[i] === 400);
    if (dead.length) await getSupabaseAdmin().from('push_devices').delete().in('token', dead);
  } finally {
    session.close();
  }
}

// ─── 보내기 ────────────────────────────────────────────

export interface NotifyInput {
  kind: PushKind;
  to: string[];
  /** 행동한 사람 — 받는 사람에서 빠지고, 문구의 이름이 된다 */
  actorId?: string;
  orgId?: string;
  params?: Omit<PushParams, 'actor' | 'org'>;
  /** 묶기와 열기에 쓰는 대상(할 일·일정 id) */
  refId?: string;
  /** 눌렀을 때 앱이 어디로 갈지 */
  data?: Record<string, string>;
}

const PREF_COLUMN = {
  my: 'notify_my_todos',
  org: 'notify_org',
  team: 'notify_team_todos',
} as const;

export async function notify(input: NotifyInput): Promise<void> {
  try {
    if (!apnsJwt()) return;
    const db = getSupabaseAdmin();
    const to = [...new Set(input.to)].filter(id => id && id !== input.actorId);
    if (to.length === 0) return;

    const group = GROUP[input.kind];
    const [{ data: people }, { data: actor }, { data: org }] = await Promise.all([
      db
        .from('profiles')
        .select('id, locale, deleted_at, notify_my_todos, notify_org, notify_team_todos')
        .in('id', to),
      input.actorId
        ? db.from('profiles').select('display_name').eq('id', input.actorId).maybeSingle()
        : Promise.resolve({ data: null }),
      input.orgId
        ? db.from('organizations').select('name').eq('id', input.orgId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    let recipients = (people ?? []).filter(
      p => !p.deleted_at && (group === 'always' || p[PREF_COLUMN[group]] !== false)
    );

    const dedupe = DEDUPE_MINUTES[input.kind];
    if (dedupe && input.refId && recipients.length) {
      const since = new Date(Date.now() - dedupe * 60_000).toISOString();
      const { data: recent } = await db
        .from('push_log')
        .select('user_id')
        .eq('kind', input.kind)
        .eq('ref_id', input.refId)
        .gte('created_at', since)
        .in(
          'user_id',
          recipients.map(r => r.id)
        );
      const skip = new Set((recent ?? []).map(r => r.user_id));
      recipients = recipients.filter(r => !skip.has(r.id));
    }
    if (recipients.length === 0) return;

    const { data: devices } = await db
      .from('push_devices')
      .select('token, user_id')
      .in(
        'user_id',
        recipients.map(r => r.id)
      );
    if (!devices?.length) return;

    const langOf = new Map(
      recipients.map(r => [r.id, isValidLocale(r.locale) ? r.locale : DEFAULT_LOCALE] as const)
    );
    const ownerOf = new Map(devices.map(d => [d.token, d.user_id]));
    const params: PushParams = { ...input.params, actor: actor?.display_name, org: org?.name };

    await deliver(
      devices.map(d => d.token),
      token => {
        const { title, body } = pushText(
          input.kind,
          params,
          langOf.get(ownerOf.get(token)!) ?? 'ko'
        );
        return JSON.stringify({
          aps: {
            alert: {
              title,
              ...(org?.name && GROUP[input.kind] !== 'always' ? { subtitle: org.name } : {}),
              ...(body ? { body } : {}),
            },
            sound: 'default',
            // 같은 할 일의 알림끼리 알림 센터에서 묶인다
            'thread-id': input.refId ?? input.kind,
          },
          kind: input.kind,
          ...(input.orgId ? { orgId: input.orgId } : {}),
          ...input.data,
        });
      }
    );

    await db
      .from('push_log')
      .insert(
        recipients.map(r => ({ user_id: r.id, kind: input.kind, ref_id: input.refId ?? null }))
      );
  } catch (e) {
    console.error('[push] failed', input.kind, e);
  }
}

/** 조직 멤버 전원(행동한 사람은 notify가 뺀다). managersOnly면 방장·관리자만 */
export async function orgMemberIds(orgId: string, managersOnly = false): Promise<string[]> {
  let q = getSupabaseAdmin().from('org_members').select('user_id').eq('org_id', orgId);
  if (managersOnly) q = q.in('role', ['owner', 'admin']);
  const { data } = await q;
  return (data ?? []).map(r => r.user_id);
}
