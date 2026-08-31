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

export const DEFAULT_POLICY: AbusingPolicy = {
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
 * 0~1 비율(밴 레벨별 rarity 드랍 배율) 필드 목록.
 * 나머지 4개(gps_max_speed_kmh·poi_block_hours·vehicle_speed_filter_kmh·
 * gps_daily_distance_cap_km)는 상한 없는 정수 임계값이라 검증 범위가 다르다.
 */
export const RATE_KEYS: ReadonlySet<keyof AbusingPolicy> = new Set([
  'soft_common_rate',
  'soft_rare_rate',
  'soft_legend_rate',
  'soft_mythic_rate',
  'hard_common_rate',
  'hard_rare_rate',
  'hard_legend_rate',
  'hard_mythic_rate',
])

/**
 * 앱 키 → `abusing_policy` 테이블 실제 컬럼명 매핑
 *
 * 앱 전역은 `soft_legend_rate`/`hard_legend_rate`를 쓰지만 테이블의 실제 컬럼은
 * `soft_legendary_rate`/`hard_legendary_rate`다. 티켓 20260813_003(legendary → legend
 * 전면 변경)에서 이 두 컬럼만 rename이 누락돼 생긴 불일치로, `drop_policy.rarity_legendary`와
 * 완전히 같은 원인이다. 이 불일치 때문에 저장은 전량 롤백됐고, 읽기에서는 키가 사라져
 * 섀도우밴의 legend 차단이 무력화돼 있었다(티켓 20260831_1149).
 *
 * ⚠️ 이 매핑은 한시적이다. 배지 등급명을 common/rare/legend/mythic →
 * common/rare/epic/mystic으로 바꾸는 후속 작업에 `soft_legendary_rate`/`hard_legendary_rate`
 * 개명이 포함돼 있다. 그 작업에서 이 상수와 아래 두 변환 함수를 함께 제거할 것.
 */
const APP_KEY_TO_DB_COLUMN: Record<string, string> = {
  soft_legend_rate: 'soft_legendary_rate',
  hard_legend_rate: 'hard_legendary_rate',
}

const DB_COLUMN_TO_APP_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(APP_KEY_TO_DB_COLUMN).map(([appKey, dbColumn]) => [dbColumn, appKey])
)

/** DB에서 읽은 행의 컬럼명을 앱 키로 되돌린다. */
function toAppKeys(row: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = { ...row }
  for (const [dbColumn, appKey] of Object.entries(DB_COLUMN_TO_APP_KEY)) {
    if (dbColumn in row) {
      mapped[appKey] = row[dbColumn]
      delete mapped[dbColumn]
    }
  }
  return mapped
}

/** 앱 키로 작성된 패치를 DB 컬럼명으로 변환한다. */
function toDbColumns(patch: Partial<AbusingPolicy>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    mapped[APP_KEY_TO_DB_COLUMN[key] ?? key] = value
  }
  return mapped
}

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
    // NUMERIC 컬럼이 문자열로 내려올 수 있어 숫자로 정규화
    const row = toAppKeys(data as unknown as Record<string, unknown>)
    const policy = { ...DEFAULT_POLICY } as Record<string, number>
    const fellBack: string[] = []
    for (const key of Object.keys(DEFAULT_POLICY)) {
      const v = row[key]
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
      if (Number.isNaN(n)) {
        fellBack.push(key)
        continue
      }
      policy[key] = n
    }
    if (fellBack.length > 0) {
      // 키 누락을 무음으로 넘기면 섀도우밴 판정이 조용히 틀어진다 (티켓 20260831_1149)
      console.error(
        `[abusing-policy] DB 값을 읽지 못해 기본값으로 대체한 항목: ${fellBack.join(', ')}`
      )
    }
    return policy as unknown as AbusingPolicy
  } catch (e) {
    console.error('[abusing-policy] 조회 예외 — 기본 정책으로 폴백:', e)
    return DEFAULT_POLICY
  }
}

/**
 * 어뷰징 정책을 저장한다. 실패하면 호출부가 인지하도록 예외를 던진다.
 * (이전에는 upsert 반환 error를 확인하지 않아 저장 실패가 성공으로 응답됐다)
 */
export async function updateAbusingPolicy(patch: Partial<AbusingPolicy>): Promise<void> {
  const supabase = createServiceClient()
  const payload = { id: 1, ...toDbColumns(patch), updated_at: new Date().toISOString() }
  // @ts-expect-error Supabase upsert()가 페이로드 타입을 never[]로 추론하는 제한 우회(억제가
  // 여전히 필요함을 tsc로 확인). 더불어 payload는 DB 컬럼명(soft_legendary_rate 등) 기준이라
  // 앱 키 기준인 AbusingPolicyRow와도 형태가 다르다 — 위 APP_KEY_TO_DB_COLUMN 주석 참조
  const { error } = await supabase.from('abusing_policy').upsert(payload)
  if (error) {
    console.error('[abusing-policy] 저장 실패:', error)
    throw new Error(`abusing_policy upsert 실패 (${error.code}): ${error.message}`)
  }
}
