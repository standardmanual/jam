'use client'

import { useMemo, useState } from 'react'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import TopNav from '@/components/ui/TopNav'
import BadgeTrophyGridCard from '@/components/badges/BadgeTrophyGridCard'
import BadgeFamilyRailItem from '@/components/badges/BadgeFamilyRailItem'
import BadgeUnlockSheet, { type BadgeUnlockSheetData } from '@/components/badges/BadgeUnlockSheet'
import { MedalIcon } from '@/components/ui/icons'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { BadgeTreeSummaryHeader } from '@ds/components/patterns/BadgeTreeSummaryHeader'
import { RecentSyncBanner } from '@ds/components/patterns/RecentSyncBanner'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import { d, t } from '@/lib/i18n'
import { formatGridProgressLine } from '@/lib/badgeProgressText'
import type { ActivityType, BadgeRarity } from '@/types/database'
import type { BadgeActivityTree, BadgeFamilyStage } from '@/lib/badgeTree'
import type { BadgeProgress, RegretLineData } from '@/lib/badge-engine/badgeProgress'

/**
 * 탭 바 전용 축약 라벨. `ACTIVITY_TYPE_LABELS`의 "트레일러닝"(5자)이 5탭 균등분할
 * (`SlidingTabs` block 모드) 폭에서 다른 2~3자 라벨들과 나란히 놓이면 좁은 화면에서
 * 넘친다(티켓 20260831_2208 후속 — 모바일 실기기 확인 결과). 다른 화면(select 옵션 등)의
 * 정식 명칭은 그대로 두고, 탭 표시에서만 축약한다.
 */
const TREE_TAB_LABELS: Partial<Record<ActivityType, string>> = {
  trail_running: '트레일',
}

/**
 * 배지 트리(/badges/tree) — 계열별 진행 레일. 티켓 20260831_2208, 20260903_2329(1차: 구조 전환).
 *
 * 이전(20260901) 버전은 배지를 등급 우선으로 평탄하게 나열했다 — 같은 계열의 Common~Mystic
 * 4장이 화면 전역에 흩어져 위계·진행 감각이 없었다. 이번 버전은 "요약 → 직전 동기화 →
 * 계열 레일 → 독립 배지 그리드" 네 단으로 세운다. 진행 수치(현재값/잔여값)는 `page.tsx`가
 * `computeBadgeProgress()`로 미리 계산해 `progressByBadgeId`/`regretLineByBadgeId`로 넘겨준다
 * (2c, 티켓 20260904_0921 — 누적/기록/주기 3종만. 2축형·다중카운터형 전용 게이지는 2d 몫).
 *
 * 요구사항 8(횡스크롤 지양): 종목 전환 탭 1줄 외에는 전부 세로로만 쌓는다.
 * 데이터는 `page.tsx`(서버 컴포넌트)가 요청마다 Supabase에서 직접 조회해 넘긴다 —
 * 정적 스냅샷이 아니라 매 요청 최신 DB 상태를 반영한다.
 */
export interface BadgeTreeClientProps {
  trees: BadgeActivityTree[]
  /** 이 유저가 획득한 배지 id 집합(page.tsx가 user_activity_badges로 조회) — 티켓 20260831_2250 */
  earnedBadgeIds: string[]
  /** 게이트가 안 열린 미획득 눈금 중 수치 조건은 이미 채운 배지 id — 티켓 20260903_2329 */
  conditionMetBadgeIds: string[]
  /** 최근 24시간 안에 동기화된 활동이 있는지 — RecentSyncBanner 노출 여부(1차, 변경 없음) */
  hasRecentSync: boolean
  /**
   * "직전 동기화보다 {라벨} {델타}{단위} 가까워졌어요" — user_family_progress current/prev
   * 비교 문구(3b, 티켓 20260904_1425). 비교할 진전이 없으면(최초 싱크 전·변화 없음) null —
   * RecentSyncBanner가 자체 기본 문구("최근 활동이 동기화됐어요")로 폴백한다.
   */
  syncComparisonMessage: string | null
  /** 계열 프런티어·미획득 독립 배지의 진행 계산 결과 — badge id로 조회(2c, 20260904_0921) */
  progressByBadgeId: Record<string, BadgeProgress>
  /** 기록형 프런티어 전용 "아쉬움 줄" 데이터 — badge id로 조회(2c, 20260904_0921) */
  regretLineByBadgeId: Record<string, RegretLineData>
}

export default function BadgeTreeClient({
  trees,
  earnedBadgeIds,
  conditionMetBadgeIds,
  hasRecentSync,
  syncComparisonMessage,
  progressByBadgeId,
  regretLineByBadgeId,
}: BadgeTreeClientProps) {
  const [activeActivity, setActiveActivity] = useState<ActivityType>(
    trees[0]?.activityType ?? 'walking'
  )
  const [activeStageId, setActiveStageId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const earnedBadgeIdSet = useMemo(() => new Set(earnedBadgeIds), [earnedBadgeIds])
  const conditionMetBadgeIdSet = useMemo(() => new Set(conditionMetBadgeIds), [conditionMetBadgeIds])

  const tabs: SlidingTabItem<ActivityType>[] = trees.map((tree) => ({
    key: tree.activityType,
    label: TREE_TAB_LABELS[tree.activityType] ?? ACTIVITY_TYPE_LABELS[tree.activityType] ?? tree.activityType,
    ariaLabel: ACTIVITY_TYPE_LABELS[tree.activityType] ?? tree.activityType,
  }))

  const activeTree = trees.find((tree) => tree.activityType === activeActivity) ?? trees[0]

  // stageId → {familyName, stage} 조회 맵 — 잠금 해제 조건 시트를 열 때 필요한 데이터를 찾는다.
  const stageIndex = useMemo(() => {
    const map = new Map<string, { familyName: string; stage: BadgeFamilyStage }>()
    if (!activeTree) return map
    for (const family of activeTree.families) {
      for (const stage of family.stages) {
        map.set(stage.id, { familyName: family.name, stage })
      }
    }
    return map
  }, [activeTree])

  // 진행 요약(BadgeTreeSummaryHeader)용 — 현재 탭의 전체 배지(계열 레일 + 독립 배지)를
  // 등급별로 집계한다. 진행 수치는 필요 없어(예: %, 잔여값) 획득/전체 카운트만 계산한다.
  const summary = useMemo(() => {
    const byRarity: Record<BadgeRarity, { earned: number; total: number }> = {
      common: { earned: 0, total: 0 },
      rare: { earned: 0, total: 0 },
      epic: { earned: 0, total: 0 },
      mystic: { earned: 0, total: 0 },
    }
    if (!activeTree) return { earnedCount: 0, totalCount: 0, byRarity }

    const allStages = [...activeTree.families.flatMap((f) => f.stages), ...activeTree.independentBadges]
    let earnedCount = 0
    for (const stage of allStages) {
      byRarity[stage.rarity].total += 1
      if (earnedBadgeIdSet.has(stage.id)) {
        byRarity[stage.rarity].earned += 1
        earnedCount += 1
      }
    }
    return { earnedCount, totalCount: allStages.length, byRarity }
  }, [activeTree, earnedBadgeIdSet])

  function handleLockClick(stageId: string) {
    setActiveStageId(stageId)
    setSheetOpen(true)
  }

  const activeEntry = activeStageId ? stageIndex.get(activeStageId) : undefined
  const sheetData: BadgeUnlockSheetData | null = activeEntry
    ? {
        badgeName: activeEntry.familyName,
        rarity: activeEntry.stage.rarity,
        imageUrl: activeEntry.stage.imageUrl,
        conditionMet: conditionMetBadgeIdSet.has(activeEntry.stage.id),
        requirements: activeEntry.stage.locks,
      }
    : null

  const trophyEarnedCount = activeTree?.independentBadges.filter((b) => earnedBadgeIdSet.has(b.id)).length ?? 0

  return (
    <div className="min-h-full bg-surface text-text">
      {/* TopNav title은 "어디로 돌아가는가"를 뜻하는 back-label (UX_WRITING_GUIDELINE.md §6) —
          /badges/tree는 /badges 타이틀 버튼으로만 진입하므로 목록 화면명("배지")을 쓴다. */}
      <TopNav
        title={d.badges.title}
        backHref="/badges"
        headerStyle={{ background: 'var(--color-surface)' }}
      />

      <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)]">
        <h1 className="text-[length:var(--text-heading)] leading-[var(--leading-heading)]">
          {d.badges.treeButton}
        </h1>
      </div>

      {trees.length === 0 || !activeTree ? (
        <div className="px-[var(--spacing-16)] pt-[var(--spacing-32)]">
          <EmptyState
            icon={<MedalIcon className="w-8 h-8" />}
            title={d.badges.emptyActivityTitle}
            description={d.badges.emptyActivityBody}
          />
        </div>
      ) : (
        <>
          <div className="px-[var(--spacing-16)] py-[var(--spacing-16)]">
            <SlidingTabs
              items={tabs}
              value={activeActivity}
              onChange={setActiveActivity}
              outlined={false}
              aria-label={d.badges.treeButton}
            />
          </div>

          <div className="px-[var(--spacing-16)] pb-[var(--spacing-32)] flex flex-col gap-[var(--spacing-16)]">
            <BadgeTreeSummaryHeader
              earnedCount={summary.earnedCount}
              totalCount={summary.totalCount}
              byRarity={summary.byRarity}
            />

            <RecentSyncBanner visible={hasRecentSync} comparisonMessage={syncComparisonMessage} />

            <div className="flex flex-col gap-[var(--spacing-12)]">
              {activeTree.families.map((family) => (
                <BadgeFamilyRailItem
                  key={family.name}
                  family={family}
                  earnedBadgeIds={earnedBadgeIdSet}
                  conditionMetBadgeIds={conditionMetBadgeIdSet}
                  onLockClick={handleLockClick}
                  progressByBadgeId={progressByBadgeId}
                  regretLineByBadgeId={regretLineByBadgeId}
                />
              ))}
            </div>

            {activeTree.independentBadges.length > 0 && (
              <div className="flex flex-col gap-[var(--spacing-8)]">
                <p className="text-right text-[length:var(--text-caption)] text-[var(--color-text-secondary)]">
                  {t(d.badges.treeTrophyCount, { total: activeTree.independentBadges.length, earned: trophyEarnedCount })}
                </p>
                <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
                  {activeTree.independentBadges.map((badge) => {
                    const earned = earnedBadgeIdSet.has(badge.id)
                    const rawProgress = progressByBadgeId[badge.id]
                    // 획득한 트로피는 진행 계산 없이 100% 고정 표시(§05 프로토타입 "획득" 예시).
                    const progress = earned
                      ? { text: '획득', fraction: 1 }
                      : rawProgress
                        ? formatGridProgressLine(rawProgress)
                        : null
                    return (
                      <BadgeTrophyGridCard
                        key={badge.id}
                        href={`/badges/${badge.id}`}
                        name={badge.name}
                        imageUrl={badge.imageUrl}
                        rarity={badge.rarity}
                        earned={earned}
                        progress={progress}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <BadgeUnlockSheet open={sheetOpen} onClose={() => setSheetOpen(false)} data={sheetData} />
    </div>
  )
}
