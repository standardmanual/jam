/**
 * 잼 정책 설정 로딩 (티켓 20261017_1423, 운영 로직 4.2·4.4·16.3절)
 *
 * `jam_policy` id=1 한 행 싱글톤(마이그레이션 226·227)을 읽는다. 강도 배율, 대량 수령 경보 기준, 동기화 아이템 배지 발급 값, 잠긴 아이템 배지의 최소값·잠길 확률이 들어 있다.
 * service_role 클라이언트 전용이고 서버에서만 쓴다. `abusing/policy.ts`와 같은 패턴이다 — 조회가 실패하거나
 * 값이 비정상이면 기본값으로 대체하고 로그를 남긴다. 정산이 설정 조회 실패로 멈추면 안 되기 때문이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'

export interface JamPolicy {
  /** 가벼움(걷기·전기자전거) 강도 배율 */
  intensity_light: number
  /** 보통(등산·자전거) 강도 배율 */
  intensity_normal: number
  /** 격함(러닝·트레일러닝) 강도 배율 */
  intensity_hard: number
  /** 한 번의 동기화로 받은 잼이 지난 N주 주간 평균의 이 배수를 넘으면 경보 */
  mass_earn_alert_multiplier: number
  /** 경보 비교에 쓰는 지난 기간(주) */
  mass_earn_alert_weeks: number
  /** 지난 기록이 없는 유저의 경보 기준 잼 */
  mass_earn_alert_no_history_amount: number
  /** 동기화 아이템 배지: 활동마다 확정 개수(등산 제외). 0이면 드랍 없음 (티켓 20261017_1424, 운영 로직 6.2절) */
  sync_item_guaranteed: number
  /** 동기화 아이템 배지: 등산 활동의 확정 개수 */
  sync_item_guaranteed_hiking: number
  /** 보너스 개수를 굴리는 횟수 */
  sync_item_bonus_rolls: number
  /** 보너스 한 번마다 확률 = 그 활동의 잼 ÷ 이 값 */
  sync_item_bonus_jam_divisor: number
  /** 보너스 한 번마다 확률의 상한(0~1) */
  sync_item_bonus_max_probability: number
  /** 동기화 등급 확률(퍼센트, 네 등급 합계 100) */
  sync_rarity_common: number
  sync_rarity_rare: number
  sync_rarity_epic: number
  sync_rarity_mystic: number
  /** Common이 이 횟수만큼 연속이면 다음은 Rare 이상 (동기화와 캡슐 합산, `user_drop_state.common_streak`) */
  common_streak_threshold: number
  /** 잠긴 아이템 배지를 여는 데 필요한 양의 등급별 최소값 — 배지에 값이 없으면 이 값을 쓴다 (티켓 20261018_0051, 운영 로직 7.4절) */
  locked_min_common: number
  locked_min_rare: number
  locked_min_epic: number
  locked_min_mystic: number
  /** 동기화·캡슐에서 나온 아이템 배지가 잠긴 채 배정될 확률(0~1) */
  locked_roll_probability: number
}

/**
 * `jam_policy` id=1 행의 **미러** — 마이그레이션 226의 기본값(운영 로직 4.4·16.3절)과 같아야 한다.
 * DB 값을 바꾸면 같은 티켓에서 이 상수도 함께 바꾼다. 한쪽만 바꾸면 폴백 경로와 정상 경로의 계산이 갈린다.
 */
export const DEFAULT_JAM_POLICY: JamPolicy = {
  intensity_light: 1,
  intensity_normal: 2,
  intensity_hard: 3,
  mass_earn_alert_multiplier: 3,
  mass_earn_alert_weeks: 4,
  mass_earn_alert_no_history_amount: 1200,
  // 마이그레이션 227 기본값(운영 로직 6.7절)
  sync_item_guaranteed: 1,
  sync_item_guaranteed_hiking: 2,
  sync_item_bonus_rolls: 2,
  sync_item_bonus_jam_divisor: 600,
  sync_item_bonus_max_probability: 0.25,
  sync_rarity_common: 84,
  sync_rarity_rare: 13,
  sync_rarity_epic: 2.5,
  sync_rarity_mystic: 0.5,
  common_streak_threshold: 10,
  // 마이그레이션 231 기본값(운영 로직 7.4절)
  locked_min_common: 30,
  locked_min_rare: 60,
  locked_min_epic: 120,
  locked_min_mystic: 240,
  locked_roll_probability: 0.25,
}

/**
 * 아이템 발급 정책 10칸. 강도·경보 칸과 달리 «칸 단위»가 아니라 «묶음 단위»로 대체한다 — 등급 확률은 네 칸 합계가
 * 100이어야 의미가 있어서, 한 칸만 기본값으로 바꾸면 합계가 어긋나기 때문이다.
 */
const ITEM_ISSUE_KEYS = [
  'sync_item_guaranteed',
  'sync_item_guaranteed_hiking',
  'sync_item_bonus_rolls',
  'sync_item_bonus_jam_divisor',
  'sync_item_bonus_max_probability',
  'sync_rarity_common',
  'sync_rarity_rare',
  'sync_rarity_epic',
  'sync_rarity_mystic',
  'common_streak_threshold',
] as const satisfies readonly (keyof JamPolicy)[]

/** 등급 확률 합계 허용 오차 — DB 제약(`jam_policy_sync_rarity_sum_100`)과 같다 */
const RARITY_SUM_TOLERANCE = 0.001

/** 칸별 값 검사 — 통과하지 못하면 그 칸만 기본값으로 대체한다 */
const VALIDATORS: Record<keyof JamPolicy, (n: number) => boolean> = {
  intensity_light: (n) => Number.isInteger(n) && n >= 0,
  intensity_normal: (n) => Number.isInteger(n) && n >= 0,
  intensity_hard: (n) => Number.isInteger(n) && n >= 0,
  mass_earn_alert_multiplier: (n) => Number.isFinite(n) && n > 0,
  mass_earn_alert_weeks: (n) => Number.isInteger(n) && n >= 1,
  mass_earn_alert_no_history_amount: (n) => Number.isInteger(n) && n >= 1,
  sync_item_guaranteed: (n) => Number.isInteger(n) && n >= 0,
  sync_item_guaranteed_hiking: (n) => Number.isInteger(n) && n >= 0,
  sync_item_bonus_rolls: (n) => Number.isInteger(n) && n >= 0,
  sync_item_bonus_jam_divisor: (n) => Number.isInteger(n) && n >= 1,
  sync_item_bonus_max_probability: (n) => Number.isFinite(n) && n >= 0 && n <= 1,
  sync_rarity_common: (n) => Number.isFinite(n) && n >= 0,
  sync_rarity_rare: (n) => Number.isFinite(n) && n >= 0,
  sync_rarity_epic: (n) => Number.isFinite(n) && n >= 0,
  sync_rarity_mystic: (n) => Number.isFinite(n) && n >= 0,
  common_streak_threshold: (n) => Number.isInteger(n) && n >= 1,
  locked_min_common: (n) => Number.isInteger(n) && n >= 1,
  locked_min_rare: (n) => Number.isInteger(n) && n >= 1,
  locked_min_epic: (n) => Number.isInteger(n) && n >= 1,
  locked_min_mystic: (n) => Number.isInteger(n) && n >= 1,
  locked_roll_probability: (n) => Number.isFinite(n) && n >= 0 && n <= 1,
}

const isItemIssueKey = (key: keyof JamPolicy): boolean => (ITEM_ISSUE_KEYS as readonly string[]).includes(key)

/**
 * 잼 정책을 읽는 **정식 경로**. 정규화·폴백·관측이 모두 여기에 있다.
 *
 * @param client 이미 만들어 둔 Supabase 클라이언트. 생략하면 service_role 클라이언트를 새로 만든다.
 */
export async function getJamPolicy(client?: SupabaseClient): Promise<JamPolicy> {
  try {
    const supabase = client ?? createServiceClient()
    const { data, error } = await supabase.from('jam_policy').select('*').eq('id', 1).single()
    if (error) {
      console.error('[jam-policy] 조회 실패 — 기본 정책으로 폴백:', error)
      return { ...DEFAULT_JAM_POLICY }
    }
    if (!data) {
      console.error('[jam-policy] id=1 행이 없음 — 기본 정책으로 폴백')
      return { ...DEFAULT_JAM_POLICY }
    }

    // NUMERIC 컬럼(mass_earn_alert_multiplier)이 문자열로 내려올 수 있어 숫자로 정규화한다
    const row = data as unknown as Record<string, unknown>
    const normalized = {} as JamPolicy
    const fellBack: string[] = []
    const itemInvalid: string[] = []
    for (const key of Object.keys(DEFAULT_JAM_POLICY) as (keyof JamPolicy)[]) {
      const v = row[key]
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
      if (Number.isNaN(n) || !VALIDATORS[key](n)) {
        normalized[key] = DEFAULT_JAM_POLICY[key]
        // 아이템 발급 칸은 아래에서 묶음 단위로 대체·로그를 남긴다
        if (isItemIssueKey(key)) itemInvalid.push(key)
        else fellBack.push(key)
        continue
      }
      normalized[key] = n
    }

    // 아이템 발급 정책: 칸이 비정상이거나 등급 확률 합계가 100이 아니면 10칸 전체를 기본값으로 대체한다
    const raritySum =
      normalized.sync_rarity_common + normalized.sync_rarity_rare + normalized.sync_rarity_epic + normalized.sync_rarity_mystic
    const sumMismatch = Math.abs(raritySum - 100) >= RARITY_SUM_TOLERANCE
    if (itemInvalid.length > 0 || sumMismatch) {
      for (const key of ITEM_ISSUE_KEYS) normalized[key] = DEFAULT_JAM_POLICY[key]
      console.error(
        itemInvalid.length > 0
          ? `[jam-policy] 아이템 발급 정책 칸이 비정상이라 10칸 전체를 기본값으로 대체: ${itemInvalid.join(', ')}`
          : `[jam-policy] 아이템 발급 등급 확률 합계가 100이 아니라(${raritySum}) 10칸 전체를 기본값으로 대체`
      )
    }
    if (fellBack.length > 0) {
      console.error(`[jam-policy] DB 값을 읽지 못하거나 비정상이라 기본값으로 대체한 항목: ${fellBack.join(', ')}`)
    }
    return normalized
  } catch (e) {
    console.error('[jam-policy] 조회 예외 — 기본 정책으로 폴백:', e)
    return { ...DEFAULT_JAM_POLICY }
  }
}
