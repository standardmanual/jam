/**
 * 어뷰징 정책 설정 로딩
 * service_role 클라이언트 전용
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * 티켓 20261021_1250(6-4 2회): 옛 섀도우밴 드랍 배율 8칸(`soft_*_rate`·`hard_*_rate`)을 이 타입·`DEFAULT_POLICY`·저장 검증에서
 * 지웠다. `abusing_policy`의 배율 열 8개는 DB에 남아 있고(NOT NULL·기본값) 코드가 읽지도 쓰지도 않는다 — 열 정리는 6-4 4회 정리 SQL 몫이다.
 */
export interface AbusingPolicy {
  gps_max_speed_kmh: number
  poi_block_hours: number
  vehicle_speed_filter_kmh: number
  gps_daily_distance_cap_km: number
  /** 걷기 활동 중 교통수단 구간 감지 임계값 (km/h). 20260909_1012 */
  transit_walk_max_speed_kmh: number
  /** 러닝 활동 중 교통수단 구간 감지 임계값 (km/h). 20260909_1012 */
  transit_run_max_speed_kmh: number
  /** 자전거 활동 중 교통수단 구간 감지 임계값 (km/h). 20260909_1012 */
  transit_cycling_max_speed_kmh: number
  /** 교통수단 구간으로 판정하기 위한 최소 연속 지속시간 (초). 20260909_1012 */
  transit_segment_min_duration_sec: number
  /** 러닝 평균 속도가 이 값(km/h)보다 느리면 걷기(가벼움)로 계산한다. 트레일러닝·등산은 판정하지 않는다. 20261017_1421 */
  mismatch_run_min_speed_kmh: number
  /** 자전거 평균 속도가 이 값(km/h)보다 느리면 걷기(가벼움)로 계산한다. 20261017_1421 */
  mismatch_cycling_min_speed_kmh: number
}

/**
 * 종목과 움직임 불일치 기준값 칸 — 양의 정수여야 한다(0·음수·소수는 비정상).
 * 로더(`getAbusingPolicy`)와 저장 경로(어드민 정책 라우트)가 같은 목록을 쓴다.
 */
export const MISMATCH_POLICY_KEYS = [
  'mismatch_run_min_speed_kmh',
  'mismatch_cycling_min_speed_kmh',
] as const satisfies readonly (keyof AbusingPolicy)[]

/**
 * `abusing_policy` id=1 행의 **미러**. "바람직한 값"이 아니라
 * **"DB를 못 읽을 때 현행 운영값을 그대로 재현하는 값"** 이다.
 *
 * 폴백이 정책을 바꾸면 장애 대응이 아니라 무음 정책 변경이 된다 (티켓 20260831_1259).
 *
 * ⚠️ **DB의 값을 바꾸면 같은 티켓에서 이 상수도 함께 바꾼다.** 한쪽만 바꾸면
 * 폴백 경로와 정상 경로의 판정이 갈리고, 그 차이는 무음으로 드러나지 않는다.
 */
export const DEFAULT_POLICY: AbusingPolicy = {
  gps_max_speed_kmh: 300,
  poi_block_hours: 72,
  vehicle_speed_filter_kmh: 60,
  gps_daily_distance_cap_km: 3000,
  // 걷기 20km/h(엘리트 경보 선수 최고 기록보다도 높음)·러닝 27km/h(30초 지속 창 기준 800m~마일
  // 세계기록 페이스 — 마라톤 페이스가 아니라 그 시간대에 버틸 수 있는 단거리 기록이 물리적
  // 상한선)·자전거 55km/h(엘리트 로드 사이클링 평균속도 40~45km/h + 내리막 스퍼트 여유분).
  // 근거는 티켓 20260909_1012 참조.
  transit_walk_max_speed_kmh: 20,
  transit_run_max_speed_kmh: 27,
  transit_cycling_max_speed_kmh: 55,
  transit_segment_min_duration_sec: 30,
  // 러닝 평균 6km/h 미만(걷는 속도)·자전거 평균 10km/h 미만(끌고 가거나 걷는 속도)은 걷기로 계산한다.
  // 마이그레이션 224의 기본값과 같아야 한다(티켓 20261017_1421, 운영 로직 16.2절).
  mismatch_run_min_speed_kmh: 6,
  mismatch_cycling_min_speed_kmh: 10,
}

/**
 * `vehicle_speed_filter_kmh`의 하한 (km/h).
 *
 * 이 값은 "차량 탑승 판정 기준"이고 필터식은 `평균속도 <= 임계값`(이하만 통과)이라,
 * 임계값을 낮출수록 통과 대상이 줄어든다. JAM!이 지원하는 활동 중 사이클링의 평균속도가
 * 통상 20~30km/h이므로 20km/h 미만으로 내리면 차량이 아니라 정상 사이클링·달리기를
 * 통째로 배제하게 된다. 걸러진 활동은 배지뿐 아니라 아이템 드랍·미션에서도 빠지므로
 * 핵심 보상 루프가 한꺼번에 멈춘다 (티켓 20260831_1300).
 *
 * 하한 검증은 **저장 경로(어드민 정책 라우트)가 소유**한다 — 운영자가 즉시 400으로 인지할 수
 * 있는 지점이기 때문이다. 소비 지점은 `<= 0`·비유한수만 막는 페일세이프만 둔다.
 */
export const MIN_VEHICLE_SPEED_FILTER_KMH = 20

/**
 * 차량 속도 필터에 **실제로 적용할** 상한(km/h) — 필터식은 `평균속도 <= 이 값`이다.
 *
 * 유한하고 0보다 크면 정책 값 그대로이고, 아니면(0·음수·NaN·Infinity) `DEFAULT_POLICY`의 값(60)으로
 * 폴백한다. 상한이 0 이하이면 사실상 모든 활동이 탈락해 핵심 보상 루프가 멈추기 때문이다.
 * 동기화(`sync.ts`)와 JAM! 행동 지표의 「활동한 날」 판정(`jamActionDayMetrics.ts`)이 같은 규칙을
 * 쓰도록 해석을 이 함수 한 곳에 둔다(티켓 20261001_0633). 하한(`MIN_VEHICLE_SPEED_FILTER_KMH`)은
 * 여기서 재검사하지 않는다 — 위 주석대로 저장 경로가 소유한다.
 */
export function effectiveVehicleSpeedFilterKmh(policy: Pick<AbusingPolicy, 'vehicle_speed_filter_kmh'>): number {
  const configured = policy.vehicle_speed_filter_kmh
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_POLICY.vehicle_speed_filter_kmh
}

/**
 * 어뷰징 정책을 읽는 **정식 경로**. 정규화·폴백·관측이 모두 여기에 있으므로
 * `abusing_policy`를 직접 select하지 말고 이 함수를 쓴다 (티켓 20260831_1300).
 *
 * @param client 이미 만들어 둔 Supabase 클라이언트. 호출부가 클라이언트를 인자로 주입받는
 *   구조(예: `processFetchedActivities(supabase, ...)`)에서 주입 사슬을 끊지 않기 위한 것이다.
 *   생략하면 service_role 클라이언트를 새로 만든다.
 */
export async function getAbusingPolicy(client?: SupabaseClient): Promise<AbusingPolicy> {
  try {
    const supabase = client ?? createServiceClient()
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
    // `AbusingPolicy`의 키 집합을 그대로 채우므로 값 타입을 `Record<keyof AbusingPolicy, number>`로
    // 선언해 둔다 — 루프가 끝나면 `AbusingPolicy`와 구조적으로 같아 별도 캐스팅 없이 반환할 수 있다.
    const normalized = {} as Record<keyof AbusingPolicy, number>
    const fellBack: string[] = []
    for (const [key, fallback] of Object.entries(DEFAULT_POLICY) as [keyof AbusingPolicy, number][]) {
      const v = row[key]
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
      if (Number.isNaN(n)) {
        normalized[key] = fallback
        fellBack.push(key)
        continue
      }
      // 종목 불일치 기준값은 양수여야 한다 — 0 이하이면 판정이 무의미해지므로 기본값으로 대체하고 로그를 남긴다
      if ((MISMATCH_POLICY_KEYS as readonly string[]).includes(key) && !(n > 0)) {
        normalized[key] = fallback
        fellBack.push(key)
        continue
      }
      normalized[key] = n
    }
    if (fellBack.length > 0) {
      // 키 누락을 무음으로 넘기면 GPS 조작·차량 속도 판정이 조용히 틀어진다 (티켓 20260831_1149).
      console.error(
        `[abusing-policy] DB 값을 읽지 못해 기본값으로 대체한 항목: ${fellBack.join(', ')}`
      )
    }

    // `AbusingPolicy` 키만 담아 돌려준다 (티켓 20260831_1328). 한때 원본 행의 상위집합을 돌려줬지만
    // `DEFAULT_POLICY` 밖 키를 읽는 곳이 없어 제거했다. 그래서 DB 행에 남은 옛 배율 열 8개(티켓 20261021_1250)가
    // 있어도 읽기는 그 열을 보지 않고, 이름으로 검증하지도 않으므로 열이 있든 없든 읽기가 깨지지 않는다.
    return normalized
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
