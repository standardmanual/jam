import type { ActivityType, BadgeCondition, BadgeRarity } from '@/types/database'
import { badgeKindOf, familyKeyOf, type BadgeKind } from '@/lib/badge-engine/badgeKind'
import {
  CROSS_GATE_CONDITION_KEYS,
  normalizeGateRequirement,
  familyMeetsGateRequirement,
  type CrossGateConditionKey,
  type NormalizedGateRequirement,
  type OwnedBadgeDef,
} from '@/lib/badge-engine/crossGate'
import { rarityTier } from '@/lib/rarity'
import { formatStopConditionValue } from '@/lib/badgeProgressText'

/**
 * 배지 트리(`/badges/tree`) 전용 그래프 빌더 — 티켓 20260831_2208, 20260905_0037(전면 리뉴얼).
 *
 * ## 20260905_0037에서 무엇이 바뀌었나
 *
 * 이 파일의 계열 정의는 **«같은 이름을 등급 4단으로 늘어놓은 것»** 이었다. 눈금을
 * `RARITY_ORDER` 4회 루프로만 만들었기 때문에, v5 무한레벨형(`rarity IS NULL`, 193종 26계열)은
 * 어느 눈금에도 담기지 못하고 **화면에서 조용히 사라졌다** — 크래시가 아니라 실종이라
 * 아무도 모르는 채로 카탈로그의 31%가 빠져 있었다.
 *
 * 그래서 계열의 정의를 **`family_key` 기준**으로 바꾸고(이름은 v5에서 배지를 유일하게
 * 식별하지 못한다 — 티켓 20260905_0030 B-6), 계열 안 눈금 순서는 종류마다 다르게 둔다:
 *
 * | 종류 | 계열 안 순서 | 화면 표현 |
 * |---|---|---|
 * | `graded`     | 등급 4단(Common→Mystic) | `BadgeStageRail` (최대 4눈금) |
 * | `leveled`    | `level` 오름차순(상한 없음) | `BadgeLevelGauge` (높이 고정) |
 * | `repeatable` | 등급 4단(회차 임계값이 커진다) | `BadgeStampRow` |
 *
 * 종류 판정은 여기서 다시 선언하지 않고 `badgeKind.ts`(단일 출처)를 부른다.
 *
 * ## 게이트는 그룹의 배열이다
 *
 * 이전에는 「미션 락이 있으면 그것만 반환」이라 **«미션 AND 선행배지»를 표현할 수 없었고**,
 * v5의 2단 교차 게이트(`cross_in_axis`·`cross_between_axis`·`gate_mission_badge`)는 아예
 * 읽지도 않았다 — 그 배지들은 트리에서 잠금이 통째로 사라진 채 그려졌다.
 * 이제 `BadgeTreeGateGroup[]`을 만든다: **그룹 안은 OR(또는 N개 이상), 그룹 사이는 AND**.
 * 「1단 통과, 2단 대기」는 그룹별 `fulfilled`로 드러난다.
 *
 * ## 정렬
 * `badges.sort_order`(마이그레이션 130, 티켓 20260905_0027)를 그대로 쓴다 — 이전의 이름
 * 72개 하드코딩은 그 티켓에서 이미 걷어냈다. 이 파일은 「계열 서열」만 정하고, 화면의
 * 「다음 목표가 가까운 순」 정렬은 진행 계산 결과를 아는 `BadgeTreeClient`가 한다.
 */

/** 등급형 계열의 눈금 순서. **레일은 이 4단계 전용이다**(`BadgeStageRail` 상한과 같은 값) */
const RARITY_ORDER: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/**
 * 계열 눈금 상한 — 등급은 4단계뿐이다.
 *
 * ⚠️ 이 상수가 프로덕션의 마지막 방어선이다. `BadgeStageRail`의 상한 검사는 **개발 빌드에서만**
 * throw하고(프로덕션에서 화면을 통째로 날리지 않으려고), 예전엔 이 파일의 `RARITY_ORDER`
 * 4회 루프가 상한을 «구조적으로» 보장했다. 이번 리뉴얼이 그 루프를 걷어냈으므로 상한을
 * 명시적으로 자른다(티켓 20260905_0037이 0036에게서 넘겨받은 항목 1).
 */
export const MAX_FAMILY_STAGES = 4

/** 화면에 보여줄 종목 탭 순서 — 티켓 배경 문단의 순서(걷기/러닝/사이클링/등산/트레일러닝) */
export const TREE_ACTIVITY_ORDER: ActivityType[] = [
  'walking', 'running', 'cycling', 'hiking', 'trail_running',
]

/**
 * 표시 순서 정렬키 — `badges.sort_order`(마이그레이션 130, 티켓 20260905_0027)를 그대로 쓴다.
 *
 * `sort_order = 0`은 «아직 설정하지 않음»이라 맨 뒤로 민다.
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
  /** 무한레벨형은 등급이 없다(마이그레이션 130) — 계열 종류 판정의 단일 기준이다 */
  rarity: BadgeRarity | null
  /** 무한레벨형의 레벨(Lv.1~). 등급형·반복형은 null */
  level: number | null
  /** 계열 식별자. 이름 대신 쓰는 안정적인 키(마이그레이션 130) */
  family_key: string | null
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
  /** 선행 배지 대표 눈금 이미지 또는 미션 이미지 — 잠금 해제 조건 시트용 (20260903_2329) */
  imageUrl: string | null
  /**
   * 시트 항목의 부제를 덮어쓰는 한 줄(「배지 · 어느 등급이든 1개」·「배지 · Rare 이상」).
   *
   * DS 기본값을 「배지」로 낮췄으므로(0036 넘김 항목 4), **참인 문장만** 여기서 명시한다 —
   * 예전엔 「어느 등급이든 1개」가 DS에 하드코딩돼 있어서 등급이 없는 레벨형 계열을 가리킬 때
   * 조용히 거짓말이 나갔다.
   */
  note?: string | null
}

/**
 * 게이트 한 묶음 — **그룹 안은 OR(또는 «N개 이상»), 그룹 사이는 AND**.
 *
 * 「미션 AND (배지 A OR 배지 B)」가 이 구조로 표현된다(티켓 20260905_0037, 0036 넘김 항목 3).
 * 평면 `relation` 하나로는 이 조합을 나타낼 수 없어 시트가 조건을 잘못 읽고 있었다.
 */
export interface BadgeTreeGateGroup {
  /** 자물쇠 표식 종류 — 미션(프라이머리 자물쇠) / 교차·선행 배지(중성 별) */
  kind: 'mission' | 'cross'
  /** 그룹 안 항목 결합. 'or' = 하나만, 'and' = 전부(또는 `note`가 말하는 개수만큼) */
  relation: 'or' | 'and'
  /** 이 그룹이 이미 열렸는지 — 「1단 통과, 2단 대기」가 이 값으로 드러난다 */
  fulfilled: boolean
  /** 그룹 제목(시트에서만 노출). 없으면 그리지 않는다 */
  title: string | null
  /** 「계열 3개 중 2개 이상」처럼 OR/AND로 못 담는 요구를 한 줄로 적는다 */
  note: string | null
  locks: BadgeTreeLock[]
}

/** 계열 안 눈금 하나 — 등급형은 등급 1단, 레벨형은 레벨 1단, 반복형은 회차 임계값 1단 */
export interface BadgeFamilyStage {
  id: string
  /** 등급과 무관한 배지 이름(예: "동네 산책러") */
  name: string
  /** 무한레벨형은 null */
  rarity: BadgeRarity | null
  /** 무한레벨형만 값이 있다 */
  level: number | null
  imageUrl: string | null
  description: string | null
  /**
   * 이 눈금 앞을 막는 게이트 묶음. 그룹 사이는 AND다.
   * 비어 있으면 게이트가 없다(수치 조건만 남았다).
   */
  gateGroups: BadgeTreeGateGroup[]
  /**
   * `gateGroups`를 평탄화한 목록 — `computeBadgeProgress(…, locks)`의 `buildGate`가
   * 예전 형태를 그대로 받는다. 새 정보를 담지 않는 파생값이므로 판정에 쓰지 않는다.
   */
  locks: BadgeTreeLock[]
  /** 표시 순서(계열 안 정렬은 이미 끝나 있고, 계열 자체의 서열 계산에 쓴다) */
  sortOrder: number
  /**
   * 「무엇이 얼마나 필요한가」 한 줄(「4km」·「6일 연속 · 5회 충족」) — 티켓 20260906_1323.
   *
   * `condition_json`만 읽어 만든 **완성 문자열**이라 유저 지표와 무관하다. 그래서 눈금 전량에
   * 대해 채워도 추가 쿼리가 없다. measurable 조건이 하나도 없으면(미션 보상·수동 발급) null이고,
   * 그때 호출부는 기존 폴백(레일 `'—'`, 캡션 「진행 표시 준비 중」)을 쓴다.
   */
  conditionText: string | null
}

/** 계열(같은 `family_key`) 하나 = 화면의 한 줄 */
export interface BadgeFamily {
  /** `family_key`(없으면 `#name:{이름}` 폴백 — `badgeKind.familyKeyOf`와 같은 규칙) */
  key: string
  name: string
  /** 화면 표현을 가르는 유일한 기준 — 레일 / 레벨 게이지 / 카운터 행 */
  kind: BadgeKind
  /** 등급형·반복형은 최대 4눈금, 레벨형은 `level` 오름차순(상한 없음) */
  stages: BadgeFamilyStage[]
}

export interface BadgeActivityTree {
  activityType: ActivityType
  /**
   * 이 종목의 모든 계열. 순서는 [선행조건 그래프 깊이 → `sort_order`]이고,
   * 화면의 「다음 목표가 가까운 순」 재정렬은 진행 계산을 아는 클라이언트가 한다.
   */
  families: BadgeFamily[]
}

/**
 * 계열의 «다음 목표» 눈금 — 첫 미획득 눈금. **서버(진행 계산 대상 선정)와 화면(정렬·행
 * 렌더)이 같은 눈금을 봐야** 하므로 여기 한 곳에 둔다.
 *
 * ⚠️ **이 함수는 «획득» 기준 프런티어다 — 진행 표시 앵커와 다를 수 있다**(티켓 20260906_1323 §8).
 * 조건은 이미 채웠지만 아직 발급되지 않은 눈금(다음 동기화에서 발급될 눈금)도 여기서는
 * 프런티어로 남는다. 그 눈금에 진행 수치를 붙이면 「22/1일」처럼 **이미 넘긴 조건에 카운트가
 * 뜨는** 표시가 된다. 그래서 진행 표시가 붙을 자리(앵커)는 서버(`badges/tree/page.tsx`)가
 * 「첫 미충족」 기준으로 따로 정해 `frontierBadgeIdByFamilyKey`로 내려보낸다.
 * 게이트 자리·「앞 구간 꽉 채움」 같은 **획득 여부** 판정은 계속 이 함수를 기준으로 한다.
 *
 * 예외는 반복형이다: 전부 획득한 뒤에도 **다음 회차가 계속 진행 중**이라 마지막 눈금을
 * 그대로 목표로 둔다(티켓 20260905_0031 — 「이미 획득했지만 다음 카운트가 진행 중」인
 * 상태가 정상이고, 미획득만 프런티어로 보던 선정 로직이 그 진행을 통째로 숨기고 있었다).
 * 등급형·레벨형은 다 받으면 목표가 없다 — `undefined`.
 */
export function frontierStageOf(
  family: BadgeFamily,
  earnedBadgeIds: Set<string>
): BadgeFamilyStage | undefined {
  const unearned = family.stages.find((s) => !earnedBadgeIds.has(s.id))
  if (unearned) return unearned
  return family.kind === 'repeatable' ? family.stages[family.stages.length - 1] : undefined
}

/** 계열의 «입구» 눈금 — 잠금 칩이 링크할 대표 배지(등급형은 Common, 레벨형은 Lv.1) */
function entryStageOf(variants: BadgeTreeSourceBadge[]): BadgeTreeSourceBadge | undefined {
  return [...variants].sort(
    (a, b) => rarityTier(a.rarity) - rarityTier(b.rarity) || (a.level ?? 0) - (b.level ?? 0)
  )[0]
}

/** 계열 안 눈금 순서 — 레벨형은 `level`, 그 외는 등급 서열 */
function sortStagesInFamily(variants: BadgeTreeSourceBadge[], kind: BadgeKind): BadgeTreeSourceBadge[] {
  if (kind === 'leveled') {
    return [...variants].sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
  }
  // 등급형·반복형은 등급 하나당 눈금 하나다 — 같은 등급이 둘 이상이면 sort_order가 앞선 것만
  // 남긴다. 이렇게 해야 눈금 수가 **구조적으로** 4를 넘지 않는다(MAX_FAMILY_STAGES 주석 참고).
  const picked: BadgeTreeSourceBadge[] = []
  for (const rarity of RARITY_ORDER) {
    const same = variants.filter((v) => v.rarity === rarity)
    if (same.length === 0) continue
    picked.push(same.reduce((min, cur) => (sortRank(cur.sort_order) < sortRank(min.sort_order) ? cur : min)))
  }
  return picked
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

  /**
   * 이 유저가 실제로 보유한 배지 정의 — `crossGate.ts`의 `familyMeetsGateRequirement`가
   * 요구하는 형태 그대로다(티켓 20260906_1947 ③). `BadgeTreeSourceBadge`가 이미
   * `OwnedBadgeDef`의 필드를 전부 가지고 있어 추가 조회 없이 필터만으로 만들 수 있다 —
   * 예전에 이 파일이 판정을 별도로 재구현한 이유(엔진 쪽 함수가 전량 조회를 요구해서)가
   * 애초에 성립하지 않았다.
   */
  const ownedDefs: OwnedBadgeDef[] = badges
    .filter((b) => earnedBadgeIds.has(b.id))
    .map((b) => ({ ...b, activity_types: b.activity_types ?? [] }))

  // 미션 완료로만 지급되는 배지(condition_json.mission_reward=true)는 트리 카드로 그리지 않고,
  // prerequisite_badge_names에서 "이 이름은 다른 활동 배지가 아니라 미션 보상 배지다"를
  // 걸러내는 용도로만 쓴다(요구사항: 미션 게이팅과 배지 게이팅 구분).
  const missionRewardNames = new Set(
    badges.filter((b) => b.condition_json?.mission_reward).map((b) => b.name)
  )

  /**
   * **종목을 가로지르는** family_key → 배지 목록. 교차 게이트(`cross_*`·`gate_mission_badge`)의
   * 대상 계열을 찾는 데 쓴다 — 미션 보상 배지도 포함해야 `gate_mission_badge`가 대상을 찾는다
   * (아래 종목별 `familyMap`은 미션 보상 배지를 이미 제외한 목록이다).
   */
  const globalFamilyMap = new Map<string, BadgeTreeSourceBadge[]>()
  for (const b of badges) {
    const key = familyKeyOf(b)
    if (!globalFamilyMap.has(key)) globalFamilyMap.set(key, [])
    globalFamilyMap.get(key)!.push(b)
  }

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

    // 계열 = family_key. 이름이 아니다 — v5는 「레벨형·반복형이 등급형과 이름을 공유할 수
    // 있다」를 설계 전제로 둔다(티켓 20260905_0030 B-6).
    const familyMap = new Map<string, BadgeTreeSourceBadge[]>()
    for (const b of activityBadges) {
      const key = familyKeyOf(b)
      if (!familyMap.has(key)) familyMap.set(key, [])
      familyMap.get(key)!.push(b)
    }

    // 이름 → 그 이름을 쓰는 계열 키들. `prerequisite_badge_names`가 **이름 기반**이라
    // 이 다리가 필요하다(엔진도 같은 모호성을 안고 있다 — crossGate.ts 원칙 ①).
    const familyKeysByName = new Map<string, string[]>()
    for (const [key, variants] of familyMap) {
      for (const name of new Set(variants.map((v) => v.name))) {
        if (!familyKeysByName.has(name)) familyKeysByName.set(name, [])
        familyKeysByName.get(name)!.push(key)
      }
    }

    // 대표배지 판정 — 이 계열의 어느 눈금이든 missions.gated_badge_id로 지목되면 대표배지
    const representativeKeys = new Set<string>()
    for (const [key, variants] of familyMap) {
      if (variants.some((v) => missionByGatedBadgeId.has(v.id))) representativeKeys.add(key)
    }

    // 계열 단위 선행조건 그래프: prereqFamily -> Set<의존하는 family 키>
    const graph = new Map<string, Set<string>>()
    for (const [key, variants] of familyMap) {
      const prereqKeys = new Set<string>()
      for (const v of variants) {
        for (const prereqName of v.condition_json?.prerequisite_badge_names ?? []) {
          if (missionRewardNames.has(prereqName)) continue
          for (const prereqKey of familyKeysByName.get(prereqName) ?? []) {
            if (prereqKey !== key) prereqKeys.add(prereqKey)
          }
        }
      }
      for (const prereqKey of prereqKeys) {
        if (!graph.has(prereqKey)) graph.set(prereqKey, new Set())
        graph.get(prereqKey)!.add(key)
      }
    }

    // BFS — 대표배지(들)를 depth 1로 두고 최단 깊이를 채택. 그래프에 연결되지 않은 독립
    // 배지(D01~D11 등)는 depth가 없다 — 정렬에서 맨 뒤로 민다.
    const depthByKey = new Map<string, number>()
    const queue: string[] = []
    for (const rootKey of representativeKeys) {
      depthByKey.set(rootKey, 1)
      queue.push(rootKey)
    }
    while (queue.length > 0) {
      const cur = queue.shift()!
      const children = graph.get(cur)
      if (!children) continue
      for (const child of children) {
        if (!depthByKey.has(child)) {
          depthByKey.set(child, depthByKey.get(cur)! + 1)
          queue.push(child)
        }
      }
    }

    /**
     * 계열 하나를 잠금 항목 한 줄로 — 대표 눈금으로 링크하고, 보유 여부는 `crossGate.ts`의
     * `familyMeetsGateRequirement`(엔진과 **같은 함수**)로 판정한다(티켓 20260906_1947 ③).
     * 예전에는 여기서 `earnedBadgeIds.has(v.id) && rarityTier(...) >= minRarityTier`를
     * 별도로 재구현했다 — 엔진이 `min_level`을 지원하도록 확장돼도(②-b) 이 파일은 계속
     * 등급만 보고 있어 "화면은 열려 보이는데 발급은 안 되는" 틈이 생길 뻔했다.
     */
    function familyLock(
      familyKey: string,
      minRarityLabel: string | null,
      minRarityTier: number,
      minLevel: number | null = null,
      gatedActivityTypes: readonly ActivityType[] | null = null,
      requireMissionReward = false
    ): BadgeTreeLock | null {
      const variants = globalFamilyMap.get(familyKey) ?? []
      // 종목 경계를 넘지 않는다(crossGate.ts 원칙 ③) — 이 종목에서 받을 수 있는 눈금만 본다.
      const inScope = variants.filter(
        (v) => !v.activity_types || v.activity_types.length === 0 || v.activity_types.includes(activityType)
      )
      const pool = inScope.length > 0 ? inScope : variants
      const entry = entryStageOf(pool)
      if (!entry) return null
      const fulfilled = familyMeetsGateRequirement(
        familyKey,
        { minRarityTier, minLevel },
        ownedDefs,
        gatedActivityTypes,
        requireMissionReward
      )
      return {
        kind: 'badge',
        name: entry.name,
        href: `/badges/${entry.id}`,
        fulfilled,
        imageUrl: entry.image_url,
        // 참인 문장만 적는다 — 등급 제한이 없으면 「어느 등급이든 1개」, 있으면 그 등급 이상.
        note: minRarityLabel
          ? `배지 · ${minRarityLabel} 이상`
          : minLevel != null
            ? `배지 · Lv.${minLevel} 이상`
            : '배지 · 어느 등급이든 1개',
      }
    }

    /** 교차 게이트 요구 하나 → 대상 계열 잠금 항목들 */
    function crossLocks(
      req: NormalizedGateRequirement,
      requireMissionReward: boolean,
      gatedActivityTypes: readonly ActivityType[] | null
    ): BadgeTreeLock[] {
      const locks: BadgeTreeLock[] = []
      for (const familyKey of req.familyKeys) {
        if (requireMissionReward) {
          const variants = globalFamilyMap.get(familyKey) ?? []
          // 미션 보상 배지가 아니면 이 요구를 만족시킬 수 없다(엔진 familyMeetsGateRequirement와 동일)
          if (!variants.some((v) => v.condition_json?.mission_reward === true)) continue
        }
        const lock = familyLock(
          familyKey,
          req.minRarityLabel,
          req.minRarityTier,
          req.minLevel,
          gatedActivityTypes,
          requireMissionReward
        )
        if (lock) locks.push(lock)
      }
      return locks
    }

    function buildGateGroups(v: BadgeTreeSourceBadge): BadgeTreeGateGroup[] {
      const groups: BadgeTreeGateGroup[] = []

      // ① 미션 게이팅 — 대표배지의 Rare 이상은 미션 완료로 열린다.
      //    예전엔 여기서 곧바로 return 해서 «미션 AND 선행배지»를 표현할 수 없었다.
      const mission = missionByGatedBadgeId.get(v.id)
      if (mission) {
        groups.push({
          kind: 'mission',
          relation: 'or',
          // 미션 진행도는 이 화면이 추적하지 않는다 — 항상 «대기»로 둔다(보수적).
          fulfilled: false,
          title: null,
          note: null,
          locks: [
            {
              kind: 'mission', name: mission.title, href: `/missions/${mission.id}`,
              fulfilled: false, imageUrl: mission.image_url, note: null,
            },
          ],
        })
      }

      // ② 선행 배지(이름 기반, OR) — 계열의 어느 등급이든 하나 보유하면 열린다.
      const prereqNames = (v.condition_json?.prerequisite_badge_names ?? []).filter(
        (n) => !missionRewardNames.has(n)
      )
      const prereqLocks: BadgeTreeLock[] = []
      const seenPrereqHref = new Set<string>()
      for (const prereqName of prereqNames) {
        for (const prereqKey of familyKeysByName.get(prereqName) ?? []) {
          const lock = familyLock(prereqKey, null, 0, null, v.activity_types)
          if (!lock || seenPrereqHref.has(lock.href)) continue
          seenPrereqHref.add(lock.href)
          prereqLocks.push(lock)
        }
      }
      if (prereqLocks.length > 0) {
        groups.push({
          kind: 'cross', relation: 'or',
          fulfilled: prereqLocks.some((l) => l.fulfilled),
          title: null, note: null, locks: prereqLocks,
        })
      }

      // ③ 2단 교차 게이트(v5) — 형태 검증은 엔진과 **같은 함수**를 쓴다.
      //    결합 규칙(crossGate.ts): 축 내 교차 ↔ 축 간 교차는 OR, 미션 보상 배지는 AND.
      const condition = v.condition_json
      if (condition) {
        const normalized = new Map<CrossGateConditionKey, NormalizedGateRequirement>()
        for (const key of CROSS_GATE_CONDITION_KEYS) {
          if (condition[key] === undefined) continue
          const result = normalizeGateRequirement(condition[key], familyKeyOf(v))
          // 형태가 깨진 게이트는 엔진이 fail-closed로 막는다. 화면도 같은 태도로 둬야
          // 「열려 보이는데 안 나오는 배지」가 생기지 않는다 — 항목을 못 그리므로 잠금만 남긴다.
          if (result.ok) normalized.set(key, result.value)
        }

        // 축 내 교차 · 축 간 교차 — 둘 다 선언되면 **하나만** 채우면 된다(OR). 사용자에게는
        // 「이 계열들 중 하나」 한 묶음으로 읽히는 편이 정확하다.
        const crossKeys = (['cross_in_axis', 'cross_between_axis'] as const).filter((k) => normalized.has(k))
        if (crossKeys.length > 0) {
          const locks: BadgeTreeLock[] = []
          const seen = new Set<string>()
          let fulfilled = false
          let maxMinCount = 1
          for (const key of crossKeys) {
            const req = normalized.get(key)!
            const keyLocks = crossLocks(req, false, v.activity_types)
            if (keyLocks.filter((l) => l.fulfilled).length >= req.minCount) fulfilled = true
            if (req.minCount > maxMinCount) maxMinCount = req.minCount
            for (const lock of keyLocks) {
              if (seen.has(lock.href)) continue
              seen.add(lock.href)
              locks.push(lock)
            }
          }
          if (locks.length > 0) {
            groups.push({
              kind: 'cross',
              relation: maxMinCount > 1 ? 'and' : 'or',
              fulfilled,
              title: null,
              note: maxMinCount > 1 ? `이 중 ${maxMinCount}개 이상 필요해요` : null,
              locks,
            })
          }
        }

        // 미션 보상 배지 — 위 교차와 **AND**로 묶인다(별도 그룹이 곧 AND다).
        const gateMissionReq = normalized.get('gate_mission_badge')
        if (gateMissionReq) {
          const locks = crossLocks(gateMissionReq, true, v.activity_types)
          if (locks.length > 0) {
            groups.push({
              kind: 'mission',
              relation: gateMissionReq.minCount > 1 ? 'and' : 'or',
              fulfilled: locks.filter((l) => l.fulfilled).length >= gateMissionReq.minCount,
              title: null,
              note: gateMissionReq.minCount > 1 ? `이 중 ${gateMissionReq.minCount}개 이상 필요해요` : null,
              locks,
            })
          }
        }
      }

      return groups
    }

    const familyRanked: { family: BadgeFamily; depth: number; order: number }[] = []

    for (const [key, variants] of familyMap) {
      // 종류는 계열의 성격이다 — 같은 계열 안에서 갈릴 일이 없지만(정합성 트리거),
      // 섞여 있으면 «가장 앞 눈금»의 종류를 따른다(레벨형이 하나라도 있으면 레벨 게이지).
      const kind: BadgeKind = variants.some((v) => v.rarity == null)
        ? 'leveled'
        : badgeKindOf(entryStageOf(variants)!)

      const ordered = sortStagesInFamily(variants, kind)
      // 프로덕션 상한(위 MAX_FAMILY_STAGES 주석) — 레벨형은 레일이 아니라 게이지로 그리므로
      // 상한을 걸지 않는다. 게이지는 레벨 수와 무관하게 높이가 고정이다.
      const capped = kind === 'leveled' ? ordered : ordered.slice(0, MAX_FAMILY_STAGES)

      const stages: BadgeFamilyStage[] = capped.map((v) => {
        const gateGroups = buildGateGroups(v)
        return {
          id: v.id,
          name: v.name,
          rarity: v.rarity,
          level: v.level,
          imageUrl: v.image_url,
          description: v.description,
          gateGroups,
          locks: gateGroups.flatMap((g) => g.locks),
          sortOrder: sortRank(v.sort_order),
          conditionText: formatStopConditionValue(v.condition_json),
        }
      })
      if (stages.length === 0) continue

      familyRanked.push({
        family: { key, name: stages[0].name, kind, stages },
        // 그래프에 안 걸리는 독립 계열은 맨 뒤로 — 이전 버전이 독립 배지를 별도 그리드로
        // 빼서 얻던 순서 효과를 정렬키 하나로 대신한다.
        depth: depthByKey.get(key) ?? Number.MAX_SAFE_INTEGER,
        order: Math.min(...stages.map((s) => s.sortOrder)),
      })
    }

    familyRanked.sort((a, b) => a.depth - b.depth || a.order - b.order || a.family.name.localeCompare(b.family.name, 'ko'))

    trees.push({ activityType, families: familyRanked.map((r) => r.family) })
  }

  return trees
}
