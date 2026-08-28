'use client'

import TopNav from '@/components/ui/TopNav'
import { d } from '@/lib/i18n'

/**
 * 베타테스트 VOC 문의 채널 (임시, 티켓 20260828_1548)
 *
 * 별도 백엔드 없이 기존 Notion 페이지를 iframe으로 임베드한다. `(main)` 레이아웃 그룹
 * 안에 둬 TopNavDataProvider·인증 컨텍스트를 그대로 상속하고, TopNav(뒤로가기,
 * title="문의")를 유지한 채 하단 전체 영역에 Notion 페이지를 띄운다.
 *
 * iframe src는 반드시 Notion 임베드 전용 경로(`/ebd/`)를 써야 한다 — 일반 공유 링크는
 * `X-Frame-Options: SAMEORIGIN` + `frame-ancestors`로 임베드가 차단됨을 확인했다.
 *
 * 정식 VOC 시스템이 생기면 제거 검토 대상.
 *
 * 페이지 전체를 흰 배경으로 고정한다(요청: 이 페이지만 항상 #FFF). 앱은 다크 테마
 * 토큰(--color-bg 등)을 전역으로 쓰므로, 이 wrapper 안에서만 관련 토큰을 라이트 값으로
 * 재정의해 TopNav 텍스트/아이콘(기본값 --color-text = 흰색)이 흰 배경 위에서도 보이게
 * 한다. 다른 화면에는 영향 없음(스코프가 이 div 서브트리로 한정됨).
 */
export default function VocPage() {
  return (
    <div
      className="flex flex-col h-dvh"
      style={
        {
          '--color-bg': '#ffffff',
          '--color-surface': '#ffffff',
          '--color-surface-elevated': '#ffffff',
          '--color-text': '#000000',
          background: '#ffffff',
        } as React.CSSProperties
      }
    >
      <TopNav title={d.voc.pageTitle} />
      <iframe
        src="https://sordid-dragonfly-b31.notion.site/ebd//3caaf2fe364580afb650e2529c39a2ae"
        title={d.voc.pageTitle}
        className="flex-1 w-full border-0"
      />
    </div>
  )
}
