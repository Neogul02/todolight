'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { updateMyProfile } from '@/app/actions/profile';
import { applyTheme } from '@/app/providers';
import { applyLocale } from '@/lib/locale-client';
import { THEMES } from '@/lib/themes';
import { LOCALES, type Locale } from '@/lib/locales';
import { removeAvatar, uploadAvatar } from '@/lib/image-upload';
import { Avatar } from '@/components/Avatar';
import { Button, Card, Input } from '@/components/ui';
import { showMsg } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useApp } from '../OrgContext';

/** 이름을 한 글자 칠 때마다 서버를 부르지 않도록 기다리는 시간 */
const NAME_SAVE_DELAY_MS = 700;

/**
 * 내 설정.
 *
 * **저장 버튼을 두지 않는다.** 테마와 언어는 고르는 순간 화면이 이미 바뀌고 사진은 고르는
 * 즉시 올라가는데, 그 상태에서 저장 버튼만 남겨 두면 "어떤 건 눌러야 남고 어떤 건 안 눌러도
 * 남는지"를 화면이 설명하지 못한다. 전부 고르는 즉시 저장한다.
 * 이름만 예외로, 입력이 멈춘 뒤에 보낸다.
 */
export default function MeClient() {
  const router = useRouter();
  const t = useTranslations('me');
  const tCommon = useTranslations('common');
  const tToast = useTranslations('toast');
  const { profile, email, userId } = useApp();

  const [name, setName] = useState(profile?.display_name ?? '');
  const [theme, setTheme] = useState(profile?.theme ?? 'system');
  const [locale, setLocale] = useState<Locale>((profile?.locale as Locale) ?? 'ko');
  const [showDone, setShowDone] = useState(profile?.show_done ?? true);
  const [showLedger, setShowLedger] = useState(profile?.show_ledger ?? true);
  const [photo, setPhoto] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  /**
   * 한 항목만 서버로 보낸다.
   * 실패하면 되돌리는 건 호출한 쪽 몫이다 — 무엇을 어떤 값으로 되돌릴지는 여기서 알 수 없다.
   */
  async function save(patch: Parameters<typeof updateMyProfile>[0], onFail?: () => void) {
    const res = await updateMyProfile(patch);
    if (!res.success) {
      showMsg(res.error, 'error');
      onFail?.();
      return false;
    }
    return true;
  }

  /*
    이름은 매 글자마다 보내면 서버를 두들기고, 포커스를 잃을 때만 보내면 폼이 없는 화면이라
    "언제 저장됐지"가 불안하다 — 입력이 멎으면 조용히 보낸다.
    첫 렌더에서는 보내지 않는다(바뀐 게 없다).
  */
  const savedName = useRef(profile?.display_name ?? '');
  useEffect(() => {
    const next = name.trim();
    if (!next || next === savedName.current) return;
    const timer = setTimeout(async () => {
      const before = savedName.current;
      savedName.current = next;
      const ok = await save({ displayName: next }, () => {
        savedName.current = before;
        setName(before);
      });
      if (ok) router.refresh();
    }, NAME_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [name, router]);

  function pickTheme(key: string) {
    const before = theme;
    setTheme(key);
    applyTheme(key);
    save({ theme: key }, () => {
      setTheme(before);
      applyTheme(before);
    });
  }

  function pickLocale(next: Locale) {
    const before = locale;
    setLocale(next);
    applyLocale(next);
    router.refresh();
    save({ locale: next }, () => {
      setLocale(before);
      applyLocale(before);
      router.refresh();
    });
  }

  function toggleShowDone() {
    const next = !showDone;
    setShowDone(next);
    save({ showDone: next }, () => setShowDone(!next));
  }

  function toggleShowLedger() {
    const next = !showLedger;
    setShowLedger(next);
    save({ showLedger: next }, () => setShowLedger(!next)).then(ok => ok && router.refresh());
  }

  // 사진은 고르는 즉시 올린다 — 업로드가 끝났는데 저장을 또 눌러야 하면 올라간 건지 모른다.
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
      showMsg(tToast('photoChanged'), 'success');
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
      showMsg(tToast('photoRemoved'), 'success');
      router.refresh();
    } catch (err) {
      showMsg(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-5 pb-safe sm:py-6">
      <h1 className="text-heading-2 text-ink">{t('title')}</h1>

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Avatar
            name={name || t('you')}
            color={profile?.avatar_color}
            imageUrl={photo}
            seed={userId}
            size="lg"
            className="size-14 text-[20px]"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink">{name || t('noName')}</p>
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
            {uploading ? t('uploading') : photo ? t('changePhoto') : t('uploadPhoto')}
          </Button>
          {photo && (
            <Button variant="ghost" onClick={clearPhoto} disabled={uploading}>
              {tCommon('delete')}
            </Button>
          )}
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-caption font-medium text-ink-secondary">{t('nameLabel')}</span>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            enterKeyHint="done"
            maxLength={30}
          />
        </label>

        {/*
          아바타 색은 고르게 하지 않는다. 계정 id에서 결정적으로 배정돼 팀원끼리 잘 겹치지 않고,
          고를 수 있게 해 봐야 설정 화면만 길어진다. 사진을 올리면 그게 우선이다.
        */}
      </Card>

      <Card className="p-5">
        <h2 className="text-title text-ink">{t('theme.title')}</h2>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {THEMES.map(themeDef => (
            <button
              key={themeDef.key}
              type="button"
              onClick={() => pickTheme(themeDef.key)}
              aria-pressed={theme === themeDef.key}
              className={cn(
                /*
                  고른 표시는 accent 테두리로 준다. surface-alt만으로는 어두운 테마에서
                  카드 배경과 거의 같은 색이라 무엇을 골랐는지 보이지 않았다.
                */
                'flex flex-col gap-2 rounded-xl border p-2.5 text-left transition-colors',
                theme === themeDef.key
                  ? 'border-accent bg-accent-soft'
                  : 'border-hairline active:bg-surface-alt'
              )}
            >
              <span className="flex gap-1">
                {themeDef.swatch.map(c => (
                  <span
                    key={c}
                    className="size-4 rounded-full border border-black/10"
                    style={{ background: c }}
                  />
                ))}
              </span>
              <span className="block truncate text-[13px] font-medium text-ink">
                {t(`theme.names.${themeDef.key}`)}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-title text-ink">{t('language.title')}</h2>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {LOCALES.map(l => (
            <button
              key={l}
              type="button"
              onClick={() => pickLocale(l)}
              aria-pressed={locale === l}
              className={cn(
                'rounded-xl border p-2.5 text-center text-[14px] font-medium text-ink transition-colors',
                locale === l
                  ? 'border-accent bg-accent-soft'
                  : 'border-hairline active:bg-surface-alt'
              )}
            >
              {t(`language.${l}`)}
            </button>
          ))}
        </div>
      </Card>

      {/* 화면에 무엇을 띄울지 — 둘 다 계정에 저장해서 기기를 옮겨도 같은 화면이 나온다 */}
      <Card className="p-5">
        <h2 className="text-title text-ink">{t('viewTitle')}</h2>
        <div className="mt-3 flex flex-col gap-3">
          <SettingCheckbox checked={showDone} onChange={toggleShowDone} label={t('showDone')} />
          <SettingCheckbox checked={showLedger} onChange={toggleShowLedger} label={t('showLedger')} />
        </div>
      </Card>

      {/* 소속 조직 목록과 로그아웃은 아바타 메뉴에 있다 — 같은 것을 두 군데 두지 않는다 */}
    </main>
  );
}

function SettingCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onChange}
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-md border transition-colors',
          checked ? 'border-accent bg-accent text-accent-ink' : 'border-hairline-strong bg-surface'
        )}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2.5 6.2 4.8 8.5 9.5 3.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className="text-[15px] text-ink">{label}</span>
    </label>
  );
}
