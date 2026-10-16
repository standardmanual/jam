import Link from 'next/link'

const ForbiddenIcon = () => (
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.5}
    strokeLinecap="round" strokeLinejoin="round" width={48} height={48} aria-hidden="true">
    <circle cx="24" cy="24" r="18" />
    <line x1="10" y1="10" x2="38" y2="38" />
  </svg>
)

export default function AdminForbiddenPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
      <div role="status" className="flex flex-col items-center gap-4 text-center px-6 max-w-sm">
        <div className="text-muted">
          <ForbiddenIcon />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-2xl font-medium">접근 권한 없음</p>
          <p className="text-muted text-base">이 계정은 어드민 접근이 허용되지 않아요.</p>
        </div>
        <Link
          href="/"
          className="mt-2 inline-flex items-center justify-center min-h-11 px-8 py-[13px] rounded-full bg-background-inverse text-snow text-base whitespace-nowrap break-keep wrap-break-word hover:opacity-90 transition-opacity"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
