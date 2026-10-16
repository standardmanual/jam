'use client'

import { EmptyState } from '@ds/components/feedback/EmptyState'
import { d } from '@/lib/i18n'

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
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-md px-6">
        <EmptyState
          icon={<WarningIcon />}
          title={d.common.rootErrorTitle}
          description={isEnvError ? d.common.rootErrorEnvDescription : d.common.rootErrorDescription}
          action={{ label: d.common.rootErrorRetry, onClick: unstable_retry }}
        />
        {process.env.NODE_ENV === 'development' && !isEnvError && (
          <p className="text-left text-muted text-xs mt-4 break-all">{error.message}</p>
        )}
        {isEnvError && (
          <div className="text-left bg-surface border border-border rounded-xl p-4 text-sm mt-4">
            <p className="font-semibold text-foreground mb-2">환경변수 설정 필요</p>
            <p className="text-muted text-xs">
              Vercel 프로젝트 Settings → Environment Variables 에서 아래 값을 추가하세요.
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              <li><code className="text-foreground">NEXT_PUBLIC_SUPABASE_URL</code></li>
              <li><code className="text-foreground">NEXT_PUBLIC_SUPABASE_ANON_KEY</code></li>
              <li><code className="text-foreground">SUPABASE_SERVICE_ROLE_KEY</code></li>
              <li><code className="text-foreground">ADMIN_EMAILS</code> — 예: sihyunrr@gmail.com</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
