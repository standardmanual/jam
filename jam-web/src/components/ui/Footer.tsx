'use client'

import { Fragment } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { d } from '@/lib/i18n'
import FooterLogo from './FooterLogo'

/**
 * 전역 하단 푸터.
 *
 * `/drops`는 제외한다: `DropsClient.tsx`가 `fixed inset-0`로 문서 흐름을 완전히 이탈하는
 * 풀스크린 지도 화면이라, `(main)/layout.tsx`의 sticky-footer 트릭(children 래퍼 `min-h-dvh`)이
 * "콘텐츠가 fixed로 이탈해 실제 높이가 0"인 케이스를 감안하지 못해 Footer가 `main` 스크롤에
 * 끌려 올라오는 버그가 있었다(20260831_2106). 향후 같은 종류의 풀스크린 이탈 화면이 늘어나면
 * 경로 하드코딩 나열보다 레이아웃 쪽에서 조건부 렌더링하는 방식을 재검토할 것.
 *
 * `/philosophy`도 제외한다: Footer의 'Philosophy' 링크가 가리키는 목적지 자신이라,
 * 그 화면 하단에 같은 링크가 다시 노출되는 순환을 막는다 (20260901_2125).
 *
 * `/privacy`·`/location-terms`는 `(legal)` 라우트 그룹으로 옮겨 `(main)` 레이아웃(Footer)을
 * 타지 않으므로 제외 목록에 두지 않는다(티켓 20260929_1400).
 *
 * 홈(`/`)은 기존에 "상단 로고 중복" 우려로 제외돼 있었으나, 바로가기·최근배지 섹션 제거로
 * 화면이 짧아져 우려가 완화됐다고 판단해 제외 목록에서 뺐다(티켓 20260917_1203).
 */
const FOOTER_EXCLUDED_PATHS = ['/drops', '/philosophy']

const FOOTER_LINKS = [
  { href: '/philosophy', label: () => d.common.footerPhilosophy },
  { href: '/privacy', label: () => d.common.footerPrivacy },
  { href: '/location-terms', label: () => d.common.footerLocationTerms },
  { href: '/probability', label: () => d.common.footerProbability },
  { href: '/voc', label: () => d.common.footerInquiry },
]

export default function Footer() {
  const pathname = usePathname()
  if (FOOTER_EXCLUDED_PATHS.includes(pathname)) return null

  return (
    // relative z-10 — 배지 상세화면(/badges/[id])의 고정 배경 레이어(position:fixed, z-index:0,
    // 20260818_002/003)가 뷰포트 전체를 덮을 때 전역 Footer가 그 아래로 가려지지 않도록 승격.
    //
    // 20260909_2319 Figma 반영 초안은 배경을 #2f2f2f로 하드코딩했으나, 실기기 확인 후
    // 페이지 배경과 다른 톤으로 튀어 보인다는 피드백으로 bg-transparent로 되돌렸다.
    // 2026-11-08 사용자 요청으로 네거티브로 바꿨다: 반전 면(--background-inverse) 위에
    // 글자는 반전 면 보조 글자(--muted-on-inverse), 로고는 흰색(--snow, FooterLogo)이다.
    <footer className="relative z-10 flex flex-col items-start justify-center gap-6 pt-6 pb-0 px-4 bg-background-inverse">
      <span className="text-[15px] leading-[28px] font-normal text-[color:var(--muted-on-inverse)] whitespace-pre-line">{d.common.footerSlogan}</span>
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
          줄바꿈과 같은 간격으로 붙는다.
          20260929_1359: 위치기반서비스 이용약관 링크를 개인정보처리방침 아래에 같은 스타일로 추가.
          20261021_1250: 확률 안내 링크를 맨 아래에 같은 스타일로 추가(운영 로직 18.3절). 방침·약관 두 법 문서가
          붙어 있는 묶음을 깨지 않으려고 끝에 둔다. 확률 안내 페이지는 (legal) 그룹이라 푸터가 없으므로 입구는 이 푸터와 캡슐 시트다.
          20261031_1302: 문의 링크(/voc)를 확률 안내 다음 줄에 같은 스타일로 추가. 상단 내비의 문의 버튼을 대신한다. */}
      {/* 2026-11-08 사용자 요청: 링크를 가로로 나열하고 사이를 작은 가운데점으로 구분한다.
          폭이 모자라면 줄을 바꾼다(flex-wrap). 가운데점은 읽기 보조 기술에서 숨긴다. */}
      <div className="flex flex-row flex-wrap items-center gap-x-2">
        {FOOTER_LINKS.map((link, i) => (
          <Fragment key={link.href}>
            {i > 0 && (
              <span aria-hidden="true" className="text-[15px] leading-[28px] text-[color:var(--muted-on-inverse)]">·</span>
            )}
            <Link
              href={link.href}
              className="text-[15px] leading-[28px] font-normal text-[color:var(--muted-on-inverse)] underline underline-offset-2 active:opacity-60 transition-opacity duration-[var(--duration-micro)]"
            >
              {link.label()}
            </Link>
          </Fragment>
        ))}
      </div>
      {/* 20260909_2319: 로고 이미지를 걷고 저작권 텍스트만 남겼다(Figma 사양). */}
      <span className="text-[15px] leading-[28px] font-normal text-[color:var(--muted-on-inverse)]">{d.common.footerCopyright}</span>
      {/* 20261104_1642: 저작권 아래, 푸터의 마지막 요소로 JAM! 로고를 서비스 영역의 좌우 패딩(px-4) 안쪽 폭 100%로 채운다.
          새 이미지 없이 .jam-logo-mark(알파 마스크 + --foreground)를 쓴다. items-start라 폭은 w-full로 정한다.
          로고 아래면이 페이지 맨 끝(브라우저 끝)에 닿도록 푸터 아래쪽 패딩과 (main)/layout의 하단 여백이 모두 0이다
          (하단 탭 바는 fixed라 스크롤 끝에서 로고 아래쪽에 겹친다). 화면에 나타날 때 아래에서 위로 Ease In으로 올라온다
          (`FooterLogo`). 라우트가 바뀌면 key로 새로 마운트해 그 화면에서도 다시 올라온다. */}
      <FooterLogo key={pathname} />
    </footer>
  )
}
