'use client'

import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { d } from '@/lib/i18n'

/**
 * 전역 하단 푸터 — 투데이(홈, `/`)는 상단에 이미 로고를 노출하므로 제외한다.
 */
export default function Footer() {
  const pathname = usePathname()
  if (pathname === '/') return null

  return (
    // relative z-10 — 배지 상세화면(/badges/[id])의 고정 배경 레이어(position:fixed, z-index:0,
    // 20260818_002/003)가 뷰포트 전체를 덮을 때 전역 Footer가 그 아래로 가려지지 않도록 승격.
    // Footer는 bg-transparent라 다른 화면에서는 이 승격이 시각적으로 아무 영향을 주지 않는다.
    <footer className="relative z-10 flex flex-col items-center justify-center gap-1.5 py-[var(--spacing-24)] px-[var(--spacing-16)] bg-transparent">
      <span className="text-[length:var(--text-caption)] leading-none text-text text-center">{d.common.footerSlogan}</span>
      <div className="flex items-center justify-center gap-1.5">
        <Image src="/jam-logo-white.png" alt="JAM!" width={2238} height={925} className="h-3 w-auto" />
        <span className="text-[length:var(--text-caption)] leading-none text-text">{d.common.footerCopyright}</span>
      </div>
    </footer>
  )
}
