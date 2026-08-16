'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { UserIcon } from '@/components/ui/icons'
import { useTextSwap, useErrorShake } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d } from '@/lib/i18n'

type CheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

function validateFormat(value: string): string | null {
  if (value.length === 0) return d.onboarding.errorEmpty
  if (value.length > 30) return d.onboarding.errorTooLong
  if (!/^[a-z0-9._]+$/.test(value)) return d.onboarding.errorFormat
  if (value.startsWith('.') || value.endsWith('.')) return d.onboarding.errorDot
  if (value.includes('..')) return d.onboarding.errorDoubleDot
  return null
}

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<CheckStatus>('idle')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 현재 유저 정보 로드 (avatar_url + 이미 username 있으면 홈으로)
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      if (!user) {
        router.replace('/login')
        return
      }
      // users 테이블에서 username / avatar_url 확인
      supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()
        .then(({ data: raw }) => {
          if (cancelled) return
          const data = raw as { username: string | null; avatar_url: string | null } | null
          if (data?.username) {
            router.replace('/')
            return
          }
          setAvatarUrl(data?.avatar_url ?? null)
        })
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 입력 변경 처리
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '')
    setInput(raw)
    setStatus('idle')
    setMessage('')

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (raw.length === 0) return

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

  async function handleSubmit() {
    if (status !== 'available' || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: input }),
      })
      const json = await res.json() as { success?: boolean; error?: string }
      if (json.success) {
        router.replace('/')
      } else if (json.error === 'DUPLICATE') {
        setStatus('taken')
        setMessage(d.onboarding.taken)
      } else {
        setMessage(d.onboarding.genericError)
      }
    } catch {
      setMessage(d.onboarding.networkError)
    } finally {
      setSubmitting(false)
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
  // `.is-error`는 선언적으로, `.is-shaking`은 훅이 명령형으로 재생한다.
  const inputShakeRef = useErrorShake<HTMLDivElement>(hasError ? status : null)

  return (
    <div className="min-h-full bg-surface text-text flex flex-col items-center justify-center px-[var(--spacing-24)] py-[var(--spacing-48)]">
      <div className="w-full max-w-sm flex flex-col items-center gap-[var(--spacing-32)]">

        {/* 프로필 이미지 */}
        <div className="flex flex-col items-center gap-[var(--spacing-16)]">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={d.onboarding.avatarAlt} width={96} height={96} className="w-24 h-24 rounded-[var(--radius-cards)] object-cover" />
          ) : (
            <div className="w-24 h-24 rounded-[var(--radius-cards)] bg-surface-elevated flex items-center justify-center">
              <UserIcon className="w-10 h-10 text-text/50" />
            </div>
          )}
          <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] text-center whitespace-pre-line">
            {d.onboarding.title}
          </h1>
          <p className="text-text/60 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center">
            {d.onboarding.subtitle}
          </p>
        </div>

        {/* 입력 영역 */}
        <div className={`t-input-wrap w-full flex flex-col gap-2${hasError ? ' is-error' : ''}`}>
          <div
            ref={inputShakeRef}
            className={`t-input flex items-center w-full min-h-11 rounded-[var(--radius-inputs)] px-[var(--spacing-16)] transition-shadow ${inputBorderClass}${hasError ? ' is-error' : ''}`}
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

          {/* 메시지는 항상 마운트한 채 텍스트만 교체한다(빈 문자열 = 숨김).
              min-h-6로 자리를 잡아 스왑 중 레이아웃이 흔들리지 않게 한다. */}
          <p
            ref={messageRef}
            aria-live="polite"
            className="t-text-swap min-h-6 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] px-1 text-text/70"
          >
            {initialMessage}
          </p>
        </div>

        {/* 생성하기 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={status !== 'available' || submitting}
          className="w-full min-h-11 bg-surface-inverse text-text-inverse py-[14px] rounded-[var(--radius-pill-buttons)] active:scale-95 transition-transform duration-100 disabled:opacity-40 disabled:cursor-not-allowed text-[length:var(--text-body)] leading-[var(--leading-body)]"
        >
          {submitting ? d.onboarding.submitting : d.onboarding.submitButton}
        </button>
      </div>
    </div>
  )
}
