'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import TopNav from '@/components/ui/TopNav'
import { UserIcon } from '@/components/ui/icons'
import { useTextSwap, useErrorShake } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import StravaSettingsSection, { type StravaSettingsState } from '@/components/strava/StravaSettingsSection'
import StravaDisconnectSheet from '@/components/strava/StravaDisconnectSheet'
import { resolveStravaUiState } from '@/lib/strava/connection-state'
import { d } from '@/lib/i18n'

type CheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'same'

function validateFormat(value: string): string | null {
  if (value.length === 0) return d.onboarding.errorEmpty
  if (value.length > 30) return d.onboarding.errorTooLong
  if (!/^[a-z0-9._]+$/.test(value)) return d.onboarding.errorFormat
  if (value.startsWith('.') || value.endsWith('.')) return d.onboarding.errorDot
  if (value.includes('..')) return d.onboarding.errorDoubleDot
  return null
}

export default function ProfileEditPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [loading, setLoading] = useState(true)
  const [currentUsername, setCurrentUsername] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const [usernameInput, setUsernameInput] = useState('')
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('idle')
  const [checkMessage, setCheckMessage] = useState('')

  // 이름(display_name) — 20260830_0113: username과 달리 필수값 아님·형식 제한 없음·
  // 수정 횟수 제한 없음. 중복확인도 없어 debounce·상태머신이 필요 없다.
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState('')

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Strava 동기화 구획 — none이거나 조회가 실패하면 null(구획을 그리지 않는다)
  const [stravaSection, setStravaSection] = useState<{
    state: StravaSettingsState
    lastSyncedAt: string | null
  } | null>(null)
  const [disconnectSheetOpen, setDisconnectSheetOpen] = useState(false)

  // 현재 유저 정보 로드
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) {
        router.replace('/login')
        return
      }
      // 구획만 따로 깜빡이지 않도록 사용자 정보와 같은 시점에 받는다. 토큰 칸이 브라우저로 내려오지 않게
      // select('*') 대신 필요한 세 칸만 고른다(access_token·refresh_token 제외).
      Promise.all([
        supabase.from('users').select('*').eq('id', user.id).single(),
        supabase
          .from('strava_connections')
          .select('disconnected_at, disconnect_reason, last_synced_at')
          .eq('user_id', user.id)
          .maybeSingle(),
      ])
        .then(([{ data: raw }, { data: stravaRow, error: stravaError }]) => {
          if (cancelled) return
          // 조회가 실패하면 구획을 숨기고 로그만 남긴다 — 저장 기능을 막지 않는다
          if (stravaError) {
            console.error('[profile/edit] strava_connections 조회 실패', stravaError)
          } else {
            const stravaState = resolveStravaUiState(stravaRow)
            setStravaSection(
              stravaState === 'none' ? null : { state: stravaState, lastSyncedAt: stravaRow?.last_synced_at ?? null }
            )
          }
          const data = raw as { username: string | null; display_name: string | null; avatar_url: string | null } | null
          const uname = data?.username ?? null
          setCurrentUsername(uname)
          setUsernameInput(uname ?? '')
          const dname = data?.display_name ?? null
          setCurrentDisplayName(dname)
          setNameInput(dname ?? '')
          setAvatarUrl(data?.avatar_url ?? null)
          setLoading(false)
        })
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 아바타 파일 선택 핸들러
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setUploadError(d.profileEdit.fileTypeError)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError(d.profileEdit.fileSizeError)
      return
    }

    setUploadError('')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json() as { avatar_url?: string; error?: string }
      if (json.avatar_url) {
        setAvatarUrl(json.avatar_url)
      } else {
        // ADR 0001 — 서버가 완성한 문구를 그대로 신뢰한다(티켓 20260915_2248)
        setUploadError(json.error ?? d.profileEdit.uploadError)
      }
    } catch {
      setUploadError(d.onboarding.networkError)
    } finally {
      setUploading(false)
      // 같은 파일 재선택 가능하도록 초기화
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // username 입력 핸들러 (debounce)
  function handleUsernameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '')
    setUsernameInput(raw)
    setCheckStatus('idle')
    setCheckMessage('')
    setSaveError('')

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (raw.length === 0) return

    // 현재 값과 같으면 별도 체크 불필요
    if (raw === currentUsername) {
      setCheckStatus('same')
      setCheckMessage('')
      return
    }

    const formatError = validateFormat(raw)
    if (formatError) {
      setCheckStatus('invalid')
      setCheckMessage(formatError)
      return
    }

    setCheckStatus('checking')
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username/check?username=${encodeURIComponent(raw)}`)
        const json = await res.json() as { available: boolean; message?: string }
        // ADR 0001 — 서버가 완성한 문구를 그대로 신뢰한다(티켓 20260915_2248)
        if (json.available) {
          setCheckStatus('available')
          setCheckMessage(json.message ?? d.onboarding.available)
        } else {
          setCheckStatus('taken')
          setCheckMessage(json.message ?? d.onboarding.taken)
        }
      } catch {
        setCheckStatus('idle')
        setCheckMessage('')
      }
    }, 500)
  }

  // 이름 입력 핸들러 — 형식 제한 없음(인스타그램 정책 동일), maxLength로 30자에서 조용히 멈춘다
  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNameInput(e.target.value)
    setSaveError('')
  }

  // username이 변경됐는지 확인
  const usernameChanged = usernameInput !== (currentUsername ?? '') && usernameInput !== ''
  // 이름은 필수값이 아니라 빈 문자열로 지우는 것도 유효한 변경(= 폴백 상태로 전환)이다
  const nameChanged = nameInput.trim() !== (currentDisplayName ?? '')

  const canSave = !saving && !uploading && (nameChanged || (usernameChanged && checkStatus === 'available'))

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setSaveError('')
    try {
      const payload: { username?: string; display_name?: string } = {}
      if (usernameChanged && checkStatus === 'available') payload.username = usernameInput
      if (nameChanged) payload.display_name = nameInput
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json() as { success?: boolean; error?: string }
      // ADR 0001 — 서버가 완성한 문구를 그대로 신뢰한다(티켓 20260915_2248).
      // 409(아이디 중복)만 인라인 필드 메시지로, 그 외는 하단 배너로 보낸다 — 위치 분기는
      // 클라이언트가 유지하되 문구 자체는 서버 응답을 그대로 쓴다.
      if (json.success) {
        router.push('/profile')
      } else if (res.status === 409) {
        setCheckStatus('taken')
        setCheckMessage(json.error ?? d.onboarding.taken)
      } else {
        setSaveError(json.error ?? d.profileEdit.saveError)
      }
    } catch {
      setSaveError(d.onboarding.networkError)
    } finally {
      setSaving(false)
    }
  }

  // 바이너리 컬러 원칙상 에러를 색으로 표현하지 않는다 — 보더 두께로만 상태를 구분하고 실제 안내는 메시지 텍스트로 전달
  const hasError = checkStatus === 'invalid' || checkStatus === 'taken'
  const inputBorderClass = hasError
    ? 'shadow-[inset_0_0_0_2px_var(--border)]'
    : 'shadow-[inset_0_0_0_1px_var(--border)]'

  // 중복확인 상태 메시지 — 즉시 전환 대신 Text states swap (04)
  const { ref: messageRef, initialText: initialMessage } = useTextSwap<HTMLParagraphElement>(checkMessage)
  // 유효하지 않거나 이미 사용 중인 아이디 — Error state shake (12).
  // `.is-error`는 선언적으로, `.is-shaking`은 훅이 명령형으로 재생한다.
  const inputShakeRef = useErrorShake<HTMLDivElement>(hasError ? checkStatus : null)

  if (loading) {
    return (
      <div className="min-h-full text-foreground flex items-center justify-center">
        <div className="w-6 h-6 border border-current border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-full text-foreground flex flex-col">
      <TopNav title={d.profile.title} />

      <div className="flex-1 flex flex-col px-4 pt-6 pb-8 gap-8">
        {/* 프로필 사진 */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="relative active:scale-95 transition-transform duration-100"
            disabled={uploading}
            aria-label={d.profileEdit.changePhotoAlt}
          >
            {avatarUrl ? (
              <Image src={avatarUrl} alt={d.onboarding.avatarAlt} width={96} height={96} className="w-24 h-24 rounded-2xl object-cover" />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-surface flex items-center justify-center">
                <UserIcon className="w-10 h-10 text-muted" />
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 rounded-2xl bg-background/70 flex items-center justify-center">
                <div className="w-6 h-6 border border-current border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </button>
          <p className="text-muted text-base">{d.profileEdit.changePhoto}</p>
          {uploadError && (
            <p className="text-base text-center">{uploadError}</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* 아이디 편집 */}
        <div className={`t-input-wrap flex flex-col gap-2${hasError ? ' is-error' : ''}`}>
          <label className="text-base text-muted">{d.profileEdit.usernameLabel}</label>
          <div
            ref={inputShakeRef}
            className={`t-input flex items-center w-full min-h-11 rounded-full px-4 transition-shadow ${inputBorderClass}${hasError ? ' is-error' : ''}`}
          >
            <span className="text-muted mr-1">@</span>
            <input
              type="text"
              value={usernameInput}
              onChange={handleUsernameChange}
              placeholder={currentUsername ?? d.onboarding.usernamePlaceholder}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 bg-transparent placeholder:text-muted focus:outline-none"
            />
            {checkStatus === 'checking' && (
              <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin ml-2 shrink-0" />
            )}
          </div>
          {/* 메시지는 항상 마운트한 채 텍스트만 교체한다(빈 문자열 = 숨김).
              min-h-6로 자리를 잡아 스왑 중 레이아웃이 흔들리지 않게 한다. */}
          <p
            ref={messageRef}
            aria-live="polite"
            className="t-text-swap min-h-6 text-base px-1 text-muted"
          >
            {initialMessage}
          </p>
        </div>

        {/* 이름 편집 — 20260830_0113: username과 동일한 커스텀 t-input 마크업을 재사용한다
            (한 화면 안에서 입력 스타일이 갈라지지 않도록 — MODULAR Input 신규 도입 없음).
            필수값이 아니고 중복확인·형식 에러가 없어 상태머신 없이 단순 controlled input이다. */}
        <div className="t-input-wrap flex flex-col gap-2">
          <label className="text-base text-muted">{d.profileEdit.nameLabel}</label>
          <div className="t-input flex items-center w-full min-h-11 rounded-full px-4 transition-shadow shadow-[inset_0_0_0_1px_var(--border)]">
            <input
              type="text"
              value={nameInput}
              onChange={handleNameChange}
              placeholder={currentDisplayName ?? d.profileEdit.namePlaceholder}
              maxLength={30}
              className="flex-1 bg-transparent placeholder:text-muted focus:outline-none"
            />
          </div>
        </div>

        {/* Strava 동기화 구획 (티켓 20261017_1422) — none이면 그리지 않는다(홈과 상단 메뉴가 이미 CTA를 갖고 있다) */}
        {stravaSection && (
          <StravaSettingsSection
            state={stravaSection.state}
            lastSyncedAt={stravaSection.lastSyncedAt}
            onDisconnect={() => setDisconnectSheetOpen(true)}
          />
        )}

        {/* 저장 버튼 */}
        <div className="flex flex-col gap-4 mt-auto">
          {saveError && (
            <p className="text-base text-center">{saveError}</p>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full min-h-11 bg-background-inverse text-snow py-[14px] rounded-full active:scale-95 transition-transform duration-100 disabled:opacity-40 disabled:cursor-not-allowed text-base"
          >
            {saving ? d.profileEdit.saving : d.profileEdit.saveButton}
          </button>
          <button
            onClick={() => router.back()}
            className="w-full min-h-11 text-muted text-base active:opacity-70 transition-opacity"
          >
            {d.profileEdit.cancelButton}
          </button>
          {/* 티켓 20260901_2217: 탈퇴 신청 안내 — 실제 삭제 로직 없이 mailto 링크로만
              접수 창구를 연다. 저장/취소와 시각적으로 구분되도록 별도 줄에 두고, 캡션으로
              "되돌릴 수 없음"을 먼저 알린다(UX 라이팅 가이드 — 해요체·간결함). */}
          <a
            href="mailto:sihyunrr@gmail.com?subject=JAM!%20탈퇴%20신청"
            className="w-full min-h-11 flex flex-col items-center justify-center gap-1 text-center active:opacity-70 transition-opacity"
          >
            <span className="text-muted text-base">
              {d.profileEdit.withdrawLink}
            </span>
            <span className="text-muted text-xs">
              {d.profileEdit.withdrawCaption}
            </span>
          </a>
        </div>
      </div>

      <StravaDisconnectSheet
        open={disconnectSheetOpen}
        onClose={() => setDisconnectSheetOpen(false)}
        onDisconnected={() => setStravaSection((prev) => (prev ? { ...prev, state: 'disconnected_user' } : prev))}
      />
    </div>
  )
}
