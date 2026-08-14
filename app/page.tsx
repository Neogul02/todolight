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
    <main className="mx-auto flex min-h-dvh max-w-[880px] flex-col px-6 py-14">
      <header className="flex items-center justify-between">
        <span className="text-title tracking-tight">todolight</span>
        <Link
          href="/login"
          className="text-[14px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          로그인
        </Link>
      </header>

      <section className="mt-20 max-w-[560px]">
        <p className="text-eyebrow text-ink-faint">조직 공유 할 일</p>
        <h1 className="mt-3 text-display text-ink">
          팀의 할 일을
          <br />
          한 페이지에서.
        </h1>
        <p className="mt-5 text-body-md text-ink-muted">
          방장이 팀원을 초대하고, 수락하면 같은 조직. 서로의 할 일 목록을 나란히 보면서
          겹치는 일을 없앤다.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link
            href="/login?mode=signup"
            className="inline-flex h-12 items-center rounded-xl bg-accent px-6 text-[15px] font-medium text-accent-ink transition-opacity hover:opacity-90"
          >
            무료로 시작하기
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center rounded-xl border border-hairline-strong bg-surface px-6 text-[15px] font-medium text-ink transition-colors hover:bg-surface-alt"
          >
            이미 계정이 있어요
          </Link>
        </div>
      </section>

      <section className="mt-24 grid gap-4 sm:grid-cols-3">
        {POINTS.map(p => (
          <div key={p.title} className="rounded-2xl border border-hairline bg-surface p-5">
            <h2 className="text-title text-ink">{p.title}</h2>
            <p className="mt-2 text-caption text-ink-muted">{p.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto pt-20 text-caption text-ink-faint">
        © {new Date().getFullYear()} todolight
      </footer>
    </main>
  );
}
