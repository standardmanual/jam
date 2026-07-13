'use client'

import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Suspense } from 'react'

function Mascot() {
  return (
    <div className="relative w-40 h-40 mb-8 select-none">
      <div className="absolute inset-0 rounded-[45%_55%_60%_40%/55%_45%_55%_45%] bg-jam-cream border-[3px] border-jam-ink" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <div className="flex gap-4">
          <span className="w-3.5 h-5 rounded-full bg-jam-ink" />
          <span className="w-3.5 h-5 rounded-full bg-jam-ink" />
        </div>
        <span className="w-8 h-4 rounded-b-full border-b-[3px] border-jam-ink" />
      </div>
    </div>
  )
}

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
    <main className="min-h-dvh flex flex-col items-center justify-center bg-jam-orange px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Mascot />

      {/* 로고 & 슬로건 */}
      <div className="text-center mb-10">
        <h1 className="text-6xl font-black text-jam-ink tracking-tighter mb-3">JAM!</h1>
        <p className="text-jam-ink/70 text-base font-bold">움직이면 얻는다. 피지털 배지 컬렉션.</p>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="w-full max-w-sm mb-6 rounded-2xl bg-jam-ink text-white border-[3px] border-jam-ink px-4 py-3 text-sm text-center font-bold">
          {error === 'auth_failed'
            ? '로그인에 실패했어요. 다시 시도해주세요.'
            : '오류가 발생했어요. 잠시 후 다시 시도해주세요.'}
        </div>
      )}

      {/* 구글 로그인 버튼 */}
      <div className="w-full max-w-sm">
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 bg-jam-cream text-jam-ink font-black rounded-2xl py-4 px-6 text-base border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616] hover:shadow-[2px_2px_0_0_#161616] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all"
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
          구글로 시작하기
        </button>
      </div>

      <p className="mt-8 text-jam-ink/60 text-xs text-center font-semibold">
        계속하면 JAM!의 이용약관 및 개인정보처리방침에 동의하는 것으로 간주됩니다.
      </p>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh flex items-center justify-center bg-jam-orange">
          <div className="text-jam-ink text-2xl font-black">JAM!</div>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
