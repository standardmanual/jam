/**
 * 미션 양식이 «기록으로 세는 조건»의 장소 카테고리 선택 칸을 그리려고 읽는 장소 카테고리 (티켓 20261021_1114 2회)
 *
 * 새 미션·수정 화면이 같이 쓴다. 배지 양식이 `poi_categories`를 읽어 같은 선택 칸을 채우는 것과 같은 원천이다.
 * 읽지 못하면 던진다 — 선택지가 비어 보이는 채로 양식이 열리면 운영자가 카테고리를 고를 수 없는데 이유도 알 수 없다.
 * 던지면 `admin/error.tsx`(다시 시도)가 받는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { throwOnQueryError } from '@/lib/admin/queryError'
import type { MissionFormPoiCategory } from './missionFormRules'

type ServiceClient = ReturnType<typeof createServiceClient>

export async function loadMissionFormPoiCategories(supabase: ServiceClient): Promise<MissionFormPoiCategory[]> {
  const { data, error } = await supabase.from('poi_categories').select('slug, label').order('label')
  throwOnQueryError(error, 'missions/form-poi-categories')
  return (data ?? []).map((row) => ({ slug: row.slug, label: row.label }))
}
