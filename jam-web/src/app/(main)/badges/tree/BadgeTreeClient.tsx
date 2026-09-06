'use client'

import { useMemo, useState } from 'react'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import TopNav from '@/components/ui/TopNav'
import BadgeTrophyGridCard from '@/components/badges/BadgeTrophyGridCard'
import BadgeFamilyRow from '@/components/badges/BadgeFamilyRow'
import BadgeUnlockSheet, { type BadgeUnlockSheetData } from '@/components/badges/BadgeUnlockSheet'
import { MedalIcon } from '@/components/ui/icons'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { BadgeTreeSummaryHeader } from '@ds/components/patterns/BadgeTreeSummaryHeader'
import { BadgeStatusSection } from '@ds/components/patterns/BadgeStatusSection'
import { RecentSyncBanner } from '@ds/components/patterns/RecentSyncBanner'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import { d } from '@/lib/i18n'
import type { ActivityType, BadgeRarity } from '@/types/database'
import { frontierStageOf } from '@/lib/badgeTree'
import type { BadgeActivityTree, BadgeFamilyStage } from '@/lib/badgeTree'
import type { BadgeProgress, RegretLineData } from '@/lib/badge-engine/badgeProgress'

/**
 * 탭 바 전용 축약 라벨. `ACTIVITY_TYPE_LABELS`의 "트레일러닝"(5자)이 5탭 균등분할
 * (`SlidingTabs` block 모드) 폭에서 다른 2~3자 라벨들과 나란히 놓이면 좁은 화면에서
 * 넘친다(티켓 20260831_2208 후속 — 모바일 실기기 확인 결과).
 */
const TREE_TAB_LABELS: Partial<Record<ActivityType, string>> = {
  trail_running: '트레일',
}

const VALID_ACTIVITY_TYPES = new Set<string>([
  'cycling',
  'running',
  'trail_running',
  'hiking',
  'walking',
])

/**
 * `?activity=`로 들어온 값을 열어둘 종목으로 정규화한다. 모르는 값이면 null
 * (`badges/page.tsx`의 `normalizeTab`과 같은 처리 — 호출부가 기존 폴백으로 떨어진다).
 *
 * 종목 이름이 맞아도 **그 종목의 트리가 실제로 있어야** 유효로 친다. 탭은 `trees`로만
 * 그려지므로, 트리가 없는 종목을 그대로 선택하면 선택된 탭이 하나도 없이 본문이 비어 보인다.
 */
function normalizeActivity(
  raw: string | undefined | null,
  trees: BadgeActivityTree[]
): ActivityType | null {
  if (!raw) return null
  if (!VALID_ACTIVITY_TYPES.has(raw)) return null
  const activityType = raw as ActivityType
  return trees.some((tree) => tree.activityType === activityType) ? activityType : null
}

/**
 * 배지 트리(/badges/tree) — 티켓 20260905_0037(전면 리뉴얼).
 *
 * ## 구분은 「다음 목표 / 받은 배지」 상태 둘뿐이다
 *
 * 이전 버전은 «계열 레일 + 독립 배지 그리드»로 나눴는데, 그건 **카탈로그의 사정**이지
 * 사용자의 질문이 아니다. 설계 분류(누적·주기·시간대)도 마찬가지다 — 배지 이름이 이미
 * 그 구분을 말한다. 이 화면의 질문은 «다음에 뭘 하면 되나» 하나이므로,
 * **다음 목표는 진행이 가까운 순으로** 정렬하고 받은 배지는 접어 둔다.
 *
 * ## 왜 접기가 성능이기도 한가
 * `BadgeStatusSection`은 접힌 동안 본문을 **렌더하지 않는다**. 「받은 배지」는 진행 계산이
 * 아예 필요 없는 쪽이라 서버(`page.tsx`)도 그 배지들의 진행을 계산하지 않는다 —
 * 630종에서 계산 대상이 «아직 못 받은 계열의 프런티어»로 좁혀진다.
 *
 * ⚠️ `BadgeStatusSection`에는 **빈 배열이 아니라 `null`을 넘겨야** `emptyText`가 뜬다
 * (`{list.map(...)}`를 그대로 넘기면 빈 영역만 남는다 — 0036이 남긴 호출부 규약).
 */
export interface BadgeTreeClientProps {
  trees: BadgeActivityTree[]
  /** 이 유저가 획득한 배지 id 집합(page.tsx가 user_activity_badges로 조회) */
  earnedBadgeIds: string[]
  /** 게이트가 안 열린 미획득 눈금 중 수치 조건은 이미 채운 배지 id */
  conditionMetBadgeIds: string[]
  /** 최근 24시간 안에 동기화된 활동이 있는지 — RecentSyncBanner 노출 여부 */
  hasRecentSync: boolean
  /** "직전 동기화보다 {라벨} {델타}{단위} 가까워졌어요" — 비교할 진전이 없으면 null */
  syncComparisonMessage: string | null
  /** 계열 프런티어의 진행 계산 결과 — badge id로 조회 */
  progressByBadgeId: Record<string, BadgeProgress>
  /** 기록형 프런티어 전용 "아쉬움 줄" 데이터 — badge id로 조회 */
  regretLineByBadgeId: Record<string, RegretLineData>
  /** `?activity=` — 열어둘 종목 탭. 유효하지 않으면 무시하고 첫 트리를 연다 (20260906_1158) */
  initialActivity?: string
}

export default function BadgeTreeClient({
  trees,
  earnedBadgeIds,
  conditionMetBadgeIds,
  hasRecentSync,
  syncComparisonMessage,
  progressByBadgeId,
  regretLineByBadgeId,
  initialActivity,
}: BadgeTreeClientProps) {
  const [activeActivity, setActiveActivity] = useState<ActivityType>(
    () => normalizeActivity(initialActivity, trees) ?? trees[0]?.activityType ?? 'walking'
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

  // stageId → 눈금 — 잠금 해제 조건 시트를 열 때 필요한 데이터를 찾는다.
  const stageIndex = useMemo(() => {
    const map = new Map<string, BadgeFamilyStage>()
    if (!activeTree) return map
    for (const family of activeTree.families) {
      for (const stage of family.stages) map.set(stage.id, stage)
    }
    return map
  }, [activeTree])

  /**
   * 「다음 목표」 — 아직 다 받지 못한 계열. **진행이 가까운 순**으로 세운다.
   * 진행을 계산할 수 없는 계열(§08 H)은 -1로 두어 맨 뒤로 민다 — 0으로 두면
   * "아직 시작도 안 한 계열"과 섞여 순서가 흔들린다.
   */
  const nextGoals = useMemo(() => {
    if (!activeTree) return []
    return activeTree.families
      .map((family) => {
        const frontier = frontierStageOf(family, earnedBadgeIdSet)
        if (!frontier) return null
        const progress = progressByBadgeId[frontier.id]
        const fraction = progress && progress.kind !== 'unsupported' ? progress.progress : -1
        return { family, fraction, order: frontier.sortOrder }
      })
      .filter((row): row is { family: BadgeActivityTree['families'][number]; fraction: number; order: number } => row != null)
      .sort((a, b) => b.fraction - a.fraction || a.order - b.order)
  }, [activeTree, earnedBadgeIdSet, progressByBadgeId])

  /** 「받은 배지」 — 계열이 아니라 **배지 단위**다(섹션 헤더의 개수와 같은 단위). */
  const earnedStages = useMemo(() => {
    if (!activeTree) return []
    return activeTree.families
      .flatMap((family) => family.stages)
      .filter((stage) => earnedBadgeIdSet.has(stage.id))
      .sort((a, b) => a.sortOrder - b.sortOrder || (a.level ?? 0) - (b.level ?? 0))
  }, [activeTree, earnedBadgeIdSet])

  // 진행 요약 — 등급별 + **등급 없음(무한레벨형)** 버킷. 예전에는 칸이 4개로 고정이라
  // 레벨형 193종이 어느 칸에도 안 들어가 totalCount와 칸 합계가 조용히 어긋났다.
  const summary = useMemo(() => {
    const byRarity: Record<BadgeRarity, { earned: number; total: number }> = {
      common: { earned: 0, total: 0 },
      rare: { earned: 0, total: 0 },
      epic: { earned: 0, total: 0 },
      mystic: { earned: 0, total: 0 },
    }
    const noRarity = { earned: 0, total: 0 }
    if (!activeTree) return { earnedCount: 0, totalCount: 0, byRarity, noRarity }

    const allStages = activeTree.families.flatMap((f) => f.stages)
    let earnedCount = 0
    for (const stage of allStages) {
      const bucket = stage.rarity ? byRarity[stage.rarity] : noRarity
      bucket.total += 1
      if (earnedBadgeIdSet.has(stage.id)) {
        bucket.earned += 1
        earnedCount += 1
      }
    }
    return { earnedCount, totalCount: allStages.length, byRarity, noRarity }
  }, [activeTree, earnedBadgeIdSet])

  function handleLockClick(stageId: string) {
    setActiveStageId(stageId)
    setSheetOpen(true)
  }

  const activeStage = activeStageId ? stageIndex.get(activeStageId) : undefined
  const sheetData: BadgeUnlockSheetData | null = activeStage
    ? {
        badgeName: activeStage.name,
        rarity: activeStage.rarity,
        level: activeStage.level,
        imageUrl: activeStage.imageUrl,
        conditionMet: conditionMetBadgeIdSet.has(activeStage.id),
        gateGroups: activeStage.gateGroups,
      }
    : null

  return (
    <div className="min-h-full bg-surface text-text">
      {/* TopNav title은 "어디로 돌아가는가"를 뜻하는 back-label (UX_WRITING_GUIDELINE.md §6) */}
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
              noRarity={summary.noRarity.total > 0 ? summary.noRarity : null}
            />

            <RecentSyncBanner visible={hasRecentSync} comparisonMessage={syncComparisonMessage} />

            <BadgeStatusSection
              title={d.badges.treeSectionNext}
              count={nextGoals.length}
              defaultOpen
              emptyText={d.badges.treeSectionNextEmpty}
            >
              {/* 빈 배열이 아니라 null을 넘긴다 — 그래야 emptyText가 뜬다 */}
              {nextGoals.length > 0 ? (
                <div className="flex flex-col gap-[var(--spacing-12)] pb-[var(--spacing-8)]">
                  {nextGoals.map(({ family }) => (
                    <BadgeFamilyRow
                      key={family.key}
                      family={family}
                      earnedBadgeIds={earnedBadgeIdSet}
                      conditionMetBadgeIds={conditionMetBadgeIdSet}
                      onLockClick={handleLockClick}
                      progressByBadgeId={progressByBadgeId}
                      regretLineByBadgeId={regretLineByBadgeId}
                    />
                  ))}
                </div>
              ) : null}
            </BadgeStatusSection>

            <BadgeStatusSection
              title={d.badges.treeSectionEarned}
              count={earnedStages.length}
              emptyText={d.badges.treeSectionEarnedEmpty}
            >
              {earnedStages.length > 0 ? (
                <div className="grid grid-cols-3 gap-[var(--spacing-8)] pb-[var(--spacing-8)]">
                  {earnedStages.map((stage) => (
                    <BadgeTrophyGridCard
                      key={stage.id}
                      href={`/badges/${stage.id}`}
                      name={stage.name}
                      imageUrl={stage.imageUrl}
                      rarity={stage.rarity}
                      level={stage.level}
                      earned
                      progress={{ text: d.badges.earnedTag, fraction: 1 }}
                    />
                  ))}
                </div>
              ) : null}
            </BadgeStatusSection>
          </div>
        </>
      )}

      <BadgeUnlockSheet open={sheetOpen} onClose={() => setSheetOpen(false)} data={sheetData} />
    </div>
  )
}
