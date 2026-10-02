/**
 * 미션 등록 전 DB 검사(티켓 20261002_0827) — `scripts/asset-generator/registerMissionFlow.mjs`의 `runMissionDbChecks`를 옮겼다.
 * 동작·라벨·오류 문장·질의 순서는 그대로다. 스크립트는 같은 이름의 얇은 JS 래퍼로 이 함수를 부른다.
 * 운영툴 예약 등록(티켓 20261002_1944)은 `titleDuplicate: 'overlap'`을 골라 「제목 중복」을 기간이 겹칠 때만 건다. 고르지 않으면 지금까지와 같다.
 */
import { createCheckCollector } from './shared'
import type { RegisterChecksClient, RegisterDbCheckResult } from './shared'

/** 검사가 읽는 미션 필드(`validateMissionBundle`이 돌려준 정규화된 묶음의 `mission`). */
export interface MissionDbCheckInput {
  title: string
  mission_type?: string | null
  reward_badge_ids?: string[] | null
  condition_json?: Record<string, unknown> | null
  /** 공개 시각. `titleDuplicate: 'overlap'`일 때만 읽는다(티켓 20261002_1944). */
  starts_at?: string | null
  /** 종료 시각. 없으면 끝없음이다. `titleDuplicate: 'overlap'`일 때만 읽는다. */
  ends_at?: string | null
  /**
   * 「제목 중복」을 어떻게 가를지(티켓 20261002_1944, 사용자 결정 2026-10-02).
   * - 생략·`'any'`: 같은 제목의 미션이 하나라도 있으면 막는다. 등록 스크립트(`registerMissionFlow.mjs`)가 이 모드다.
   * - `'overlap'`: 같은 제목이어도 기간이 겹치는 미션이 있을 때만 막는다. 운영툴 예약 등록(`execute/mission.ts`)이 이 모드다.
   * 스크립트도 이 함수를 부르고 묶음의 `starts_at`을 함께 넘기므로, 시각이 있다는 것만으로 모드를 바꾸지 않고 호출부가 고르게 한다.
   */
  titleDuplicate?: 'any' | 'overlap'
}

/** 미션 기간 하나. 종료가 없으면 끝없음이다. */
export interface MissionPeriod {
  starts_at: string | null | undefined
  ends_at: string | null | undefined
}

/**
 * 두 미션의 기간 [공개, 종료)이 겹치는지. 종료가 없으면 끝없음이고, 한쪽의 종료 시각과 다른 쪽의 공개 시각이 같으면 겹치지 않는다.
 * 시각을 읽을 수 없으면 겹치는 것으로 본다(판단할 수 없는데 통과시키지 않는다). 순수 함수라 사전 점검(`execute/precheck.ts`)도 쓴다.
 */
export function missionPeriodsOverlap(a: MissionPeriod, b: MissionPeriod): boolean {
  const read = (value: string | null | undefined, open: number): number => {
    if (value === null || value === undefined || value === '') return open
    return Date.parse(value)
  }
  const aStart = read(a.starts_at, Number.NaN)
  const bStart = read(b.starts_at, Number.NaN)
  const aEnd = read(a.ends_at, Number.POSITIVE_INFINITY)
  const bEnd = read(b.ends_at, Number.POSITIVE_INFINITY)
  if ([aStart, bStart, aEnd, bEnd].some((ms) => Number.isNaN(ms))) return true
  return aStart < bEnd && bStart < aEnd
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
    if (mission.titleDuplicate === 'overlap') {
      // 같은 제목의 기존 미션을 모두 읽어 기간이 겹치는 것이 있을 때만 막는다. 읽은 행의 시각을 읽을 수 없으면 겹친 것으로 본다.
      const sameTitle = await client.from('missions').select('id, starts_at, ends_at').eq('title', mission.title)
      if (sameTitle.error) return `DB 조회에 실패했어요: ${sameTitle.error.message}`
      const overlapping = (sameTitle.data ?? []).find((row) =>
        missionPeriodsOverlap(
          { starts_at: mission.starts_at, ends_at: mission.ends_at },
          { starts_at: row.starts_at as string | null, ends_at: row.ends_at as string | null }
        )
      )
      return overlapping ? `같은 제목의 미션이 이미 있고 기간이 겹쳐요(id: ${overlapping.id}).` : null
    }
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
