'use client'

import { useEffect, useMemo, useState } from 'react'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import TopNav from '@/components/ui/TopNav'
import BadgeFamilyRow from '@/components/badges/BadgeFamilyRow'
import BadgeProgressGridCell from '@/components/badges/BadgeProgressGridCell'
import BadgeUnlockSheet, { type BadgeUnlockSheetData } from '@/components/badges/BadgeUnlockSheet'
import { MedalIcon } from '@/components/ui/icons'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { BadgeTreeSummaryHeader } from '@ds/components/patterns/BadgeTreeSummaryHeader'
import { BadgeStatusSection } from '@ds/components/patterns/BadgeStatusSection'
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

/**
 * `?activity=`로 들어온 값을 열어둘 종목으로 정규화한다. 모르는 값이면 null
 * (`badges/page.tsx`의 `normalizeTab`과 같은 처리 — 호출부가 기존 폴백으로 떨어진다).
 *
 * 판정 기준은 **그 종목의 트리가 실제로 `trees`에 있는가** 하나뿐이다. 탭은 `trees`로만
 * 그려지므로, 트리가 없는 종목을 선택하면 선택된 탭이 하나도 없이 본문이 비어 보인다.
 *
 * ⚠️ `ActivityType` 5종을 하드코딩한 Set을 **따로 두지 않는다**(티켓 20260906_1158).
 * `trees` 매칭이 이미 모든 무효값을 거르므로 Set은 완전 중복이고, 종목 목록의 출처가 둘이
 * 되면 6번째 종목이 추가될 때 «트리는 있는데 Set에 없어 딥링크만 조용히 실패»하는 방향으로
 * 썩는다. 매칭된 트리의 `activityType`을 그대로 돌려주므로 캐스팅도 필요 없다.
 *
 * `trim().toLowerCase()`를 거치는 이유: URL은 사람이 손으로 고치고 메신저가 대문자화하는
 * 입력이다. `?activity=Running`이 아무 피드백 없이 걷기로 떨어지는 것을 막는다.
 *
 * ⚠️ `typeof raw !== 'string'` 검사를 **지우지 말 것**. `?activity=a&activity=b`처럼 같은 키가
 * 두 번 오면 Next가 배열을 넘기고, 그때 `raw.trim()`이 터져 화면 전체가 500이 된다
 * (티켓 20260906_1158 2차 게이트 실측). 중복 파라미터는 손으로 고친 URL·링크 합성으로 흔히
 * 생기는 입력이므로, 형제 화면 `normalizeTab`이 그렇듯 오류 대신 조용히 폴백한다.
 */
function normalizeActivity(
  raw: string | string[] | undefined | null,
  trees: BadgeActivityTree[]
): ActivityType | null {
  if (typeof raw !== 'string' || !raw) return null
  const normalized = raw.trim().toLowerCase()
  const matched = trees.find((tree) => tree.activityType === normalized)
  return matched ? matched.activityType : null
}

/**
 * 배지 트리(/badges/tree) — 티켓 20260905_0037(전면 리뉴얼), 20260906_1323(화면 정리).
 *
 * ## 이 화면은 「다음 목표」 하나만 그린다
 *
 * 이전 버전은 «계열 레일 + 독립 배지 그리드»로 나눴는데, 그건 **카탈로그의 사정**이지
 * 사용자의 질문이 아니다. 설계 분류(누적·주기·시간대)도 마찬가지다 — 배지 이름이 이미
 * 그 구분을 말한다. 이 화면의 질문은 «다음에 뭘 하면 되나» 하나이므로,
 * **다음 목표를 진행이 가까운 순으로** 정렬해 그것만 보여준다.
 *
 * 「받은 배지」 섹션은 20260906_1323에서 걷어냈다 — 이미 받은 것을 그리드로 다시 늘어놓아
 * 스크롤만 길어졌고, 받은 배지는 `/badges`가 이미 담당한다. 진행 계산 대상이 «아직 못 받은
 * 계열의 앵커»로 좁혀지는 구조(서버 `page.tsx`)는 그대로다.
 *
 * ⚠️ `BadgeStatusSection`에는 **빈 배열이 아니라 `null`을 넘겨야** `emptyText`가 뜬다
 * (`{list.map(...)}`를 그대로 넘기면 빈 영역만 남는다 — 0036이 남긴 호출부 규약).
 *
 * ## 눈금 1개 계열은 그리드로 묶는다 (티켓 20260906_1425)
 *
 * v5 실측(194계열 630종)의 1/3(63계열)이 눈금 1개다. 눈금과 눈금을 잇는 연결선이 레일의
 * 은유인데, 눈금이 하나면 연결선이 없어 그 은유가 성립하지 않는다 — 그 63계열이 카드 한 장씩
 * 세로로 늘어서 스크롤만 길어졌다. 그래서 `nextGoals`를 **여기서(= `BadgeFamilyRow` 위에서)**
 * 두 갈래로 나눈다: `kind === 'graded' && stages.length === 1`은 그리드 셀
 * (`BadgeProgressGridCell` → DS `BadgeProgressRingCard`)로, 그 외는 그대로 `BadgeFamilyRow`
 * 한 줄씩. `BadgeFamilyRow` 자체는 "계열 하나 = 한 줄"만 그릴 수 있어 이 분기를 할 수 없다.
 */
export interface BadgeTreeClientProps {
  trees: BadgeActivityTree[]
  /** 이 유저가 획득한 배지 id 집합(page.tsx가 user_activity_badges로 조회) */
  earnedBadgeIds: string[]
  /** 게이트가 안 열린 미획득 눈금 중 수치 조건은 이미 채운 배지 id */
  conditionMetBadgeIds: string[]
  /** 계열 진행 앵커의 진행 계산 결과 — badge id로 조회 */
  progressByBadgeId: Record<string, BadgeProgress>
  /** 기록형 앵커 전용 "아쉬움 줄" 데이터 — badge id로 조회 */
  regretLineByBadgeId: Record<string, RegretLineData>
  /**
   * 계열 key → **진행 표시 앵커** 배지 id (티켓 20260906_1323 §8).
   *
   * 서버가 「첫 미충족」 기준으로 정한 값이다 — 같은 판정을 클라이언트가 다시 하면 서버와
   * 갈라지므로 결과만 받는다. 값이 없는 계열은 기존 `frontierStageOf`(획득 기준)로 폴백한다.
   */
  frontierBadgeIdByFamilyKey: Record<string, string>
  /**
   * `?activity=` — 열어둘 종목 탭. 유효하지 않으면 무시하고 첫 트리를 연다 (20260906_1158).
   * 같은 키가 중복되면 Next가 배열을 주므로 `string[]`도 받는다 — 정규화에서 폴백된다.
   */
  initialActivity?: string | string[]
}

export default function BadgeTreeClient({
  trees,
  earnedBadgeIds,
  conditionMetBadgeIds,
  progressByBadgeId,
  regretLineByBadgeId,
  frontierBadgeIdByFamilyKey,
  initialActivity,
}: BadgeTreeClientProps) {
  const [activeActivity, setActiveActivity] = useState<ActivityType>(
    () => normalizeActivity(initialActivity, trees) ?? trees[0]?.activityType ?? 'walking'
  )
  const [activeStageId, setActiveStageId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  /**
   * 탭을 옮기면 URL의 `?activity=`도 함께 갱신한다(티켓 20260906_1158).
   * 읽기만 있으면 «쿼리로 열고 탭을 옮긴 뒤 주소를 공유하면 상대는 처음 종목을 본다»는
   * 왕복 비대칭이 생긴다 — 읽기를 넣었기 때문에 따라오는 짝이다.
   *
   * `router.replace`가 아니라 `window.history.replaceState`를 쓴다 — 서버 재조회가
   * 필요 없고(트리는 전 종목을 이미 다 만든다) 형제 화면 `BadgesClient`의 선례와도 같다.
   */
  const handleActivityChange = (activityType: ActivityType) => {
    setActiveActivity(activityType)
    // 지금 트리 화면에 다른 쿼리 파라미터는 없지만, 현재 URL에서 만들어 `activity`만
    // 갈아끼운다 — 나중에 다른 파라미터가 붙어도 이 갱신이 지우지 않도록.
    const params = new URLSearchParams(window.location.search)
    params.set('activity', activityType)
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
  }

  // 브라우저 뒤로/앞으로 탐색 시 `?activity=`를 다시 탭에 반영(`BadgesClient`와 같은 형태).
  // 정규화를 통과하지 못하면 상태를 바꾸지 않는다 — 현재 탭을 그대로 둔다.
  useEffect(() => {
    const onPopState = () => {
      const raw = new URLSearchParams(window.location.search).get('activity')
      const fromQuery = normalizeActivity(raw, trees)
      if (fromQuery) setActiveActivity(fromQuery)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [trees])

  const earnedBadgeIdSet = useMemo(() => new Set(earnedBadgeIds), [earnedBadgeIds])
  const conditionMetBadgeIdSet = useMemo(() => new Set(conditionMetBadgeIds), [conditionMetBadgeIds])

  const tabs: SlidingTabItem<ActivityType>[] = trees.map((tree) => ({
    key: tree.activityType,
    label: TREE_TAB_LABELS[tree.activityType] ?? ACTIVITY_TYPE_LABELS[tree.activityType] ?? tree.activityType,
    ariaLabel: ACTIVITY_TYPE_LABELS[tree.activityType] ?? tree.activityType,
  }))

  const activeTree = trees.find((tree) => tree.activityType === activeActivity) ?? trees[0]

  // stageId → 눈금 — 「받는 방법」 시트를 열 때 필요한 데이터를 찾는다.
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
   *
   * 진행을 읽는 눈금은 서버가 정한 **진행 앵커**다(티켓 20260906_1323 §8). 없으면 기존
   * 획득 기준 프런티어로 폴백한다 — 정렬과 행 렌더가 같은 눈금을 봐야 한다.
   */
  const nextGoals = useMemo(() => {
    if (!activeTree) return []
    return activeTree.families
      .map((family) => {
        const frontier = frontierStageOf(family, earnedBadgeIdSet)
        if (!frontier) return null
        const progressBadgeId = frontierBadgeIdByFamilyKey[family.key] ?? frontier.id
        const progress = progressByBadgeId[progressBadgeId]
        const fraction = progress && progress.kind !== 'unsupported' ? progress.progress : -1
        return { family, progressBadgeId, fraction, order: frontier.sortOrder }
      })
      .filter(
        (
          row
        ): row is {
          family: BadgeActivityTree['families'][number]
          progressBadgeId: string
          fraction: number
          order: number
        } => row != null
      )
      .sort((a, b) => b.fraction - a.fraction || a.order - b.order)
  }, [activeTree, earnedBadgeIdSet, progressByBadgeId, frontierBadgeIdByFamilyKey])

  /**
   * 「다음 목표」를 두 갈래로 나눈다(티켓 20260906_1425) — 눈금이 1개뿐인 등급형 계열은
   * 레일의 은유(눈금과 눈금을 잇는 연결선)가 성립하지 않는다. 분기 기준은 계열의 구조
   * (`kind === 'graded' && stages.length === 1`) 하나뿐이고, 이 분기는 `BadgeFamilyRow`가
   * 아니라 여기(그 위)에서 한다 — `BadgeFamilyRow`는 "계열 하나 = 한 줄"을 그리는
   * 컴포넌트라 「여러 계열을 한 그리드에 묶는다」를 할 수 없다.
   *
   * `nextGoals`가 이미 "진행이 가까운 순 → sortOrder"로 정렬돼 있으므로, `filter`는 그
   * 순서를 그대로 보존한다 — 각 갈래 안에서 정렬을 다시 하지 않는다.
   */
  const gridGoals = useMemo(
    () => nextGoals.filter(({ family }) => family.kind === 'graded' && family.stages.length === 1),
    [nextGoals]
  )
  const railGoals = useMemo(
    () => nextGoals.filter(({ family }) => !(family.kind === 'graded' && family.stages.length === 1)),
    [nextGoals]
  )
  /**
   * 그리드 카드가 레일 목록 **어디에 끼어드나** — 「구성원 최고 진행률 자리」다
   * (티켓 20260906_2140 E③). 그리드는 카드 한 장으로 묶이므로 여러 조각으로 쪼개
   * 레일 사이사이에 흩어 놓지 않는다(그러면 «묶어서 스크롤을 줄인다»는 목적이 무너진다).
   * 대신 그 한 장을 **가장 잘 나가는 구성원의 진행률에 해당하는 자리**에 통째로 넣는다.
   *
   * 예전에는 「그리드가 맨 위냐 맨 아래냐」 이분법이었다 — 그리드 최고 진행률이 3등이어도
   * 맨 아래로 밀려 「진행이 가까운 것이 위」가 깨졌다.
   */
  const gridInsertIndex = useMemo(() => {
    if (gridGoals.length === 0) return -1
    const best = gridGoals[0]?.fraction ?? -1
    const idx = railGoals.findIndex((row) => row.fraction < best)
    return idx === -1 ? railGoals.length : idx
  }, [gridGoals, railGoals])

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

  // 눈금 1개 계열 묶음 — 그리드 3열(375px 기준, 63계열 실측치로 스크롤을 크게 줄인다).
  // 2열보다 3열이 행 수를 더 줄인다.
  //
  // 티켓 20260906_2140 E③: 이 묶음을 **카드 한 장**으로 감싼다. 예전에는 셀들이 배경 없이
  // 떠 있어 「계열 하나 = 카드 하나」인 레일들 사이에서 이 63계열만 다른 문법으로 읽혔다.
  // 카드 제목은 사용자가 그 자리에서 얻는 것을 그대로 말한다 — 「한 번에 끝나는 배지」.
  const gridSection =
    gridGoals.length > 0 ? (
      <section
        key="grid"
        aria-label="한 번에 끝나는 배지"
        className="rounded-[var(--radius-card)] bg-[var(--color-surface-elevated)] p-[var(--spacing-16)]"
      >
        <h3 className="mb-[var(--spacing-16)] text-[length:var(--text-small)] font-bold text-text">
          한 번에 끝나는 배지
        </h3>
        <div className="grid grid-cols-3 gap-x-[var(--spacing-8)] gap-y-[var(--spacing-16)]">
        {gridGoals.map(({ family, progressBadgeId }) => (
          <BadgeProgressGridCell
            key={family.key}
            family={family}
            earnedBadgeIds={earnedBadgeIdSet}
            conditionMetBadgeIds={conditionMetBadgeIdSet}
            onLockClick={handleLockClick}
            progressByBadgeId={progressByBadgeId}
            progressBadgeId={progressBadgeId}
          />
        ))}
        </div>
      </section>
    ) : null

  // 레일 카드들 — 그리드 카드가 「구성원 최고 진행률 자리」에 끼어든다.
  const railCards = railGoals.map(({ family, progressBadgeId }) => (
          <BadgeFamilyRow
            key={family.key}
            family={family}
            earnedBadgeIds={earnedBadgeIdSet}
            conditionMetBadgeIds={conditionMetBadgeIdSet}
            onLockClick={handleLockClick}
            progressByBadgeId={progressByBadgeId}
            regretLineByBadgeId={regretLineByBadgeId}
            progressBadgeId={progressBadgeId}
          />
  ))

  // 카드 간 간격 12→16px(E④) — 카드 안 여백이 16px이라 12px 간격이면 카드 사이가 카드
  // 안쪽보다 좁아 두 카드가 한 덩어리로 보였다.
  const goalCards =
    gridInsertIndex === -1
      ? railCards
      : [...railCards.slice(0, gridInsertIndex), gridSection, ...railCards.slice(gridInsertIndex)]

  return (
    <div className="min-h-full bg-surface text-text">
      {/* TopNav title은 "어디로 돌아가는가"를 뜻하는 back-label (UX_WRITING_GUIDELINE.md §6) */}
      <TopNav
        title={d.badges.title}
        backHref="/badges"
        headerStyle={{ background: 'var(--color-surface)' }}
      />

      {/* 화면 제목 `<h1>배지 트리</h1>`를 두지 않는다(티켓 20260906_2140 E①) —
          TopNav가 이미 「배지」를 달고 있고, 탭 5개가 곧 이 화면이 무엇인지 말한다.
          제목 한 줄이 첫 화면에서 카드 한 장 분량의 세로를 먹고 있었다. 대신 TopNav와
          탭 사이에 --spacing-24를 확보해 숨을 준다. */}
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
          <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)] pb-[var(--spacing-16)]">
            <SlidingTabs
              items={tabs}
              value={activeActivity}
              onChange={handleActivityChange}
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

            {/* 접기/펴기를 쓰지 않는다(E② · F-1) — 이 섹션이 곧 화면 본문이라 접을 이유가
                없었고(`defaultOpen`으로 늘 열려 있었다), 제목 자리의 chevron이 「화면을
                통째로 닫는 버튼」처럼 보였다. 정렬 기준은 헤더에 적는다(E⑤). */}
            <BadgeStatusSection
              title={d.badges.treeSectionNext}
              count={nextGoals.length}
              collapsible={false}
              note={nextGoals.length > 0 ? '진행률 높은 순' : null}
              emptyText={d.badges.treeSectionNextEmpty}
            >
              {/* 빈 배열이 아니라 null을 넘긴다 — 그래야 emptyText가 뜬다 */}
              {nextGoals.length > 0 ? (
                <div className="flex flex-col gap-[var(--spacing-16)] pb-[var(--spacing-8)]">
                  {goalCards}
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
