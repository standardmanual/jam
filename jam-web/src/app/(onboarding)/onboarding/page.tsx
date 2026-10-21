'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { UserIcon, PencilIcon } from '@/components/ui/icons'
import Button from '@/components/ui/Button'
import { useTextSwap, useErrorShake } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d, t } from '@/lib/i18n'
import { trackEvent } from '@/lib/analytics/gtag'
import TribeStep, { type TribesState } from './TribeStep'
import { resolveOnboardingEntry, type OnboardingUserRow } from './onboarding-entry'

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

  // 로그아웃 요청이 진행 중이다(두 단계 공통) — 티켓 20261021_1247. 성공하면 풀지 않는다(/login으로 넘어갈 때까지 중복 클릭을 막는다).
  const [loggingOut, setLoggingOut] = useState(false)

  // ── 2단계: 트라이브 + 프로필이미지 ───────────────────────────────────────
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [tribesState, setTribesState] = useState<TribesState>({ kind: 'loading' })
  const [selectedTribeId, setSelectedTribeId] = useState<string | null>(null)
  const [step2Error, setStep2Error] = useState('')
  const [submittingStep2, setSubmittingStep2] = useState(false)
  // 아이디를 이미 정해 곧장 2단계로 온 유저(트라이브 게이트로 돌아온 유저 포함)에게만 «트라이브를 고르면 JAM!을 시작할 수 있어요» 한 줄을 보인다.
  // 이 화면에서 1단계를 막 마치고 넘어온 유저에게는 이유를 설명할 필요가 없다(티켓 20261021_1247).
  const [arrivedAtTribeStep, setArrivedAtTribeStep] = useState(false)

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
    setTribesState({ kind: 'ready', tribes: data as Extract<TribesState, { kind: 'ready' }>['tribes'] })
  }

  // 현재 유저 정보 로드 — username·display_name·avatar_url·트라이브 확인
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
          // 어디에 둘지는 tribe_id 하나로 정한다(티켓 20261021_1247). `(main)` 레이아웃의 트라이브 게이트·로그인 콜백·프로필 경유지와 같은 기준이라
          // «게이트는 여기로 보내고 여기서는 홈으로 되돌리는» 반복이 없다. 예전에는 onboarding_completed_at을 봤다.
          const entry = resolveOnboardingEntry(raw as OnboardingUserRow | null)

          // 트라이브를 이미 고른 유저는 온보딩으로 올 이유가 없다.
          if (entry.kind === 'home') {
            router.replace('/')
            return
          }

          setAvatarUrl(entry.avatarUrl)

          if (entry.kind === 'tribe') {
            // 1단계는 이미 마쳤고 2단계(트라이브)만 남은 유저 — 아이디는 이미 확정된
            // 값이므로 재확인 없이 곧장 2단계로 보낸다.
            setCurrentUsername(entry.username)
            setInput(entry.username)
            setStatus('same')
            setNameInput(entry.displayName)
            setAgeConfirmed(true)
            setArrivedAtTribeStep(true)
            setStep('tribe')
            loadTribes()
          }
          setLoaded(true)
        })
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 때 한 번만 읽는다(기존 동작)
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
    !submittingStep1 &&
    !loggingOut

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
        // 정상 UI 흐름에서는 도달하지 않는다(트라이브를 이미 고른 유저는 로드 시점에 홈으로 리다이렉트됨).
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

  // ── 로그아웃 길 (두 단계 공통) — 티켓 20261021_1247, 채원 사전 판정 2026-10-21 ───────────
  // 트라이브를 고르지 않은 유저는 (main) 화면에 닿지 못해 프로필의 «로그아웃»을 쓸 수 없다. 잘못된 구글 계정으로 들어온 유저가 빠져나갈 길이 이 화면에 있어야 한다.
  // 실패를 반드시 알린다: signOut이 네트워크 오류면 세션을 지우지 않고 error만 돌려주는데, proxy.ts는 로그인된 유저를 /login에서 /로 돌려보내고
  // /는 트라이브 게이트가 다시 /onboarding으로 보내 막다른 길이 된다. 프로필의 로그아웃은 오류를 무시하지만 여기서는 따라 하지 않는다.
  async function handleLogout() {
    if (loggingOut || submittingStep1 || submittingStep2) return
    setLoggingOut(true)
    let failed = false
    try {
      const { error } = await supabase.auth.signOut()
      failed = Boolean(error)
    } catch {
      failed = true
    }
    if (failed) {
      setLoggingOut(false)
      // 2단계는 기존 오류 자리(role="alert"), 1단계는 기존 안내 줄(message)에 보인다
      if (step === 'tribe') setStep2Error(d.onboarding.networkError)
      else setMessage(d.onboarding.networkError)
      return
    }
    // 성공하면 loggingOut을 풀지 않는다 — 화면이 넘어갈 때까지 중복 클릭을 막는다
    router.push('/login')
  }

  // 바이너리 컬러 원칙상 에러를 색으로 표현하지 않는다 — 보더 두께로만 상태를 구분하고 실제 안내는 메시지 텍스트로 전달
  const hasError = status === 'invalid' || status === 'taken'
  const inputBorderClass = hasError
    ? 'shadow-[inset_0_0_0_2px_var(--separator)]'
    : 'shadow-[inset_0_0_0_1px_var(--separator)]'

  // 중복확인 상태 메시지 — 즉시 전환 대신 Text states swap (04)
  const { ref: messageRef, initialText: initialMessage } = useTextSwap<HTMLParagraphElement>(message)
  // 유효하지 않거나 이미 사용 중인 아이디 — Error state shake (12).
  const inputShakeRef = useErrorShake<HTMLDivElement>(hasError ? status : null)

  if (!loaded) {
    return (
      <div className="min-h-full text-foreground flex items-center justify-center">
        <div className="w-6 h-6 border border-current border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (step === 'account') {
    return (
      <div className="min-h-full text-foreground flex flex-col items-center justify-start px-6 py-12">
        <div className="w-full max-w-sm flex flex-col items-center gap-8">

          <h1 className="text-3xl text-center whitespace-pre-line">
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
            <span
              aria-hidden="true"
              className="absolute -top-2 -right-2 w-[22px] h-[22px] rounded-full bg-surface shadow-[inset_0_0_0_1px_var(--separator)] flex items-center justify-center pointer-events-none"
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
            <p className="text-base text-center">{uploadError}</p>
          )}

          {/* 아이디 입력 — 가로 70%로 축소 */}
          <div className={`t-input-wrap w-[70%] flex flex-col gap-2${hasError ? ' is-error' : ''}`}>
            <div
              ref={inputShakeRef}
              className={`t-input flex items-center w-full min-h-11 rounded-full px-4 bg-surface transition-shadow ${inputBorderClass}${hasError ? ' is-error' : ''}`}
            >
              <span className="text-muted mr-1">@</span>
              <input
                type="text"
                value={input}
                onChange={handleChange}
                placeholder={d.onboarding.usernamePlaceholder}
                maxLength={30}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 bg-transparent placeholder:text-muted focus:outline-none"
              />
              {status === 'checking' && (
                <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin ml-2 shrink-0" />
              )}
            </div>
            <p
              ref={messageRef}
              aria-live="polite"
              className="t-text-swap min-h-6 text-base px-1 text-muted"
            >
              {initialMessage}
            </p>
          </div>

          {/* 이름(display_name) 입력 — 티켓 20260909_2119: 온보딩에서는 필수값. 가로 70%로 축소 */}
          <div className="w-[70%] flex flex-col gap-2">
            <div className="t-input flex items-center w-full min-h-11 rounded-full px-4 bg-surface shadow-[inset_0_0_0_1px_var(--separator)]">
              <input
                type="text"
                value={nameInput}
                onChange={handleNameChange}
                placeholder={d.profileEdit.namePlaceholder}
                maxLength={30}
                className="flex-1 bg-transparent placeholder:text-muted focus:outline-none"
              />
            </div>
            <p className="text-right text-xs px-1 text-muted">
              {t(d.onboarding.nameCounter, { count: nameInput.length })}
            </p>
          </div>

          {/* 만 14세 이상 자기확인 — 이미 아이디가 있던 유저(1단계 재진입 아님)는 생략 */}
          {currentUsername === null && (
            <label className="w-[70%] flex items-center gap-3 min-h-11 cursor-pointer">
              <span
                className={`relative shrink-0 w-5 h-5 rounded-sm flex items-center justify-center transition-shadow ${
                  ageConfirmed
                    ? 'shadow-[inset_0_0_0_2px_var(--separator)]'
                    : 'shadow-[inset_0_0_0_1px_var(--separator)]'
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
                    <path d="M3 8.5L6.5 12L13 4.5" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className="text-base text-foreground">
                {d.onboarding.ageConfirmLabel}
              </span>
            </label>
          )}

          <button
            onClick={handleStep1Next}
            disabled={!canProceedStep1}
            className="w-[70%] min-h-11 bg-background-inverse text-snow py-[14px] rounded-full active:scale-95 transition-transform duration-100 disabled:opacity-40 disabled:cursor-not-allowed text-base"
          >
            {submittingStep1 ? d.onboarding.step1Saving : d.onboarding.step1NextButton}
          </button>

          {/* 로그아웃 길 — 티켓 20261021_1247. 1단계에는 «뒤로»도 없어 잘못된 구글 계정으로 들어온 유저가 빠져나갈 길이 없다.
              2단계(TribeStep)와 같은 ghost 버튼이다. 제출 중에는 비활성이고, 로그아웃 중에는 스피너를 보인다(글자는 그대로). */}
          <Button
            type="button"
            variant="ghost"
            onClick={handleLogout}
            disabled={submittingStep1}
            loading={loggingOut}
            className="whitespace-nowrap break-keep wrap-break-word"
          >
            {d.profile.logoutButton}
          </Button>
        </div>
      </div>
    )
  }

  // ── 2단계: 트라이브 고르기 ───────────────────────────────────────────────
  // 화면 구성은 TribeStep(받은 값을 그리기만 한다). 카드를 눌러도 확정되지 않고 «이 트라이브로 시작하기» 버튼을 눌러야 handleFinish가 돈다.
  return (
    <TribeStep
      tribesState={tribesState}
      selectedTribeId={selectedTribeId}
      submitting={submittingStep2}
      loggingOut={loggingOut}
      error={step2Error}
      showGateHint={arrivedAtTribeStep}
      onSelect={setSelectedTribeId}
      onFinish={handleFinish}
      onBack={() => setStep('account')}
      onRetry={loadTribes}
      onLogout={handleLogout}
    />
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
