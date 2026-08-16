/**
 * 메모 안의 URL·전화번호를 찾아 눌러서 바로 열리게 한다.
 *
 * URL은 http(s)://로 시작하는 것만 잡는다 — www.example.com처럼 프로토콜 없는 형태까지
 * 잡으면 "www"가 들어간 일반 텍스트를 오탐할 여지가 생긴다.
 * 전화번호는 0으로 시작하고 하이픈으로 나뉜 형태(010-1234-5678, 02-123-4567)만 잡는다 —
 * "2024-2025"처럼 하이픈으로 이어진 숫자는 흔해서, 0으로 시작한다는 조건 없이 자릿수만
 * 보면 날짜·기간 같은 걸 전화번호로 잘못 링크한다.
 */
const URL_PATTERN = /https?:\/\/[^\s]+/g;
const PHONE_PATTERN = /\b0\d{1,2}-\d{3,4}-\d{4}\b/g;
/** URL 끝에 붙은 문장 부호는 링크가 아니라 문장의 일부일 가능성이 높다 */
const TRAILING_PUNCTUATION = /[.,!?)\]}』」〉》"']+$/;

type Segment = { text: string; href: string | null };

function splitSegments(text: string): Segment[] {
  const matches: { start: number; end: number; href: string }[] = [];

  for (const m of text.matchAll(URL_PATTERN)) {
    const trimmed = m[0].replace(TRAILING_PUNCTUATION, '');
    if (trimmed) matches.push({ start: m.index, end: m.index + trimmed.length, href: trimmed });
  }
  for (const m of text.matchAll(PHONE_PATTERN)) {
    matches.push({ start: m.index, end: m.index + m[0].length, href: `tel:${m[0].replace(/-/g, '')}` });
  }
  matches.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue; // URL과 전화번호 패턴이 겹치면 먼저 잡힌 쪽을 살린다
    if (m.start > cursor) segments.push({ text: text.slice(cursor, m.start), href: null });
    segments.push({ text: text.slice(m.start, m.end), href: m.href });
    cursor = m.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), href: null });
  return segments;
}

/**
 * 부모가 이 텍스트 자체를 눌러 다른 동작(예: 메모 편집)을 하는 경우가 많아서, 링크 클릭은
 * stopPropagation으로 그 상위 클릭을 막는다 — 안 그러면 링크를 눌렀는데 편집 모드로도 같이 들어간다.
 */
export function Linkify({ text }: { text: string }) {
  const segments = splitSegments(text);
  if (segments.every(s => s.href === null)) return <>{text}</>;

  return (
    <>
      {segments.map((s, i) =>
        s.href ? (
          <a
            key={i}
            href={s.href}
            target={s.href.startsWith('tel:') ? undefined : '_blank'}
            rel={s.href.startsWith('tel:') ? undefined : 'noopener noreferrer'}
            onClick={e => e.stopPropagation()}
            className="text-accent underline underline-offset-2"
          >
            {s.text}
          </a>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  );
}
