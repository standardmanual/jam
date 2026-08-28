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
 * TopNav·TabBar는 앱 기본 다크 테마 그대로 둔다(요청: 그건 손대지 말 것). 콘텐츠
 * 영역(iframe)만 앱의 다크 모드와 무관하게 항상 흰 배경(#FFF)으로 고정 — iframe
 * 엘리먼트 자체에 배경을 지정해 콘텐츠 로드 전후 모두 흰색으로 보이게 한다.
 */
export default function VocPage() {
  return (
    <div className="flex flex-col h-dvh bg-surface text-text">
      <TopNav title={d.voc.pageTitle} />
      <iframe
        src="https://sordid-dragonfly-b31.notion.site/ebd//3caaf2fe364580afb650e2529c39a2ae"
        title={d.voc.pageTitle}
        className="flex-1 w-full border-0"
        style={{ background: '#ffffff' }}
      />
    </div>
  )
}
