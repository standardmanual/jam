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
    <div className="p-8 max-w-xl">
      <h1 className="text-2xl font-bold mb-2 text-red-600">오류 발생</h1>
      <p className="text-[#6b7280] mb-6 text-sm">어드민 페이지를 로드하는 중 오류가 발생했습니다.</p>

      {isMissingServiceKey && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
          <p className="font-semibold text-amber-600 mb-2">환경변수 설정 필요</p>
          <p className="text-[#374151] mb-3">
            Vercel 프로젝트 설정 → Environment Variables 에서 아래 변수를 추가하세요.
          </p>
          <ul className="space-y-1 text-xs text-[#6b7280]">
            <li>
              <code className="bg-[#f3f4f6] px-1 py-0.5 rounded text-amber-600">SUPABASE_SERVICE_ROLE_KEY</code>
              {' '}— Supabase 프로젝트 Settings → API → service_role secret
            </li>
            <li>
              <code className="bg-[#f3f4f6] px-1 py-0.5 rounded text-amber-600">ADMIN_EMAILS</code>
              {' '}— 콤마로 구분된 어드민 이메일 목록 (예: sihyunrr@gmail.com)
            </li>
          </ul>
        </div>
      )}

      <details className="mb-6 bg-white border border-[#e5e7eb] rounded-xl p-4">
        <summary className="text-xs text-[#898989] cursor-pointer">오류 상세</summary>
        <pre className="mt-2 text-xs text-red-500 whitespace-pre-wrap break-all">{error.message}</pre>
      </details>

      <div className="flex gap-3">
        <button
          onClick={unstable_retry}
          className="bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#111111] text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="text-[#111111]/70 hover:text-[#111111] text-sm font-medium px-4 py-2 transition-colors"
        >
          앱으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
