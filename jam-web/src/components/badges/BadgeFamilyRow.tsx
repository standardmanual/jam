'use client'

import { useState } from 'react'
import { BadgeStageRail } from '@ds/components/patterns/BadgeStageRail'
import { BadgeLevelGauge } from '@ds/components/patterns/BadgeLevelGauge'
import { BadgeStampRow } from '@ds/components/patterns/BadgeStampRow'
import { DualAxisGauge } from '@ds/components/patterns/DualAxisGauge'
import { computeStopStatus, hasUnfulfilledGate } from '@/lib/badgeTreeConditionStatus'
import {
  formatFrontierProgressText,
  formatRegretLineText,
  formatDualAxisGaugeProps,
  formatFamilyRowValues,
  formatStampCaption,
  type FrontierCaption,
} from '@/lib/badgeProgressText'
import { RARITY_LABEL } from '@/lib/rarity'
import { frontierStageOf } from '@/lib/badgeTree'
import type { BadgeFamily, BadgeFamilyStage } from '@/lib/badgeTree'
import type { BadgeProgress, RegretLineData } from '@/lib/badge-engine/badgeProgress'

export interface BadgeFamilyRowProps {
  family: BadgeFamily
  earnedBadgeIds: Set<string>
  conditionMetBadgeIds: Set<string>
  /** ready/locked 눈금(또는 그 앞 게이트) 탭 시 잠금 해제 조건 시트 오픈 요청 */
  onLockClick: (stageId: string) => void
  /** 계열 진행 앵커의 진행 계산 결과 — badge id로 조회 */
  progressByBadgeId: Record<string, BadgeProgress>
  /** 기록형 앵커 전용 "아쉬움 줄" 데이터 — badge id로 조회 */
  regretLineByBadgeId: Record<string, RegretLineData>
  /**
   * **진행 표시 앵커** 배지 id — 서버가 「첫 미충족」 기준으로 정한 눈금 (티켓 20260906_1323 §8).
   *
   * 획득 기준 프런티어(`frontierStageOf`)와 다를 수 있다: 조건은 이미 채웠지만 아직 발급되지
   * 않은 눈금은 프런티어로 남는데, 거기에 진행 수치를 붙이면 「22/1일」처럼 이미 넘긴 조건에
   * 카운트가 뜬다. 진행·아쉬움 줄·게이지는 이 눈금을 보고, 게이트·링크 같은 **획득 여부**
   * 판정은 계속 프런티어를 본다. null이면 프런티어로 폴백한다.
   */
  progressBadgeId: string | null
}

/**
 * `new Date()`(비순수 호출)를 컴포넌트 함수 본문 밖으로 뺀 순수 헬퍼 — react-hooks/purity가
 * 컴포넌트 본문 안의 비순수 호출을 막는다. "이번 주 · D일 남음"의 D-day는 렌더 시점
 * (클라이언트 현재 시각) 기준이 더 정확해 서버에서 미리 굽지 않고 여기서 계산한다.
 */
function buildFrontierCaption(
  progress: BadgeProgress | undefined,
  conditionText: string | null
): FrontierCaption | null {
  if (!progress) return null
  return formatFrontierProgressText(progress, new Date(), conditionText)
}

/**
 * 계열 하나 = 화면의 한 줄 — 티켓 20260905_0037(이전 이름 `BadgeFamilyRailItem`).
 *
 * **표현을 가르는 기준은 계열의 종류 하나뿐이다**(`badgeKind.ts` 단일 출처):
 *
 * | 종류 | 컴포넌트 | 왜 |
 * |---|---|---|
 * | `graded`     | `BadgeStageRail`  | 등급 4단의 «서열»이 곧 진행이다 |
 * | `leveled`    | `BadgeLevelGauge` | 레벨 상한이 없어 눈금으로 늘어놓을 수 없다 |
 * | `repeatable` | `BadgeStampRow`   | 「몇 번 다시 채웠나」가 전부다 |
 *
 * 이전 버전은 등급형만 그릴 수 있었고, 그래서 v5 레벨형 193종이 화면에서 통째로 사라져
 * 있었다. 설계 분류(누적·주기·시간대)는 여기서도 화면에도 노출하지 않는다 — 배지 이름이
 * 곧 구분자다.
 *
 * 문구 조립은 DS가 하지 않는다 — `badgeProgressText.ts`가 완성 문자열을 만들어 넘긴다.
 */
export default function BadgeFamilyRow({
  family,
  earnedBadgeIds,
  conditionMetBadgeIds,
  onLockClick,
  progressByBadgeId,
  regretLineByBadgeId,
  progressBadgeId,
}: BadgeFamilyRowProps) {
  const [expanded, setExpanded] = useState(false)

  // 획득 기준 프런티어 — 카드가 어디로 이동하는지·게이트가 남았는지는 계속 이 눈금이 정한다.
  const frontierStage: BadgeFamilyStage | undefined = frontierStageOf(family, earnedBadgeIds)
  // 진행 표시 앵커 — 서버가 정한 「첫 미충족」 눈금. 못 찾으면 프런티어로 폴백한다.
  const progressStage: BadgeFamilyStage | undefined =
    (progressBadgeId ? family.stages.find((s) => s.id === progressBadgeId) : undefined) ?? frontierStage
  const rawProgress = progressStage ? progressByBadgeId[progressStage.id] : undefined
  // 진행을 계산할 수 없을 때 그 자리에 적을 획득 조건(티켓 20260906_1323 §9).
  const progressConditionText = progressStage?.conditionText ?? null

  // ── 무한레벨형 — 지나온 레벨을 그리지 않고 «지금 레벨 · 다음 목표 · 남은 양»만 말한다
  if (family.kind === 'leveled') {
    const earnedLevels = family.stages.filter((s) => earnedBadgeIds.has(s.id)).map((s) => s.level ?? 0)
    const currentLevel = earnedLevels.length > 0 ? Math.max(...earnedLevels) : null
    const values = rawProgress ? formatFamilyRowValues(rawProgress, progressConditionText) : null
    return (
      <FamilyRowShell stage={frontierStage} onLockClick={onLockClick} label={family.name}>
        <BadgeLevelGauge
          name={family.name}
          level={currentLevel}
          current={values?.current ?? '—'}
          next={values?.next ?? '—'}
          left={values?.left ?? null}
          fraction={values?.fraction ?? 0}
          imageUrl={frontierStage?.imageUrl ?? null}
          alt={family.name}
        />
      </FamilyRowShell>
    )
  }

  // ── 반복형 — 누적 회차를 ×N 칩 하나로, 다음 임계값까지의 거리는 캡션 한 줄로
  if (family.kind === 'repeatable') {
    const axis = rawProgress && rawProgress.kind !== 'unsupported' ? rawProgress.axes[0] : null
    return (
      <FamilyRowShell stage={frontierStage} onLockClick={onLockClick} label={family.name}>
        <BadgeStampRow
          name={family.name}
          rarity={frontierStage?.rarity ?? null}
          count={axis ? Math.floor(axis.current) : null}
          caption={rawProgress ? formatStampCaption(rawProgress, progressConditionText) : null}
          earned={frontierStage ? earnedBadgeIds.has(frontierStage.id) : false}
          imageUrl={frontierStage?.imageUrl ?? null}
          alt={family.name}
        />
      </FamilyRowShell>
    )
  }

  // ── 등급형 — 등급 4단 레일(프로덕션에서도 4눈금으로 잘린다)
  const stops = family.stages.map((stage) => ({
    id: stage.id,
    rarity: stage.rarity,
    imageUrl: stage.imageUrl,
    description: stage.description,
    status: computeStopStatus(stage.id, stage.gateGroups, earnedBadgeIds, conditionMetBadgeIds),
    href: `/badges/${stage.id}`,
    // 아직 도달하지 않은 눈금의 캡션 자리 — 상태 라벨('—') 대신 이 조건값을 적는다(§7).
    conditionText: stage.conditionText,
    // 게이트마다 «이미 통과했는지»를 함께 넘긴다 — 없으면 미션을 이미 깬 상태에서도
    // 자물쇠 2개가 같게 그려져 무엇이 남았는지 안 읽힌다.
    gates: stage.gateGroups.map((g) => ({ kind: g.kind, met: g.fulfilled })),
  }))

  const nextStop = stops.find((s) => s.status !== 'earned')
  const nextRarityLabel = nextStop?.rarity ? (RARITY_LABEL[nextStop.rarity] ?? nextStop.rarity) : null

  const frontierProgress = buildFrontierCaption(rawProgress, progressConditionText)
  const dualAxisGauge = rawProgress ? formatDualAxisGaugeProps(rawProgress) : null
  const regretRaw = progressStage ? regretLineByBadgeId[progressStage.id] : undefined
  const regretLine =
    regretRaw && progressStage?.rarity ? formatRegretLineText(regretRaw, progressStage.rarity) : null

  const rail = (
    <BadgeStageRail
      familyName={family.name}
      stops={stops}
      nextRarityLabel={nextRarityLabel}
      frontierProgress={frontierProgress}
      progressStopId={progressStage?.id ?? null}
      regretLine={regretLine}
      expanded={expanded}
      onToggleExpand={() => setExpanded((v) => !v)}
      onLockClick={onLockClick}
    />
  )

  if (!dualAxisGauge || !nextStop) return rail

  // 레일+게이지를 한 div로 묶어 내부 간격을 계열 간 간격보다 좁게 둔다 — Fragment로 형제
  // 반환하면 부모 flex의 gap이 "레일-게이지 사이"와 "계열-계열 사이"에 똑같이 적용돼
  // 이 둘이 한 묶음으로 안 읽혔다(인터랙션 리뷰 지적, 티켓 20260904_1058).
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
        rarity={nextStop.rarity ?? undefined}
        axes={dualAxisGauge.axes}
        ruleText={dualAxisGauge.ruleText}
        bottleneckNote={dualAxisGauge.bottleneckNote}
      />
    </div>
  )
}

/**
 * 레벨 게이지·카운터 행의 «누를 곳». 레일은 눈금마다 링크/버튼을 갖지만 이 둘은 카드 한
 * 장이라 껍데기가 필요하다 — 게이트가 남아 있으면 잠금 해제 조건 시트를 열고, 아니면
 * 그 배지 상세로 간다. 게이트가 있는데 누를 곳이 없으면 조건을 확인할 방법이 사라진다.
 */
function FamilyRowShell({
  stage,
  onLockClick,
  label,
  children,
}: {
  stage: BadgeFamilyStage | undefined
  onLockClick: (stageId: string) => void
  label: string
  children: React.ReactNode
}) {
  const base = { display: 'block', width: '100%', textAlign: 'left' as const, background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', textDecoration: 'none' }
  if (!stage) return <>{children}</>
  if (hasUnfulfilledGate(stage.gateGroups)) {
    return (
      <button type="button" style={base} onClick={() => onLockClick(stage.id)} aria-label={`${label} 잠금 해제 조건 보기`}>
        {children}
      </button>
    )
  }
  return (
    <a href={`/badges/${stage.id}`} style={base} aria-label={label}>
      {children}
    </a>
  )
}
