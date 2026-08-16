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
    <div className="min-h-dvh bg-[#0A0A0A] text-white flex items-center justify-center">
      <div role="status" className="flex flex-col items-center gap-4 text-center px-6 max-w-sm">
        <div className="text-white/30">
          <ForbiddenIcon />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-2xl font-medium">접근 권한 없음</p>
          <p className="text-white/50 text-base">이 계정은 어드민 접근이 허용되지 않아요.</p>
        </div>
        <Link
          href="/"
          className="mt-2 px-6 py-2.5 rounded-xl bg-[#e8461f] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
