'use client'

import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Suspense } from 'react'
import InlineNotice from '@/components/ui/InlineNotice'
import { WITHDRAWN_QUERY_KEY } from '@/lib/account/withdraw-contract'
import { d } from '@/lib/i18n'

function LoginContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  // 탈퇴를 마친 유저가 오는 곳(`/login?withdrawn=1`, 티켓 20261021_1249 3회). 오류와 안내가 쌓이지 않게 ?error가 있으면 오류만 보인다
  const withdrawn = searchParams.get(WITHDRAWN_QUERY_KEY) === '1'

  const handleGoogleLogin = async () => {
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback`
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-background text-foreground px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* 로고 */}
      <div className="text-center mb-10">
        {/* 흰색 로고 PNG를 마스크로 쓰고 색은 --foreground로 칠한다(크림 위 흰 로고는 1.05:1). 이름은 role="img"가 맡는다. */}
        <span role="img" aria-label={d.auth.wordmark} className="jam-logo-mark inline-block align-bottom h-[48px]" />
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="w-full max-w-sm mb-6 rounded-2xl bg-background-inverse text-snow px-4 py-4 text-base text-center">
          {error === 'auth_failed' ? d.auth.errorFailed : d.auth.errorGeneric}
        </div>
      )}

      {/* 탈퇴 완료 안내 — 오류처럼 읽히지 않도록 검정 반전 배너를 쓰지 않고 InlineNotice(왼쪽 정렬)로 보인다 */}
      {!error && withdrawn && (
        <div className="w-full max-w-sm mb-6">
          <InlineNotice>{d.auth.withdrawnNotice}</InlineNotice>
        </div>
      )}

      {/* 구글 로그인 버튼 */}
      <div className="w-full max-w-sm">
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 bg-background-inverse text-snow rounded-full min-h-11 py-[14px] px-6 text-base active:scale-95 transition-transform duration-100"
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
            className="w-full mt-4 flex items-center justify-center gap-3 border border-foreground/30 text-foreground rounded-full min-h-11 py-[14px] px-6 text-base active:scale-95 transition-transform duration-100"
          >
            {d.auth.devLogin}
          </button>
        )}
      </div>

      <p className="mt-8 text-muted text-[11px] text-center">
        {d.auth.terms}
      </p>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh flex items-center justify-center bg-background text-foreground">
          <div className="text-3xl">{d.auth.wordmark}</div>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
