/**
 * 컬렉션별 아이템 얻을 길 계산의 입력 읽기 (티켓 20261004_1641, 상위 20260930_1503 ⑦b, 운영툴 PRD §11.11).
 *
 * `GET /api/admin/item-paths`가 요청마다 부른다. 계산은 ⑦a `compute.ts`가 하고, 이 파일은 계산에 필요한 행만 읽어 입력 모양으로 돌려준다.
 * 저장하지 않는다. 서비스 클라이언트를 인자로 받는다(테스트는 가짜를 넘긴다).
 *
 * ## 무엇을 읽나
 *
 * | 표 | 범위 | 비고 |
 * |---|---|---|
 * | `item_books` | **공개된 것 전부**(활성이고 시작 시각이 지난 것). 기간이 끝난 컬렉션도 싣는다 | `applyLaunchedItemBookFilter`. 비활성·공개 전은 읽지 않는다(드랍 길 판정이 아니라 읽기 범위다) |
 * | `badges` | `type = 'item'`이고 삭제되지 않은 것 중 위 컬렉션에 속한 것 | 활성 아이템만 3,600개가 넘어 1,000행 쪽 읽기가 꼭 필요하다 |
 * | `combination_recipes` | 전부 | 공개 중인지는 계산 함수가 가른다 |
 * | `missions` | 전부 | 노출·진행 중인지는 계산 함수가 가른다 |
 *
 * ## 하나라도 읽지 못하면 던진다
 *
 * 읽지 못한 표를 빈 목록으로 두면 그 표에서 오던 길이 조용히 「닫힘」으로 바뀌어 아이템이 막힘으로 보인다. 그래서 어느 표든 오류가 나면 부분 결과 없이
 * 예외를 던지고, 라우트가 서버 로그를 남기고 고정 문장 500으로 받는다. 모든 읽기는 `fetchAllRows`(안정 정렬 + 끝까지 쪽 읽기)를 거친다.
 *
 * ## 동기화·캡슐·등급 올리기 길에 더한 칸 (티켓 20261022_1136 2회)
 *
 * 컬렉션은 `tribe_id`(그 길이 푸는 트라이브), 아이템은 `rarity`(등급)·`always_locked`·`unlock_required`(잠긴 채 받는 모습)를 더 읽는다. 컬렉션의 `drop_excluded`·기간과
 * 아이템의 `drop_excluded`·기간은 원래 읽던 칸이다. 정책 표(잠김 최소값·확률)는 읽지 않는다.
 *
 * 관리자 ID(`updated_by` 등)는 select 목록에 없다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchAllRowsIn } from '@/lib/db/fetchAllRows'
import { applyLaunchedItemBookFilter } from '@/lib/itembook/visibility'
import type { MissionExposureMode } from '@/types/database'
import type {
  ComputeItemPathsInput,
  ItemPathCollectionInput,
  ItemPathItemInput,
  ItemPathRecipeInput,
} from './types'

type ServiceClient = ReturnType<typeof createServiceClient>

export const ITEM_PATH_LOAD_FAILED_MESSAGE = '아이템 얻을 길을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'

/** `computeItemPaths`에 넘길 입력에서 「지금」을 뺀 것 — 시각은 호출하는 쪽이 정한다 */
export type ItemPathInputs = Omit<ComputeItemPathsInput, 'now'>

/** 읽는 칸 목록 */
const COLLECTION_COLUMNS = 'id, tribe_id, is_active, valid_from, valid_until, drop_excluded'
const ITEM_COLUMNS =
  'id, item_book_id, deleted_at, drop_excluded, valid_from, valid_until, rarity, always_locked, unlock_required'
const RECIPE_COLUMNS = 'id, reward_badge_ids, valid_from, valid_until'
const MISSION_COLUMNS = 'id, reward_badge_ids, starts_at, ends_at, exposure_mode, exposure_at'

interface MissionRow {
  id: string
  reward_badge_ids: string[] | null
  starts_at: string
  ends_at: string | null
  exposure_mode: string | null
  exposure_at: string | null
}

/**
 * 계산에 필요한 행을 끝까지 읽는다. 어느 표든 읽기에 실패하면 던진다(부분 결과를 돌려주지 않는다).
 * `now`는 컬렉션 공개 판정의 기준 시각이고, 같은 값을 `computeItemPaths`에 넘겨야 읽기와 계산이 어긋나지 않는다.
 */
export async function loadItemPathInputs(supabase: ServiceClient, now: Date): Promise<ItemPathInputs> {
  const nowIso = now.toISOString()

  const collections = await fetchAllRows<ItemPathCollectionInput>('item-paths:item-books', 'id', () =>
    applyLaunchedItemBookFilter(supabase.from('item_books').select(COLLECTION_COLUMNS), nowIso)
  )

  const [items, recipes, missionRows] = await Promise.all([
    fetchAllRowsIn<ItemPathItemInput, string>(
      'item-paths:item-badges',
      'id',
      collections.map((collection) => collection.id),
      (chunk) =>
        supabase.from('badges').select(ITEM_COLUMNS).eq('type', 'item').is('deleted_at', null).in('item_book_id', chunk)
    ),
    fetchAllRows<ItemPathRecipeInput>('item-paths:recipes', 'id', () =>
      supabase.from('combination_recipes').select(RECIPE_COLUMNS)
    ),
    fetchAllRows<MissionRow>('item-paths:missions', 'id', () => supabase.from('missions').select(MISSION_COLUMNS)),
  ])

  return {
    collections,
    items,
    recipes,
    missions: missionRows.map((row) => ({ ...row, exposure_mode: row.exposure_mode as MissionExposureMode | null })),
  }
}
