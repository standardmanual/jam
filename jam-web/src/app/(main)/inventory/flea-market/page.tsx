import Link from 'next/link'

export default function FleaMarketPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full bg-jam-purple px-6 text-center pt-[env(safe-area-inset-top)] pb-8">
      {/* 잠금 아이콘 */}
      <div className="w-24 h-24 rounded-full bg-white border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616] flex items-center justify-center mb-6">
        <span className="text-5xl">🔒</span>
      </div>

      {/* 타이틀 */}
      <h1 className="text-2xl font-black text-white mb-3">플리마켓 오픈 준비 중</h1>

      {/* 안내 문구 */}
      <p className="text-white/70 text-sm leading-relaxed mb-2 font-semibold">
        서울 DAU <span className="text-jam-lime font-black">3만명</span> 달성 시 오픈됩니다
      </p>
      <p className="text-white/50 text-xs font-semibold">
        플리마켓에서 다른 러너들과 아이템 배지를 교환할 수 있어요
      </p>

      {/* 진행 상황 힌트 */}
      <div className="mt-8 w-full max-w-xs bg-jam-cream border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] px-5 py-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-jam-ink/50 font-bold">오픈 조건</span>
          <span className="text-xs text-jam-ink/50 font-bold">달성 전</span>
        </div>
        <div className="w-full h-1.5 bg-jam-ink/10 rounded-full overflow-hidden">
          <div className="h-full bg-jam-lime rounded-full w-0" />
        </div>
        <p className="text-[11px] text-jam-ink/50 mt-2 text-center font-semibold">서울 DAU 30,000명 달성</p>
      </div>

      {/* 뒤로가기 */}
      <Link
        href="/inventory"
        className="mt-8 inline-flex items-center gap-2 text-white font-bold text-sm border-[3px] border-white/40 rounded-full px-5 py-2.5"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        인벤토리로 돌아가기
      </Link>
    </div>
  )
}
