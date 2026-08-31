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
 * 20260901 UI 수정: 종목별로 "동일 배지의 등급 순서"(가족 단위 묶음)가 아니라 "전체 액티비티
 * 배지의 획득 단계"를 기준으로 한 줄짜리 평평한 목록(`cards`)을 반환한다. 등급(Common→Mystic)
 * 자체가 이미 대략적인 획득 순서를 나타내므로 1차 정렬키로 쓰고, 같은 등급 안에서는 선행조건
 * 그래프의 BFS 깊이(대표배지가 1) → 문서 서술 순서로 2차 정렬한다. D01~D11·트로피 매트릭스처럼
 * 선행조건 그래프에 연결되지 않은 독립 발급 배지는 같은 등급 그룹 맨 뒤에 자기들끼리의 문서
 * 서술 순서로 붙는다. 화면에는 "1단계"·"대표 배지" 같은 구분 라벨·구분선을 두지 않는다 —
 * 각 카드가 등급 pill을 자체적으로 보여주므로 별도 헤더가 없어도 단계가 읽힌다.
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
}

export interface BadgeTreeLock {
  kind: 'badge' | 'mission'
  /** 선행 배지 이름 또는 미션 제목 — 잠금칩에서 볼드 처리 대상 (20260901 UI 수정) */
  name: string
  href: string
  /** kind='badge'일 때만 의미 있음 — 이 유저가 이 선행 배지를 이미 보유했는지 */
  fulfilled: boolean
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

export interface BadgeActivityTree {
  activityType: ActivityType
  /** 등급(획득 단계) → 그래프 깊이 → 문서 순서로 정렬된 평평한 카드 목록. 구분 라벨·구분선 없음 */
  cards: BadgeTreeCard[]
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

    // 이름 → Common 등급 id (배지 게이팅 잠금 칩 링크용, 요구사항: "해당 배지의 Common 등급으로 링크")
    const nameToCommonId = new Map<string, string>()
    for (const [name, variants] of familyMap) {
      const common = variants.find((v) => v.rarity === 'common')
      if (common) nameToCommonId.set(name, common.id)
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
        locks.push({ kind: 'mission', name: mission.title, href: `/missions/${mission.id}`, fulfilled: false })
        return locks
      }
      const prereqNames = (v.condition_json?.prerequisite_badge_names ?? []).filter(
        (n) => !missionRewardNames.has(n)
      )
      for (const prereqName of prereqNames) {
        const id = nameToCommonId.get(prereqName)
        if (!id) continue
        // OR 조건: 선행 배지 그룹의 어느 등급이든 보유하면 충족 (엔진 규칙과 동일)
        const prereqVariants = familyMap.get(prereqName) ?? []
        const fulfilled = prereqVariants.some((pv) => earnedBadgeIds.has(pv.id))
        locks.push({ kind: 'badge', name: prereqName, href: `/badges/${id}`, fulfilled })
      }
      return locks
    }

    const orderList = ACTIVITY_BADGE_ORDER[activityType] ?? []
    const orderIndex = (name: string) => {
      const i = orderList.indexOf(name)
      return i === -1 ? orderList.length : i
    }

    // 평탄화: 모든 (배지, 등급) 조합을 카드 하나씩으로 만들고, [등급 → 그래프 깊이(없으면
    // 맨 뒤) → 문서 순서] 3단계 정렬키로 하나의 목록에 줄세운다. "1단계"·"대표 배지" 같은
    // 구분 라벨이나 구분선은 화면에 두지 않는다 — 등급 pill 자체가 단계를 알려준다.
    const ranked: { card: BadgeTreeCard; rarityIdx: number; independent: boolean; secondary: number; tertiary: number }[] = []
    for (const [name, variants] of familyMap) {
      const depth = depthByName.get(name)
      const independent = depth === undefined
      const secondary = independent ? INDEPENDENT_BADGE_ORDER.indexOf(name) : depth
      const tertiary = orderIndex(name)
      for (const rarity of RARITY_ORDER) {
        const v = variants.find((variant) => variant.rarity === rarity)
        if (!v) continue
        ranked.push({
          card: {
            id: v.id,
            name,
            rarity: v.rarity,
            imageUrl: v.image_url,
            description: v.description,
            locks: buildLocks(v),
          },
          rarityIdx: RARITY_ORDER.indexOf(v.rarity),
          independent,
          secondary,
          tertiary,
        })
      }
    }
    ranked.sort((a, b) => {
      if (a.rarityIdx !== b.rarityIdx) return a.rarityIdx - b.rarityIdx
      if (a.independent !== b.independent) return a.independent ? 1 : -1
      if (a.secondary !== b.secondary) return a.secondary - b.secondary
      return a.tertiary - b.tertiary
    })

    trees.push({ activityType, cards: ranked.map((r) => r.card) })
  }

  return trees
}
