/**
 * 장소 읽기 API의 입력 읽기 (티켓 20261102_1602). 저장하지 않는다.
 *
 * 읽는 칸: `poi_categories`(slug·label), `poi`(id·name·category·linked_badge_id·is_active·pending_review·sido·gu — 지역 칸은 마이그레이션 313 이후, 티켓 20261102_2254), `poi_drops`(id·poi_id·picked_up_at).
 * 좌표·주소·네이버 칸, 드랍한 유저·주운 유저 칸은 select 목록에 없다. 2,000곳이 넘어 모든 읽기는 `fetchAllRows`(1,000행 쪽 읽기)를 거친다.
 *
 * 원천 하나라도 읽지 못하면 던진다. 읽지 못한 표를 빈 목록으로 바꾸면 드랍이 0건으로, 장소가 없는 것으로 보이기 때문이다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/db/fetchAllRows'
import type { PlaceCategoryInput, PlaceDropInput, PlaceInput, PlaceInputs } from './types'

type ServiceClient = ReturnType<typeof createServiceClient>

export const PLACES_LOAD_FAILED_MESSAGE = '장소 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'

export async function loadPlaceInputs(supabase: ServiceClient): Promise<PlaceInputs> {
  const [categories, places, drops] = await Promise.all([
    fetchAllRows<PlaceCategoryInput>('ops-places:categories', 'slug', () =>
      supabase.from('poi_categories').select('slug, label')
    ),
    fetchAllRows<PlaceInput>('ops-places:poi', 'id', () =>
      supabase.from('poi').select('id, name, category, linked_badge_id, is_active, pending_review, sido, gu')
    ),
    fetchAllRows<PlaceDropInput & { id: string }>('ops-places:poi-drops', 'id', () =>
      supabase.from('poi_drops').select('id, poi_id, picked_up_at')
    ),
  ])
  return { categories, places, drops }
}
