'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { UserIcon, PencilIcon } from '@/components/ui/icons'
import { Card } from '@ds/components/cards/Card'
import { useTextSwap, useErrorShake } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d, t } from '@/lib/i18n'
import { trackEvent } from '@/lib/analytics/gtag'
import type { TribeRow } from '@/types/database'

type CheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'same'
type Step = 'account' | 'tribe'

function validateFormat(value: string): string | null {
  if (value.length === 0) return d.onboarding.errorEmpty
  if (value.length > 30) return d.onboarding.errorTooLong
  if (!/^[a-z0-9._]+$/.test(value)) return d.onboarding.errorFormat
  if (value.startsWith('.') || value.endsWith('.')) return d.onboarding.errorDot
  if (value.includes('..')) return d.onboarding.errorDoubleDot
  return null
}

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // 현재 유저 로드가 끝나기 전에는 아무 단계도 그리지 않는다(깜빡임 방지).
  const [loaded, setLoaded] = useState(false)
  const [step, setStep] = useState<Step>('account')

  // ── 1단계: 아이디 ────────────────────────────────────────────────────────
  const [currentUsername, setCurrentUsername] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<CheckStatus>('idle')
  const [message, setMessage] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── 1단계: 이름(display_name) — 20260830_0113 프로필 편집과 동일 기준(최대 30자, 형식 제한 없음).
  // 온보딩에서는 필수값이다(프로필 편집과 달리 빈 값 허용 안 함, 티켓 20260909_2119).
  const [nameInput, setNameInput] = useState('')

  // 티켓 20260901_2217: 14세 미만 가입 제한 self-declaration. 이미 아이디가 있던 유저(1단계를
  // 예전에 마쳤거나 이번 세션에서 방금 마친 유저)는 가입 시점에 이미 확인한 셈이라 다시
  // 보여주지 않는다 — currentUsername이 null일 때(진짜 최초 1단계)만 렌더링한다.
  const [ageConfirmed, setAgeConfirmed] = useState(false)

  const [submittingStep1, setSubmittingStep1] = useState(false)

  // ── 2단계: 트라이브 + 프로필이미지 ───────────────────────────────────────
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  type TribesState =
    | { kind: 'loading' }
    | { kind: 'ready'; tribes: Pick<TribeRow, 'id' | 'name' | 'tagline' | 'image_url'>[] }
    | { kind: 'error' }
  const [tribesState, setTribesState] = useState<TribesState>({ kind: 'loading' })
  const [selectedTribeId, setSelectedTribeId] = useState<string | null>(null)
  const [step2Error, setStep2Error] = useState('')
  const [submittingStep2, setSubmittingStep2] = useState(false)

  async function loadTribes() {
    setTribesState({ kind: 'loading' })
    const { data, error } = await supabase
      .from('tribes')
      .select('id, name, tagline, image_url')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error || !data) {
      setTribesState({ kind: 'error' })
      return
    }
    setTribesState({ kind: 'ready', tribes: data as Pick<TribeRow, 'id' | 'name' | 'tagline' | 'image_url'>[] })
  }

  // 현재 유저 정보 로드 — username·display_name·avatar_url·온보딩 완료 여부 확인
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      if (!user) {
        router.replace('/login')
        return
      }
      supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()
        .then(({ data: raw }) => {
          if (cancelled) return
          const data = raw as {
            username: string | null
            display_name: string | null
            avatar_url: string | null
            onboarding_completed_at: string | null
          } | null

          // 2단계(트라이브 포함)까지 이미 끝난 유저는 온보딩으로 올 이유가 없다.
          if (data?.onboarding_completed_at) {
            router.replace('/')
            return
          }

          setAvatarUrl(data?.avatar_url ?? null)

          if (data?.username) {
            // 1단계는 이미 마쳤고 2단계(트라이브)만 남은 유저 — 아이디는 이미 확정된
            // 값이므로 재확인 없이 곧장 2단계로 보낸다.
            setCurrentUsername(data.username)
            setInput(data.username)
            setStatus('same')
            setNameInput(data.display_name ?? '')
            setAgeConfirmed(true)
            setStep('tribe')
            loadTribes()
          }
          setLoaded(true)
        })
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // GA4 sign_up_complete — /auth/callback이 신규 가입(users row가 이번에 처음 생김) 때만
  // 붙이는 플래그. 새로고침·뒤로가기로 재전송되지 않도록 URL에서 즉시 지운다.
  const signupTrackedRef = useRef(false)
  useEffect(() => {
    if (signupTrackedRef.current) return
    if (searchParams.get('new_signup') !== '1') return
    signupTrackedRef.current = true
    trackEvent('sign_up_complete')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('new_signup')
    const query = params.toString()
    router.replace(query ? `/onboarding?${query}` : '/onboarding', { scroll: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ── 1단계: 아이디 입력 ───────────────────────────────────────────────────
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '')
    setInput(raw)
    setMessage('')

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (raw.length === 0) {
      setStatus('idle')
      return
    }

    if (raw === currentUsername) {
      setStatus('same')
      return
    }

    const formatError = validateFormat(raw)
    if (formatError) {
      setStatus('invalid')
      setMessage(formatError)
      return
    }

    setStatus('checking')
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username/check?username=${encodeURIComponent(raw)}`)
        const json = await res.json() as { available: boolean }
        if (json.available) {
          setStatus('available')
          setMessage(d.onboarding.available)
        } else {
          setStatus('taken')
          setMessage(d.onboarding.taken)
        }
      } catch {
        setStatus('idle')
        setMessage('')
      }
    }, 500)
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNameInput(e.target.value)
  }

  const canProceedStep1 =
    (status === 'available' || status === 'same') &&
    nameInput.trim().length > 0 &&
    ageConfirmed &&
    !submittingStep1

  async function handleStep1Next() {
    if (!canProceedStep1) return
    setSubmittingStep1(true)
    setMessage('')
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: input, display_name: nameInput.trim() }),
      })
      const json = await res.json() as { success?: boolean; error?: string }
      if (json.success) {
        setCurrentUsername(input)
        setStep('tribe')
        if (tribesState.kind !== 'ready') loadTribes()
      } else if (json.error === 'DUPLICATE') {
        setStatus('taken')
        setMessage(d.onboarding.taken)
      } else {
        setMessage(d.onboarding.genericError)
      }
    } catch {
      setMessage(d.onboarding.networkError)
    } finally {
      setSubmittingStep1(false)
    }
  }

  // ── 2단계: 프로필이미지 변경 — 기존 /api/profile/avatar 재사용 ────────────
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
        setUploadError(d.profileEdit.uploadError)
      }
    } catch {
      setUploadError(d.onboarding.networkError)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── 2단계: 트라이브 선택 + 최종 제출 ──────────────────────────────────────
  async function handleFinish() {
    if (!selectedTribeId || submittingStep2) return
    setSubmittingStep2(true)
    setStep2Error('')
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUsername, display_name: nameInput.trim(), tribe_id: selectedTribeId }),
      })
      const json = await res.json() as { success?: boolean; error?: string }
      if (json.success) {
        // GA4 onboarding_complete — 티켓 20260909_2119: 2단계(트라이브 포함)까지 마쳤을 때만 전송.
        trackEvent('onboarding_complete')
        router.replace('/')
      } else if (json.error === 'INVALID_TRIBE') {
        setStep2Error(d.onboarding.invalidTribeError)
        setSelectedTribeId(null)
        loadTribes()
      } else if (json.error === 'ALREADY_SET') {
        // 정상 UI 흐름에서는 도달하지 않는다(이미 온보딩 완료 유저는 로드 시점에 홈으로 리다이렉트됨).
        router.replace('/')
      } else {
        setStep2Error(d.onboarding.genericError)
      }
    } catch {
      setStep2Error(d.onboarding.networkError)
    } finally {
      setSubmittingStep2(false)
    }
  }

  // 바이너리 컬러 원칙상 에러를 색으로 표현하지 않는다 — 보더 두께로만 상태를 구분하고 실제 안내는 메시지 텍스트로 전달
  const hasError = status === 'invalid' || status === 'taken'
  const inputBorderClass = hasError
    ? 'shadow-[inset_0_0_0_2px_var(--color-border-inverse)]'
    : 'shadow-[inset_0_0_0_1px_var(--color-border-inverse)]'

  // 중복확인 상태 메시지 — 즉시 전환 대신 Text states swap (04)
  const { ref: messageRef, initialText: initialMessage } = useTextSwap<HTMLParagraphElement>(message)
  // 유효하지 않거나 이미 사용 중인 아이디 — Error state shake (12).
  const inputShakeRef = useErrorShake<HTMLDivElement>(hasError ? status : null)

  if (!loaded) {
    return (
      <div className="min-h-full bg-surface text-text flex items-center justify-center">
        <div className="w-6 h-6 border border-current border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (step === 'account') {
    return (
      <div className="min-h-full bg-surface text-text flex flex-col items-center justify-start px-[var(--spacing-24)] py-[var(--spacing-48)]">
        <div className="w-full max-w-sm flex flex-col items-center gap-[var(--spacing-32)]">

          <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] text-center whitespace-pre-line">
            {d.onboarding.step1Title}
          </h1>

          {/* 프로필 이미지 — 우측 상단에 편집 픽토그램 오버레이, 안내 텍스트 없이 아이콘만으로 변경 유도 */}
          <div className="relative shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative block active:scale-95 transition-transform duration-100"
              disabled={uploading}
              aria-label={d.profileEdit.changePhotoAlt}
            >
              {avatarUrl ? (
                <Image src={avatarUrl} alt={d.onboarding.avatarAlt} width={96} height={96} className="w-24 h-24 rounded-[var(--radius-cards)] object-cover" />
              ) : (
                <div className="w-24 h-24 rounded-[var(--radius-cards)] bg-surface-elevated flex items-center justify-center">
                  <UserIcon className="w-10 h-10 text-text/50" />
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 rounded-[var(--radius-cards)] bg-surface/70 flex items-center justify-center">
                  <div className="w-6 h-6 border border-current border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </button>
            <span
              aria-hidden="true"
              className="absolute -top-2 -right-2 w-[22px] h-[22px] rounded-[var(--radius-pill)] bg-surface-elevated shadow-[inset_0_0_0_1px_var(--color-border-inverse)] flex items-center justify-center pointer-events-none"
            >
              <PencilIcon className="w-2.5 h-2.5" />
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          {uploadError && (
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center">{uploadError}</p>
          )}

          {/* 아이디 입력 — 가로 70%로 축소 */}
          <div className={`t-input-wrap w-[70%] flex flex-col gap-2${hasError ? ' is-error' : ''}`}>
            <div
              ref={inputShakeRef}
              className={`t-input flex items-center w-full min-h-11 rounded-[var(--radius-inputs)] px-[var(--spacing-16)] bg-surface-elevated transition-shadow ${inputBorderClass}${hasError ? ' is-error' : ''}`}
            >
              <span className="text-text/60 mr-1">@</span>
              <input
                type="text"
                value={input}
                onChange={handleChange}
                placeholder={d.onboarding.usernamePlaceholder}
                maxLength={30}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 bg-transparent placeholder:text-text/30 focus:outline-none"
              />
              {status === 'checking' && (
                <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin ml-2 shrink-0" />
              )}
            </div>
            <p
              ref={messageRef}
              aria-live="polite"
              className="t-text-swap min-h-6 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] px-1 text-text/70"
            >
              {initialMessage}
            </p>
          </div>

          {/* 이름(display_name) 입력 — 티켓 20260909_2119: 온보딩에서는 필수값. 가로 70%로 축소 */}
          <div className="w-[70%] flex flex-col gap-2">
            <div className="t-input flex items-center w-full min-h-11 rounded-[var(--radius-inputs)] px-[var(--spacing-16)] bg-surface-elevated shadow-[inset_0_0_0_1px_var(--color-border-inverse)]">
              <input
                type="text"
                value={nameInput}
                onChange={handleNameChange}
                placeholder={d.profileEdit.namePlaceholder}
                maxLength={30}
                className="flex-1 bg-transparent placeholder:text-text/30 focus:outline-none"
              />
            </div>
            <p className="text-right text-[length:var(--text-caption)] leading-[var(--leading-caption)] px-1 text-text/40">
              {t(d.onboarding.nameCounter, { count: nameInput.length })}
            </p>
          </div>

          {/* 만 14세 이상 자기확인 — 이미 아이디가 있던 유저(1단계 재진입 아님)는 생략 */}
          {currentUsername === null && (
            <label className="w-[70%] flex items-center gap-[var(--spacing-12)] min-h-11 cursor-pointer">
              <span
                className={`relative shrink-0 w-5 h-5 rounded-[var(--radius-xs)] flex items-center justify-center transition-shadow ${
                  ageConfirmed
                    ? 'shadow-[inset_0_0_0_2px_var(--color-border-inverse)]'
                    : 'shadow-[inset_0_0_0_1px_var(--color-border-inverse)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(e) => setAgeConfirmed(e.target.checked)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label={d.onboarding.ageConfirmLabel}
                />
                {ageConfirmed && (
                  <svg viewBox="0 0 16 16" className="w-3 h-3 pointer-events-none" fill="none" aria-hidden="true">
                    <path d="M3 8.5L6.5 12L13 4.5" stroke="var(--color-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/90">
                {d.onboarding.ageConfirmLabel}
              </span>
            </label>
          )}

          <button
            onClick={handleStep1Next}
            disabled={!canProceedStep1}
            className="w-[70%] min-h-11 bg-surface-inverse text-text-inverse py-[14px] rounded-[var(--radius-pill-buttons)] active:scale-95 transition-transform duration-100 disabled:opacity-40 disabled:cursor-not-allowed text-[length:var(--text-body)] leading-[var(--leading-body)]"
          >
            {submittingStep1 ? d.onboarding.step1Saving : d.onboarding.step1NextButton}
          </button>
        </div>
      </div>
    )
  }

  // ── 2단계: 트라이브 선택 + 프로필이미지 ──────────────────────────────────
  return (
    <div className="min-h-full bg-surface text-text flex flex-col items-center px-[var(--spacing-24)] py-[var(--spacing-48)]">
      <div className="w-full max-w-sm flex flex-col items-center gap-[var(--spacing-32)]">

        <div className="flex flex-col items-center gap-[var(--spacing-16)]">
          {/* 프로필 이미지 변경 UI는 1단계로 이동(티켓 20260909_2119 추가 수정) */}
          <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] text-center whitespace-pre-line">
            {d.onboarding.step2Title}
          </h1>
          <p className="text-text/60 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center">
            {d.onboarding.step2Subtitle}
          </p>
        </div>

        {/* 트라이브 카드 그리드 */}
        {tribesState.kind === 'loading' && (
          <div className="w-full flex items-center justify-center py-[var(--spacing-32)]">
            <div className="w-6 h-6 border border-current border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {tribesState.kind === 'error' && (
          <div className="w-full flex flex-col items-center gap-[var(--spacing-16)] py-[var(--spacing-16)]">
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center text-text/70">
              {d.onboarding.tribesLoadError}
            </p>
            <button
              onClick={loadTribes}
              className="min-h-11 px-[var(--spacing-24)] rounded-[var(--radius-pill-buttons)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] active:scale-95 transition-transform duration-100"
            >
              {d.onboarding.retryButton}
            </button>
          </div>
        )}

        {tribesState.kind === 'ready' && tribesState.tribes.length === 0 && (
          <div className="w-full flex flex-col items-center gap-[var(--spacing-16)] py-[var(--spacing-16)]">
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center text-text/70">
              {d.onboarding.tribesEmptyError}
            </p>
            <button
              onClick={loadTribes}
              className="min-h-11 px-[var(--spacing-24)] rounded-[var(--radius-pill-buttons)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] active:scale-95 transition-transform duration-100"
            >
              {d.onboarding.retryButton}
            </button>
          </div>
        )}

        {tribesState.kind === 'ready' && tribesState.tribes.length > 0 && (
          <div className="w-full grid grid-cols-2 gap-[var(--spacing-8)]">
            {tribesState.tribes.map((tribe) => {
              const selected = selectedTribeId === tribe.id
              return (
                <Card
                  key={tribe.id}
                  tone={selected ? 'inverse' : 'default'}
                  onClick={() => setSelectedTribeId(tribe.id)}
                  className="flex flex-col items-center text-center gap-[var(--spacing-8)]"
                  style={{ minHeight: 140 }}
                >
                  {tribe.image_url ? (
                    <Image src={tribe.image_url} alt="" width={48} height={48} className="w-12 h-12 rounded-[var(--radius-cards)] object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-[var(--radius-cards)] bg-black/10 flex items-center justify-center">
                      <UserIcon className="w-6 h-6 opacity-40" />
                    </div>
                  )}
                  <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] font-bold">
                    {tribe.name}
                  </span>
                  {tribe.tagline && (
                    <span className="text-[length:var(--text-caption)] leading-[var(--leading-caption)] opacity-60">
                      {tribe.tagline}
                    </span>
                  )}
                </Card>
              )
            })}
          </div>
        )}

        {step2Error && (
          <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center">{step2Error}</p>
        )}

        <div className="w-full flex flex-col gap-[var(--spacing-12)]">
          <button
            onClick={handleFinish}
            disabled={!selectedTribeId || submittingStep2}
            className="w-full min-h-11 bg-surface-inverse text-text-inverse py-[14px] rounded-[var(--radius-pill-buttons)] active:scale-95 transition-transform duration-100 disabled:opacity-40 disabled:cursor-not-allowed text-[length:var(--text-body)] leading-[var(--leading-body)]"
          >
            {submittingStep2 ? d.onboarding.finishing : d.onboarding.finishButton}
          </button>
          {/* 1단계(아이디·이름)로 돌아가 값을 다시 확인·수정할 수 있게 한다. */}
          <button
            onClick={() => setStep('account')}
            className="w-full min-h-11 text-text/60 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] active:opacity-70 transition-opacity"
          >
            {d.common.back}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  // useSearchParams()는 Suspense 경계 안에서만 쓸 수 있다 (login/page.tsx와 동일 패턴).
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  )
}
