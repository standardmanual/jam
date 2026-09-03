'use client'

import { useState } from 'react'
import { BadgeStageRail } from '@ds/components/patterns/BadgeStageRail'
import { computeStopStatus } from '@/lib/badgeTreeConditionStatus'
import type { BadgeFamily } from '@/lib/badgeTree'
import type { BadgeRarity } from '@/types/database'

const RARITY_LABEL: Record<BadgeRarity, string> = {
  common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic',
}

export interface BadgeFamilyRailItemProps {
  family: BadgeFamily
  earnedBadgeIds: Set<string>
  conditionMetBadgeIds: Set<string>
  /** ready/locked 눈금(또는 그 앞 게이트) 탭 시 잠금 해제 조건 시트 오픈 요청 */
  onLockClick: (stageId: string) => void
}

/**
 * 계열 레일 한 줄 — 티켓 20260903_2329. `BadgeStageRail`(DS)에 넘길 `stops` 배열을
 * 이 계열의 데이터(등급·잠금·획득 여부)로 조립하고, 펼침 상태를 스스로 들고 있다.
 * 잠금 해제 조건 시트는 페이지 단위로 하나만 띄우므로 그 상태는 부모(`BadgeTreeClient`)가
 * 갖고, 이 컴포넌트는 `onLockClick`으로 어떤 눈금이 눌렸는지만 알린다.
 */
export default function BadgeFamilyRailItem({
  family,
  earnedBadgeIds,
  conditionMetBadgeIds,
  onLockClick,
}: BadgeFamilyRailItemProps) {
  const [expanded, setExpanded] = useState(false)

  const stops = family.stages.map((stage) => ({
    id: stage.id,
    rarity: stage.rarity,
    imageUrl: stage.imageUrl,
    description: stage.description,
    status: computeStopStatus(stage.id, stage.locks, earnedBadgeIds, conditionMetBadgeIds),
    href: `/badges/${stage.id}`,
  }))

  const nextStop = stops.find((s) => s.status !== 'earned')
  const nextRarityLabel = nextStop ? (RARITY_LABEL[nextStop.rarity] ?? nextStop.rarity) : null

  return (
    <BadgeStageRail
      familyName={family.name}
      stops={stops}
      nextRarityLabel={nextRarityLabel}
      expanded={expanded}
      onToggleExpand={() => setExpanded((v) => !v)}
      onLockClick={onLockClick}
    />
  )
}
