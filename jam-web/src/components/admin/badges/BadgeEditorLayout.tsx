'use client'

/**
 * 어드민 배지 생성·수정·조회 화면 전용 레이아웃 — 티켓 20260911_0901
 *
 * 실제 구현은 `@/components/admin/AdminEditorLayout`(제네릭, 네임스페이스 기반)에 있다. 원래
 * 이 파일에 있던 레이아웃 골격·상태 배지·필드 그리드·읽기 전용 그리드는 애초에 배지 전용
 * 식별자 타입에 묶여 있지 않아 그대로 옮겼고, 섹션 카드·섹션 목차·스크롤 이동만 배지 전용
 * `BadgeSectionId`에 묶여 있어 제네릭 버전을 `namespace: 'badge'`로 감싼 얇은 래퍼로 바꿨다
 * (투데이 컨텐츠 화면 리뉴얼 티켓 20260911_1454에서 일반화).
 *
 * 이 파일이 내보내는 이름·시그니처는 전부 그대로다 — 이미 검증된 배지 화면 3개 파일
 * (BadgeForm.tsx·BadgeConditionSection.tsx·BadgeDetail.tsx)은 이번 티켓에서 건드리지 않는다.
 */
import {
  EditorShell,
  SectionCard,
  SectionNav,
  scrollToSection,
  type SectionCardProps,
  type SectionNavProps,
} from '@/components/admin/AdminEditorLayout'
import type { BadgeSectionId } from '@/lib/admin/badge-sections'

export {
  RAIL_ACTIONS_CLASS,
  RailCard,
  SectionStatusBadge,
  FIELD_GRID_CLASS,
  fieldSpanClass,
  ReadOnlyGrid,
  ReadOnlyItem,
} from '@/components/admin/AdminEditorLayout'

export const BadgeEditorShell = EditorShell

/** 섹션 카드 — 제목·한 줄 설명·상태 배지를 머리에 두고, 목차 이동 대상이 된다 */
export function BadgeSectionCard(props: Omit<SectionCardProps<BadgeSectionId>, 'namespace'>) {
  return <SectionCard namespace="badge" {...props} />
}

/** 섹션으로 스크롤하고 제목에 포커스를 둔다 — 모션 감소 설정이면 즉시 이동 */
export function scrollToBadgeSection(id: BadgeSectionId) {
  scrollToSection('badge', id)
}

/** 레일의 섹션 목차 — 상태를 보여 주고 누르면 해당 섹션으로 이동한다 */
export function BadgeSectionNav(props: Omit<SectionNavProps<BadgeSectionId>, 'namespace'>) {
  return <SectionNav namespace="badge" {...props} />
}
