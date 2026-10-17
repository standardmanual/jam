/**
 * 잼 정책 설정 로딩 (티켓 20261017_1423, 운영 로직 4.2·4.4·16.3절)
 *
 * `jam_policy` id=1 한 행 싱글톤(마이그레이션 226)을 읽는다. 강도 배율과 대량 수령 경보 기준이 들어 있다.
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
}

/** 칸별 값 검사 — 통과하지 못하면 그 칸만 기본값으로 대체한다 */
const VALIDATORS: Record<keyof JamPolicy, (n: number) => boolean> = {
  intensity_light: (n) => Number.isInteger(n) && n >= 0,
  intensity_normal: (n) => Number.isInteger(n) && n >= 0,
  intensity_hard: (n) => Number.isInteger(n) && n >= 0,
  mass_earn_alert_multiplier: (n) => Number.isFinite(n) && n > 0,
  mass_earn_alert_weeks: (n) => Number.isInteger(n) && n >= 1,
  mass_earn_alert_no_history_amount: (n) => Number.isInteger(n) && n >= 1,
}

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
    for (const key of Object.keys(DEFAULT_JAM_POLICY) as (keyof JamPolicy)[]) {
      const v = row[key]
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
      if (Number.isNaN(n) || !VALIDATORS[key](n)) {
        normalized[key] = DEFAULT_JAM_POLICY[key]
        fellBack.push(key)
        continue
      }
      normalized[key] = n
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
