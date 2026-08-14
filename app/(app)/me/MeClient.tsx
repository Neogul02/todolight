'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateMyProfile } from '@/app/actions/profile';
import { applyTheme } from '@/app/providers';
import { THEMES } from '@/lib/themes';
import { removeAvatar, uploadAvatar } from '@/lib/image-upload';
import { Avatar } from '@/components/Avatar';
import { Badge, Button, Card, Input } from '@/components/ui';
import { showMsg } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useApp } from '../OrgContext';

export default function MeClient() {
  const router = useRouter();
  const { profile, email, orgs, userId } = useApp();

  const [name, setName] = useState(profile?.display_name ?? '');
  const [theme, setTheme] = useState(profile?.theme ?? 'system');
  const [showDone, setShowDone] = useState(profile?.show_done ?? true);
  const [photo, setPhoto] = useState<string | null>(profile?.avatar_url ?? null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    const res = await updateMyProfile({ displayName: name, theme, showDone });
    setBusy(false);
    if (!res.success) {
      showMsg(res.error, 'error');
      return;
    }
    applyTheme(res.data.theme);
    showMsg('저장했어요.', 'success');
    router.refresh();
  }

  // 사진은 저장 버튼을 기다리지 않고 고르는 즉시 반영한다 —
  // 업로드가 끝났는데 "저장"을 또 눌러야 하면 올라간 건지 아닌지 헷갈린다.
  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploading) return;

    setUploading(true);
    try {
      const url = await uploadAvatar(userId, file);
      const res = await updateMyProfile({ avatarUrl: url });
      if (!res.success) throw new Error(res.error);
      setPhoto(url);
      showMsg('사진을 바꿨어요.', 'success');
      router.refresh();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setUploading(false);
    }
  }

  async function clearPhoto() {
    if (uploading) return;
    setUploading(true);
    try {
      await removeAvatar(userId);
      const res = await updateMyProfile({ avatarUrl: null });
      if (!res.success) throw new Error(res.error);
      setPhoto(null);
      showMsg('사진을 지웠어요.', 'success');
      router.refresh();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-5 pb-safe sm:py-6">
      <h1 className="text-heading-2 text-ink">내 설정</h1>

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Avatar
            name={name || '나'}
            color={profile?.avatar_color}
            imageUrl={photo}
            seed={userId}
            size="lg"
            className="size-14 text-[20px]"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink">{name || '이름 없음'}</p>
            <p className="truncate text-caption text-ink-faint">{email}</p>
          </div>
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} className="hidden" />
        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '올리는 중…' : photo ? '사진 바꾸기' : '사진 올리기'}
          </Button>
          {photo && (
            <Button variant="ghost" onClick={clearPhoto} disabled={uploading}>
              지우기
            </Button>
          )}
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">이름</span>
          <Input value={name} onChange={e => setName(e.target.value)} maxLength={30} />
        </label>

        {/*
          아바타 색은 고르게 하지 않는다. 계정 id에서 결정적으로 배정돼 팀원끼리 잘 겹치지 않고,
          고를 수 있게 해 봐야 설정 화면만 길어진다. 사진을 올리면 그게 우선이다.
        */}
      </Card>

      <Card className="p-5">
        <h2 className="text-title text-ink">테마</h2>
        <p className="mt-1 text-caption text-ink-muted">누르면 바로 적용돼요.</p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {THEMES.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTheme(t.key);
                applyTheme(t.key);
              }}
              aria-pressed={theme === t.key}
              className={cn(
                'flex flex-col gap-2 rounded-xl border p-2.5 text-left transition-colors',
                theme === t.key
                  ? 'border-hairline-strong bg-surface-alt'
                  : 'border-hairline active:bg-surface-alt'
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
              <span className="block truncate text-[13px] font-medium text-ink">{t.name}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-title text-ink">보드</h2>
        <label className="mt-3 flex cursor-pointer items-center gap-3">
          <button
            type="button"
            role="checkbox"
            aria-checked={showDone}
            onClick={() => setShowDone(v => !v)}
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-md border transition-colors',
              showDone
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-hairline-strong bg-surface'
            )}
          >
            {showDone && (
              <svg
                viewBox="0 0 12 12"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M2.5 6.2 4.8 8.5 9.5 3.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <span className="min-w-0">
            <span className="block text-[15px] text-ink">완료한 할 일도 보기</span>
            <span className="block text-caption text-ink-muted">끄면 아직 남은 일만 보여요.</span>
          </span>
        </label>
      </Card>

      <Card className="p-5">
        <h2 className="text-title text-ink">소속 조직</h2>
        {orgs.length === 0 ? (
          <p className="mt-2 text-caption text-ink-muted">아직 속한 조직이 없어요.</p>
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

      {/* 로그아웃은 아바타 메뉴에 있다 — 같은 동작을 두 군데 두지 않는다 */}
      <Button size="lg" onClick={save} disabled={busy || !name.trim()}>
        저장
      </Button>
    </main>
  );
}
