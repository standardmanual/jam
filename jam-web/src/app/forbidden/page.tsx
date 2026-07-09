import Link from 'next/link'

export default function AdminForbiddenPage() {
  return (
    <div className="min-h-dvh bg-[#0A0A0A] text-white flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-6xl">🚫</p>
        <h1 className="text-2xl font-bold">접근 권한 없음</h1>
        <p className="text-white/50">이 계정은 어드민 접근이 허용되지 않습니다.</p>
        <Link href="/" className="inline-block mt-4 text-[#AEEA00] hover:underline">
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
