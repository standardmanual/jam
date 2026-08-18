'use client'

import { usePathname } from 'next/navigation'
import Footer from './Footer'

/**
 * (main) 레이아웃의 전역 Footer 슬롯 — [20260818_002]
 * `/badges/[id]` 상세화면은 향후 배경 테마 적용을 위해 Footer를 페이지가 직접 렌더링하므로,
 * 여기서는 해당 경로에서만 전역 렌더링을 skip한다. 다른 화면은 기존과 동일하게 Footer가 렌더링된다.
 */
export default function GlobalFooterSlot() {
  const pathname = usePathname()
  if (pathname?.startsWith('/badges/')) return null

  return <Footer />
}
