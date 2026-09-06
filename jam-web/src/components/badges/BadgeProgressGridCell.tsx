'use client'

import { BadgeProgressRingCard } from '@ds/components/patterns/BadgeProgressRingCard'
import { computeStopStatus } from '@/lib/badgeTreeConditionStatus'
import { formatGridCellCaption } from '@/lib/badgeProgressText'
import { RARITY_LABEL } from '@/lib/rarity'
import type { BadgeFamily } from '@/lib/badgeTree'
import type { BadgeProgress } from '@/lib/badge-engine/badgeProgress'

export interface BadgeProgressGridCellProps {
  /** 눈금이 정확히 1개인 등급형 계열 — 호출부(`BadgeTreeClient`)가 이미 걸러서 넘긴다 */
  family: BadgeFamily
  earnedBadgeIds: Set<string>
  conditionMetBadgeIds: Set<string>
  /** ready/locked 눈금 탭 시 잠금 해제 조건 시트 오픈 요청 */
  onLockClick: (stageId: string) => void
  /** 계열 진행 앵커의 진행 계산 결과 — badge id로 조회 */
  progressByBadgeId: Record<string, BadgeProgress>
  /** 진행 표시 앵커 배지 id(서버가 정한 「첫 미충족」 기준). null이면 이 계열의 유일한 눈금을 쓴다 */
  progressBadgeId: string | null
}

/**
 * 눈금 1개 계열 하나 = 그리드 셀 하나 — 티켓 20260906_1425.
 *
 * `BadgeFamilyRow`(레일 분기)와 같은 계산(상태 판정·진행 캡션)을 하되, 레일 대신 그리드 셀
 * (`BadgeProgressRingCard`, DS)을 그린다. 이 계열이 «눈금 1개인지»는 `BadgeTreeClient`의
 * `nextGoals` 분기가 이미 걸러서 넘긴다 — 여기서 다시 검사하지 않는다(단일 분기 지점 원칙).
 *
 * 문구 조립은 이 컴포넌트가 하지 않는다 — `badgeProgressText.ts`(`formatGridCellCaption`)가
 * 완성 문자열을 만들어 넘긴다(기존 원칙 유지).
 */
export default function BadgeProgressGridCell({
  family,
  earnedBadgeIds,
  conditionMetBadgeIds,
  onLockClick,
  progressByBadgeId,
  progressBadgeId,
}: BadgeProgressGridCellProps) {
  const stage = family.stages[0]
  if (!stage) return null

  const status = computeStopStatus(stage.id, stage.gateGroups, earnedBadgeIds, conditionMetBadgeIds)
  const rawProgress = progressByBadgeId[progressBadgeId ?? stage.id]
  const caption = formatGridCellCaption(rawProgress, status, stage.conditionText)

  const rarityLabel = stage.rarity ? (RARITY_LABEL[stage.rarity] ?? stage.rarity) : null
  const stopName = [family.name, rarityLabel].filter(Boolean).join(' ')
  // 캡션이 상태 라벨을 넘어서는 정보(수치·조건값)일 때만 이어붙인다 — 바닥 폴백("조건 충족")은
  // statusAriaText와 같은 말이라 이어붙이면 "조건 충족. 조건 충족"으로 중복된다.
  const ariaLabel = `${stopName}, ${caption.statusAriaText}` + (caption.hasDetail ? `. ${caption.text}` : '')

  // `StopHitArea`(BadgeStageRail)와 같은 규칙 — ready/locked만 버튼(잠금 시트), 그 외는 링크.
  const gated = status === 'ready' || status === 'locked'

  return (
    <BadgeProgressRingCard
      name={family.name}
      imageUrl={stage.imageUrl}
      rarity={stage.rarity}
      status={status}
      fraction={caption.fraction}
      captionText={caption.text}
      muted={caption.muted}
      pending={caption.pending}
      ariaLabel={ariaLabel}
      href={gated ? undefined : `/badges/${stage.id}`}
      onClick={gated ? () => onLockClick(stage.id) : undefined}
    />
  )
}
