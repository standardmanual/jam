'use client'

import { usePathname } from 'next/navigation'
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
 *
 * `/privacy`도 같은 이유로 제외한다: '개인정보처리방침' 링크의 목적지 자신이다 (20260901_2217).
 */
const FOOTER_EXCLUDED_PATHS = ['/', '/drops', '/philosophy', '/privacy']

export default function Footer() {
  const pathname = usePathname()
  if (FOOTER_EXCLUDED_PATHS.includes(pathname)) return null

  return (
    // relative z-10 — 배지 상세화면(/badges/[id])의 고정 배경 레이어(position:fixed, z-index:0,
    // 20260818_002/003)가 뷰포트 전체를 덮을 때 전역 Footer가 그 아래로 가려지지 않도록 승격.
    //
    // 20260909_2319 Figma 반영 초안은 배경을 #2f2f2f로 하드코딩했으나, 실기기 확인 후
    // 페이지 배경(부모 <main>의 bg-surface)과 다른 톤으로 튀어 보인다는 피드백으로
    // bg-transparent로 되돌렸다 — 이러면 Footer가 항상 부모 배경(화면마다 다를 수 있는
    // "원색 풀블리드 배경")을 그대로 물려받아 이질감이 없다(원래 방식으로 복귀).
    <footer className="relative z-10 flex flex-col items-start justify-center gap-[var(--spacing-24)] py-[var(--spacing-24)] px-[var(--spacing-16)] bg-transparent">
      <span className="text-[15px] leading-[28px] font-normal text-text whitespace-pre-line">{d.common.footerSlogan}</span>
      {/* 20260901_2125: 슬로건 아래 → 저작권 줄 위. 캡션 톤을 그대로 따르고
          밑줄만 붙여 링크임을 알린다(과한 강조 금지).
          globals.css가 -webkit-tap-highlight-color를 전역으로 껐으므로 active 피드백을
          직접 준다(텍스트 링크에는 scale보다 opacity가 자연스럽다).
          20260901_2217: 개인정보처리방침 링크를 추가하며 이 줄에 함께 둔다.
          20260909_2319: Figma 디자인이 두 링크를 세로로 쌓으므로 flex-row → flex-col로 변경.
          당시 min-h-11(44px)로 터치 영역을 확보했던 것은 캡션 12px 기준(히트박스가 약
          72×12px로 WCAG 2.2 AA 24×24조차 못 미치던 시절)의 유산이었는데, 이번 Figma 반영으로
          폰트가 15px/line-height 28px로 커지면서 텍스트 자체 높이(28px)가 이미 AA 최소
          기준(24×24)을 넘는다. 실기기 확인 후 "슬로건처럼 줄바꿈 수준으로 붙여 달라"는
          피드백을 받아 min-h-11을 제거했다 — 44px 히트박스(AAA 권장치)를 버리고 텍스트 크기
          그대로(28px, AA 기준 충족)를 히트박스로 쓴다. gap-0과 결합해 두 링크가 슬로건의
          줄바꿈과 같은 간격으로 붙는다. */}
      <div className="flex flex-col items-start gap-0">
        <Link
          href="/philosophy"
          className="text-[15px] leading-[28px] font-normal text-text underline underline-offset-2 active:opacity-60 transition-opacity duration-[var(--duration-micro)]"
        >
          {d.common.footerPhilosophy}
        </Link>
        <Link
          href="/privacy"
          className="text-[15px] leading-[28px] font-normal text-text underline underline-offset-2 active:opacity-60 transition-opacity duration-[var(--duration-micro)]"
        >
          {d.common.footerPrivacy}
        </Link>
      </div>
      {/* 20260909_2319: 로고 이미지 제거, 저작권 텍스트만 남긴다(Figma 사양). */}
      <span className="text-[15px] leading-[28px] font-normal text-text">{d.common.footerCopyright}</span>
    </footer>
  )
}
