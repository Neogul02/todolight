'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { updateMyProfile } from '@/app/actions/profile';
import { applyTheme } from '@/app/providers';
import { THEMES } from '@/lib/themes';
import { Avatar } from '@/components/Avatar';
import { Badge, Button, Card, Input } from '@/components/ui';
import { showMsg } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useApp } from '../OrgContext';

const EMOJI_CHOICES = ['🙂', '🐣', '🔥', '🌿', '☕', '🐳', '🍊', '🧊', '🎧', '🪴', '⭐', '🥐'];

export default function MeClient() {
  const router = useRouter();
  const { profile, email, orgs } = useApp();

  const [name, setName] = useState(profile?.display_name ?? '');
  const [emoji, setEmoji] = useState(profile?.avatar_emoji ?? '');
  const [theme, setTheme] = useState(profile?.theme ?? 'sand');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    const res = await updateMyProfile({
      displayName: name,
      avatarEmoji: emoji || null,
      theme,
    });
    setBusy(false);
    if (!res.success) {
      showMsg(res.error, 'error');
      return;
    }
    applyTheme(res.data.theme);
    showMsg('저장했습니다.', 'success');
    router.refresh();
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-5 pb-tabbar sm:py-6">
      <h1 className="text-heading-2 text-ink">내 설정</h1>

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Avatar name={name || '나'} emoji={emoji} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{name || '이름 없음'}</p>
            <p className="truncate text-caption text-ink-faint">{email}</p>
          </div>
        </div>

        <label className="mt-5 flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">이름</span>
          <Input value={name} onChange={e => setName(e.target.value)} maxLength={30} />
        </label>

        <div className="mt-4">
          <span className="text-caption font-medium text-ink-secondary">아바타</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setEmoji('')}
              className={cn(
                'grid size-9 place-items-center rounded-lg border text-[13px] transition-colors',
                emoji === ''
                  ? 'border-accent bg-canvas-soft text-ink'
                  : 'border-hairline text-ink-muted hover:bg-surface-alt'
              )}
            >
              없음
            </button>
            {EMOJI_CHOICES.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={cn(
                  'grid size-9 place-items-center rounded-lg border text-[17px] transition-colors',
                  emoji === e
                    ? 'border-accent bg-canvas-soft'
                    : 'border-hairline hover:bg-surface-alt'
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-title text-ink">테마</h2>
          <Badge>기본 무료</Badge>
        </div>
        <p className="mt-1 text-caption text-ink-muted">
          유료 테마는 준비 중입니다. 지금은 미리보기로 적용해 볼 수 있습니다.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {THEMES.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTheme(t.key);
                applyTheme(t.key);
              }}
              className={cn(
                'flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors',
                theme === t.key
                  ? 'border-hairline-strong bg-surface-alt'
                  : 'border-hairline hover:bg-surface-alt'
              )}
            >
              <span className="flex gap-1">
                {t.swatch.map(c => (
                  <span
                    key={c}
                    className="size-4 rounded-full border border-black/10"
                    style={{ background: c }}
                  />
                ))}
              </span>
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                {t.name}
                {!t.free && <Badge tone="warning">준비중</Badge>}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-title text-ink">소속 조직</h2>
        {orgs.length === 0 ? (
          <p className="mt-2 text-caption text-ink-muted">아직 속한 조직이 없습니다.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1">
            {orgs.map(o => (
              <li key={o.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{o.name}</span>
                <span className="text-[12px] text-ink-faint">{o.member_count}명</span>
                <Badge tone={o.role === 'owner' ? 'accent' : 'neutral'}>
                  {o.role === 'owner' ? '방장' : o.role === 'admin' ? '관리자' : '팀원'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Button size="lg" onClick={save} disabled={busy || !name.trim()}>
        저장
      </Button>

      {/* 로그아웃은 헤더에서 이리로 옮겼다 — 모바일 헤더 한 줄에 넣기엔 자리가 없다 */}
      <Button size="lg" variant="ghost" onClick={signOut} className="text-ink-muted">
        로그아웃
      </Button>
    </main>
  );
}
