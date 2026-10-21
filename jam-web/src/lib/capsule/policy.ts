/**
 * 캡슐 정책 설정 로딩 (티켓 20261018_0052 1회, 운영 로직 5.2·5.4절)
 *
 * `capsule_policy` id=1 한 행 싱글톤(마이그레이션 232)을 읽는다. 개수, 다른 트라이브 확률, 등급 확률, Epic 보정, 퀘스트 전 값이 들어 있다.
 * 챕터별 채울 양(`capsule_chapter_costs`)은 DB 함수 `capsule_get_or_create`가 읽으므로 앱은 이 행만 읽는다.
 * 2회의 열기 추첨이 이 값을 쓴다. Common 연속 보정(10번)과 잠길 확률은 동기화와 합산하는 값이라 `lib/jam/policy.ts`의 것을 쓴다.
 *
 * service_role 클라이언트 전용이고 서버에서만 쓴다. `lib/jam/policy.ts`와 같은 패턴이다: 조회가 실패하면 기본값으로 대체하고 로그를 남긴다.
 * 값이 비정상이면 그 칸만 기본값으로 대체한다. 단 등급 확률 네 칸은 합계가 100이어야 의미가 있어 묶음 단위로 대체한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'

export interface CapsulePolicy {
  /** 열 때 확정으로 나오는 개수 */
  guaranteed_count: number
  /** 확률로 더 나올 수 있는 개수 */
  bonus_count: number
  /** 보너스 개수가 나올 확률(0~1) */
  bonus_probability: number
  /** 나온 개체마다 다른 트라이브의 것일 확률(0~1) */
  other_tribe_probability: number
  /** 캡슐 등급 확률(퍼센트, 네 등급 합계 100) */
  rarity_common: number
  rarity_rare: number
  rarity_epic: number
  rarity_mystic: number
  /** 이 횟수만큼 열 동안 Epic 이상이 없으면 다음 캡슐은 Epic 이상(보정 1) */
  pity_epic_threshold: number
  /** 챕터가 없는 유저(퀘스트 전) 캡슐의 채울 양 */
  pre_quest_fill_amount: number
  /** 퀘스트 전 첫 캡슐에서 반드시 나오는 잠긴 아이템 배지를 여는 데 필요한 양 */
  pre_quest_unlock_required: number
}

/**
 * `capsule_policy` id=1 행의 **미러** — 마이그레이션 232의 기본값(운영 로직 5.2·5.4절)과 같아야 한다.
 * DB 값을 바꾸면 같은 티켓에서 이 상수도 함께 바꾼다. 한쪽만 바꾸면 폴백 경로와 정상 경로의 계산이 갈린다.
 */
export const DEFAULT_CAPSULE_POLICY: CapsulePolicy = {
  guaranteed_count: 1,
  bonus_count: 1,
  bonus_probability: 0.2,
  other_tribe_probability: 0.2,
  rarity_common: 70,
  rarity_rare: 22,
  rarity_epic: 6,
  rarity_mystic: 2,
  pity_epic_threshold: 15,
  pre_quest_fill_amount: 5,
  pre_quest_unlock_required: 5,
}

/** 등급 확률 네 칸 — 묶음 단위로 대체한다 */
const RARITY_KEYS = ['rarity_common', 'rarity_rare', 'rarity_epic', 'rarity_mystic'] as const satisfies readonly (keyof CapsulePolicy)[]

/** 등급 확률 합계 허용 오차 — DB 제약(`capsule_policy_rarity_sum_100`)과 같다 */
const RARITY_SUM_TOLERANCE = 0.001

/**
 * 칸별 값 검사 — 통과하지 못하면 그 칸만 기본값으로 대체한다.
 * 확률 안내(`lib/probability/disclosure.ts`, 티켓 20261021_1250)가 같은 검사를 쓰려고 내보낸다. 읽기 실패 때 기본값으로 대체하는 쪽은 이 파일의 `getCapsulePolicy`뿐이다.
 */
export const VALIDATORS: Record<keyof CapsulePolicy, (n: number) => boolean> = {
  guaranteed_count: (n) => Number.isInteger(n) && n >= 0,
  bonus_count: (n) => Number.isInteger(n) && n >= 0,
  bonus_probability: (n) => Number.isFinite(n) && n >= 0 && n <= 1,
  other_tribe_probability: (n) => Number.isFinite(n) && n >= 0 && n <= 1,
  rarity_common: (n) => Number.isFinite(n) && n >= 0,
  rarity_rare: (n) => Number.isFinite(n) && n >= 0,
  rarity_epic: (n) => Number.isFinite(n) && n >= 0,
  rarity_mystic: (n) => Number.isFinite(n) && n >= 0,
  pity_epic_threshold: (n) => Number.isInteger(n) && n >= 1,
  pre_quest_fill_amount: (n) => Number.isInteger(n) && n >= 1,
  pre_quest_unlock_required: (n) => Number.isInteger(n) && n >= 1,
}

const isRarityKey = (key: keyof CapsulePolicy): boolean => (RARITY_KEYS as readonly string[]).includes(key)

/**
 * 캡슐 정책을 읽는 **정식 경로**. 정규화·폴백·관측이 모두 여기에 있다.
 *
 * @param client 이미 만들어 둔 Supabase 클라이언트. 생략하면 service_role 클라이언트를 새로 만든다.
 */
export async function getCapsulePolicy(client?: SupabaseClient): Promise<CapsulePolicy> {
  try {
    const supabase = client ?? createServiceClient()
    const { data, error } = await supabase.from('capsule_policy').select('*').eq('id', 1).single()
    if (error) {
      console.error('[capsule-policy] 조회 실패 — 기본 정책으로 폴백:', error)
      return { ...DEFAULT_CAPSULE_POLICY }
    }
    if (!data) {
      console.error('[capsule-policy] id=1 행이 없음 — 기본 정책으로 폴백')
      return { ...DEFAULT_CAPSULE_POLICY }
    }

    // NUMERIC 컬럼이 문자열로 내려올 수 있어 숫자로 정규화한다
    const row = data as unknown as Record<string, unknown>
    const normalized = {} as CapsulePolicy
    const fellBack: string[] = []
    const rarityInvalid: string[] = []
    for (const key of Object.keys(DEFAULT_CAPSULE_POLICY) as (keyof CapsulePolicy)[]) {
      const v = row[key]
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
      if (Number.isNaN(n) || !VALIDATORS[key](n)) {
        normalized[key] = DEFAULT_CAPSULE_POLICY[key]
        // 등급 확률 칸은 아래에서 묶음 단위로 대체·로그를 남긴다
        if (isRarityKey(key)) rarityInvalid.push(key)
        else fellBack.push(key)
        continue
      }
      normalized[key] = n
    }

    // 등급 확률: 칸이 비정상이거나 합계가 100이 아니면 네 칸 전체를 기본값으로 대체한다
    const raritySum = normalized.rarity_common + normalized.rarity_rare + normalized.rarity_epic + normalized.rarity_mystic
    const sumMismatch = Math.abs(raritySum - 100) >= RARITY_SUM_TOLERANCE
    if (rarityInvalid.length > 0 || sumMismatch) {
      for (const key of RARITY_KEYS) normalized[key] = DEFAULT_CAPSULE_POLICY[key]
      console.error(
        rarityInvalid.length > 0
          ? `[capsule-policy] 등급 확률 칸이 비정상이라 네 칸 전체를 기본값으로 대체: ${rarityInvalid.join(', ')}`
          : `[capsule-policy] 등급 확률 합계가 100이 아니라(${raritySum}) 네 칸 전체를 기본값으로 대체`
      )
    }
    if (fellBack.length > 0) {
      console.error(`[capsule-policy] DB 값을 읽지 못하거나 비정상이라 기본값으로 대체한 항목: ${fellBack.join(', ')}`)
    }
    return normalized
  } catch (e) {
    console.error('[capsule-policy] 조회 예외 — 기본 정책으로 폴백:', e)
    return { ...DEFAULT_CAPSULE_POLICY }
  }
}
