'use client'

import { usePathname } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { d } from '@/lib/i18n'

/**
 * 전역 하단 푸터 — 투데이(홈, `/`)는 상단에 이미 로고를 노출하므로 제외한다.
 *
 * `/drops`도 제외한다: `DropsClient.tsx`가 `fixed inset-0`로 문서 흐름을 완전히 이탈하는
 * 풀스크린 지도 화면이라, `(main)/layout.tsx`의 sticky-footer 트릭(children 래퍼 `min-h-dvh`)이
 * "콘텐츠가 fixed로 이탈해 실제 높이가 0"인 케이스를 감안하지 못해 Footer가 `main` 스크롤에
 * 끌려 올라오는 버그가 있었다(20260831_2106). 향후 같은 종류의 풀스크린 이탈 화면이 늘어나면
 * 경로 하드코딩 나열보다 레이아웃 쪽에서 조건부 렌더링하는 방식을 재검토할 것.
 *
 * `/philosophy`도 제외한다: Footer의 'Philosophy' 링크가 가리키는 목적지 자신이라,
 * 그 화면 하단에 같은 링크가 다시 노출되는 순환을 막는다 (20260901_2125).
 */
const FOOTER_EXCLUDED_PATHS = ['/', '/drops', '/philosophy']

export default function Footer() {
  const pathname = usePathname()
  if (FOOTER_EXCLUDED_PATHS.includes(pathname)) return null

  return (
    // relative z-10 — 배지 상세화면(/badges/[id])의 고정 배경 레이어(position:fixed, z-index:0,
    // 20260818_002/003)가 뷰포트 전체를 덮을 때 전역 Footer가 그 아래로 가려지지 않도록 승격.
    // Footer는 bg-transparent라 다른 화면에서는 이 승격이 시각적으로 아무 영향을 주지 않는다.
    <footer className="relative z-10 flex flex-col items-center justify-center gap-1.5 py-[var(--spacing-24)] px-[var(--spacing-16)] bg-transparent">
      <span className="text-[length:var(--text-caption)] leading-none text-text text-center">{d.common.footerSlogan}</span>
      {/* 20260901_2125: 슬로건 아래 → 로고+저작권 줄 위. 캡션 톤을 그대로 따르고
          밑줄만 붙여 링크임을 알린다(과한 강조 금지).
          min-h-11(44px)로 터치 영역을 확보하고 -my-4로 늘어난 높이를 상쇄해 3단 배치의
          시각 간격은 그대로 둔다 — 캡션 12px 그대로면 히트 박스가 약 72×12px로 WCAG 2.2의
          24×24조차 못 미치는데, 이 링크가 철학 페이지로 가는 유일한 진입점이다.
          globals.css가 -webkit-tap-highlight-color를 전역으로 껐으므로 active 피드백을
          직접 준다(텍스트 링크에는 scale보다 opacity가 자연스럽다). */}
      <Link
        href="/philosophy"
        className="inline-flex items-center justify-center min-h-11 -my-4 px-[var(--spacing-16)] text-[length:var(--text-caption)] leading-none text-text underline underline-offset-2 active:opacity-60 transition-opacity duration-[var(--duration-micro)]"
      >
        {d.common.footerPhilosophy}
      </Link>
      <div className="flex items-center justify-center gap-1.5">
        <Image src="/jam-logo-white.png" alt="JAM!" width={2238} height={925} className="h-3 w-auto" />
        <span className="text-[length:var(--text-caption)] leading-none text-text">{d.common.footerCopyright}</span>
      </div>
    </footer>
  )
}
