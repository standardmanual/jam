'use client'

/**
 * 어드민 투데이 카드 생성·수정·조회 화면 전용 레이아웃 — 티켓 20260911_1454
 *
 * 배지 화면의 `BadgeEditorLayout.tsx`(티켓 20260911_0901)와 같은 방식으로,
 * `@/components/admin/AdminEditorLayout`(제네릭, 네임스페이스 기반)을 `namespace: 'today'`로
 * 감싼 얇은 래퍼다. 배지·투데이 두 화면이 같은 레이아웃 부품을 쓴다.
 */
import {
  EditorShell,
  SectionCard,
  SectionNav,
  scrollToSection,
  type SectionCardProps,
  type SectionNavProps,
} from '@/components/admin/AdminEditorLayout'
import type { TodaySectionId } from '@/lib/admin/today-sections'

export {
  RAIL_ACTIONS_CLASS,
  RailCard,
  SectionStatusBadge,
  FIELD_GRID_CLASS,
  fieldSpanClass,
  ReadOnlyGrid,
  ReadOnlyItem,
} from '@/components/admin/AdminEditorLayout'

export const TodayEditorShell = EditorShell

/** 섹션 카드 — 제목·한 줄 설명·상태 배지를 머리에 두고, 목차 이동 대상이 된다 */
export function TodaySectionCard(props: Omit<SectionCardProps<TodaySectionId>, 'namespace'>) {
  return <SectionCard namespace="today" {...props} />
}

/** 섹션으로 스크롤하고 제목에 포커스를 둔다 — 모션 감소 설정이면 즉시 이동 */
export function scrollToTodaySection(id: TodaySectionId) {
  scrollToSection('today', id)
}

/** 레일의 섹션 목차 — 상태를 보여 주고 누르면 해당 섹션으로 이동한다 */
export function TodaySectionNav(props: Omit<SectionNavProps<TodaySectionId>, 'namespace'>) {
  return <SectionNav namespace="today" {...props} />
}
