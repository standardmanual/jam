/**
 * 랭킹 모드에 연결할 수 없는 미션 — 기간 동안 모은 잼(`jam_period_earned`)이 든 미션 (서버 전용, 티켓 20261019_1445 3-B)
 *
 * 이 키가 든 미션의 순위 진행값은 모은 잼의 양이다. 홈 투데이 랭킹 보드는 홈 방문자 전원에게 보이므로 그 양이 드러나지 않게
 * 읽는 쪽(`lib/ranking/rankingDataSource.ts`)이 순위를 빈 결과로 돌려준다. 여기서는 쓰는 쪽을 맞춘다:
 * (1) 랭킹 모드 저장(POST·PATCH)이 그런 미션 연결을 거절하고, (2) 생성·수정 화면의 미션 선택 목록에서 그런 미션을 뺀다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasPeriodEarnedKey } from '@/lib/missions/condition-keys'

/** 저장 거절 문구 — [현상] → [원인] → [해결책] */
export const PERIOD_EARNED_RANKING_ERROR =
  '이 미션은 랭킹 규칙에 연결할 수 없어요. ' +
  '조건에 «기간 동안 모은 잼»이 들어 있는 미션은 모은 양이 홈을 보는 모두에게 드러나지 않게 홈 랭킹 보드가 순위를 비워 두기 때문이에요. ' +
  '다른 랭킹형 미션을 고르거나, 이 미션의 순위는 미션 상세 화면에서 확인해 주세요.'

/** 미션 조건을 읽지 못해 저장을 멈출 때의 문구 — 읽지 못한 채 저장하면 막아야 할 미션이 새기 때문이다(fail-closed) */
export const PERIOD_EARNED_CHECK_FAILED_ERROR =
  '저장하지 못했어요. 연결할 미션의 조건을 확인하지 못했어요. 잠시 뒤 다시 시도해도 같으면 개발자에게 전달해 주세요.'

/** 이 미션이 기간 동안 모은 잼 미션인가. 없는 미션은 false(연결 자체는 DB가 거절한다). 읽지 못하면 던진다 */
export async function isPeriodEarnedMission(supabase: SupabaseClient, missionId: string): Promise<boolean> {
  const { data, error } = await supabase.from('missions').select('condition_json').eq('id', missionId).maybeSingle()
  if (error) throw new Error(`missions.condition_json 조회 실패: ${error.message}`)
  return hasPeriodEarnedKey((data as { condition_json: unknown } | null)?.condition_json)
}

/**
 * 저장 본문이 기간 동안 모은 잼 미션을 랭킹 모드에 연결하려는지 검사한다.
 * 본문에 연결할 미션 id가 없으면(수동 지정 유저 모드, 미션을 건드리지 않는 수정) 읽지 않는다.
 *
 * @returns 거절할 사유(문구). 연결해도 되면 null. 읽지 못하면 던진다
 */
export async function rankingModeMissionRejection(
  supabase: SupabaseClient,
  body: { target_mission_id?: string | null },
): Promise<string | null> {
  const missionId = body.target_mission_id
  if (typeof missionId !== 'string' || missionId === '') return null
  return (await isPeriodEarnedMission(supabase, missionId)) ? PERIOD_EARNED_RANKING_ERROR : null
}

export interface RankingMissionOption {
  id: string
  title: string
}

/**
 * 랭킹 모드 생성·수정 화면의 미션 선택 목록 — 랭킹형 미션 가운데 기간 동안 모은 잼 미션을 뺀 것(제목순).
 * 랭킹형이 아닌 미션은 SQL 필터로 이미 빠진다(User Story 2).
 */
export async function fetchRankingMissionOptions(supabase: SupabaseClient): Promise<RankingMissionOption[]> {
  const { data } = await supabase
    .from('missions')
    .select('id, title, condition_json')
    .eq('status_display_type', 'ranking')
    .order('title')
  return ((data ?? []) as { id: string; title: string; condition_json: unknown }[])
    .filter((m) => !hasPeriodEarnedKey(m.condition_json))
    .map((m) => ({ id: m.id, title: m.title }))
}
