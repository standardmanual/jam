/**
 * 챕터 오름 보상 설정 읽기 (티켓 20261127_1731 C3a)
 *
 * 추첨이 읽는 설정은 두 곳이다. 등급 확률·다른 트라이브 확률·에픽 보정 임계값은 `chapter_reward_policy`(`id = 1` 한 행),
 * 같은 등급 연속 임계값과 잠금 확률·최소값은 `jam_policy`(`lib/jam/policy.ts`의 `getJamPolicy`)다. 개수는 `chapter_definitions.reward_count`다.
 *
 * 읽지 못한 값으로 추첨하면 확률이 틀어지므로 **기본값으로 대체하지 않고 던진다**(옛 `getCapsulePolicy`와 다르다) — 보상 추첨은 다음 기회로 미룰 수 있다.
 * 클라이언트는 호출부가 넘긴다(service_role). 서버 전용이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** `chapter_reward_policy` 한 행에서 추첨이 읽는 칸 */
export interface ChapterRewardPolicy {
  /** 나온 개체마다 다른 트라이브의 것일 확률(0~1) */
  other_tribe_probability: number
  /** 등급 확률(퍼센트, 네 등급 합계 100) */
  rarity_common: number
  rarity_rare: number
  rarity_epic: number
  rarity_mystic: number
  /** 이 횟수만큼 Epic 이상이 없으면 다음 보상의 첫 개체는 Epic 이상(보정 1) */
  pity_epic_threshold: number
}

const POLICY_COLUMNS = [
  'other_tribe_probability',
  'rarity_common',
  'rarity_rare',
  'rarity_epic',
  'rarity_mystic',
  'pity_epic_threshold',
] as const satisfies readonly (keyof ChapterRewardPolicy)[]

/** NUMERIC 칸이 문자열로 내려올 수 있어 숫자로 읽는다. 읽지 못하면 NaN */
function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') return Number(v)
  return NaN
}

/**
 * `chapter_reward_policy`의 `id = 1` 한 행을 읽는다. 행이 없거나 읽지 못하거나 값이 비정상이면 던진다.
 * 비정상: 확률 칸이 0~1 밖, 등급 확률이 음수·유한하지 않음·합계가 0, 에픽 보정 임계값이 1 미만의 정수가 아님.
 */
export async function getChapterRewardPolicy(supabase: SupabaseClient): Promise<ChapterRewardPolicy> {
  const { data, error } = await supabase.from('chapter_reward_policy').select(POLICY_COLUMNS.join(', ')).eq('id', 1).maybeSingle()
  if (error) throw new Error(`chapter_reward_policy 조회 실패: ${error.message}`)
  if (!data) throw new Error('chapter_reward_policy id=1 행이 없다')

  const row = data as unknown as Record<string, unknown>
  const policy = {} as ChapterRewardPolicy
  for (const key of POLICY_COLUMNS) {
    const n = toNumber(row[key])
    if (!Number.isFinite(n)) throw new Error(`chapter_reward_policy.${key} 값을 읽지 못했다: ${String(row[key])}`)
    policy[key] = n
  }

  if (policy.other_tribe_probability < 0 || policy.other_tribe_probability > 1) {
    throw new Error(`chapter_reward_policy.other_tribe_probability가 0~1 밖이다: ${policy.other_tribe_probability}`)
  }
  const rarities = [policy.rarity_common, policy.rarity_rare, policy.rarity_epic, policy.rarity_mystic]
  if (rarities.some((r) => r < 0) || rarities.reduce((a, b) => a + b, 0) <= 0) {
    throw new Error(`chapter_reward_policy 등급 확률이 비정상이다: ${rarities.join('/')}`)
  }
  if (!Number.isInteger(policy.pity_epic_threshold) || policy.pity_epic_threshold < 1) {
    throw new Error(`chapter_reward_policy.pity_epic_threshold가 1 이상의 정수가 아니다: ${policy.pity_epic_threshold}`)
  }
  return policy
}

/**
 * 마친 챕터의 보상 개수(`chapter_definitions.reward_count`). 값이 NULL이면 «보상 없음»을 뜻하는 `null`을 돌려준다(0이 아니다).
 * 행이 없거나 읽지 못하거나 0 이하·정수가 아닌 값이면 던진다.
 */
export async function getChapterRewardCount(supabase: SupabaseClient, finishedChapterNo: number): Promise<number | null> {
  const { data, error } = await supabase
    .from('chapter_definitions')
    .select('reward_count')
    .eq('chapter_no', finishedChapterNo)
    .maybeSingle()
  if (error) throw new Error(`chapter_definitions 조회 실패: ${error.message}`)
  if (!data) throw new Error(`chapter_definitions에 챕터 ${finishedChapterNo} 행이 없다`)

  const value = (data as { reward_count?: unknown }).reward_count
  if (value === null || value === undefined) return null
  const n = toNumber(value)
  if (!Number.isInteger(n) || n < 1) throw new Error(`chapter_definitions.reward_count가 1 이상의 정수가 아니다 (챕터 ${finishedChapterNo}): ${String(value)}`)
  return n
}
