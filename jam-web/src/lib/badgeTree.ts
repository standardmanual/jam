import type { ActivityType, BadgeCondition, BadgeRarity } from '@/types/database'

/**
 * 배지 트리(`/badges/tree`) 전용 그래프 빌더 — 티켓 20260831_2208.
 *
 * 액티비티 배지는 종목별 대표배지(동네 산책러/첫 숨결/언덕의 도전자/첫 고도/야생의 주자)를
 * 루트로, `condition_json.prerequisite_badge_names`(동일 종목 내 다른 배지 이름, OR 조건)로
 * 이어진 선행조건 그래프를 이룬다.
 *
 * 대표배지의 Rare 이상은 다른 배지가 아니라 **미션 완료**로 게이팅된다
 * (`missions.gated_badge_id` = 그 등급 배지의 id). 대표배지는 이 게이팅 방식으로
 * 식별한다 — 이름을 하드코딩하지 않아, 나중에 대표배지 구성이 바뀌어도 그대로 반영된다.
 *
 * 20260903_2329 UI 수정(1차: 구조 전환): 정렬 1순위를 등급 → **계열(name)**로 바꿨다.
 * 같은 계열의 Common~Mystic 4장을 화면 전역에 흩어 놓던 이전 방식(등급 우선 평탄화,
 * 20260901 수정)이 위계·진행 감각을 없앴기 때문이다 — 이 파일이 원래 갖고 있던
 * familyMap·representativeNames·BFS depth(대표배지가 1)·문서 서술 순서·`earnedBadgeIds`
 * OR-fulfillment 로직은 전부 그대로 재사용하고, **묶는 단위만** "등급별 평평한 카드
 * 목록"에서 "계열별 레일(`families`) + 계열이 없는 독립 배지(`independentBadges`)"로
 * 바꿨다 — 신규 계산은 없다. 계열 순서는 이전에 카드 2·3차 정렬키로 쓰던
 * [BFS depth → 문서 순서]를 그대로 승격했다(진행률 기준 정렬은 진행 계산 모듈이 필요한
 * 2차로 미룸).
 *
 * 20260905_0027(v5 스키마): 이름 72개 하드코딩 배열 2종을 걷어내고 `badges.sort_order`
 * (마이그레이션 130)를 정렬키로 쓴다 — 아래 `sortRank` 주석 참고.
 */

const RARITY_ORDER: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/** 화면에 보여줄 종목 탭 순서 — 티켓 배경 문단의 순서(걷기/러닝/사이클링/등산/트레일러닝) */
export const TREE_ACTIVITY_ORDER: ActivityType[] = [
  'walking', 'running', 'cycling', 'hiking', 'trail_running',
]

/**
 * 표시 순서 정렬키 — `badges.sort_order`(마이그레이션 130, 티켓 20260905_0027)를 그대로 쓴다.
 *
 * 이전에는 배지 **이름 72개**를 이 파일에 하드코딩해(`ACTIVITY_BADGE_ORDER` 40 +
 * `INDEPENDENT_BADGE_ORDER` 32) `indexOf`로 순서를 매겼다. 550종(v5)에서는 유지가 불가능하고,
 * 목록에 없는 이름은 `indexOf`가 `-1`을 반환해 **그리드 맨 앞으로 튀어나왔다.**
 *
 * `sort_order = 0`은 «아직 설정하지 않음»이라 맨 뒤로 민다 — 위 결함을 뒤집은 것이고,
 * 계열 레일이 쓰던 기존 동작(목록에 없는 이름은 맨 뒤)과도 같다.
 * DB 백필 규약: 계열 레일 1~99(계열 안 모든 등급이 같은 값) / 독립 발급 배지 101~ .
 */
const UNSET_SORT_ORDER = Number.MAX_SAFE_INTEGER
/**
 * `export`인 이유: 어드민 계열 관리 화면(`lib/admin/badge-families.ts`)이 같은 순서로 계열을
 * 늘어놓아야 한다. 「`sort_order = 0`은 맨 뒤」는 이 저장소의 다른 `sort_order`
 * (`today_cards`·`factions`·`item_books`, 0이 앞)와 **반대 관습**이라, 다시 선언하면
 * 습관대로 오름차순 정렬해 배지 트리와 순서가 갈린다(티켓 20260905_0032 B).
 */
export function sortRank(sortOrder: number): number {
  return sortOrder > 0 ? sortOrder : UNSET_SORT_ORDER
}

export interface BadgeTreeSourceBadge {
  id: string
  name: string
  /**
   * 무한레벨형은 등급이 없다(마이그레이션 130). 아래 `RARITY_ORDER` 루프가 등급 있는 배지만
   * 눈금으로 담으므로, 레벨형은 현재 트리에 그려지지 않는다 — 레벨 레일은 티켓 20260905_0037.
   */
  rarity: BadgeRarity | null
  description: string | null
  image_url: string | null
  activity_types: ActivityType[] | null
  condition_json: BadgeCondition | null
  /** 표시 순서 — `badges.sort_order`(마이그레이션 130). 0이면 미설정이라 맨 뒤로 밀린다 */
  sort_order: number
}

export interface BadgeTreeSourceMission {
  id: string
  title: string
  gated_badge_id: string | null
  /** 잠금 해제 조건 시트(UnlockConditionSheetContent)의 아이콘 박스용 — 20260903_2329 */
  image_url: string | null
}

export interface BadgeTreeLock {
  kind: 'badge' | 'mission'
  /** 선행 배지 이름 또는 미션 제목 — 잠금칩에서 볼드 처리 대상 (20260901 UI 수정) */
  name: string
  href: string
  /** kind='badge'일 때만 의미 있음 — 이 유저가 이 선행 배지를 이미 보유했는지 */
  fulfilled: boolean
  /** 선행 배지(Common 등급) 이미지 또는 미션 이미지 — 잠금 해제 조건 시트용 (20260903_2329) */
  imageUrl: string | null
}

/** 배지 하나(특정 등급)의 트리 카드 — 20260901 UI 수정으로 가족 단위 묶음을 없애고 개별 카드로 평탄화 */
export interface BadgeTreeCard {
  id: string
  /** 등급과 무관한 배지 그룹 이름(예: "동네 산책러") */
  name: string
  rarity: BadgeRarity
  imageUrl: string | null
  description: string | null
  locks: BadgeTreeLock[]
}

/** 계열 안 눈금 하나(특정 등급) — 20260903_2329, BadgeTreeCard와 필드는 같지만 계열 레일 전용 의미로 별칭 */
export type BadgeFamilyStage = BadgeTreeCard

/** 계열(같은 이름) 하나 = 레일 하나. Common→Mystic 순, 존재하는 등급만 담는다 — 20260903_2329 */
export interface BadgeFamily {
  name: string
  stages: BadgeFamilyStage[]
}

export interface BadgeActivityTree {
  activityType: ActivityType
  /**
   * 계열 우선(대표배지 BFS 깊이 → 문서 서술 순서)으로 정렬된 레일 목록 — 20260903_2329.
   * 등급 순서는 각 계열의 `stages` 내부에서만 의미를 가진다(Common→Mystic).
   */
  families: BadgeFamily[]
  /**
   * 계열(가족) 그래프에 연결되지 않은 독립 발급 배지(D01~D11 + 트로피 매트릭스) —
   * 레일이 아니라 그리드로 그린다. 정렬은 `badges.sort_order` 오름차순
   * (진행률 기준 정렬은 2차) — 20260903_2329 / 20260905_0027.
   */
  independentBadges: BadgeTreeCard[]
}

export function buildBadgeActivityTrees(
  badges: BadgeTreeSourceBadge[],
  missions: BadgeTreeSourceMission[],
  /** 이 유저가 획득한 배지 id 집합 — 선행 배지 잠금칩의 "획득 완료" 판정용 (20260901 UI 수정) */
  earnedBadgeIds: Set<string>
): BadgeActivityTree[] {
  const missionByGatedBadgeId = new Map<string, BadgeTreeSourceMission>()
  for (const m of missions) {
    if (m.gated_badge_id) missionByGatedBadgeId.set(m.gated_badge_id, m)
  }

  // 미션 완료로만 지급되는 배지(condition_json.mission_reward=true)는 트리 카드로 그리지 않고,
  // prerequisite_badge_names에서 "이 이름은 다른 활동 배지가 아니라 미션 보상 배지다"를
  // 걸러내는 용도로만 쓴다(요구사항: 미션 게이팅과 배지 게이팅 구분).
  const missionRewardNames = new Set(
    badges.filter((b) => b.condition_json?.mission_reward).map((b) => b.name)
  )

  const byActivity = new Map<ActivityType, BadgeTreeSourceBadge[]>()
  for (const b of badges) {
    if (b.condition_json?.mission_reward) continue
    const activityType = b.activity_types?.[0]
    if (!activityType) continue
    if (!byActivity.has(activityType)) byActivity.set(activityType, [])
    byActivity.get(activityType)!.push(b)
  }

  const trees: BadgeActivityTree[] = []

  for (const activityType of TREE_ACTIVITY_ORDER) {
    const activityBadges = byActivity.get(activityType) ?? []
    if (activityBadges.length === 0) continue

    const familyMap = new Map<string, BadgeTreeSourceBadge[]>()
    for (const b of activityBadges) {
      if (!familyMap.has(b.name)) familyMap.set(b.name, [])
      familyMap.get(b.name)!.push(b)
    }

    // 이름 → Common 등급 배지 (배지 게이팅 잠금 칩 링크·이미지용, 요구사항: "해당 배지의 Common
    // 등급으로 링크". image_url은 잠금 해제 조건 시트 아이콘용 — 20260903_2329)
    const nameToCommonBadge = new Map<string, BadgeTreeSourceBadge>()
    for (const [name, variants] of familyMap) {
      const common = variants.find((v) => v.rarity === 'common')
      if (common) nameToCommonBadge.set(name, common)
    }

    // 대표배지 판정 — 이 그룹의 어느 등급이든 missions.gated_badge_id로 지목되면 대표배지
    const representativeNames = new Set<string>()
    for (const [name, variants] of familyMap) {
      if (variants.some((v) => missionByGatedBadgeId.has(v.id))) representativeNames.add(name)
    }

    // family 단위 선행조건 그래프: prereqFamily -> Set<의존하는 family 이름>
    // (대표배지는 prerequisite_badge_names가 전부 미션 보상 배지 이름을 가리키므로,
    // familyMap에 없는 이름으로 자동 필터링되어 별도 분기 없이도 간선이 생기지 않는다)
    const graph = new Map<string, Set<string>>()
    for (const [name, variants] of familyMap) {
      const prereqFamilyNames = new Set<string>()
      for (const v of variants) {
        for (const prereqName of v.condition_json?.prerequisite_badge_names ?? []) {
          if (missionRewardNames.has(prereqName)) continue
          if (familyMap.has(prereqName)) prereqFamilyNames.add(prereqName)
        }
      }
      for (const prereqName of prereqFamilyNames) {
        if (!graph.has(prereqName)) graph.set(prereqName, new Set())
        graph.get(prereqName)!.add(name)
      }
    }

    // BFS — 대표배지(들)를 depth 1로 두고 최단 깊이를 채택. 그래프에 연결되지 않은 독립
    // 배지(D01~D11 등)는 depth가 없다 — 정렬 시 sort_order로 따로 처리한다.
    const depthByName = new Map<string, number>()
    const queue: string[] = []
    for (const rootName of representativeNames) {
      depthByName.set(rootName, 1)
      queue.push(rootName)
    }
    while (queue.length > 0) {
      const cur = queue.shift()!
      const children = graph.get(cur)
      if (!children) continue
      for (const child of children) {
        if (!depthByName.has(child)) {
          depthByName.set(child, depthByName.get(cur)! + 1)
          queue.push(child)
        }
      }
    }

    function buildLocks(v: BadgeTreeSourceBadge): BadgeTreeLock[] {
      if (v.rarity === 'common') return []
      const locks: BadgeTreeLock[] = []
      const mission = missionByGatedBadgeId.get(v.id)
      if (mission) {
        locks.push({
          kind: 'mission', name: mission.title, href: `/missions/${mission.id}`,
          fulfilled: false, imageUrl: mission.image_url,
        })
        return locks
      }
      const prereqNames = (v.condition_json?.prerequisite_badge_names ?? []).filter(
        (n) => !missionRewardNames.has(n)
      )
      for (const prereqName of prereqNames) {
        const prereqCommon = nameToCommonBadge.get(prereqName)
        if (!prereqCommon) continue
        // OR 조건: 선행 배지 그룹의 어느 등급이든 보유하면 충족 (엔진 규칙과 동일)
        const prereqVariants = familyMap.get(prereqName) ?? []
        const fulfilled = prereqVariants.some((pv) => earnedBadgeIds.has(pv.id))
        locks.push({
          kind: 'badge', name: prereqName, href: `/badges/${prereqCommon.id}`,
          fulfilled, imageUrl: prereqCommon.image_url,
        })
      }
      return locks
    }

    // 계열별로 묶는다 — [그래프 깊이(대표배지가 1) → 문서 서술 순서]로 레일 순서를 정한다.
    // 이전(20260901) 버전이 "등급 우선 평탄화" 카드 목록의 2·3차 정렬키로 쓰던 것과 같은
    // 키를, 이번엔 계열(레일) 자체의 1차 정렬키로 승격했을 뿐 — 신규 계산 없음.
    // 그래프에 연결되지 않은 이름(depth undefined)은 독립 배지이므로 별도 목록으로 뺀다.
    const familyRanked: { family: BadgeFamily; depth: number; docOrder: number }[] = []
    const independentRanked: { card: BadgeTreeCard; order: number }[] = []

    for (const [name, variants] of familyMap) {
      const depth = depthByName.get(name)
      if (depth === undefined) {
        // 독립 배지 — 계열 그래프에 안 걸리는 이름(D01~D11 등). 여러 등급을 가질 일이
        // 없지만(§05 실측), 방어적으로 RARITY_ORDER 전부를 훑어 존재하는 등급만 담는다.
        for (const rarity of RARITY_ORDER) {
          const v = variants.find((variant) => variant.rarity === rarity)
          if (!v) continue
          independentRanked.push({
            // 이 루프는 rarity로 찾은 배지만 담으므로 등급은 항상 있다(레벨형은 애초에 안 걸린다)
            card: { id: v.id, name, rarity, imageUrl: v.image_url, description: v.description, locks: buildLocks(v) },
            order: sortRank(v.sort_order),
          })
        }
        continue
      }

      const stages: BadgeFamilyStage[] = []
      for (const rarity of RARITY_ORDER) {
        const v = variants.find((variant) => variant.rarity === rarity)
        if (!v) continue
        stages.push({ id: v.id, name, rarity, imageUrl: v.image_url, description: v.description, locks: buildLocks(v) })
      }
      // 계열의 정렬키: 계열 안 배지들의 sort_order 최솟값(백필 규약상 4장이 같은 값이지만,
      // 어긋난 값이 섞여도 결정적으로 정렬되도록 최솟값을 쓴다)
      familyRanked.push({
        family: { name, stages },
        depth,
        docOrder: Math.min(...variants.map((v) => sortRank(v.sort_order))),
      })
    }

    familyRanked.sort((a, b) => a.depth - b.depth || a.docOrder - b.docOrder)
    independentRanked.sort((a, b) => a.order - b.order)

    trees.push({
      activityType,
      families: familyRanked.map((r) => r.family),
      independentBadges: independentRanked.map((r) => r.card),
    })
  }

  return trees
}
