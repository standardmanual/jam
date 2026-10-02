/**
 * 미션 등록 전 DB 검사(티켓 20261002_0827) — `scripts/asset-generator/registerMissionFlow.mjs`의 `runMissionDbChecks`를 옮겼다.
 * 동작·라벨·오류 문장·질의 순서는 그대로다. 스크립트는 같은 이름의 얇은 JS 래퍼로 이 함수를 부른다.
 */
import { createCheckCollector } from './shared'
import type { RegisterChecksClient, RegisterDbCheckResult } from './shared'

/** 검사가 읽는 미션 필드(`validateMissionBundle`이 돌려준 정규화된 묶음의 `mission`). */
export interface MissionDbCheckInput {
  title: string
  mission_type?: string | null
  reward_badge_ids?: string[] | null
  condition_json?: Record<string, unknown> | null
}

/**
 * DB를 읽어야 알 수 있는 검사를 돌린다(읽기 전용). `supabase`가 null이면 «건너뜀»으로 표시한다.
 * 반환: `{ checks: [{ label, status, detail }], errors: string[] }` — status는 통과·실패·건너뜀·해당 없음.
 */
export async function runMissionDbChecks({
  supabase,
  mission,
}: {
  supabase: RegisterChecksClient | null | undefined
  mission: MissionDbCheckInput
}): Promise<RegisterDbCheckResult> {
  const { checks, errors, add } = createCheckCollector(supabase)

  await add('제목 중복', true, async (client) => {
    const { data, error } = await client.from('missions').select('id').eq('title', mission.title).limit(1)
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    if (data && data.length > 0) {
      return `같은 제목의 미션이 이미 있어요(id: ${data[0].id}). 기존 미션 갱신은 이 스크립트 범위 밖이라 중복으로 거절해요.`
    }
    return null
  })

  const rewardBadgeIds = mission.reward_badge_ids ?? []
  await add('보상 배지 존재', rewardBadgeIds.length > 0, async (client) => {
    const { data, error } = await client.from('badges').select('id').in('id', rewardBadgeIds).is('deleted_at', null)
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    const found = new Set((data ?? []).map((row) => String(row.id).toLowerCase()))
    const missing = rewardBadgeIds.filter((id) => !found.has(id.toLowerCase()))
    return missing.length === 0 ? null : `reward_badge_ids에 해당하는 배지가 없거나 삭제됐어요: ${missing.join(', ')}`
  })

  // 조건 값 검증(`checkMissionConditionValue`)은 UUID 형식만 본다 — 실제 행이 있는지는 DB를 읽어야 안다.
  // 없는 배지·지점을 가리키면 그 미션은 영원히 달성되지 않는다(티켓 20260905_1327).
  const conditionBadgeId = mission.mission_type === 'item_collect' ? mission.condition_json?.badge_id : null
  await add('조건 배지 존재', typeof conditionBadgeId === 'string', async (client) => {
    const { data, error } = await client.from('badges').select('id').eq('id', conditionBadgeId).is('deleted_at', null).maybeSingle()
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    return data ? null : `condition_json.badge_id에 해당하는 배지가 없거나 삭제됐어요: ${conditionBadgeId}`
  })

  const conditionPoiId = mission.mission_type === 'checkin' ? mission.condition_json?.poi_id : null
  await add('조건 지점 존재', typeof conditionPoiId === 'string', async (client) => {
    const { data, error } = await client.from('poi').select('id').eq('id', conditionPoiId).maybeSingle()
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    return data ? null : `condition_json.poi_id에 해당하는 지점이 없어요: ${conditionPoiId}`
  })

  return { checks, errors }
}
