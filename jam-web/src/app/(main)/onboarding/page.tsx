'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type CheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

function validateFormat(value: string): string | null {
  if (value.length === 0) return '아이디를 입력해 주세요'
  if (value.length > 30) return '30자 이하로 입력해 주세요'
  if (!/^[a-z0-9._]+$/.test(value)) return '영문, 숫자, ., _ 만 사용할 수 있어요'
  if (value.startsWith('.') || value.endsWith('.')) return '점(.)으로 시작하거나 끝날 수 없어요'
  if (value.includes('..')) return '점(.)을 연속으로 사용할 수 없어요'
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
          setMessage('사용 가능한 아이디예요 ✓')
        } else {
          setStatus('taken')
          setMessage('이미 사용 중인 아이디예요')
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
        setMessage('이미 사용 중인 아이디예요')
      } else {
        setMessage('오류가 발생했어요. 다시 시도해 주세요.')
      }
    } catch {
      setMessage('네트워크 오류가 발생했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputBorder =
    status === 'available'
      ? 'border-jam-lime'
      : status === 'taken' || status === 'invalid'
        ? 'border-red-500'
        : 'border-jam-ink/30'

  const msgColor =
    status === 'available' ? 'text-jam-lime' : 'text-red-400'

  return (
    <div className="min-h-full bg-jam-ink flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">

        {/* 프로필 이미지 */}
        <div className="flex flex-col items-center gap-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="프로필"
              className="w-24 h-24 rounded-3xl object-cover border-[3px] border-white/20"
            />
          ) : (
            <div className="w-24 h-24 rounded-3xl bg-white/10 border-[3px] border-white/20 flex items-center justify-center text-4xl">
              👤
            </div>
          )}
          <h1 className="text-white font-black text-2xl text-center leading-snug">
            JAM! 아이디를<br />만들어 주세요
          </h1>
          <p className="text-white/50 text-sm font-semibold text-center">
            아이디는 나중에 변경할 수 있어요
          </p>
        </div>

        {/* 입력 영역 */}
        <div className="w-full flex flex-col gap-2">
          <div className={`flex items-center w-full bg-white/10 border-[2px] ${inputBorder} rounded-xl px-4 py-3 transition-colors`}>
            <span className="text-white/60 font-semibold mr-1">@</span>
            <input
              type="text"
              value={input}
              onChange={handleChange}
              placeholder="username"
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 bg-transparent text-white font-semibold placeholder:text-white/30 focus:outline-none"
            />
            {status === 'checking' && (
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin ml-2 shrink-0" />
            )}
          </div>

          {message && (
            <p className={`text-sm font-semibold px-1 ${msgColor}`}>{message}</p>
          )}
        </div>

        {/* 생성하기 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={status !== 'available' || submitting}
          className="w-full bg-jam-lime text-jam-ink font-black py-4 rounded-2xl border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-lg"
        >
          {submitting ? '저장 중...' : '생성하기'}
        </button>
      </div>
    </div>
  )
}
