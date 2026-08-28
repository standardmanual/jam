'use client'

import { EmptyState } from '@ds/components/feedback/EmptyState'

/** error.tsx 전용 경고 아이콘 — EmptyState 기본 아이콘(빈 상자)은 "결과 없음"을 뜻해
 * 여기서 쓰이는 "문제가 생겼다"는 의미와 다르므로 커스텀 아이콘을 넘긴다. */
function WarningIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={48}
      height={48}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="18" />
      <line x1="24" y1="16" x2="24" y2="26" />
      <circle cx="24" cy="32" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

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
    <div className="min-h-dvh bg-surface text-text flex items-center justify-center">
      <div className="w-full max-w-md px-6">
        <EmptyState
          icon={<WarningIcon />}
          title="페이지를 불러오지 못했어요"
          description={isEnvError ? '환경변수 설정이 빠져 있어요.' : error.message}
          action={{ label: '다시 시도', onClick: unstable_retry }}
        />
        {isEnvError && (
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
        )}
      </div>
    </div>
  )
}
