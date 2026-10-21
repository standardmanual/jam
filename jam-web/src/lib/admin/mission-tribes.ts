/**
 * 어드민 미션의 «참가할 수 있는 트라이브» 저장 규칙 (티켓 20261019_1318 1회, 운영 로직 13.2절)
 *
 * 미션에는 트라이브 칸이 없고, 참가할 수 있는 트라이브는 별도 표 `mission_allowed_tribes`에 미션마다 한 행씩 둔다
 * (마이그레이션 249). 행이 하나도 없으면 모든 유저가 하는 공통 미션이다.
 * 어드민 폼은 `scope`('common' | 'tribe')와 `allowed_tribe_ids`를 미션 본문과 함께 보내고, 두 필드는 `missions` 칸이
 * 아니므로 라우트가 본문에서 빼고 이 파일의 함수로 따로 저장한다.
 *
 * - `scope`가 본문에 없으면 트라이브를 건드리지 않는다(PATCH 부분 갱신).
 * - `common`은 허용 목록을 비운다. `tribe`는 존재하는 트라이브 id를 하나 이상 요구한다.
 * - 참가·완료 기록이 있는 미션은 접근을 줄이는 변경(공통 → 트라이브 제한, 허용 트라이브 빼기)을 거절한다 —
 *   이미 참가한 유저가 갑자기 미션을 볼 수 없게 되기 때문이다. 접근을 넓히는 변경은 허용한다.
 * - 저장은 «더할 것을 먼저 넣고, 뺄 것을 나중에 지운다». 목록을 먼저 비우면 중간에 실패했을 때 트라이브 미션이
 *   공통 미션으로 열려 버린다.
 *
 * 읽기·쓰기 실패는 던진다. 호출한 라우트가 로그를 남기고 고정 문구로 응답한다(DB 오류 원문은 응답에 싣지 않는다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { isUuid } from './uuid'

type ServiceClient = ReturnType<typeof createServiceClient>

export type MissionScope = 'common' | 'tribe'

export const MISSION_SCOPE_LABEL: Record<MissionScope, string> = {
  common: '공통 미션',
  tribe: '트라이브 미션',
}

export interface MissionTribeSelection {
  scope: MissionScope
  /** `common`이면 항상 빈 목록. `tribe`이면 중복을 없앤 1개 이상의 트라이브 id */
  tribeIds: string[]
}

export type MissionTribeParse =
  | { ok: true; selection: MissionTribeSelection | null }
  | { ok: false; error: string }

export const TRIBE_SCOPE_INVALID_MESSAGE = '미션 종류를 확인하지 못했어요. 공통 미션이나 트라이브 미션 중에서 골라 저장해 주세요.'
export const TRIBE_REQUIRED_MESSAGE =
  '트라이브 미션은 참가할 수 있는 트라이브를 하나 이상 골라야 해요. 트라이브를 고르거나 공통 미션으로 바꿔 저장해 주세요.'
export const TRIBE_IDS_INVALID_MESSAGE =
  '참가할 수 있는 트라이브 목록의 형식이 올바르지 않아요. 화면에서 트라이브를 다시 골라 저장해 주세요.'
export const TRIBE_NOT_FOUND_MESSAGE =
  '존재하지 않는 트라이브가 포함돼 있어요. 화면을 새로고침한 뒤 트라이브를 다시 골라 저장해 주세요.'
export const TRIBE_NARROWING_BLOCKED_MESSAGE =
  '참가할 수 있는 트라이브를 줄이지 못했어요. 이미 참가하거나 완료한 유저가 있어서, 줄이면 그 유저가 갑자기 미션을 볼 수 없게 돼요. 트라이브를 더하는 변경만 할 수 있어요. 줄이려면 종료일을 지난 날짜로 바꿔 노출을 막고 새 미션을 만들어 주세요.'
export const TRIBE_SAVE_PARTIAL_MESSAGE =
  '미션 내용은 저장했지만 참가할 수 있는 트라이브를 바꾸지 못했어요. 서버에서 저장 중 오류가 났어요. 같은 내용으로 다시 저장해 주세요.'
export const TRIBE_CREATE_CLEANUP_FAILED_MESSAGE =
  '참가할 수 있는 트라이브를 저장하지 못했고, 방금 만든 미션도 지우지 못했어요. 이 미션이 모두에게 열린 공통 미션으로 남아 있을 수 있어요. 미션 목록에서 확인해 지워 주세요.'

/**
 * 본문의 `scope`·`allowed_tribe_ids`를 읽어 검증한다. `scope`가 본문에 없으면 `selection: null`(건드리지 않음)이다.
 * DB를 읽지 않는 검사만 한다 — 트라이브가 실제로 있는지는 `findMissingTribeIds`가 확인한다.
 */
export function parseMissionTribeSelection(body: Record<string, unknown>): MissionTribeParse {
  const scope = body.scope
  if (scope === undefined) return { ok: true, selection: null }
  if (scope !== 'common' && scope !== 'tribe') return { ok: false, error: TRIBE_SCOPE_INVALID_MESSAGE }

  // 공통 미션은 허용 목록을 비운다 — 같이 온 목록은 무시한다.
  if (scope === 'common') return { ok: true, selection: { scope, tribeIds: [] } }

  const raw = body.allowed_tribe_ids
  if (raw === undefined || raw === null) return { ok: false, error: TRIBE_REQUIRED_MESSAGE }
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string' || !isUuid(id))) {
    return { ok: false, error: TRIBE_IDS_INVALID_MESSAGE }
  }
  const tribeIds = [...new Set(raw as string[])]
  if (tribeIds.length === 0) return { ok: false, error: TRIBE_REQUIRED_MESSAGE }
  return { ok: true, selection: { scope, tribeIds } }
}

/** `tribes`에 없는 id를 돌려준다(없으면 빈 목록). 읽지 못하면 던진다. */
export async function findMissingTribeIds(supabase: ServiceClient, tribeIds: string[]): Promise<string[]> {
  if (tribeIds.length === 0) return []
  const { data, error } = await supabase.from('tribes').select('id').in('id', tribeIds)
  if (error) throw new Error(`tribes 조회 실패: ${error.message}`)
  const found = new Set((data ?? []).map((row) => row.id))
  return tribeIds.filter((id) => !found.has(id))
}

/** 미션에 참가할 수 있는 트라이브 id 목록. 빈 목록이면 공통 미션이다. 읽지 못하면 던진다. */
export async function readAllowedTribeIds(supabase: ServiceClient, missionId: string): Promise<string[]> {
  const { data, error } = await supabase.from('mission_allowed_tribes').select('tribe_id').eq('mission_id', missionId)
  if (error) throw new Error(`mission_allowed_tribes 조회 실패: ${error.message}`)
  return (data ?? []).map((row) => row.tribe_id)
}

/**
 * 접근을 줄이는 변경인가: 공통 → 트라이브 제한, 또는 허용 트라이브를 빼는 변경(바꿔치기 포함).
 * 트라이브를 더하기만 하거나 공통으로 넓히거나 그대로 두는 변경은 줄이는 변경이 아니다.
 */
export function narrowsTribeAccess(before: readonly string[], selection: MissionTribeSelection): boolean {
  if (selection.scope === 'common') return false
  if (before.length === 0) return true
  return before.some((id) => !selection.tribeIds.includes(id))
}

/** 이 미션에 참가나 완료 기록이 하나라도 있는가. 읽지 못하면 던진다. */
export async function hasParticipationOrCompletion(supabase: ServiceClient, missionId: string): Promise<boolean> {
  const participations = await supabase
    .from('user_mission_participations')
    .select('mission_id', { count: 'exact', head: true })
    .eq('mission_id', missionId)
  if (participations.error) throw new Error(`user_mission_participations 조회 실패: ${participations.error.message}`)
  if ((participations.count ?? 0) > 0) return true

  const completions = await supabase
    .from('user_mission_completions')
    .select('mission_id', { count: 'exact', head: true })
    .eq('mission_id', missionId)
  if (completions.error) throw new Error(`user_mission_completions 조회 실패: ${completions.error.message}`)
  return (completions.count ?? 0) > 0
}

export interface TribeChangePlan {
  /** 저장 전의 허용 트라이브 id. `replaceAllowedTribes`에 넘겨 다시 읽지 않게 한다 */
  before: string[]
  /** 접근을 줄이는 변경인데 참가·완료 기록이 있어 거절해야 하는가 */
  blocked: boolean
}

/** PATCH가 저장 전에 부른다: 지금 허용 목록을 읽고, 줄이는 변경이면 참가·완료 기록을 확인한다. */
export async function planTribeChange(
  supabase: ServiceClient,
  missionId: string,
  selection: MissionTribeSelection
): Promise<TribeChangePlan> {
  const before = await readAllowedTribeIds(supabase, missionId)
  if (!narrowsTribeAccess(before, selection)) return { before, blocked: false }
  return { before, blocked: await hasParticipationOrCompletion(supabase, missionId) }
}

/**
 * 허용 트라이브를 `tribeIds`와 같게 맞춘다: 없는 것을 먼저 넣고, 남는 것을 지운다. 이미 같으면 아무것도 쓰지 않는다.
 * `before`를 넘기면(PATCH가 이미 읽은 값) 다시 읽지 않는다. 새 미션은 `[]`을 넘긴다. 실패하면 던진다.
 * 넣기가 실패하면 목록이 그대로이고, 지우기가 실패하면 목록이 요청보다 넓은 채로 남는다(비어 버리지는 않는다).
 */
export async function replaceAllowedTribes(
  supabase: ServiceClient,
  missionId: string,
  tribeIds: readonly string[],
  before?: readonly string[]
): Promise<void> {
  const current = before ?? (await readAllowedTribeIds(supabase, missionId))
  const toAdd = tribeIds.filter((id) => !current.includes(id))
  const toRemove = current.filter((id) => !tribeIds.includes(id))

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('mission_allowed_tribes')
      .insert(toAdd.map((tribe_id) => ({ mission_id: missionId, tribe_id })))
    if (error) throw new Error(`mission_allowed_tribes 추가 실패: ${error.message}`)
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('mission_allowed_tribes')
      .delete()
      .eq('mission_id', missionId)
      .in('tribe_id', toRemove)
    if (error) throw new Error(`mission_allowed_tribes 삭제 실패: ${error.message}`)
  }
}
