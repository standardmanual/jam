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
    <footer className="flex flex-col items-center justify-center gap-1.5 py-[var(--spacing-24)] px-[var(--spacing-16)] bg-[var(--color-bg)]">
      <span className="text-[length:var(--text-caption)] leading-none text-text text-center">{d.common.footerSlogan}</span>
      <div className="flex items-center justify-center gap-1.5">
        <Image src="/jam-logo-white.png" alt="JAM!" width={2238} height={925} className="h-3 w-auto" />
        <span className="text-[length:var(--text-caption)] leading-none text-text">{d.common.footerCopyright}</span>
      </div>
    </footer>
  )
}
