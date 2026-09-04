'use client'

import { useState } from 'react'
import { BadgeStageRail } from '@ds/components/patterns/BadgeStageRail'
import { DualAxisGauge } from '@ds/components/patterns/DualAxisGauge'
import { computeStopStatus } from '@/lib/badgeTreeConditionStatus'
import {
  formatFrontierProgressText,
  formatRegretLineText,
  formatDualAxisGaugeProps,
  type FrontierCaption,
} from '@/lib/badgeProgressText'
import { RARITY_LABEL } from '@/lib/rarity'
import type { BadgeFamily } from '@/lib/badgeTree'
import type { BadgeProgress, RegretLineData } from '@/lib/badge-engine/badgeProgress'

export interface BadgeFamilyRailItemProps {
  family: BadgeFamily
  earnedBadgeIds: Set<string>
  conditionMetBadgeIds: Set<string>
  /** ready/locked 눈금(또는 그 앞 게이트) 탭 시 잠금 해제 조건 시트 오픈 요청 */
  onLockClick: (stageId: string) => void
  /** 계열 프런티어의 진행 계산 결과 — badge id로 조회(2c, 20260904_0921) */
  progressByBadgeId: Record<string, BadgeProgress>
  /** 기록형 프런티어 전용 "아쉬움 줄" 데이터 — badge id로 조회(2c, 20260904_0921) */
  regretLineByBadgeId: Record<string, RegretLineData>
}

/**
 * `new Date()`(비순수 호출)를 컴포넌트 함수 본문 밖으로 뺀 순수 헬퍼 — react-hooks/purity가
 * 컴포넌트 본문 안의 비순수 호출을 막는다(`badges/tree/page.tsx`의 `isWithinRecentSyncWindow`와
 * 동일 패턴). "이번 주 · D일 남음"의 D-day는 렌더 시점(클라이언트 현재 시각) 기준이 더
 * 정확해 서버에서 미리 굽지 않고 여기서 계산한다.
 */
function buildFrontierCaption(progress: BadgeProgress | undefined): FrontierCaption | null {
  if (!progress) return null
  return formatFrontierProgressText(progress, new Date())
}

/**
 * 계열 레일 한 줄 — 티켓 20260903_2329. `BadgeStageRail`(DS)에 넘길 `stops` 배열을
 * 이 계열의 데이터(등급·잠금·획득 여부)로 조립하고, 펼침 상태를 스스로 들고 있다.
 * 잠금 해제 조건 시트는 페이지 단위로 하나만 띄우므로 그 상태는 부모(`BadgeTreeClient`)가
 * 갖고, 이 컴포넌트는 `onLockClick`으로 어떤 눈금이 눌렸는지만 알린다.
 *
 * 진행 수치(2c): 프런티어(첫 미획득 눈금)의 `BadgeProgress`/`RegretLineData`를 문자열로
 * 조립해 `BadgeStageRail`에 넘긴다 — `BadgeStageRail`은 kind를 모른 채 완성 문자열만 그린다.
 *
 * 2축형(dual) 게이지(2d, 티켓 20260904_1058): 프런티어가 dual이면 `formatFrontierProgressText`가
 * `null`을 반환해 `BadgeStageRail`은 지금처럼 상태 라벨만 그린다(레일 자체는 고치지 않음) —
 * 대신 `DualAxisGauge`(DS 신규 패턴)를 `BadgeStageRail` 아래에 추가로 렌더한다. dual이 아니면
 * `formatDualAxisGaugeProps()`가 `null`을 반환해 아무것도 그리지 않는다.
 */
export default function BadgeFamilyRailItem({
  family,
  earnedBadgeIds,
  conditionMetBadgeIds,
  onLockClick,
  progressByBadgeId,
  regretLineByBadgeId,
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

  const rawProgress = nextStop ? progressByBadgeId[nextStop.id] : undefined
  const frontierProgress = buildFrontierCaption(rawProgress)
  const dualAxisGauge = rawProgress ? formatDualAxisGaugeProps(rawProgress) : null
  const regretRaw = nextStop ? regretLineByBadgeId[nextStop.id] : undefined
  const regretLine = regretRaw && nextStop ? formatRegretLineText(regretRaw, nextStop.rarity) : null

  const rail = (
    <BadgeStageRail
      familyName={family.name}
      stops={stops}
      nextRarityLabel={nextRarityLabel}
      frontierProgress={frontierProgress}
      regretLine={regretLine}
      expanded={expanded}
      onToggleExpand={() => setExpanded((v) => !v)}
      onLockClick={onLockClick}
    />
  )

  if (!dualAxisGauge || !nextStop) return rail

  // 레일+게이지를 한 div로 묶어 내부 간격을 계열 간 간격(BadgeTreeClient의 리스트 gap,
  // --spacing-12)보다 좁게 둔다 — Fragment로 형제 반환하면 부모 flex의 gap이 "레일-게이지
  // 사이"와 "계열-계열 사이"에 똑같이 적용돼 이 둘이 한 묶음으로 안 읽혔다(인터랙션 리뷰
  // 지적, 티켓 20260904_1058). aria-label로 이 묶음이 어느 계열 얘기인지도 함께 알린다.
  return (
    <div
      role="group"
      aria-label={`${family.name} 진행 상세`}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}
    >
      {rail}
      <DualAxisGauge
        imageUrl={nextStop.imageUrl}
        alt={`${family.name} ${nextRarityLabel ?? ''}`}
        rarity={nextStop.rarity}
        axes={dualAxisGauge.axes}
        ruleText={dualAxisGauge.ruleText}
        bottleneckNote={dualAxisGauge.bottleneckNote}
      />
    </div>
  )
}
