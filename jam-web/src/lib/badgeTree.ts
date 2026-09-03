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
 * [BFS depth → 문서 순서]를 그대로 승격했고, 독립 배지 순서는 기존
 * `INDEPENDENT_BADGE_ORDER`를 그대로 쓴다(진행률 기준 정렬은 진행 계산 모듈이 필요한
 * 2차로 미룸).
 */

const RARITY_ORDER: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/**
 * 같은 등급·같은 깊이 내 정렬 기준 — `Specs/Content/ACTIVITY_BADGES.md`의 W1~W8/R1~R8/...
 * 번호 순서. DB에는 이 순서를 나타내는 컬럼이 없어(같은 배치로 삽입된 행은 created_at이
 * 전부 동일 타임스탬프) 문서 순서를 그대로 옮겨온다 — 조건값 자체는 아래에서 전부 DB
 * 라이브 조회로 채우므로 "정적 스냅샷 금지" 요구사항을 어기지 않는다.
 */
const ACTIVITY_BADGE_ORDER: Record<ActivityType, string[]> = {
  walking: [
    '동네 산책러', '산책의 명상가', '루틴의 수호자', '작심삼일의 파괴자',
    '밤의 보행자', '이달의 산책왕', '새벽 루틴 마스터', '점심 산책러',
  ],
  running: [
    '첫 숨결', '리듬의 발견', '지구력의 전사', '달리기의 루틴',
    '달리기의 연결', '이달의 주자왕', '스피드 엔듀러', '주말 파이터',
  ],
  cycling: [
    '두 바퀴의 시작', '페달의 리듬', '장거리 항속', '언덕의 도전자',
    '사이클 루틴', '이달의 그란폰도', '산악 라이더', '계절 라이더',
  ],
  hiking: [
    '첫 고도', '산자락의 첫발', '주말 등산가', '산행의 깊이',
    '혹한의 등반자', '이달의 정복자', '혹한 장정', '주말 등반자',
  ],
  trail_running: [
    '야생의 첫발', '수직의 도전', '야생의 주자', '트레일 루틴',
    '혹한의 트레일러', '이달의 야생왕', '알파인 트레일러', '새벽 야생인',
  ],
}

/** 화면에 보여줄 종목 탭 순서 — 티켓 배경 문단의 순서(걷기/러닝/사이클링/등산/트레일러닝) */
export const TREE_ACTIVITY_ORDER: ActivityType[] = [
  'walking', 'running', 'cycling', 'hiking', 'trail_running',
]

/**
 * 독립 발급 배지(D01~D11 + 트로피 매트릭스, 걷기 전용 32종) 정렬 순서 — 티켓 20260831_2250.
 * `Specs/Content/ACTIVITY_BADGES.md`의 실제 서술 순서(D01→D11, 그다음 T01~T18·T20·T22·T23 —
 * T19·T21은 설계 단계에서 제외되어 결번)를 그대로 옮겼다. 이름 자체가 누적일수·트로피 순서를
 * 담고 있어 가나다순으로 정렬하면 성장 서사가 깨진다.
 */
const INDEPENDENT_BADGE_ORDER: string[] = [
  // D01~D11 — 누적 걷기 일수 체크포인트
  '첫 발자국', '일주일의 증인', '이주의 리듬', '한 달의 산책자',
  '두 달째 걷는 사람', '백일의 걸음', '반년의 동행', '일 년의 발자취',
  '오백일의 산책자', '칠백일의 순례자', '천일의 방랑자',
  // 트로피 매트릭스 — T01~T18·T20·T22·T23 (T19·T21 결번)
  '숫자의 노예', '그냥 좀 걸었을 뿐', '만보왕', '걸음의 구도자',
  '주말의 신도', '월요병 극복자', '불금은 없다', '평일의 성실함',
  '일요일 새벽의 수도승', '불타는 금요일 밤 산책', '월요일 점심의 도피',
  '폭염 속의 걸음', '영하 15도의 산책자', '그냥 좀 더웠음',
  '사계절의 발걸음', '봄에만 걷는 사람', '겨울잠 안 자는 사람',
  '1월의 다짐', '장마철의 의지', '하루종일 걸었다', '그냥 나갔다 옴',
]

export interface BadgeTreeSourceBadge {
  id: string
  name: string
  rarity: BadgeRarity
  description: string | null
  image_url: string | null
  activity_types: ActivityType[] | null
  condition_json: BadgeCondition | null
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
   * 레일이 아니라 그리드로 그린다. 정렬은 기존 `INDEPENDENT_BADGE_ORDER` 그대로
   * (진행률 기준 정렬은 2차) — 20260903_2329.
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
    // 배지(D01~D11 등)는 depth가 없다 — 정렬 시 INDEPENDENT_BADGE_ORDER로 따로 처리한다.
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

    const orderList = ACTIVITY_BADGE_ORDER[activityType] ?? []
    const orderIndex = (name: string) => {
      const i = orderList.indexOf(name)
      return i === -1 ? orderList.length : i
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
            card: { id: v.id, name, rarity: v.rarity, imageUrl: v.image_url, description: v.description, locks: buildLocks(v) },
            order: INDEPENDENT_BADGE_ORDER.indexOf(name),
          })
        }
        continue
      }

      const stages: BadgeFamilyStage[] = []
      for (const rarity of RARITY_ORDER) {
        const v = variants.find((variant) => variant.rarity === rarity)
        if (!v) continue
        stages.push({ id: v.id, name, rarity: v.rarity, imageUrl: v.image_url, description: v.description, locks: buildLocks(v) })
      }
      familyRanked.push({ family: { name, stages }, depth, docOrder: orderIndex(name) })
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
