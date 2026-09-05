/**
 * 배지를 가리키는 «모든» 참조를 한 곳에서 센다 (티켓 20260905_0034)
 *
 * ## 왜 필요한가
 * 단건 하드 삭제 가드(`api/admin/badges/[id]/route.ts`)가 6곳만 세고 있었다. 빠진 참조 중
 * `point_transactions.source_badge_id`는 **ON DELETE NO ACTION FK**라, 사전 체크를 통과한 뒤
 * `DELETE`가 FK 위반으로 실패하고 **raw Postgres 에러 문자열이 500으로 그대로 노출**된다.
 * 나머지(미션 보상·미션 게이트·투데이 카드·레시피 재료)는 FK가 아닌 uuid[] / 느슨한 참조라
 * 삭제는 되지만 **끊어진 id가 콘텐츠에 남는다.**
 *
 * 그래서 참조 카운트를 이 파일 하나로 모으고, 단건 삭제 가드와 일괄 도구가 **같은 함수**를
 * 부른다 — 한쪽만 고쳐지는 일이 없도록.
 *
 * ## 조회 방식 두 가지
 * - **큰 테이블**(획득 이력·인벤토리·드랍·포인트 원장·지점): `count: 'exact', head: true`로
 *   건수만 센다. id 목록은 **80개씩 쪼개서** 넘긴다 — 207종·550종을 한 번에 `.in()`에 넣으면
 *   URL이 수 KB가 되어 잘린다(티켓 20260825_035와 같은 함정).
 * - **작은 테이블**(투데이 카드·미션·레시피·컬렉션): 페이지를 끝까지 넘겨 **행을 통째로**
 *   가져와 메모리에서 판정한다. uuid[] 컬럼은 건수만으로는 «어느 행이 가리키는지»를 알 수
 *   없는데, 참조 정리(개별 해제)는 그 행 목록이 있어야 한다.
 *
 * ## fail-closed
 * 조회가 하나라도 실패하면 `error`를 채워 돌려준다. 부분 카운트로 «참조 0건»이라 판정하면
 * CASCADE 참조(체크인 획득 이력·아이템북 슬롯)가 조용히 함께 지워진다 — 하드 삭제 가드가
 * 막으려던 사고 그 자체다.
 */
import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

/** `.in()` 한 번에 넣는 id 개수. 80 × uuid 37자 ≈ 3KB — URL 상한에 여유가 있다 */
const ID_CHUNK = 80

/** 작은 테이블 전량 조회 페이지 크기(PostgREST 기본 응답 상한과 같다) */
const PAGE_SIZE = 1000

/** 참조의 성격 — 화면이 묶어서 보여주는 단위 */
export type BadgeReferenceGroup = 'earn' | 'ledger' | 'content'

export const BADGE_REFERENCE_GROUP_LABEL: Record<BadgeReferenceGroup, string> = {
  earn: '유저 획득·보유 이력',
  ledger: '포인트 원장',
  content: '콘텐츠 연결',
}

export type BadgeReferenceKey =
  | 'user_activity_badges'
  | 'user_checkin_badge_earns'
  | 'inventory_items'
  | 'poi_drops'
  | 'user_item_book_slots'
  | 'point_transactions'
  | 'poi'
  | 'missions_gated'
  | 'missions_reward'
  | 'today_cards'
  | 'recipes_ingredient'
  | 'recipes_result'
  | 'recipes_required'
  | 'item_books_required'
  | 'item_books_reward'

export interface BadgeReferenceSource {
  key: BadgeReferenceKey
  group: BadgeReferenceGroup
  /** 화면 표기 */
  label: string
  /** 실제 위치 — 어드민이 어디를 고쳐야 하는지 알 수 있게 그대로 보여준다 */
  location: string
  /**
   * 이 참조가 남아 있으면 `badges` 행 DELETE가 **FK 위반으로 실패**한다
   * (ON DELETE NO ACTION). 하드 삭제를 막아야 하는 자리.
   */
  blocksDelete: boolean
  /**
   * ON DELETE CASCADE — 하드 삭제하면 **유저 기록이 조용히 함께 사라진다.**
   * 실패하지 않기 때문에 오히려 더 위험하다.
   */
  cascades: boolean
  /** 일괄 도구의 «참조 정리»로 개별 해제할 수 있는 자리인가 */
  detachable: boolean
}

/**
 * 배지를 가리키는 자리 전부. FK 규칙은 마이그레이션 실측이다
 * (001·011·017·030·053·056·061·080·101).
 *
 * ⚠️ `combination_recipes.ingredient_badge_ids`를 «해제 가능»으로 두지 않는다 — 재료는
 * 2~3개 조합이 곧 레시피의 정체성이라, 한 개만 빼면 다른 레시피가 된다. 목록으로 보여주고
 * 레시피 화면에서 고치게 한다.
 */
export const BADGE_REFERENCE_SOURCES: BadgeReferenceSource[] = [
  {
    key: 'user_activity_badges',
    group: 'earn',
    label: '활동 배지 획득 이력',
    location: 'user_activity_badges.badge_id',
    blocksDelete: true,
    cascades: false,
    detachable: false,
  },
  {
    key: 'user_checkin_badge_earns',
    group: 'earn',
    label: '체크인 배지 획득 이력',
    location: 'user_checkin_badge_earns.badge_id',
    blocksDelete: false,
    cascades: true,
    detachable: false,
  },
  {
    key: 'inventory_items',
    group: 'earn',
    label: '아이템 개체(인벤토리)',
    location: 'inventory_items.badge_id',
    blocksDelete: true,
    cascades: false,
    detachable: false,
  },
  {
    key: 'poi_drops',
    group: 'earn',
    label: '월드 드랍',
    location: 'poi_drops.badge_id',
    blocksDelete: true,
    cascades: false,
    detachable: false,
  },
  {
    key: 'user_item_book_slots',
    group: 'earn',
    label: '컬렉션 슬롯 진행',
    location: 'user_item_book_slots.badge_id',
    blocksDelete: false,
    cascades: true,
    detachable: false,
  },
  {
    key: 'point_transactions',
    group: 'ledger',
    label: '포인트 지급 원장',
    location: 'point_transactions.source_badge_id',
    blocksDelete: true,
    cascades: false,
    detachable: false,
  },
  {
    key: 'poi',
    group: 'content',
    label: '지점 연결',
    location: 'poi.linked_badge_id',
    blocksDelete: true,
    cascades: false,
    detachable: false,
  },
  {
    key: 'missions_gated',
    group: 'content',
    label: '미션 게이트 배지',
    location: 'missions.gated_badge_id',
    blocksDelete: false,
    cascades: false,
    detachable: true,
  },
  {
    key: 'missions_reward',
    group: 'content',
    label: '미션 보상 배지',
    location: 'missions.reward_badge_ids',
    blocksDelete: false,
    cascades: false,
    detachable: true,
  },
  {
    key: 'today_cards',
    group: 'content',
    label: '투데이 카드',
    location: 'today_cards.badge_ids',
    blocksDelete: false,
    cascades: false,
    detachable: true,
  },
  {
    key: 'recipes_ingredient',
    group: 'content',
    label: '믹스 레시피 재료',
    location: 'combination_recipes.ingredient_badge_ids',
    blocksDelete: false,
    cascades: false,
    detachable: false,
  },
  {
    key: 'recipes_result',
    group: 'content',
    label: '믹스 레시피 결과',
    location: 'combination_recipes.result_badge_id',
    blocksDelete: false,
    cascades: false,
    detachable: false,
  },
  {
    key: 'recipes_required',
    group: 'content',
    label: '믹스 레시피 보유 조건',
    location: 'combination_recipes.required_activity_badge_id',
    blocksDelete: true,
    cascades: false,
    detachable: false,
  },
  {
    key: 'item_books_required',
    group: 'content',
    label: '컬렉션 보유 조건',
    location: 'item_books.required_activity_badge_id',
    blocksDelete: false,
    cascades: false,
    detachable: false,
  },
  {
    key: 'item_books_reward',
    group: 'content',
    label: '컬렉션 완성 보상',
    location: 'item_books.reward_badge_id',
    blocksDelete: false,
    cascades: false,
    detachable: false,
  },
]

export const BADGE_REFERENCE_SOURCE_BY_KEY = new Map(BADGE_REFERENCE_SOURCES.map((s) => [s.key, s]))

/** 참조 정리 화면이 「개별 해제」로 다룰 수 있는 행 하나 */
export interface BadgeReferenceRowRef {
  sourceKey: BadgeReferenceKey
  rowId: string
  /** 사람이 알아볼 이름(미션 제목·카드 제목 등) */
  label: string
  /** 이 행이 가리키는 «대상» 배지 id들 */
  badgeIds: string[]
}

export interface BadgeReferenceReport {
  /** 참조 자리별 건수 — 값이 0인 자리도 키는 존재한다 */
  counts: Record<BadgeReferenceKey, number>
  /** 유저 획득·보유 이력 합계 */
  earnTotal: number
  /** 포인트 원장 합계 */
  ledgerTotal: number
  /** 콘텐츠 연결 합계 */
  contentTotal: number
  /** 하드 삭제를 FK 위반으로 실패시키는 참조 합계 */
  blockingTotal: number
  /** 하드 삭제 시 조용히 함께 지워지는 유저 기록 합계 */
  cascadeTotal: number
  /** 전체 합계 */
  total: number
  /** 개별 해제 가능한 행 목록 (참조 정리용) */
  rows: BadgeReferenceRowRef[]
  /** 조회 실패 메시지. 값이 있으면 **어떤 실행도 하면 안 된다**(부분 카운트) */
  error: string | null
}

function emptyCounts(): Record<BadgeReferenceKey, number> {
  const counts = {} as Record<BadgeReferenceKey, number>
  for (const source of BADGE_REFERENCE_SOURCES) counts[source.key] = 0
  return counts
}

/** id 목록을 URL 안전 크기로 쪼갠다 — 일괄 update/delete도 같은 크기를 쓴다 */
export function chunkBadgeIds(ids: string[], size = ID_CHUNK): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size))
  return chunks
}

type CountResult = PromiseLike<{ count: number | null; error: { message: string } | null }>

async function countChunked(ids: string[], run: (chunk: string[]) => CountResult) {
  let total = 0
  for (const chunk of chunkBadgeIds(ids)) {
    const { count, error } = await run(chunk)
    if (error) return { count: total, error: error.message }
    total += count ?? 0
  }
  return { count: total, error: null as string | null }
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function fetchAllRows<T>(run: (from: number, to: number) => PageResult<T>) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1)
    if (error) return { rows, error: error.message }
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return { rows, error: null as string | null }
}

/**
 * 대상 배지 집합을 가리키는 참조를 전부 센다. **아무것도 쓰지 않는다.**
 *
 * 단건 하드 삭제 가드는 `[id]`로, 일괄 도구는 전체 대상 목록으로 같은 함수를 부른다.
 */
export async function collectBadgeReferences(
  supabase: ServiceClient,
  badgeIds: string[]
): Promise<BadgeReferenceReport> {
  const counts = emptyCounts()
  const rows: BadgeReferenceRowRef[] = []
  const errors: string[] = []

  if (badgeIds.length === 0) {
    return {
      counts,
      earnTotal: 0,
      ledgerTotal: 0,
      contentTotal: 0,
      blockingTotal: 0,
      cascadeTotal: 0,
      total: 0,
      rows,
      error: null,
    }
  }

  const targetSet = new Set(badgeIds)
  const hits = (ids: (string | null)[]) => ids.filter((id): id is string => !!id && targetSet.has(id))

  // ── 큰 테이블: 건수만 센다 ────────────────────────────────────────────────
  const scalarCounters: { key: BadgeReferenceKey; run: (chunk: string[]) => CountResult }[] = [
    {
      key: 'user_activity_badges',
      run: (chunk) =>
        supabase.from('user_activity_badges').select('*', { count: 'exact', head: true }).in('badge_id', chunk),
    },
    {
      key: 'user_checkin_badge_earns',
      run: (chunk) =>
        supabase.from('user_checkin_badge_earns').select('*', { count: 'exact', head: true }).in('badge_id', chunk),
    },
    {
      key: 'inventory_items',
      run: (chunk) =>
        supabase.from('inventory_items').select('*', { count: 'exact', head: true }).in('badge_id', chunk),
    },
    {
      key: 'poi_drops',
      run: (chunk) => supabase.from('poi_drops').select('*', { count: 'exact', head: true }).in('badge_id', chunk),
    },
    {
      key: 'user_item_book_slots',
      run: (chunk) =>
        supabase.from('user_item_book_slots').select('*', { count: 'exact', head: true }).in('badge_id', chunk),
    },
    {
      key: 'point_transactions',
      run: (chunk) =>
        supabase.from('point_transactions').select('*', { count: 'exact', head: true }).in('source_badge_id', chunk),
    },
    {
      key: 'poi',
      run: (chunk) => supabase.from('poi').select('*', { count: 'exact', head: true }).in('linked_badge_id', chunk),
    },
  ]

  for (const counter of scalarCounters) {
    const { count, error } = await countChunked(badgeIds, counter.run)
    counts[counter.key] = count
    if (error) errors.push(`${counter.key}: ${error}`)
  }

  // ── 작은 테이블: 행을 통째로 가져와 메모리에서 판정 ─────────────────────────
  const missionsResult = await fetchAllRows<{
    id: string
    title: string
    reward_badge_ids: string[] | null
    gated_badge_id: string | null
  }>((from, to) =>
    supabase.from('missions').select('id, title, reward_badge_ids, gated_badge_id').order('id').range(from, to)
  )
  if (missionsResult.error) errors.push(`missions: ${missionsResult.error}`)
  for (const mission of missionsResult.rows) {
    const rewardHits = hits(mission.reward_badge_ids ?? [])
    if (rewardHits.length > 0) {
      counts.missions_reward += 1
      rows.push({ sourceKey: 'missions_reward', rowId: mission.id, label: mission.title, badgeIds: rewardHits })
    }
    if (mission.gated_badge_id && targetSet.has(mission.gated_badge_id)) {
      counts.missions_gated += 1
      rows.push({
        sourceKey: 'missions_gated',
        rowId: mission.id,
        label: mission.title,
        badgeIds: [mission.gated_badge_id],
      })
    }
  }

  const cardsResult = await fetchAllRows<{ id: string; title: string; badge_ids: string[] | null }>((from, to) =>
    supabase.from('today_cards').select('id, title, badge_ids').order('id').range(from, to)
  )
  if (cardsResult.error) errors.push(`today_cards: ${cardsResult.error}`)
  for (const card of cardsResult.rows) {
    const cardHits = hits(card.badge_ids ?? [])
    if (cardHits.length > 0) {
      counts.today_cards += 1
      rows.push({ sourceKey: 'today_cards', rowId: card.id, label: card.title, badgeIds: cardHits })
    }
  }

  const recipesResult = await fetchAllRows<{
    id: string
    ingredient_badge_ids: string[] | null
    result_badge_id: string | null
    required_activity_badge_id: string | null
  }>((from, to) =>
    supabase
      .from('combination_recipes')
      .select('id, ingredient_badge_ids, result_badge_id, required_activity_badge_id')
      .order('id')
      .range(from, to)
  )
  if (recipesResult.error) errors.push(`combination_recipes: ${recipesResult.error}`)
  for (const recipe of recipesResult.rows) {
    if (hits(recipe.ingredient_badge_ids ?? []).length > 0) counts.recipes_ingredient += 1
    if (recipe.result_badge_id && targetSet.has(recipe.result_badge_id)) counts.recipes_result += 1
    if (recipe.required_activity_badge_id && targetSet.has(recipe.required_activity_badge_id)) {
      counts.recipes_required += 1
    }
  }

  const itemBooksResult = await fetchAllRows<{
    id: string
    name: string
    required_activity_badge_id: string | null
    reward_badge_id: string | null
  }>((from, to) =>
    supabase
      .from('item_books')
      .select('id, name, required_activity_badge_id, reward_badge_id')
      .order('id')
      .range(from, to)
  )
  if (itemBooksResult.error) errors.push(`item_books: ${itemBooksResult.error}`)
  for (const book of itemBooksResult.rows) {
    if (book.required_activity_badge_id && targetSet.has(book.required_activity_badge_id)) {
      counts.item_books_required += 1
    }
    if (book.reward_badge_id && targetSet.has(book.reward_badge_id)) counts.item_books_reward += 1
  }

  let earnTotal = 0
  let ledgerTotal = 0
  let contentTotal = 0
  let blockingTotal = 0
  let cascadeTotal = 0
  for (const source of BADGE_REFERENCE_SOURCES) {
    const value = counts[source.key]
    if (source.group === 'earn') earnTotal += value
    else if (source.group === 'ledger') ledgerTotal += value
    else contentTotal += value
    if (source.blocksDelete) blockingTotal += value
    if (source.cascades) cascadeTotal += value
  }

  return {
    counts,
    earnTotal,
    ledgerTotal,
    contentTotal,
    blockingTotal,
    cascadeTotal,
    total: earnTotal + ledgerTotal + contentTotal,
    rows,
    error: errors.length > 0 ? errors.join(' / ') : null,
  }
}
