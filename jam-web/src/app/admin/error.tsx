'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[Admin Error]', error)
  }, [error])

  const isMissingServiceKey =
    error.message?.includes('Key are required') ||
    error.message?.includes('SUPABASE_SERVICE_ROLE_KEY')

  return (
    <div className="w-full p-4 md:p-8 space-y-6">
      <h1 className="text-2xl font-bold mb-2 text-red-600">문제가 생겼어요</h1>
      <p className="text-muted-foreground mb-6 text-sm">페이지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>

      {isMissingServiceKey && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
          <p className="font-semibold text-amber-600 mb-2">환경 변수 설정이 필요해요</p>
          <p className="text-foreground mb-3">
            Vercel 프로젝트 설정 → Environment Variables에서 아래 변수를 추가해 주세요.
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>
              <code className="bg-muted px-1 py-0.5 rounded text-amber-600">SUPABASE_SERVICE_ROLE_KEY</code>
              {' '}— Supabase 프로젝트 Settings → API → service_role secret
            </li>
            <li>
              <code className="bg-muted px-1 py-0.5 rounded text-amber-600">ADMIN_EMAILS</code>
              {' '}— 콤마로 구분된 어드민 이메일 목록 (예: sihyunrr@gmail.com)
            </li>
          </ul>
        </div>
      )}

      <details className="mb-6 bg-white border border-border rounded-xl p-4">
        <summary className="text-xs text-muted-foreground cursor-pointer">오류 상세 정보</summary>
        <pre className="mt-2 text-xs text-red-500 whitespace-pre-wrap break-all">{error.message}</pre>
      </details>

      <div className="flex gap-3">
        <button
          onClick={unstable_retry}
          className="bg-muted hover:bg-accent text-foreground text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="text-foreground/70 hover:text-foreground text-sm font-medium px-4 py-2 transition-colors"
        >
          앱으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
