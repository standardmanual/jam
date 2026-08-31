/**
 * 어뷰징 정책 설정 로딩
 * service_role 클라이언트 전용
 */
import { createServiceClient } from '@/lib/supabase/server'

export interface AbusingPolicy {
  soft_common_rate: number
  soft_rare_rate: number
  soft_legend_rate: number
  soft_mythic_rate: number
  hard_common_rate: number
  hard_rare_rate: number
  hard_legend_rate: number
  hard_mythic_rate: number
  gps_max_speed_kmh: number
  poi_block_hours: number
  vehicle_speed_filter_kmh: number
  gps_daily_distance_cap_km: number
}

const DEFAULT_POLICY: AbusingPolicy = {
  soft_common_rate: 1.0,
  soft_rare_rate: 1.0,
  soft_legend_rate: 0.0,
  soft_mythic_rate: 0.0,
  hard_common_rate: 1.0,
  hard_rare_rate: 0.0,
  hard_legend_rate: 0.0,
  hard_mythic_rate: 0.0,
  gps_max_speed_kmh: 300,
  poi_block_hours: 72,
  vehicle_speed_filter_kmh: 60,
  gps_daily_distance_cap_km: 3000,
}

/**
 * 이미 경고를 낸 누락 키 (프로세스 단위 1회만 기록)
 *
 * 이 로더는 드랍 판정·픽업마다 호출되는 핫패스라 매번 찍으면 로그가 잠긴다.
 * 콜드스타트마다 한 줄은 남으므로 감지 수단으로는 충분하다.
 */
const warnedMissingKeys = new Set<string>()

export async function getAbusingPolicy(): Promise<AbusingPolicy> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.from('abusing_policy').select('*').eq('id', 1).single()
    if (error) {
      // 폴백은 유지하되(드랍 엔진이 죽으면 안 됨) 실패 신호는 서버 로그에 남긴다
      console.error('[abusing-policy] 조회 실패 — 기본 정책으로 폴백:', error)
      return DEFAULT_POLICY
    }
    if (!data) return DEFAULT_POLICY
    // 형제 로더(drop/combine/ambient)와 달리 정규화 루프 없이 행을 그대로 반환한다.
    // 반환 형태는 의도적으로 바꾸지 않고 키 누락만 경고한다 — 여기서 기본값 병합을 하면
    // 지금 undefined로 내려가 `shouldAllowDrop`의 `?? 1.0` 폴백을 타는 값들이 0으로
    // 바뀌어 드랍률이 실제로 달라진다(컬럼명 불일치 정리는 별도 티켓 대상).
    const row = data as unknown as Record<string, unknown>
    for (const key of Object.keys(DEFAULT_POLICY)) {
      if (!(key in row) && !warnedMissingKeys.has(key)) {
        warnedMissingKeys.add(key)
        console.error(`[abusing-policy] 컬럼 누락 — 값 없음: ${key}`)
      }
    }
    return data
  } catch (e) {
    console.error('[abusing-policy] 조회 예외 — 기본 정책으로 폴백:', e)
    return DEFAULT_POLICY
  }
}

/**
 * 어뷰징 정책을 저장한다. 실패하면 호출부가 인지하도록 예외를 던진다.
 * (티켓 20260831_1149 — upsert 반환 error를 확인하지 않아 저장 실패가 200으로 응답됐다)
 */
export async function updateAbusingPolicy(patch: Partial<AbusingPolicy>): Promise<void> {
  const supabase = createServiceClient()
  const table = supabase.from('abusing_policy')
  const payload = { id: 1, ...patch, updated_at: new Date().toISOString() }
  // @ts-expect-error Supabase upsert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 AbusingPolicyRow와 일치
  const { error } = await table.upsert(payload)
  if (error) {
    console.error('[abusing-policy] 저장 실패:', error)
    throw new Error(`abusing_policy upsert 실패 (${error.code}): ${error.message}`)
  }
}
