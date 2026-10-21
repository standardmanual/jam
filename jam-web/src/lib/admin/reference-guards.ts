/**
 * 미션·컬렉션(item_books)·트라이브(tribes) 하드 삭제 참조 가드 (티켓 20260907_1134)
 *
 * `lib/admin/badge-references.ts`와 같은 목적(참조를 세어 하드 삭제를 막을지 판정)이지만,
 * 엔티티마다 참조처·FK 규칙이 완전히 다르므로 **하나의 공용 함수로 추상화하지 않는다** —
 * 세 엔티티 전용 함수를 이 파일에 모아둔다(티켓 상세 요구사항 ①).
 *
 * ## FK 규칙 실측 (마이그레이션 011·012·017·034·048·080·099)
 * - **missions**: `user_mission_completions`·`user_mission_participations`·
 *   `mission_rank_snapshots`는 `mission_id` **CASCADE** — 하드 삭제하면 유저의 참여·완료·
 *   랭킹 기록이 조용히 함께 사라진다. `point_transactions.source_mission_id`는
 *   **ON DELETE 미지정 → NO ACTION**이라 참조가 있으면 DELETE 자체가 FK 위반으로 실패한다.
 *   `today_cards.mission_id`는 **SET NULL** — 차단 사유는 아니지만 안내 문구에는 포함한다.
 *   `ranking_modes.target_mission_id`도 **SET NULL**(마이그레이션 158) — 삭제하면 랭킹 규칙의
 *   대상이 조용히 비워지므로 투데이 카드 연결과 같이 안내만 한다(티켓 20260925_2105).
 *   마이그레이션 249·250이 만든 표 3개도 `mission_id` **CASCADE**다(티켓 20261019_1318 1회):
 *   `mission_item_rewards`(미션이 준·못 준 아이템 배지 보상 — 받지 않은 보상이 함께 사라진다)와
 *   `mission_participation_cancellations`(트라이브 변경으로 취소된 참가의 이력)는 유저 기록이라 삭제를 막고,
 *   `mission_allowed_tribes`(참가할 수 있는 트라이브)는 운영자가 정한 설정이라 사용자 기록이 없으면 안내만 한다.
 * - **item_books(컬렉션)**: `user_item_book_slots`·`user_item_book_completions`는
 *   `item_book_id` **CASCADE**. `user_drop_state.last_drop_book_id`는 **NO ACTION**
 *   (사전 조사에 없던 참조 — 거의 모든 활성 유저가 `user_drop_state` 행을 가지므로 실무에서는
 *   이 한 자리가 컬렉션 하드 삭제를 사실상 항상 막는다). `badges.item_book_id`·
 *   `today_cards.item_book_id`는 SET NULL.
 * - **tribes(트라이브)**: `tribe_adjacency`의 `tribe_id`/`adjacent_tribe_id` 모두
 *   **CASCADE**. `user_drop_state.last_drop_tribe_id`는 **NO ACTION**(위와 같은 이유로
 *   실무 차단 확률이 높다). `users.tribe_id`(`users_tribe_id_fkey`)도 **NO ACTION**이다
 *   (티켓 20260924_0945 — 운영 DB 확인). `badges.tribe_id`·`item_books.tribe_id`는 SET NULL.
 *   `mission_allowed_tribes.tribe_id`(마이그레이션 249)는 **ON DELETE RESTRICT**다 — 참가 대상으로 둔 미션이 있으면 DELETE 자체가
 *   실패하므로 삭제를 막는 참조다(티켓 20261019_1318 2회, 1회 게이트 [주의]: 목록에 없을 때는 가드를 통과한 뒤 DB에서 막혀 500이 났다).
 *   `mission_participation_cancellations.new_tribe_id`는 SET NULL이고 취소 이력의 «바뀐 트라이브» 표시일 뿐이라 등록하지 않는다.
 *
 * ## fail-closed
 * 조회가 하나라도 실패하면 `error`를 채운다 — 호출부는 이 경우 어떤 삭제도 실행하지 않는다.
 * 부분 카운트를 «참조 0건»으로 취급하면 CASCADE 참조가 조용히 함께 지워진다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { BulkSkip } from './bulk/shared'

type ServiceClient = ReturnType<typeof createServiceClient>

/** 작은 테이블 전량 조회 페이지 크기 (badge-references.ts와 동일 관례) */
const PAGE_SIZE = 1000

export interface ReferenceSource {
  key: string
  /** 화면 표기 */
  label: string
  /** 실제 위치 */
  location: string
  /**
   * true면 이 참조가 있는 대상은 하드 삭제를 막는다 — FK NO ACTION(삭제 실패) 또는
   * CASCADE(유저 기록 소실) 둘 다 여기 해당한다. false는 SET NULL처럼 삭제를 막지는
   * 않지만 안내 문구에는 포함해야 하는 참조다.
   */
  blocks: boolean
  /** 안내 문구의 단위. 없으면 `건`(유저 수처럼 사람을 세는 참조는 `명`) */
  unit?: string
}

export interface ReferenceSummary {
  /** 이 대상을 막는 참조 합계 */
  blockingTotal: number
  /** 전체 참조 합계(안내용, blocks:false 포함) */
  total: number
  /** 참조가 있는 자리를 사람이 읽을 문구로 나열 (`레이블 N건, 레이블 N건`) */
  hitLabels: string
  /** `hitLabels` 중 삭제를 막는 참조(`blocks: true`)만 — 목록의 "삭제 불가 사유" 칸이 쓴다 */
  blockingLabels: string
  /** `hitLabels` 중 삭제를 막지 않는 참조(`blocks: false`)만 — 삭제 뒤 운영자에게 알리는 안내가 쓴다 */
  noticeLabels: string
}

/** id 목록 기준으로 페이지를 끝까지 넘겨 행을 통째로 가져온다(badge-references.ts와 동일). */
async function fetchAllRows<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1)
    if (error) return { rows, error: error.message }
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return { rows, error: null }
}

function emptyCounts(sources: ReferenceSource[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of sources) counts[s.key] = 0
  return counts
}

/** 대상별 참조 카운트에서 요약(차단 여부·안내 문구)을 만든다 — 엔티티 공통 포맷터. */
export function summarizeReference(sources: ReferenceSource[], counts: Record<string, number>): ReferenceSummary {
  let blockingTotal = 0
  let total = 0
  const hitLabels: string[] = []
  const blockingLabels: string[] = []
  const noticeLabels: string[] = []
  for (const s of sources) {
    const c = counts[s.key] ?? 0
    if (c > 0) {
      const label = `${s.label} ${c}${s.unit ?? '건'}`
      hitLabels.push(label)
      total += c
      if (s.blocks) {
        blockingTotal += c
        blockingLabels.push(label)
      } else {
        noticeLabels.push(label)
      }
    }
  }
  return {
    blockingTotal,
    total,
    hitLabels: hitLabels.join(', '),
    blockingLabels: blockingLabels.join(', '),
    noticeLabels: noticeLabels.join(', '),
  }
}

/**
 * 일괄 삭제 대상을 "삭제 가능"과 "건너뜀"으로 나눈다(티켓 20260924_0945) — 컬렉션·트라이브
 * 일괄 삭제가 같은 판정을 쓴다. 막는 참조(`blocks: true`)가 하나라도 있으면 건너뛰고,
 * 사유는 `describe`가 만든다(예: `연결된 참조 3건(...)`).
 */
export function classifyReferenceDeletion(
  ids: string[],
  counts: Map<string, Record<string, number>>,
  sources: ReferenceSource[],
  describe: (summary: ReferenceSummary) => string
): { deletable: string[]; skipped: BulkSkip[] } {
  const deletable: string[] = []
  const skipped: BulkSkip[] = []
  for (const id of ids) {
    const summary = summarizeReference(sources, counts.get(id) ?? {})
    if (summary.blockingTotal > 0) skipped.push({ id, reason: describe(summary) })
    else deletable.push(id)
  }
  return { deletable, skipped }
}

export interface ReferenceCollectResult {
  /** 대상 id → 참조원별 건수 */
  counts: Map<string, Record<string, number>>
  /** 조회 실패 메시지. 값이 있으면 어떤 삭제도 실행하면 안 된다(fail-closed) */
  error: string | null
}

// ── 미션 ─────────────────────────────────────────────────────────────────

export const MISSION_REFERENCE_SOURCES: ReferenceSource[] = [
  {
    key: 'user_mission_completions',
    label: '완료 이력',
    location: 'user_mission_completions.mission_id',
    blocks: true, // CASCADE
  },
  {
    key: 'user_mission_participations',
    label: '참여 이력',
    location: 'user_mission_participations.mission_id',
    blocks: true, // CASCADE
  },
  {
    key: 'mission_rank_snapshots',
    label: '랭킹 스냅샷',
    location: 'mission_rank_snapshots.mission_id',
    blocks: true, // CASCADE
  },
  {
    key: 'point_transactions',
    label: '포인트 지급 원장',
    location: 'point_transactions.source_mission_id',
    blocks: true, // NO ACTION — FK 위반으로 삭제 자체가 실패한다
  },
  {
    key: 'today_cards',
    label: '투데이 카드 연결',
    location: 'today_cards.mission_id',
    blocks: false, // SET NULL — 차단 사유는 아니나 안내에 포함
  },
  {
    key: 'ranking_modes',
    label: '랭킹 규칙 연결', // 화면(어드민 랭킹 규칙 관리)이 쓰는 이름. 테이블은 ranking_modes
    location: 'ranking_modes.target_mission_id',
    blocks: false, // SET NULL — 차단 사유는 아니나 안내에 포함
  },
  {
    // 받지 않은 보상(status='pending')은 이 표에만 있어서 미션을 지우면 유저가 받을 보상이 사라진다. 지금은 완료 기록이 먼저
    // 삭제를 막지만(보상은 완료에서만 생긴다), 그 전제가 깨져도 보상이 조용히 사라지지 않게 직접 막는다(티켓 20261019_1318).
    key: 'mission_item_rewards',
    label: '아이템 배지 보상 기록',
    location: 'mission_item_rewards.mission_id',
    blocks: true, // CASCADE — 유저가 받지 않은 보상이 함께 사라진다
  },
  {
    key: 'mission_participation_cancellations',
    label: '참가 취소 기록',
    location: 'mission_participation_cancellations.mission_id',
    blocks: true, // CASCADE — 트라이브 변경으로 취소된 참가의 이력이 함께 사라진다
  },
  {
    // 사용자 기록이 아니라 운영자가 정한 설정이다. 미션을 지우면 설정도 함께 지워지는 게 맞으므로 막지 않고 안내만 한다.
    key: 'mission_allowed_tribes',
    label: '참가 트라이브 제한',
    location: 'mission_allowed_tribes.mission_id',
    blocks: false, // CASCADE — 운영 설정이라 차단 사유가 아니다
    unit: '곳', // 제한된 트라이브 수
  },
]

export async function collectMissionReferences(
  supabase: ServiceClient,
  missionIds: string[]
): Promise<ReferenceCollectResult> {
  const counts = new Map(missionIds.map((id) => [id, emptyCounts(MISSION_REFERENCE_SOURCES)]))
  if (missionIds.length === 0) return { counts, error: null }

  const targetSet = new Set(missionIds)
  const errors: string[] = []
  const tally = (key: string, rows: (string | null)[]) => {
    for (const id of rows) {
      if (id && targetSet.has(id)) counts.get(id)![key] += 1
    }
  }

  const completions = await fetchAllRows<{ mission_id: string }>((from, to) =>
    supabase.from('user_mission_completions').select('mission_id').in('mission_id', missionIds).range(from, to)
  )
  if (completions.error) errors.push(`user_mission_completions: ${completions.error}`)
  tally('user_mission_completions', completions.rows.map((r) => r.mission_id))

  const participations = await fetchAllRows<{ mission_id: string }>((from, to) =>
    supabase.from('user_mission_participations').select('mission_id').in('mission_id', missionIds).range(from, to)
  )
  if (participations.error) errors.push(`user_mission_participations: ${participations.error}`)
  tally('user_mission_participations', participations.rows.map((r) => r.mission_id))

  const rankSnapshots = await fetchAllRows<{ mission_id: string }>((from, to) =>
    supabase.from('mission_rank_snapshots').select('mission_id').in('mission_id', missionIds).range(from, to)
  )
  if (rankSnapshots.error) errors.push(`mission_rank_snapshots: ${rankSnapshots.error}`)
  tally('mission_rank_snapshots', rankSnapshots.rows.map((r) => r.mission_id))

  const pointTx = await fetchAllRows<{ source_mission_id: string | null }>((from, to) =>
    supabase.from('point_transactions').select('source_mission_id').in('source_mission_id', missionIds).range(from, to)
  )
  if (pointTx.error) errors.push(`point_transactions: ${pointTx.error}`)
  tally('point_transactions', pointTx.rows.map((r) => r.source_mission_id))

  const todayCards = await fetchAllRows<{ mission_id: string | null }>((from, to) =>
    supabase.from('today_cards').select('mission_id').in('mission_id', missionIds).range(from, to)
  )
  if (todayCards.error) errors.push(`today_cards: ${todayCards.error}`)
  tally('today_cards', todayCards.rows.map((r) => r.mission_id))

  const rankingModes = await fetchAllRows<{ target_mission_id: string | null }>((from, to) =>
    supabase.from('ranking_modes').select('target_mission_id').in('target_mission_id', missionIds).range(from, to)
  )
  if (rankingModes.error) errors.push(`ranking_modes: ${rankingModes.error}`)
  tally('ranking_modes', rankingModes.rows.map((r) => r.target_mission_id))

  const itemRewards = await fetchAllRows<{ mission_id: string }>((from, to) =>
    supabase.from('mission_item_rewards').select('mission_id').in('mission_id', missionIds).range(from, to)
  )
  if (itemRewards.error) errors.push(`mission_item_rewards: ${itemRewards.error}`)
  tally('mission_item_rewards', itemRewards.rows.map((r) => r.mission_id))

  const cancellations = await fetchAllRows<{ mission_id: string }>((from, to) =>
    supabase.from('mission_participation_cancellations').select('mission_id').in('mission_id', missionIds).range(from, to)
  )
  if (cancellations.error) errors.push(`mission_participation_cancellations: ${cancellations.error}`)
  tally('mission_participation_cancellations', cancellations.rows.map((r) => r.mission_id))

  const allowedTribes = await fetchAllRows<{ mission_id: string }>((from, to) =>
    supabase.from('mission_allowed_tribes').select('mission_id').in('mission_id', missionIds).range(from, to)
  )
  if (allowedTribes.error) errors.push(`mission_allowed_tribes: ${allowedTribes.error}`)
  tally('mission_allowed_tribes', allowedTribes.rows.map((r) => r.mission_id))

  return { counts, error: errors.length > 0 ? errors.join(' / ') : null }
}

// ── 컬렉션(item_books) ───────────────────────────────────────────────────

export const ITEM_BOOK_REFERENCE_SOURCES: ReferenceSource[] = [
  {
    key: 'user_item_book_slots',
    label: '유저 슬롯 진행',
    location: 'user_item_book_slots.item_book_id',
    blocks: true, // CASCADE
  },
  {
    key: 'user_item_book_completions',
    label: '컬렉션 완성 기록',
    location: 'user_item_book_completions.item_book_id',
    blocks: true, // CASCADE
  },
  {
    key: 'user_item_book_tier_completions',
    label: '컬렉션 등급별 완성 기록',
    location: 'user_item_book_tier_completions.item_book_id',
    blocks: true, // CASCADE
  },
  {
    key: 'user_drop_state',
    label: '유저 드랍 상태(최근 드랍 컬렉션)',
    location: 'user_drop_state.last_drop_book_id',
    blocks: true, // NO ACTION — 사전 조사에 없던 참조. 거의 모든 활성 유저가 행을 갖는다.
  },
  {
    key: 'badges',
    label: '소속 아이템배지',
    location: 'badges.item_book_id',
    blocks: false, // SET NULL
  },
  {
    key: 'today_cards',
    label: '투데이 카드 연결',
    location: 'today_cards.item_book_id',
    blocks: false, // SET NULL
  },
]

export async function collectItemBookReferences(
  supabase: ServiceClient,
  itemBookIds: string[]
): Promise<ReferenceCollectResult> {
  const counts = new Map(itemBookIds.map((id) => [id, emptyCounts(ITEM_BOOK_REFERENCE_SOURCES)]))
  if (itemBookIds.length === 0) return { counts, error: null }

  const targetSet = new Set(itemBookIds)
  const errors: string[] = []
  const tally = (key: string, rows: (string | null)[]) => {
    for (const id of rows) {
      if (id && targetSet.has(id)) counts.get(id)![key] += 1
    }
  }

  const slots = await fetchAllRows<{ item_book_id: string }>((from, to) =>
    supabase.from('user_item_book_slots').select('item_book_id').in('item_book_id', itemBookIds).range(from, to)
  )
  if (slots.error) errors.push(`user_item_book_slots: ${slots.error}`)
  tally('user_item_book_slots', slots.rows.map((r) => r.item_book_id))

  const completions = await fetchAllRows<{ item_book_id: string }>((from, to) =>
    supabase.from('user_item_book_completions').select('item_book_id').in('item_book_id', itemBookIds).range(from, to)
  )
  if (completions.error) errors.push(`user_item_book_completions: ${completions.error}`)
  tally('user_item_book_completions', completions.rows.map((r) => r.item_book_id))

  const tierCompletions = await fetchAllRows<{ item_book_id: string }>((from, to) =>
    supabase.from('user_item_book_tier_completions').select('item_book_id').in('item_book_id', itemBookIds).range(from, to)
  )
  if (tierCompletions.error) errors.push(`user_item_book_tier_completions: ${tierCompletions.error}`)
  tally('user_item_book_tier_completions', tierCompletions.rows.map((r) => r.item_book_id))

  const dropState = await fetchAllRows<{ last_drop_book_id: string | null }>((from, to) =>
    supabase.from('user_drop_state').select('last_drop_book_id').in('last_drop_book_id', itemBookIds).range(from, to)
  )
  if (dropState.error) errors.push(`user_drop_state: ${dropState.error}`)
  tally('user_drop_state', dropState.rows.map((r) => r.last_drop_book_id))

  const badges = await fetchAllRows<{ item_book_id: string | null }>((from, to) =>
    supabase.from('badges').select('item_book_id').in('item_book_id', itemBookIds).range(from, to)
  )
  if (badges.error) errors.push(`badges: ${badges.error}`)
  tally('badges', badges.rows.map((r) => r.item_book_id))

  const todayCards = await fetchAllRows<{ item_book_id: string | null }>((from, to) =>
    supabase.from('today_cards').select('item_book_id').in('item_book_id', itemBookIds).range(from, to)
  )
  if (todayCards.error) errors.push(`today_cards: ${todayCards.error}`)
  tally('today_cards', todayCards.rows.map((r) => r.item_book_id))

  return { counts, error: errors.length > 0 ? errors.join(' / ') : null }
}

// ── 트라이브(tribes) ─────────────────────────────────────────────────────

export const TRIBE_REFERENCE_SOURCES: ReferenceSource[] = [
  {
    key: 'tribe_adjacency',
    label: '드랍 인접 관계',
    location: 'tribe_adjacency.tribe_id / adjacent_tribe_id',
    blocks: true, // CASCADE
  },
  {
    key: 'user_drop_state',
    label: '유저 드랍 상태(최근 드랍 계열)',
    location: 'user_drop_state.last_drop_tribe_id',
    blocks: true, // NO ACTION — 사전 조사에 없던 참조. 거의 모든 활성 유저가 행을 갖는다.
  },
  {
    // `users_tribe_id_fkey`는 삭제를 막는 FK(NO ACTION)다(운영 DB 확인, 티켓 20260924_0945).
    // 이 참조가 보호 목록에 없어서, 유저가 고른 트라이브를 지우면 보호 검사를 통과한 뒤 DB에서
    // 막혀 500이 났다.
    key: 'users',
    label: '이 트라이브를 고른 유저',
    location: 'users.tribe_id',
    blocks: true, // NO ACTION
    unit: '명',
  },
  {
    // 마이그레이션 249의 외래 키는 ON DELETE RESTRICT다. 한 줄이 미션 하나이므로 «미션 N건»이다.
    key: 'mission_allowed_tribes',
    label: '참가 대상으로 둔 미션',
    location: 'mission_allowed_tribes.tribe_id',
    blocks: true, // RESTRICT
  },
  {
    key: 'badges',
    label: '소속 배지',
    location: 'badges.tribe_id',
    blocks: false, // SET NULL
  },
  {
    key: 'item_books',
    label: '소속 컬렉션',
    location: 'item_books.tribe_id',
    blocks: false, // SET NULL
  },
]

export async function collectTribeReferences(
  supabase: ServiceClient,
  tribeIds: string[]
): Promise<ReferenceCollectResult> {
  const counts = new Map(tribeIds.map((id) => [id, emptyCounts(TRIBE_REFERENCE_SOURCES)]))
  if (tribeIds.length === 0) return { counts, error: null }

  const targetSet = new Set(tribeIds)
  const errors: string[] = []
  const tally = (key: string, rows: (string | null)[]) => {
    for (const id of rows) {
      if (id && targetSet.has(id)) counts.get(id)![key] += 1
    }
  }

  // tribe_adjacency는 두 컬럼(tribe_id / adjacent_tribe_id) 모두 대상을 가리킬 수 있다 —
  // 어느 한쪽이라도 매칭되면 그 행은 대상 트라이브를 참조하는 것이다.
  const asSource = await fetchAllRows<{ tribe_id: string }>((from, to) =>
    supabase.from('tribe_adjacency').select('tribe_id').in('tribe_id', tribeIds).range(from, to)
  )
  if (asSource.error) errors.push(`tribe_adjacency(tribe_id): ${asSource.error}`)
  tally('tribe_adjacency', asSource.rows.map((r) => r.tribe_id))

  const asAdjacent = await fetchAllRows<{ adjacent_tribe_id: string }>((from, to) =>
    supabase
      .from('tribe_adjacency')
      .select('adjacent_tribe_id')
      .in('adjacent_tribe_id', tribeIds)
      .range(from, to)
  )
  if (asAdjacent.error) errors.push(`tribe_adjacency(adjacent_tribe_id): ${asAdjacent.error}`)
  tally('tribe_adjacency', asAdjacent.rows.map((r) => r.adjacent_tribe_id))

  const dropState = await fetchAllRows<{ last_drop_tribe_id: string | null }>((from, to) =>
    supabase
      .from('user_drop_state')
      .select('last_drop_tribe_id')
      .in('last_drop_tribe_id', tribeIds)
      .range(from, to)
  )
  if (dropState.error) errors.push(`user_drop_state: ${dropState.error}`)
  tally('user_drop_state', dropState.rows.map((r) => r.last_drop_tribe_id))

  const users = await fetchAllRows<{ tribe_id: string | null }>((from, to) =>
    supabase.from('users').select('tribe_id').in('tribe_id', tribeIds).range(from, to)
  )
  if (users.error) errors.push(`users: ${users.error}`)
  tally('users', users.rows.map((r) => r.tribe_id))

  const badges = await fetchAllRows<{ tribe_id: string | null }>((from, to) =>
    supabase.from('badges').select('tribe_id').in('tribe_id', tribeIds).range(from, to)
  )
  if (badges.error) errors.push(`badges: ${badges.error}`)
  tally('badges', badges.rows.map((r) => r.tribe_id))

  const itemBooks = await fetchAllRows<{ tribe_id: string | null }>((from, to) =>
    supabase.from('item_books').select('tribe_id').in('tribe_id', tribeIds).range(from, to)
  )
  if (itemBooks.error) errors.push(`item_books: ${itemBooks.error}`)
  tally('item_books', itemBooks.rows.map((r) => r.tribe_id))

  const allowedTribes = await fetchAllRows<{ tribe_id: string }>((from, to) =>
    supabase.from('mission_allowed_tribes').select('tribe_id').in('tribe_id', tribeIds).range(from, to)
  )
  if (allowedTribes.error) errors.push(`mission_allowed_tribes: ${allowedTribes.error}`)
  tally('mission_allowed_tribes', allowedTribes.rows.map((r) => r.tribe_id))

  return { counts, error: errors.length > 0 ? errors.join(' / ') : null }
}
