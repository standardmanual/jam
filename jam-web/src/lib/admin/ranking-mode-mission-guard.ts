/**
 * 랭킹 모드에 연결할 수 없는 미션 — 기간 동안 모은 잼(`jam_period_earned`)이 든 미션 (서버 전용, 티켓 20261019_1445 3-B)
 *
 * 이 키가 든 미션의 순위 진행값은 모은 잼의 양이다. 홈 투데이 랭킹 보드는 홈 방문자 전원에게 보이므로 그 양이 드러나지 않게
 * 읽는 쪽(`lib/ranking/rankingDataSource.ts`)이 순위를 빈 결과로 돌려준다. 여기서는 쓰는 쪽을 맞춘다:
 * (1) 랭킹 모드 저장(POST·PATCH)이 그런 미션 연결을 거절하고, (2) 생성·수정 화면의 미션 선택 목록에서 그런 미션을 뺀다.
 *
 * 티켓 20261019_1445 4회: (3) PATCH는 본문에 미션이 없어도 «수정 후에도 남는 기존 연결»을 검사하고, (4) 수정 화면은 지금 연결된 그런 미션을
 * «연결할 수 없는 미션»이라는 표시와 함께 목록에 남겨 선택 칸이 빈 것처럼 보이지 않게 한다(저장은 (1)이 그대로 거절한다).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasPeriodEarnedKey } from '@/lib/missions/condition-keys'

/** 저장 거절 문구 — [현상] → [원인] → [해결책] */
export const PERIOD_EARNED_RANKING_ERROR =
  '이 미션은 랭킹 규칙에 연결할 수 없어요. ' +
  '조건에 «기간 동안 모은 잼»이 들어 있는 미션은 모은 양이 홈을 보는 모두에게 드러나지 않게 홈 랭킹 보드가 순위를 비워 두기 때문이에요. ' +
  '다른 랭킹형 미션을 고르거나, 이 미션의 순위는 미션 상세 화면에서 확인해 주세요.'

/**
 * 이미 연결된 미션이 기간 동안 모은 잼 미션인 모드의 수정을 거절하는 문구 — [현상] → [원인] → [해결책].
 * 본문에 연결할 미션이 없는 수정(직접 API 호출)이 기존 연결 때문에 막힐 때 쓴다.
 */
export const PERIOD_EARNED_EXISTING_LINK_ERROR =
  '수정을 저장하지 못했어요. ' +
  '이 랭킹 규칙이 연결된 미션의 조건에 «기간 동안 모은 잼»이 들어 있어서, 모은 양이 홈을 보는 모두에게 드러나지 않게 홈 랭킹 보드가 순위를 비워 두고 있기 때문이에요. ' +
  '대상 미션을 다른 랭킹형 미션으로 바꿔 저장하거나, 쓰지 않는 규칙이면 삭제해 주세요.'

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
 *
 * - 본문에 연결할 미션 id가 있으면 그 미션을 본다(POST·PATCH 공통).
 * - 본문이 미션을 비우면(`null`·빈 문자열: 수동 지정 유저 모드 등) 읽지 않는다.
 * - 본문에 미션 칸이 아예 없고 `existingModeId`(PATCH 대상)가 있으면, 수정 뒤에도 남는 **기존 연결**을 본다: 기존 모드의 대상 방식이
 *   (본문이 바꾸지 않았다면) 미션 참가자 순위이고 연결된 미션이 기간 동안 모은 잼 미션이면 거절한다. 대상 방식을 유저 직접 지정으로 바꾸는
 *   수정은 기존 연결이 더는 쓰이지 않으므로 통과시킨다. `existingModeId`가 없는 POST는 기존 연결이 없어 읽지 않는다.
 *
 * @returns 거절할 사유(문구). 연결해도 되면 null. 읽지 못하면 던진다
 */
export async function rankingModeMissionRejection(
  supabase: SupabaseClient,
  body: { target_type?: string; target_mission_id?: string | null },
  existingModeId?: string,
): Promise<string | null> {
  const missionId = body.target_mission_id
  if (typeof missionId === 'string' && missionId !== '') {
    return (await isPeriodEarnedMission(supabase, missionId)) ? PERIOD_EARNED_RANKING_ERROR : null
  }
  if (missionId !== undefined || existingModeId === undefined) return null

  const { data, error } = await supabase
    .from('ranking_modes')
    .select('target_type, target_mission_id')
    .eq('id', existingModeId)
    .maybeSingle()
  if (error) throw new Error(`ranking_modes 조회 실패: ${error.message}`)
  const existing = data as { target_type: string; target_mission_id: string | null } | null
  // 없는 모드의 수정은 이 검사가 아니라 저장 쪽이 처리한다
  if (!existing) return null

  const effectiveTargetType = body.target_type ?? existing.target_type
  if (effectiveTargetType !== 'mission_participants') return null
  if (typeof existing.target_mission_id !== 'string' || existing.target_mission_id === '') return null
  return (await isPeriodEarnedMission(supabase, existing.target_mission_id)) ? PERIOD_EARNED_EXISTING_LINK_ERROR : null
}

export interface RankingMissionOption {
  id: string
  title: string
}

/** 수정 화면에서 지금 연결된 기간 동안 모은 잼 미션을 목록에 남길 때 제목 뒤에 붙이는 표시 */
export const PERIOD_EARNED_OPTION_SUFFIX = ' (연결할 수 없는 미션)'

/**
 * 랭킹 모드 생성·수정 화면의 미션 선택 목록 — 랭킹형 미션 가운데 기간 동안 모은 잼 미션을 뺀 것(제목순).
 * 랭킹형이 아닌 미션은 SQL 필터로 이미 빠진다(User Story 2).
 *
 * `currentMissionId`(수정 화면): 지금 이 규칙에 연결된 미션이 기간 동안 모은 잼 미션이면 목록에서 빼지 않고 제목 뒤에
 * `PERIOD_EARNED_OPTION_SUFFIX`를 붙여 남긴다. 빼면 이미 연결된 규칙을 열었을 때 선택 칸이 비어 보이는데, 저장하면 그 미션 연결이
 * 거절되기 때문이다. 이 표시는 보이게만 할 뿐이고 저장은 그대로 거절된다(`rankingModeMissionRejection`).
 */
export async function fetchRankingMissionOptions(
  supabase: SupabaseClient,
  currentMissionId?: string | null,
): Promise<RankingMissionOption[]> {
  const { data } = await supabase
    .from('missions')
    .select('id, title, condition_json')
    .eq('status_display_type', 'ranking')
    .order('title')
  const options: RankingMissionOption[] = []
  for (const m of (data ?? []) as { id: string; title: string; condition_json: unknown }[]) {
    if (!hasPeriodEarnedKey(m.condition_json)) options.push({ id: m.id, title: m.title })
    else if (m.id === currentMissionId) options.push({ id: m.id, title: `${m.title}${PERIOD_EARNED_OPTION_SUFFIX}` })
  }
  return options
}
