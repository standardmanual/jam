'use client'

import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Suspense } from 'react'
import { d } from '@/lib/i18n'

function LoginContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const handleGoogleLogin = async () => {
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback`
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-surface text-text px-[var(--spacing-24)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* 로고 */}
      <div className="text-center mb-[var(--spacing-40)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/jam-logo-white.png" alt={d.auth.wordmark} className="h-[48px] w-auto mx-auto" />
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="w-full max-w-sm mb-[var(--spacing-24)] rounded-[var(--radius-cards)] bg-surface-inverse text-text-inverse px-[var(--spacing-16)] py-[var(--spacing-16)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center">
          {error === 'auth_failed' ? d.auth.errorFailed : d.auth.errorGeneric}
        </div>
      )}

      {/* 구글 로그인 버튼 */}
      <div className="w-full max-w-sm">
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 bg-surface-inverse text-text-inverse rounded-[var(--radius-pill-buttons)] min-h-11 py-[14px] px-[var(--spacing-24)] text-[length:var(--text-body)] leading-[var(--leading-body)] active:scale-95 transition-transform duration-100"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {d.auth.googleLogin}
        </button>

        {/* 로컬 개발 전용 — 프로덕션/프리뷰 빌드에서는 NODE_ENV가 'development'가 아니므로 렌더링 안 됨 */}
        {process.env.NODE_ENV === 'development' && (
          <button
            onClick={() => {
              window.location.href = '/api/dev-login'
            }}
            className="w-full mt-[var(--spacing-16)] flex items-center justify-center gap-3 border border-text/30 text-text rounded-[var(--radius-pill-buttons)] min-h-11 py-[14px] px-[var(--spacing-24)] text-[length:var(--text-body)] leading-[var(--leading-body)] active:scale-95 transition-transform duration-100"
          >
            {d.auth.devLogin}
          </button>
        )}
      </div>

      <p className="mt-[var(--spacing-32)] text-text/60 text-[11px] text-center">
        {d.auth.terms}
      </p>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh flex items-center justify-center bg-surface text-text">
          <div className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)]">{d.auth.wordmark}</div>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
