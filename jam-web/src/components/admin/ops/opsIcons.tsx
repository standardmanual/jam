/**
 * 운영툴 받은 기획함의 아이콘 대응 (티켓 20260930_1817, 채원 화면 설계 「토큰과 상태 표시」·「항목 목록의 한 행」).
 *
 * 상태는 색만으로 나누지 않는다 — 아이콘과 글자를 함께 그린다. 아이콘은 장식이라 `aria-hidden`을 준다.
 */
import type { ComponentType } from 'react'
import {
  IconAlertTriangle,
  IconAward,
  IconBan,
  IconBook,
  IconBroadcast,
  IconBulb,
  IconCalendarEvent,
  IconCircleCheck,
  IconCircleX,
  IconDice,
  IconEye,
  IconFlagCheck,
  IconFlask,
  IconInbox,
  IconLoader2,
  IconNews,
  IconQuestionMark,
  IconTarget,
} from '@tabler/icons-react'
import type { OpsItemStatus } from '@/lib/admin/opsInbox/constants'
import type { OpsBundleStage } from '@/lib/admin/opsInbox/bundleStatus'

export type OpsIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>

/** 항목 상태 10개. 준비중은 돌지 않는 IconLoader2다(정지). */
export const OPS_ITEM_STATUS_ICONS: Record<OpsItemStatus, OpsIcon> = {
  arrived: IconInbox,
  reviewing: IconEye,
  approved: IconCircleCheck,
  preparing: IconLoader2,
  scheduled: IconCalendarEvent,
  live: IconBroadcast,
  ended: IconFlagCheck,
  rejected: IconCircleX,
  cancelled: IconBan,
  failed: IconAlertTriangle,
}

/** 묶음 단계(S2 상태 열). 항목 상태와 같은 아이콘을 쓴다. */
export const OPS_BUNDLE_STAGE_ICONS: Record<OpsBundleStage, OpsIcon> = {
  arrived: IconInbox,
  review: IconEye,
  prepare: IconCircleCheck,
  scheduled: IconCalendarEvent,
  live: IconBroadcast,
  ended: IconFlagCheck,
  rejected: IconCircleX,
  cancelled: IconBan,
  failed: IconAlertTriangle,
}

const KIND_ICONS: Record<string, OpsIcon> = {
  home_feed_card: IconNews,
  mission: IconTarget,
  drop_schedule: IconDice,
  recipe: IconFlask,
  jam_badge: IconAward,
  collection_launch: IconBook,
  pattern_proposal: IconBulb,
}

/** 항목 종류 아이콘. 허용값 밖은 물음표다(「종류 확인 필요」 글자와 함께 그린다). */
export function OpsKindIcon({ kind, className }: { kind: string | null | undefined; className?: string }) {
  const Icon = kind && Object.prototype.hasOwnProperty.call(KIND_ICONS, kind) ? KIND_ICONS[kind] : IconQuestionMark
  return <Icon className={className} aria-hidden="true" />
}
