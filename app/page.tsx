import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';

const POINTS = [
  {
    title: '한 화면에 팀 전체',
    body: '멤버마다 컬럼 하나. 옆으로 넘기거나 한눈에 펼쳐서 누가 뭘 들고 있는지 바로 본다.',
  },
  {
    title: '실시간 동기화',
    body: '누가 체크하면 그 순간 모두의 화면이 바뀐다. 같은 일을 두 번 하지 않는다.',
  },
  {
    title: '대신 처리 + 메모',
    body: '남의 할 일을 대신 끝내고 한 줄 남긴다. 누가 처리했는지 카드에 그대로 남는다.',
  },
];

export default async function LandingPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect('/board');

  return (
    <main className="mx-auto flex min-h-dvh max-w-[880px] flex-col px-5 pt-6 pb-8 sm:px-6 sm:pt-14">
      <header className="flex items-center justify-between">
        <span className="text-title tracking-tight">todolight</span>
        <Link
          href="/login"
          className="-mr-2 rounded-lg px-2 py-2 text-[15px] font-medium text-ink-muted transition-colors active:bg-canvas-soft sm:text-[14px] sm:hover:text-ink"
        >
          로그인
        </Link>
      </header>

      <section className="mt-14 max-w-[560px] sm:mt-20">
        <p className="text-eyebrow text-ink-faint">조직 공유 할 일</p>
        <h1 className="mt-3 text-[34px] font-bold leading-[1.15] tracking-[-0.035em] text-ink sm:text-display">
          팀의 할 일을
          <br />
          한 페이지에서.
        </h1>
        <p className="mt-4 text-body-sm text-ink-muted sm:mt-5 sm:text-body-md">
          방장이 팀원을 초대하고, 수락하면 같은 조직. 서로의 할 일 목록을 나란히 보면서 겹치는 일을
          없앤다.
        </p>
        {/* 모바일은 세로로 쌓고 폭을 꽉 채운다 — 엄지로 닿는 자리 */}
        <div className="mt-7 flex flex-col gap-2 sm:mt-8 sm:flex-row sm:flex-wrap">
          <Link
            href="/login?mode=signup"
            className="inline-flex h-13 items-center justify-center rounded-2xl bg-accent px-6 text-[16px] font-medium text-accent-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
          >
            무료로 시작하기
          </Link>
          <Link
            href="/login"
            className="inline-flex h-13 items-center justify-center rounded-2xl border border-hairline-strong bg-surface px-6 text-[16px] font-medium text-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
          >
            이미 계정이 있어요
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-3 sm:mt-24 sm:grid-cols-3 sm:gap-4">
        {POINTS.map(p => (
          <div key={p.title} className="rounded-2xl border border-hairline bg-surface p-4 sm:p-5">
            <h2 className="text-title text-ink">{p.title}</h2>
            <p className="mt-1.5 text-caption text-ink-muted">{p.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto pt-16 pb-safe text-caption text-ink-faint">
        © {new Date().getFullYear()} todolight
      </footer>
    </main>
  );
}
