/**
 * 밸런스 서브 대시보드의 읽기 (티켓 20261022_1136 1회 a, 운영 로직 19.2절)
 *
 * 화면(서버 컴포넌트)이 요청마다 부른다. 계산은 `compute.ts`가 하고, 이 파일은 필요한 행을 끝까지 읽어 지표 6개를 만든다. 저장하지 않는다.
 * 서비스 클라이언트를 인자로 받는다(테스트는 가짜를 넘긴다). `badges`를 읽지 않아 소프트 삭제의 영향이 없다.
 *
 * ## 무엇을 읽나
 *
 * | 표 | 범위 | 쓰는 지표 |
 * |---|---|---|
 * | `users` | 어드민이 아닌 유저의 `id`, `tribe_id` | 모두 |
 * | `chapter_ups` | 전부 | 모두(챕터 1에 오른 유저와 시점별 챕터), 2(도달 시각) |
 * | `user_suspensions` | 전부 | 모두(기간과 겹치는 이용 정지 제외) |
 * | `capsule_opens` | 지표 1의 구간 시작 이후 | 1 |
 * | `item_issue_log` | 지표 3·4의 구간 시작 이후 | 3, 4 |
 * | `user_item_book_tier_completions`, `item_books` | 완성 기록 전부, 공개된 컬렉션 | 5 |
 * | `inventory` | 전부 | 6 |
 *
 * 227·232의 인덱스는 `user_id`가 앞서서 날짜 조건은 전체 읽기에 가깝다. 유저 수백 명까지는 1,000행 쪽 읽기로 충분하다(추정).
 * 그 위로 가면 읽기 전용 함수로 바꾼다(후속).
 *
 * ## 읽기 실패는 그 지표만 오류 카드로
 *
 * 표 하나를 읽지 못하면 그 표를 쓰는 지표만 `error`로 돌려주고 나머지는 계산한다. 공통으로 쓰는 표(`users`, `chapter_ups`, `user_suspensions`)를 읽지 못하면 여섯 개 모두 `error`다.
 * 읽지 못한 표를 빈 목록으로 두면 «0건»이나 «부족»으로 보여 원인이 가려지므로 부분 결과를 만들지 않는다. 원인은 서버 로그에만 남기고 화면에는 고정 문장을 쓴다.
 * 모든 읽기는 `fetchAllRows`(안정 정렬 + 끝까지 쪽 읽기)를 거친다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/db/fetchAllRows'
import { applyLaunchedItemBookFilter } from '@/lib/itembook/visibility'
import {
  buildCohort,
  capsuleWindow,
  monthlyWindow,
  rarityWindow,
  type Cohort,
} from './cohort'
import {
  computeCapsuleOpens,
  computeChapterReach,
  computeCollectionComplete,
  computeInventoryFull,
  computeMonthlyItems,
  computeRarityFeel,
} from './compute'
import type {
  BalanceDashboardData,
  BalanceMetricKey,
  CapsuleOpenRow,
  ChapterUpRow,
  InventoryRow,
  ItemBookRow,
  ItemIssueRow,
  MetricPart,
  MetricResult,
  SuspensionRow,
  TierCompletionRow,
  UserRow,
} from './types'

type ServiceClient = ReturnType<typeof createServiceClient>

export const BALANCE_DASHBOARD_LOAD_FAILED_MESSAGE = '지표를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'

/** 읽는 칸 목록. 관리자 ID(`*_by`)와 이메일은 없다 */
const USER_COLUMNS = 'id, is_admin, tribe_id'
const CHAPTER_UP_COLUMNS = 'user_id, chapter_no, reached_at'
const SUSPENSION_COLUMNS = 'user_id, suspended_at, lifted_at'
const CAPSULE_OPEN_COLUMNS = 'user_id, opened_at'
const ISSUE_COLUMNS = 'user_id, rarity, created_at'
const COMPLETION_COLUMNS = 'user_id, item_book_id, completed_at'
const ITEM_BOOK_COLUMNS = 'id, tribe_id'
const INVENTORY_COLUMNS = 'user_id, max_slots, used_slots'

type Settled<T> = { ok: true; value: T } | { ok: false }

/** 읽기 하나가 던져도 다른 읽기가 이어지게 한다. 원인은 서버 로그에만 남긴다 */
async function settle<T>(task: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await task() }
  } catch (error) {
    console.error('[balance-dashboard] 읽기 실패', error)
    return { ok: false }
  }
}

async function readCommon(supabase: ServiceClient) {
  const [users, chapterUps, suspensions] = await Promise.all([
    fetchAllRows<UserRow>('balance-dashboard:users', 'id', () =>
      supabase.from('users').select(USER_COLUMNS).eq('is_admin', false)
    ),
    fetchAllRows<ChapterUpRow>('balance-dashboard:chapter-ups', ['user_id', 'chapter_no'], () =>
      supabase.from('chapter_ups').select(CHAPTER_UP_COLUMNS)
    ),
    fetchAllRows<SuspensionRow>('balance-dashboard:suspensions', 'id', () =>
      supabase.from('user_suspensions').select(SUSPENSION_COLUMNS)
    ),
  ])
  return { users, chapterUps, suspensions }
}

function readCapsuleOpens(supabase: ServiceClient, sinceIso: string): Promise<CapsuleOpenRow[]> {
  return fetchAllRows<CapsuleOpenRow>('balance-dashboard:capsule-opens', 'id', () =>
    supabase.from('capsule_opens').select(CAPSULE_OPEN_COLUMNS).gte('opened_at', sinceIso)
  )
}

function readItemIssues(supabase: ServiceClient, sinceIso: string): Promise<ItemIssueRow[]> {
  return fetchAllRows<ItemIssueRow>('balance-dashboard:item-issues', 'id', () =>
    supabase.from('item_issue_log').select(ISSUE_COLUMNS).gte('created_at', sinceIso)
  )
}

async function readCollections(supabase: ServiceClient, nowIso: string) {
  const [completions, books] = await Promise.all([
    fetchAllRows<TierCompletionRow>(
      'balance-dashboard:tier-completions',
      ['user_id', 'item_book_id', 'tier'],
      () => supabase.from('user_item_book_tier_completions').select(COMPLETION_COLUMNS)
    ),
    fetchAllRows<ItemBookRow>('balance-dashboard:item-books', 'id', () =>
      applyLaunchedItemBookFilter(supabase.from('item_books').select(ITEM_BOOK_COLUMNS), nowIso)
    ),
  ])
  return { completions, books }
}

function readInventories(supabase: ServiceClient): Promise<InventoryRow[]> {
  return fetchAllRows<InventoryRow>('balance-dashboard:inventory', 'user_id', () =>
    supabase.from('inventory').select(INVENTORY_COLUMNS)
  )
}

/** 대상 유저가 정해졌고 이 지표의 원천도 읽었으면 계산하고, 하나라도 못 읽었으면 오류 카드로 돌려준다 */
function evaluate(key: BalanceMetricKey, cohort: Cohort | null, run: (cohort: Cohort) => MetricPart[] | null): MetricResult {
  const parts = cohort === null ? null : run(cohort)
  if (parts === null) return { key, status: 'error', message: BALANCE_DASHBOARD_LOAD_FAILED_MESSAGE }
  return { key, status: 'ok', parts }
}

/**
 * 지표 6개를 읽고 계산한다. `now`는 모든 구간의 기준 시각이다(읽기 범위와 계산이 어긋나지 않게 같은 값을 쓴다).
 * 던지지 않는다. 읽지 못한 지표는 `status: 'error'`로 돌려준다.
 */
export async function loadBalanceDashboard(supabase: ServiceClient, now: Date): Promise<BalanceDashboardData> {
  const nowIso = now.toISOString()
  const opensSince = new Date(capsuleWindow(now).start).toISOString()
  const issuesSince = new Date(Math.min(monthlyWindow(now).start, rarityWindow(now).start)).toISOString()

  const [common, opens, issues, collections, inventories] = await Promise.all([
    settle(() => readCommon(supabase)),
    settle(() => readCapsuleOpens(supabase, opensSince)),
    settle(() => readItemIssues(supabase, issuesSince)),
    settle(() => readCollections(supabase, nowIso)),
    settle(() => readInventories(supabase)),
  ])

  const cohort = common.ok ? buildCohort(common.value) : null

  return {
    generatedAt: nowIso,
    metrics: [
      evaluate('capsule_open', cohort, (c) => (opens.ok ? computeCapsuleOpens(c, opens.value, now) : null)),
      evaluate('chapter_reach', cohort, (c) => computeChapterReach(c, now)),
      evaluate('monthly_items', cohort, (c) => (issues.ok ? computeMonthlyItems(c, issues.value, now) : null)),
      evaluate('rarity_feel', cohort, (c) => (issues.ok ? computeRarityFeel(c, issues.value, now) : null)),
      evaluate('collection_complete', cohort, (c) =>
        collections.ok ? computeCollectionComplete(c, collections.value.completions, collections.value.books, now) : null
      ),
      evaluate('inventory_full', cohort, (c) => (inventories.ok ? computeInventoryFull(c, inventories.value, now) : null)),
    ],
  }
}
