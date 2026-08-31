/**
 * 어뷰징 정책 설정 로딩
 * service_role 클라이언트 전용
 */
import { createServiceClient } from '@/lib/supabase/server'

export interface AbusingPolicy {
  soft_common_rate: number
  soft_rare_rate: number
  soft_epic_rate: number
  soft_mystic_rate: number
  hard_common_rate: number
  hard_rare_rate: number
  hard_epic_rate: number
  hard_mystic_rate: number
  gps_max_speed_kmh: number
  poi_block_hours: number
  vehicle_speed_filter_kmh: number
  gps_daily_distance_cap_km: number
}

export const DEFAULT_POLICY: AbusingPolicy = {
  soft_common_rate: 1.0,
  soft_rare_rate: 1.0,
  soft_epic_rate: 0.0,
  soft_mystic_rate: 0.0,
  hard_common_rate: 1.0,
  hard_rare_rate: 0.0,
  hard_epic_rate: 0.0,
  hard_mystic_rate: 0.0,
  gps_max_speed_kmh: 300,
  poi_block_hours: 72,
  vehicle_speed_filter_kmh: 60,
  gps_daily_distance_cap_km: 3000,
}

/**
 * 0~1 비율(밴 레벨별 rarity 드랍 배율) 필드 목록.
 * 나머지 4개(gps_max_speed_kmh·poi_block_hours·vehicle_speed_filter_kmh·
 * gps_daily_distance_cap_km)는 상한 없는 정수 임계값이라 검증 범위가 다르다.
 */
export const RATE_KEYS: ReadonlySet<keyof AbusingPolicy> = new Set([
  'soft_common_rate',
  'soft_rare_rate',
  'soft_epic_rate',
  'soft_mystic_rate',
  'hard_common_rate',
  'hard_rare_rate',
  'hard_epic_rate',
  'hard_mystic_rate',
])

export async function getAbusingPolicy(): Promise<AbusingPolicy> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.from('abusing_policy').select('*').eq('id', 1).single()
    if (error) {
      // 폴백은 유지하되(정책 로딩 실패로 픽업 경로가 죽으면 안 됨) 실패 신호는 서버 로그에 남긴다
      console.error('[abusing-policy] 조회 실패 — 기본 정책으로 폴백:', error)
      return DEFAULT_POLICY
    }
    if (!data) {
      console.error('[abusing-policy] id=1 행이 없음 — 기본 정책으로 폴백')
      return DEFAULT_POLICY
    }

    // NUMERIC 컬럼이 문자열로 내려올 수 있어 숫자로 정규화한다
    const row = data as unknown as Record<string, unknown>
    const normalized: Record<string, number> = {}
    const fellBack: string[] = []
    for (const [key, fallback] of Object.entries(DEFAULT_POLICY)) {
      const v = row[key]
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
      if (Number.isNaN(n)) {
        normalized[key] = fallback
        fellBack.push(key)
        continue
      }
      normalized[key] = n
    }
    if (fellBack.length > 0) {
      // 키 누락을 무음으로 넘기면 섀도우밴 판정이 조용히 틀어진다 (티켓 20260831_1149).
      // 마이그레이션 115가 아직 실행되지 않았다면 등급 배율 키가 여기 걸린다.
      console.error(
        `[abusing-policy] DB 값을 읽지 못해 기본값으로 대체한 항목: ${fellBack.join(', ')}`
      )
    }

    // ⚠️ 원본 행의 **상위집합**으로 돌려준다 (DEFAULT_POLICY 키만 추리면 안 된다).
    // 마이그레이션 115(등급명 legendary·mythic → epic·mystic) 실행 전에는 DB에 구 컬럼명이
    // 남아 있고, shadow-ban.ts는 런타임 rarity 값으로 `${banLevel}_${rarity}_rate` 키를
    // 조합한다. 구 키를 떨어뜨리면 `?? 1.0` 폴백을 타면서 지금 작동 중인 차단이 꺼진다.
    // 115 적용 후에는 `...row` 스프레드를 지우고 normalized만 반환해도 된다.
    return { ...row, ...normalized } as unknown as AbusingPolicy
  } catch (e) {
    console.error('[abusing-policy] 조회 예외 — 기본 정책으로 폴백:', e)
    return DEFAULT_POLICY
  }
}

/**
 * 어뷰징 정책을 저장한다. 실패하면 호출부가 인지하도록 예외를 던진다.
 * (이전에는 upsert 반환 error를 확인하지 않아 저장 실패가 성공으로 응답됐다 — 티켓 20260831_1149)
 */
export async function updateAbusingPolicy(patch: Partial<AbusingPolicy>): Promise<void> {
  const supabase = createServiceClient()
  const payload = { id: 1, ...patch, updated_at: new Date().toISOString() }
  const { error } = await supabase.from('abusing_policy').upsert(payload)
  if (error) {
    console.error('[abusing-policy] 저장 실패:', error)
    throw new Error(`abusing_policy upsert 실패 (${error.code}): ${error.message}`)
  }
}
