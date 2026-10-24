/**
 * 밸런스 설정 «어뷰징» 구역의 연결 (티켓 20261022_1134 2회, 운영 로직 16.2절·19.1절)
 *
 * `abusing_policy` id=1 한 행의 **기준값 10칸**을 편집한다: 이동 감지 2칸(`gps_*`), 차량 속도 필터 1칸, 교통수단 구간 감지 4칸(`transit_*`),
 * 종목 불일치 2칸(`mismatch_*`), 장소 블록 유지 시간 1칸(`poi_block_hours`). 옛 어뷰징 화면의 «정책 설정» 탭(`/admin/abusing`)과 그 API(`PUT /api/admin/abusing/policy`)를
 * 이 구역으로 옮겼다. 이용 정지·장소 블록 탭은 제재 운영 도구라 옛 화면에 그대로 남는다. 열 정의는 마이그레이션 010·011·078·148·224이고 열 10개가 모두 `INTEGER NOT NULL`이다.
 * 옛 섀도우밴 배율 8열은 화면과 코드에서 이미 빠졌고(티켓 20261021_1250) 열 정리는 출시 뒤 SQL 몫이라 이 구역은 읽지도 쓰지도 않는다. 확률 안내 페이지가 읽는 칸이 아니라 확인창은 없다.
 *
 * 칸의 범위(옛 저장 라우트와 달라진 점, 사용자 결정 ①): **모든 칸이 정수 1 이상**이고, 차량 속도 필터만 `MIN_VEHICLE_SPEED_FILTER_KMH`(20) 이상이다.
 * 옛 라우트는 0 이상 숫자를 받았지만 옛 입력칸이 `parseInt(...) || 기본값`으로 읽어 0이 기본값으로 바뀌었다(티켓 20261017_1506). 새 폼은 빈칸을 오류로 처리하고 최소값을 1로 둔다.
 * 종목 불일치 두 칸은 옛 라우트도 정수 1 이상이었다. 범위 규칙은 칸 정의(`min`·`decimals`)가 한 곳에서 갖고, 공용 저장(`save.ts`)이 서버에서 같은 정의로 한 번 더 건다.
 *
 * 읽기는 `getAbusingPolicy`(정식 읽기 경로, 동기화·픽업이 쓴다)와 **같은 뜻**이되 편집 화면용으로 두 곳이 다르다:
 * - **행이 없으면 던지지 않고 코드 기본값(`DEFAULT_POLICY`)을 보인다**(옛 화면과 같다. 인벤토리 구역은 행이 없으면 던진다). 이때 수정 시각은 없으므로 `ABUSING_NO_ROW_STAMP`를 대신 돌려주고,
 *   그 값을 들고 온 첫 저장은 `upsert`로 행을 만든다(옛 `updateAbusingPolicy`와 같다). 화면이 보던 열 10개를 모두 싣고(바꾸지 않은 칸은 기본값), 옛 배율 열은 DB 기본값으로 채워진다.
 * - 조회 오류와 숫자가 아닌 값은 기본값으로 바꿔 보이지 않고 던진다(구역이 오류 카드가 된다). 읽기 경로는 폴백이 장애 대응이라 기본값을 돌려주지만, 편집 화면이 기본값을 저장된 값처럼 보이면 그 값을 그대로 저장하게 된다.
 *   같은 이유로 종목 불일치 칸의 DB 값이 0 이하여도 기본값으로 바꾸지 않고 그대로 보인다(그러면 칸 오류가 떠서 고쳐야 저장된다. 엔진은 그 값을 기본값 6·10으로 쓰고 있다).
 *
 * 쓰기는 `updated_at` 조건 갱신이다(갱신 트리거가 없어 저장이 직접 올린다). 행이 없던 때의 첫 저장만 `upsert`이고 조건이 없다: 읽기와 쓰기 사이에 다른 곳이 행을 만들면 마지막 저장이 이긴다(옛 화면과 같고,
 * 행은 마이그레이션 010이 만들어 둬서 실제로는 생기지 않는 경로다). 이력을 못 쓴 뒤 되돌림(`save.ts`)이 첫 저장을 되돌리면 행은 남고 값과 수정 시각(`ABUSING_NO_ROW_STAMP`)이 처음 상태로 돌아가
 * 화면이 들고 있는 시각과 같아진다.
 */
import { DEFAULT_POLICY, MIN_VEHICLE_SPEED_FILTER_KMH, type AbusingPolicy } from '@/lib/abusing/policy'
import type { Database } from '@/types/database.generated'
import { dbNumber } from './fields'
import { INTEGER_MAX, type BalanceFieldDef, type BalanceSectionBinding, type BalanceValues } from './types'

export const ABUSING_SECTION_ID = 'abusing'

/** 이 구역이 편집하는 `abusing_policy` 칸. 화면 순서와 같고 `AbusingPolicy`의 키 전부다(시험이 지킨다). */
export const ABUSING_BALANCE_KEYS = [
  'gps_max_speed_kmh',
  'gps_daily_distance_cap_km',
  'vehicle_speed_filter_kmh',
  'transit_walk_max_speed_kmh',
  'transit_run_max_speed_kmh',
  'transit_cycling_max_speed_kmh',
  'transit_segment_min_duration_sec',
  'mismatch_run_min_speed_kmh',
  'mismatch_cycling_min_speed_kmh',
  'poi_block_hours',
] as const satisfies readonly (keyof AbusingPolicy)[]

export type AbusingBalanceKey = (typeof ABUSING_BALANCE_KEYS)[number]

const MOVE_GROUP = '이동 감지'
const VEHICLE_GROUP = '차량'
const TRANSIT_GROUP = '교통수단'
const MISMATCH_GROUP = '종목 불일치'
const BLOCK_GROUP = '장소 블록'

const transitHint = (activity: string) =>
  `${activity} 중 이 속도를 넘는 상태가 최소 지속 시간 이상 이어지면 대중교통 탑승 구간으로 보고 거리·시간에서 제외해요.`

/**
 * 칸 정의. 라벨·힌트·단위는 옛 «정책 설정» 탭의 문구를 해요체로 다듬었다. 범위는 위 설명대로 정수 1 이상(차량 속도 필터는 20 이상), 상한은 DB `INTEGER` 한계다.
 * 기본값은 `DEFAULT_POLICY`(마이그레이션 기본값의 미러)다.
 */
export const ABUSING_FIELDS: readonly BalanceFieldDef[] = [
  {
    key: 'gps_max_speed_kmh',
    label: '이동 속도 임계값',
    unit: 'km/h',
    hint: '이 속도를 넘으면 비정상 이동(GPS 조작)으로 판정해요.',
    group: MOVE_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_POLICY.gps_max_speed_kmh,
    affectsDisclosure: false,
  },
  {
    key: 'gps_daily_distance_cap_km',
    label: '하루 누적 이동거리 상한',
    unit: 'km',
    hint: '하루 총 이동거리가 이 값을 넘으면 비정상 이동으로 판정해요.',
    group: MOVE_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_POLICY.gps_daily_distance_cap_km,
    affectsDisclosure: false,
  },
  {
    key: 'vehicle_speed_filter_kmh',
    label: '차량 속도 필터',
    unit: 'km/h',
    hint: '평균 속도가 이 값을 넘는 활동은 배지·아이템 드랍·미션 평가에서 제외해요. 자전거·달리기까지 걸러지지 않도록 20km/h 아래로는 내릴 수 없어요.',
    group: VEHICLE_GROUP,
    decimals: 0,
    min: MIN_VEHICLE_SPEED_FILTER_KMH,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_POLICY.vehicle_speed_filter_kmh,
    affectsDisclosure: false,
  },
  {
    key: 'transit_walk_max_speed_kmh',
    label: '걷기 최고 속도',
    unit: 'km/h',
    hint: transitHint('걷기'),
    group: TRANSIT_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_POLICY.transit_walk_max_speed_kmh,
    affectsDisclosure: false,
  },
  {
    key: 'transit_run_max_speed_kmh',
    label: '러닝 최고 속도',
    unit: 'km/h',
    hint: transitHint('러닝'),
    group: TRANSIT_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_POLICY.transit_run_max_speed_kmh,
    affectsDisclosure: false,
  },
  {
    key: 'transit_cycling_max_speed_kmh',
    label: '자전거 최고 속도',
    unit: 'km/h',
    hint: transitHint('자전거'),
    group: TRANSIT_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_POLICY.transit_cycling_max_speed_kmh,
    affectsDisclosure: false,
  },
  {
    key: 'transit_segment_min_duration_sec',
    label: '최소 지속 시간',
    unit: '초',
    hint: '최고 속도를 이 시간 이상 이어서 넘겨야 교통수단 탑승 구간으로 판정해요.',
    group: TRANSIT_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_POLICY.transit_segment_min_duration_sec,
    affectsDisclosure: false,
  },
  {
    key: 'mismatch_run_min_speed_kmh',
    label: '러닝 최소 평균 속도',
    unit: 'km/h',
    hint: '기록 속도가 이 값보다 느리면 걷기로 계산해요. 트레일러닝·등산은 제외해요.',
    group: MISMATCH_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_POLICY.mismatch_run_min_speed_kmh,
    affectsDisclosure: false,
  },
  {
    key: 'mismatch_cycling_min_speed_kmh',
    label: '자전거 최소 평균 속도',
    unit: 'km/h',
    hint: '기록 속도가 이 값보다 느리면 걷기로 계산해요.',
    group: MISMATCH_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_POLICY.mismatch_cycling_min_speed_kmh,
    affectsDisclosure: false,
  },
  {
    key: 'poi_block_hours',
    label: '블록 지속 시간',
    unit: '시간',
    hint: '차단된 장소의 블록을 유지하는 시간이에요. 72시간은 3일이에요.',
    group: BLOCK_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_POLICY.poi_block_hours,
    affectsDisclosure: false,
  },
]

type AbusingPolicyInsert = Database['public']['Tables']['abusing_policy']['Insert']
type AbusingPolicyUpdate = Database['public']['Tables']['abusing_policy']['Update']

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다. `ABUSING_BALANCE_KEYS`와 같아야 하고 시험이 지킨다). */
export const ABUSING_SELECT =
  'gps_max_speed_kmh, gps_daily_distance_cap_km, vehicle_speed_filter_kmh, transit_walk_max_speed_kmh, transit_run_max_speed_kmh, transit_cycling_max_speed_kmh, transit_segment_min_duration_sec, mismatch_run_min_speed_kmh, mismatch_cycling_min_speed_kmh, poi_block_hours, updated_at'

/**
 * `abusing_policy` 행이 없을 때 읽기가 돌려주는 수정 시각. 공용 저장이 빈 글자를 거절하므로 자리를 채우는 값이고, DB가 받는 시각 형식이라
 * 이력 실패 뒤 되돌림이 이 값을 `updated_at`에 써도 오류가 나지 않는다. 쓰기는 이 값을 들고 오면 «행이 없던 때의 첫 저장»으로 본다.
 */
export const ABUSING_NO_ROW_STAMP = '1970-01-01T00:00:00.000Z'

const LOG = '[admin/balance]'

function defaultValues(): BalanceValues {
  return Object.fromEntries(ABUSING_BALANCE_KEYS.map((key) => [key, DEFAULT_POLICY[key]]))
}

export const ABUSING_BINDING: BalanceSectionBinding = {
  id: ABUSING_SECTION_ID,
  fields: ABUSING_FIELDS,

  async read(service) {
    const { data, error } = await service.from('abusing_policy').select(ABUSING_SELECT).eq('id', 1).maybeSingle()
    if (error) throw new Error(`어뷰징 정책 조회 실패: ${error.message}`)
    if (!data) {
      console.error(`${LOG} ${ABUSING_SECTION_ID} id=1 행이 없음 — 기본값을 보인다. 첫 저장이 행을 만든다`)
      return { values: defaultValues(), updatedAt: ABUSING_NO_ROW_STAMP }
    }
    const row: Record<string, unknown> = data
    const values: BalanceValues = {}
    for (const key of ABUSING_BALANCE_KEYS) {
      const n = dbNumber(row[key])
      if (n === null) throw new Error(`어뷰징 정책 조회 실패: ${key} 값을 숫자로 읽을 수 없음`)
      values[key] = n
    }
    return { values, updatedAt: data.updated_at }
  },

  async write(service, input) {
    if (input.expectedUpdatedAt === ABUSING_NO_ROW_STAMP) {
      // 행이 없던 때의 첫 저장: 옛 `updateAbusingPolicy`처럼 upsert. 화면이 보던 기본값 전부를 싣고 바꾼 칸만 새 값으로 덮는다
      const insert: AbusingPolicyInsert = { id: 1, ...DEFAULT_POLICY, updated_at: input.nextUpdatedAt }
      for (const key of ABUSING_BALANCE_KEYS) {
        const value = input.values[key]
        if (value !== undefined) insert[key] = value
      }
      const { data, error } = await service.from('abusing_policy').upsert(insert).select('updated_at')
      if (error) return { ok: false, reason: 'error', message: error.message }
      const created = data?.[0]
      if (!created) return { ok: false, reason: 'error', message: '저장한 행을 돌려받지 못함' }
      return { ok: true, updatedAt: created.updated_at }
    }

    const update: AbusingPolicyUpdate = { updated_at: input.nextUpdatedAt }
    for (const key of ABUSING_BALANCE_KEYS) {
      const value = input.values[key]
      if (value !== undefined) update[key] = value
    }
    const { data, error } = await service
      .from('abusing_policy')
      .update(update)
      .eq('id', 1)
      .eq('updated_at', input.expectedUpdatedAt)
      .select('updated_at')
    if (error) return { ok: false, reason: 'error', message: error.message }
    const row = data?.[0]
    if (!row) return { ok: false, reason: 'conflict' }
    return { ok: true, updatedAt: row.updated_at }
  },
}
