/**
 * 미션 양식이 트라이브 체크 목록을 그리려고 읽는 트라이브 (티켓 20261019_1318 1회)
 *
 * 새 미션·수정 화면이 같이 쓴다. 읽지 못하면 던진다 — 목록이 비어 보이는 채로 양식이 열리면 트라이브 미션을 고를 수 없고,
 * 수정 화면에서는 기존 트라이브 제한이 «없음»으로 보여 저장하는 순간 풀릴 수 있다. 던지면 `admin/error.tsx`(다시 시도)가 받는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { throwOnQueryError } from '@/lib/admin/queryError'
import type { MissionFormTribe } from './missionFormRules'

type ServiceClient = ReturnType<typeof createServiceClient>

export async function loadMissionFormTribes(supabase: ServiceClient): Promise<MissionFormTribe[]> {
  const { data, error } = await supabase.from('tribes').select('id, name, is_active, sort_order')
  throwOnQueryError(error, 'missions/form-tribes')
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }))
}
