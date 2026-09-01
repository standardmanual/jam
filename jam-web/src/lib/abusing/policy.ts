/**
 * 어뷰징 정책 설정 로딩
 * service_role 클라이언트 전용
 */
import type { SupabaseClient } from '@supabase/supabase-js'
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

/**
 * `abusing_policy` id=1 행의 **미러**. "바람직한 값"이 아니라
 * **"DB를 못 읽을 때 현행 운영값을 그대로 재현하는 값"** 이다.
 *
 * 폴백이 정책을 바꾸면 장애 대응이 아니라 무음 정책 변경이 된다. 실제로
 * `soft_epic_rate`·`hard_epic_rate`가 여기만 `0.0`(차단)이고 DB는 `1.00`(차단 꺼짐)이어서,
 * 정책 조회가 한 번 실패하면 의도적으로 꺼둔 Epic 차단이 켜지는 상태였다 (티켓 20260831_1259).
 *
 * 값 출처: 2026-08-31 12:59 `abusing_policy` id=1 실측.
 * Epic 배율이 1.00인 경위는 마이그레이션 `115_rename_rarity_epic_mystic.sql` §5
 * (사용자 확인 2026-08-31, "유저 체감 동작을 바꾸지 않는다")와
 * `Service Plan/Specs/SERVICE_OPERATIONS.md` §12-5 참조.
 *
 * ⚠️ **DB의 배율을 바꾸면 같은 티켓에서 이 상수도 함께 바꾼다.** 한쪽만 바꾸면
 * 폴백 경로와 정상 경로의 판정이 갈리고, 그 차이는 무음으로 드러나지 않는다.
 */
export const DEFAULT_POLICY: AbusingPolicy = {
  soft_common_rate: 1.0,
  soft_rare_rate: 1.0,
  soft_epic_rate: 1.0,
  soft_mystic_rate: 0.0,
  hard_common_rate: 1.0,
  hard_rare_rate: 0.0,
  hard_epic_rate: 1.0,
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

/** {@link findPolicyRateMismatches}가 돌려주는 갈림 항목 하나 */
export interface AbusingPolicyMismatch {
  key: keyof AbusingPolicy
  dbValue: number
  codeValue: number
}

/**
 * DB에 저장된 배율(`RATE_KEYS` 8종)이 `DEFAULT_POLICY`(폴백 미러)와 갈라졌는지 검사한다.
 * 저장 경로(`updateAbusingPolicy`)와 어드민 배너가 같은 검사를 공유해 판정이 어긋나지
 * 않게 한다 (티켓 20260831_1330).
 */
export function findPolicyRateMismatches(current: AbusingPolicy): AbusingPolicyMismatch[] {
  const mismatches: AbusingPolicyMismatch[] = []
  for (const key of RATE_KEYS) {
    const dbValue = current[key]
    const codeValue = DEFAULT_POLICY[key]
    if (dbValue !== codeValue) {
      mismatches.push({ key, dbValue, codeValue })
    }
  }
  return mismatches
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
      normalized[key] = n
    }
    if (fellBack.length > 0) {
      // 키 누락을 무음으로 넘기면 섀도우밴 판정이 조용히 틀어진다 (티켓 20260831_1149).
      // 마이그레이션 115가 아직 실행되지 않았다면 등급 배율 키가 여기 걸린다.
      console.error(
        `[abusing-policy] DB 값을 읽지 못해 기본값으로 대체한 항목: ${fellBack.join(', ')}`
      )
    }

    // `AbusingPolicy` 키만 담아 돌려준다 (티켓 20260831_1328).
    // 한때 `{ ...row, ...normalized }`로 원본 행의 **상위집합**을 돌려줬다 — 마이그레이션 115
    // (등급명 legend·mythic → epic·mystic) 미실행 구간에 DB에 남은 구 컬럼명을, shadow-ban.ts가
    // 런타임 문자열로 `${banLevel}_${rarity}_rate`를 조합해 찾아갈 수 있게 살려두려는
    // 목적이었다(티켓 20260831_1149). 그런데 1) 115가 적용돼 DB 컬럼과 앱 키가 일치하고,
    // 2) 티켓 20260831_1259가 그 문자열 조합을 `Record<BadgeRarity, keyof AbusingPolicy>`
    // 타입 맵으로 바꿔 애초에 구 키를 조회하지 않는다 — 두 근거가 모두 사라져 상위집합은
    // `AbusingPolicy`에 없는 키를 실어 나르기만 했다. 소비 지점(pickup route·drop-engine·
    // 어드민 화면·정책 API) 전수 확인 결과 `DEFAULT_POLICY` 밖 키를 읽는 곳이 없어 제거했다.
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

  // 저장이 성공한 직후에만(드랍마다가 아니라 1회) DB와 DEFAULT_POLICY(폴백 미러)가
  // 갈라졌는지 검사한다. 이 규율이 "같은 티켓에서 policy.ts도 함께 바꾼다"는 문서 규칙을
  // 어드민 저장 경로에서도 강제하는 유일한 코드 상의 장치다 (티켓 20260831_1330).
  const saved = await getAbusingPolicy(supabase)
  const mismatches = findPolicyRateMismatches(saved)
  if (mismatches.length > 0) {
    const detail = mismatches
      .map((m) => `${m.key}(DB=${m.dbValue}, policy.ts=${m.codeValue})`)
      .join(', ')
    console.warn(
      `[abusing-policy] 저장된 배율이 DEFAULT_POLICY와 달라요 — ${detail}. ` +
        `폴백(DB 조회 실패) 시에는 policy.ts 값이 대신 적용되니, DB 배율을 바꿨다면 ` +
        `src/lib/abusing/policy.ts의 DEFAULT_POLICY도 같은 티켓에서 함께 갱신하세요.`
    )
  }
}
