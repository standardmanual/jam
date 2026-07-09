'use client'

export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  const isEnvError =
    error.message?.includes('URL and Key are required') ||
    error.message?.includes('SUPABASE')

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md px-6">
        <p className="text-5xl">⚠️</p>
        <h1 className="text-xl font-bold">페이지 로드 오류</h1>

        {isEnvError ? (
          <div className="text-left bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-sm mt-4">
            <p className="font-semibold text-yellow-400 mb-2">환경변수 설정 필요</p>
            <p className="text-white/60 text-xs">
              Vercel 프로젝트 Settings → Environment Variables 에서 아래 값을 추가하세요.
            </p>
            <ul className="mt-2 space-y-1 text-xs text-white/50">
              <li><code className="text-yellow-300">NEXT_PUBLIC_SUPABASE_URL</code></li>
              <li><code className="text-yellow-300">NEXT_PUBLIC_SUPABASE_ANON_KEY</code></li>
              <li><code className="text-yellow-300">SUPABASE_SERVICE_ROLE_KEY</code></li>
              <li><code className="text-yellow-300">ADMIN_EMAILS</code> — 예: sihyunrr@gmail.com</li>
            </ul>
          </div>
        ) : (
          <p className="text-white/40 text-sm">{error.message}</p>
        )}

        <button
          onClick={unstable_retry}
          className="mt-4 bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
