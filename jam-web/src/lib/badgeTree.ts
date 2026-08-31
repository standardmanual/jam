import type { ActivityType, BadgeCondition, BadgeRarity } from '@/types/database'
import { d, t } from '@/lib/i18n'

/**
 * 배지 트리(`/badges/tree`) 전용 그래프 빌더 — 티켓 20260831_2208.
 *
 * 액티비티 배지는 종목별 대표배지(동네 산책러/첫 숨결/언덕의 도전자/첫 고도/야생의 주자)를
 * 루트로, `condition_json.prerequisite_badge_names`(동일 종목 내 다른 배지 이름, OR 조건)로
 * 이어진 선행조건 그래프를 이룬다. 이 파일은 그 그래프를 BFS로 순회해 "먼저 얻어야 하는
 * 배지 → 그다음 배지들" 단계(stage)를 계산한다.
 *
 * 대표배지의 Rare 이상은 다른 배지가 아니라 **미션 완료**로 게이팅된다
 * (`missions.gated_badge_id` = 그 등급 배지의 id). 대표배지는 이 게이팅 방식으로
 * 식별한다 — 이름을 하드코딩하지 않아, 나중에 대표배지 구성이 바뀌어도 그대로 반영된다
 * (요구사항 7 "실제 DB와 라이브 연동").
 *
 * D01~D11(누적 걷기 일수 체크포인트)·트로피 매트릭스(T01~T23) 같은 **독립 발급 배지**
 * (선행조건이 전혀 없고 대표배지도 아닌 배지, `Specs/Content/ACTIVITY_BADGES.md` 확인)는
 * 선행조건 그래프에 연결되지 않아 BFS로 도달할 수 없다. 이런 배지는 stage에 억지로
 * 끼워 넣지 않고 `independentFamilies`로 별도 반환한다 — 트리 UI가 "선행 조건 없이 얻는
 * 배지" 섹션으로 그린다.
 */

const RARITY_ORDER: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/**
 * 동일 단계(depth) 내 정렬 기준 — `Specs/Content/ACTIVITY_BADGES.md`의 W1~W8/R1~R8/...
 * 번호 순서. DB에는 이 순서를 나타내는 컬럼이 없어(같은 배치로 삽입된 행은 created_at이
 * 전부 동일 타임스탬프) 문서 순서를 그대로 옮겨온다 — 조건값 자체는 아래에서 전부 DB
 * 라이브 조회로 채우므로 "정적 스냅샷 금지"(요구사항 7)를 어기지 않는다.
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
 * "선행 조건 없이 얻는 배지" 섹션(D01~D11 + 트로피 매트릭스, 걷기 전용 32종) 정렬 순서 —
 * 티켓 20260831_2250. `Specs/Content/ACTIVITY_BADGES.md`의 실제 서술 순서(D01→D11, 그다음
 * T01~T18·T20·T22·T23 — T19·T21은 설계 단계에서 제외되어 결번)를 그대로 옮겼다. 이름 자체가
 * 누적일수·트로피 순서를 담고 있어 가나다순으로 정렬하면 성장 서사가 깨진다.
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
  label: string
  href: string
}

export interface BadgeTreeVariant {
  id: string
  rarity: BadgeRarity
  imageUrl: string | null
  description: string | null
  locks: BadgeTreeLock[]
}

export interface BadgeTreeFamily {
  /** 등급과 무관한 배지 그룹 이름(예: "동네 산책러") — 같은 이름을 등급별로 갖는다 */
  name: string
  /** 종목 대표배지 여부(⚡ 강조 표시 대상) — missions.gated_badge_id로 판정 */
  representative: boolean
  /** Common → Rare → Epic → Mystic 순, 실제 존재하는 등급만 */
  variants: BadgeTreeVariant[]
}

export interface BadgeTreeStage {
  /** 1부터 시작 — 1단계가 종목 대표배지 */
  depth: number
  families: BadgeTreeFamily[]
}

export interface BadgeActivityTree {
  activityType: ActivityType
  stages: BadgeTreeStage[]
  /** 선행조건 그래프에 연결되지 않은 독립 발급 배지(D01~D11, 트로피 매트릭스 등) */
  independentFamilies: BadgeTreeFamily[]
}

function lockLabelForBadge(name: string): string {
  return t(d.badges.treeLockBadgeHint, { name })
}

function lockLabelForMission(title: string): string {
  return t(d.badges.treeLockMissionHint, { title })
}

export function buildBadgeActivityTrees(
  badges: BadgeTreeSourceBadge[],
  missions: BadgeTreeSourceMission[]
): BadgeActivityTree[] {
  const missionByGatedBadgeId = new Map<string, BadgeTreeSourceMission>()
  for (const m of missions) {
    if (m.gated_badge_id) missionByGatedBadgeId.set(m.gated_badge_id, m)
  }

  // 미션 완료로만 지급되는 배지(condition_json.mission_reward=true)는 트리 노드로 그리지 않고,
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

    // BFS — 대표배지(들)를 depth 1로 두고 최단 깊이를 채택
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

    function buildFamily(name: string, variants: BadgeTreeSourceBadge[]): BadgeTreeFamily {
      const treeVariants: BadgeTreeVariant[] = RARITY_ORDER.map((rarity) =>
        variants.find((v) => v.rarity === rarity)
      )
        .filter((v): v is BadgeTreeSourceBadge => !!v)
        .map((v) => {
          const locks: BadgeTreeLock[] = []
          if (v.rarity !== 'common') {
            const mission = missionByGatedBadgeId.get(v.id)
            if (mission) {
              locks.push({ label: lockLabelForMission(mission.title), href: `/missions/${mission.id}` })
            } else {
              const prereqNames = (v.condition_json?.prerequisite_badge_names ?? []).filter(
                (n) => !missionRewardNames.has(n)
              )
              for (const prereqName of prereqNames) {
                const id = nameToCommonId.get(prereqName)
                if (id) locks.push({ label: lockLabelForBadge(prereqName), href: `/badges/${id}` })
              }
            }
          }
          return {
            id: v.id,
            rarity: v.rarity,
            imageUrl: v.image_url,
            description: v.description,
            locks,
          }
        })
      return { name, representative: representativeNames.has(name), variants: treeVariants }
    }

    const orderList = ACTIVITY_BADGE_ORDER[activityType] ?? []
    const orderIndex = (name: string) => {
      const i = orderList.indexOf(name)
      return i === -1 ? orderList.length : i
    }

    const stageFamilies = new Map<number, BadgeTreeFamily[]>()
    const independentFamilies: BadgeTreeFamily[] = []
    for (const [name, variants] of familyMap) {
      const depth = depthByName.get(name)
      const family = buildFamily(name, variants)
      if (depth === undefined) {
        independentFamilies.push(family)
      } else {
        if (!stageFamilies.has(depth)) stageFamilies.set(depth, [])
        stageFamilies.get(depth)!.push(family)
      }
    }
    for (const families of stageFamilies.values()) {
      families.sort((a, b) => orderIndex(a.name) - orderIndex(b.name))
    }
    // 가나다순이 아니라 문서 서술 순서(성장 서사, INDEPENDENT_BADGE_ORDER)로 고정 정렬.
    // 배열에 없는 이름(향후 신규 독립 배지)은 뒤로 보내는 fallback — 에러로 죽지 않게.
    independentFamilies.sort((a, b) => {
      const ai = INDEPENDENT_BADGE_ORDER.indexOf(a.name)
      const bi = INDEPENDENT_BADGE_ORDER.indexOf(b.name)
      const aOrder = ai === -1 ? INDEPENDENT_BADGE_ORDER.length : ai
      const bOrder = bi === -1 ? INDEPENDENT_BADGE_ORDER.length : bi
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.name.localeCompare(b.name, 'ko')
    })

    const stages: BadgeTreeStage[] = Array.from(stageFamilies.keys())
      .sort((a, b) => a - b)
      .map((depth) => ({ depth, families: stageFamilies.get(depth)! }))

    trees.push({ activityType, stages, independentFamilies })
  }

  return trees
}
