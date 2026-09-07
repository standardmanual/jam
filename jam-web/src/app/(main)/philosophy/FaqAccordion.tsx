'use client'

import { Accordion, type AccordionItem } from '@ds/components/navigation/Accordion'

/**
 * FAQ 아코디언 클라이언트 경계 (티켓 20260907_0934).
 *
 * `Accordion`(DS-021)은 내부에서 `useState`를 쓰는 인터랙티브 컴포넌트라 클라이언트
 * 컴포넌트여야 한다. `philosophy/page.tsx`는 DB/API 의존이 없어 서버 컴포넌트로 유지하는
 * 것이 원래 설계 의도(20260901_2125)라, 페이지 전체를 'use client'로 바꾸는 대신 FAQ
 * 렌더링만 이 얇은 클라이언트 래퍼로 분리했다. FAQ 원고(`items`)는 서버 컴포넌트인
 * page.tsx가 만들어 이미 렌더된 ReactNode로 넘긴다.
 */
export default function FaqAccordion({ items }: { items: AccordionItem[] }) {
  return <Accordion items={items} />
}
