/**
 * 밸런스 설정 «시스템 드랍» 구역의 연결 (티켓 20261022_1134 3회, 운영 로직 9.4절·19.1절)
 *
 * `ambient_drop_config` id=1 한 행의 **숫자 8칸**을 편집한다: 예약 배포 시각(`schedule_hour_kst`)과 상호 배제 창(`exclusion_window_minutes`), 배치 규모(`batch_size`)와 지점당 한도(`max_active_per_poi`),
 * 등급 비율 네 칸(`rarity_*`). 옛 앰비언트 드랍 화면(`/admin/ambient-drop`)과 그 저장 API(`PUT /api/admin/ambient-drop/config`)가 쓰던 숫자 칸을 이 구역으로 옮겼다.
 * 스위치(`auto_enabled`)와 세 축 고르기(`*_mode`, `category_slug`, `collection_ids`), 지금 배포, 날짜 예약, 실행 이력은 제재가 아니라 운영 도구라 옛 화면에 그대로 남고,
 * 그 저장은 숫자 칸을 쓰지 않는다(옛 라우트가 이 8열을 다시 쓰면 이 구역이 방금 바꾼 값을 되돌릴 수 있기 때문이다).
 * 열 정의는 마이그레이션 104(표)와 137(`schedule_hour_kst` SMALLINT, CHECK 0~23)이고 `exclusion_window_minutes`·`batch_size`·`max_active_per_poi`는 `INTEGER`(CHECK 0 이상, 1 이상, 1 이상)다.
 * `last_auto_run_on`은 예약 배포를 하루 한 번만 하려는 시스템 전용 열이라 읽지도 쓰지도 않는다. 그 열을 쓰는 cron(`claimAmbientDropAutoRun`)은 `updated_at`을 올리지 않으므로 이 구역의 수정 시각 409와 부딪치지 않는다.
 *
 * **등급 비율은 화면에서 퍼센트, DB에서 0~1이다.** 읽을 때 ×100, 쓸 때 ÷100으로 바꾼다. DB 열이 `NUMERIC(4,3)`이라 소수 셋째 자리까지 담고, 화면 퍼센트는 소수 첫째 자리(0.1%가 0.001)라 두 눈금이 정확히 맞는다.
 * 부동소수 곱셈이 `0.333 * 100 = 33.300000000000004`처럼 어긋나므로 곱하고 나눈 뒤 반올림으로 눈금에 맞춘다(`fields.ts`의 `fractionToPercent`·`percentToFraction`). 이력 값(`balance_setting_changes.changes`)도 화면 단위인 퍼센트로 남는다.
 * 합계 100 검사는 캡슐 구역과 같은 `validateSumTo100`을 쓴다(허용 오차 0.001이고 눈금이 0.1이라 소수 퍼센트의 부동소수 오차로 잘못 거절하지 않는다).
 *
 * 등급 네 칸은 확률 안내 페이지가 읽는 칸(`AMBIENT_COLUMNS`)이라 `affectsDisclosure: true`다(확률 안내 확인창이 뜨고, 이력의 `affects_disclosure`가 켜져 확률 안내의 «바뀐 날짜» 표에 오른다).
 * 단 `rarity_mode`가 random이면 서비스는 이 비율을 쓰지 않는다(`lib/ambient-drop/index.ts`). 구역 본문(`AmbientSection`)이 그때 안내 한 줄을 둔다.
 *
 * 옛 저장 라우트와 달라진 점: 상호 배제 창과 배치 규모·지점당 한도는 **정수만** 받는다(옛 라우트는 소수를 받아 DB 정수 열 오류가 «참조 값을 확인해주세요» 400으로 돌아왔다). 상호 배제 창 상한은 코드 기준 180분이다
 * (`AMBIENT_DROP_EXCLUSION_WINDOW_MAX_MINUTES`; 옛 오류 문구와 정책 카드가 720분이라고 적었다). 등급 비율은 합 100을 이 구역이 검사하고, 옛 라우트는 `rarity_mode`가 explicit일 때만 합 1을 검사했다.
 *
 * 읽기는 행이 없거나 값이 숫자가 아니면 던진다(구역이 오류 카드가 된다. 기본값으로 바꿔 보이지 않는다). 행은 마이그레이션 104가 만든다.
 * 쓰기는 `updated_at` 조건 갱신이다(갱신 트리거가 없어 저장이 직접 올린다). 바뀐 열만 쓴다.
 */
import { DEFAULT_AMBIENT_DROP_CONFIG } from '@/lib/ambient-drop/config'
import { AMBIENT_DROP_EXCLUSION_WINDOW_MAX_MINUTES } from '@/lib/ambient-drop/schedule'
import { AMBIENT_COLUMNS } from '@/lib/probability/disclosure'
import type { Database } from '@/types/database.generated'
import { dbNumber, fractionToPercent, percentToFraction, validateSumTo100 } from './fields'
import { INTEGER_MAX, type BalanceFieldDef, type BalanceSectionBinding, type BalanceServiceClient, type BalanceValues } from './types'

export const AMBIENT_SECTION_ID = 'ambient'

/** 이 구역이 편집하는 `ambient_drop_config` 칸. 화면 순서와 같다. */
export const AMBIENT_BALANCE_KEYS = [
  'schedule_hour_kst',
  'exclusion_window_minutes',
  'batch_size',
  'max_active_per_poi',
  'rarity_common',
  'rarity_rare',
  'rarity_epic',
  'rarity_mystic',
] as const

export type AmbientBalanceKey = (typeof AMBIENT_BALANCE_KEYS)[number]

/** 등급 비율 네 칸. 합이 100(%)이어야 한다. 확률 안내 페이지가 읽는 칸(`AMBIENT_COLUMNS`)과 같다. */
export const AMBIENT_RARITY_KEYS = ['rarity_common', 'rarity_rare', 'rarity_epic', 'rarity_mystic'] as const

const SCHEDULE_GROUP = '예약 배포'
const BATCH_GROUP = '배치 규모'
export const AMBIENT_RARITY_GROUP = '등급 비율'

const LOG = '[admin/balance]'

function isRarityKey(key: string): key is (typeof AMBIENT_RARITY_KEYS)[number] {
  return (AMBIENT_RARITY_KEYS as readonly string[]).includes(key)
}

/** 확률 안내 페이지가 읽는 `ambient_drop_config` 칸(`AMBIENT_COLUMNS`) — 이 칸을 바꾸면 확률 안내가 함께 바뀐다. */
const DISCLOSED = new Set<string>(AMBIENT_COLUMNS)

type AmbientFieldInit = Omit<BalanceFieldDef, 'affectsDisclosure' | 'defaultValue'> & { key: AmbientBalanceKey; defaultValue: number }

function ambientField(init: AmbientFieldInit): BalanceFieldDef {
  return { ...init, affectsDisclosure: DISCLOSED.has(init.key) }
}

function rarityField(key: (typeof AMBIENT_RARITY_KEYS)[number], label: string): BalanceFieldDef {
  return ambientField({
    key,
    label,
    unit: '%',
    group: AMBIENT_RARITY_GROUP,
    decimals: 1,
    min: 0,
    max: 100,
    sumTo: 100,
    defaultValue: fractionToPercent(DEFAULT_AMBIENT_DROP_CONFIG[key]),
  })
}

/**
 * 칸 정의. 범위는 DB와 코드의 기준이다: 배포 시각은 0~23 정수(마이그레이션 137의 CHECK, `isValidScheduleHourKst`), 상호 배제 창은 0 이상 180 이하 정수(CHECK `>= 0`과 코드 상한),
 * 배치 규모와 지점당 한도는 1 이상 정수(CHECK `> 0`), 등급 비율은 0~100(%)이고 소수 첫째 자리까지다. 기본값은 `DEFAULT_AMBIENT_DROP_CONFIG`(등급 비율은 퍼센트로 바꾼 값)다.
 */
export const AMBIENT_FIELDS: readonly BalanceFieldDef[] = [
  ambientField({
    key: 'schedule_hour_kst',
    label: '배포 시각',
    unit: '시',
    hint: '한국시간 기준 정시예요. 0은 자정, 3은 새벽 3시예요. 예약 배포를 켜 두면 이 시각에 매일 배포해요. 오늘 예약 배포가 이미 돌았다면 새 시각은 내일부터 적용돼요.',
    group: SCHEDULE_GROUP,
    decimals: 0,
    min: 0,
    max: 23,
    defaultValue: DEFAULT_AMBIENT_DROP_CONFIG.schedule_hour_kst,
  }),
  ambientField({
    key: 'exclusion_window_minutes',
    label: '상호 배제 창',
    unit: '분',
    hint: `예약 배포를 켜 두면 예약 시각 전후 이 시간 동안은 「지금 배포」를 누를 수 없어요. 두 배포가 겹치지 않게 하는 값이라 15분 안팎이면 충분해요. 0이면 막지 않아요. 너무 길면 「지금 배포」가 하루 종일 막힐 수 있어서 ${AMBIENT_DROP_EXCLUSION_WINDOW_MAX_MINUTES}분까지만 정할 수 있어요.`,
    group: SCHEDULE_GROUP,
    decimals: 0,
    min: 0,
    max: AMBIENT_DROP_EXCLUSION_WINDOW_MAX_MINUTES,
    defaultValue: DEFAULT_AMBIENT_DROP_CONFIG.exclusion_window_minutes,
  }),
  ambientField({
    key: 'batch_size',
    label: '실행당 배치 개수',
    unit: '개',
    hint: '배포 한 번에 장소에 놓는 드랍 개수예요.',
    group: BATCH_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_AMBIENT_DROP_CONFIG.batch_size,
  }),
  ambientField({
    key: 'max_active_per_poi',
    label: '장소당 최대 활성 드랍',
    unit: '개',
    hint: '한 장소에 동시에 놓여 있을 수 있는 시스템 드랍의 최대 개수예요.',
    group: BATCH_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_AMBIENT_DROP_CONFIG.max_active_per_poi,
  }),
  rarityField('rarity_common', 'Common'),
  rarityField('rarity_rare', 'Rare'),
  rarityField('rarity_epic', 'Epic'),
  rarityField('rarity_mystic', 'Mystic'),
]

type AmbientConfigUpdate = Database['public']['Tables']['ambient_drop_config']['Update']

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다. `AMBIENT_BALANCE_KEYS`와 같아야 하고 시험이 지킨다). */
export const AMBIENT_SELECT =
  'schedule_hour_kst, exclusion_window_minutes, batch_size, max_active_per_poi, rarity_common, rarity_rare, rarity_epic, rarity_mystic, updated_at'

export type AmbientRarityMode = 'explicit' | 'random'

/**
 * 등급 축 모드(`rarity_mode`)를 읽는다. 구역 본문이 «무작위라 등급 비율을 쓰지 않아요» 안내를 둘지 가르는 데만 쓴다.
 * 읽지 못하거나 모르는 값이면 던진다(부르는 쪽이 잡아서 안내만 생략한다. 구역 값 읽기를 막지 않는다).
 */
export async function readAmbientRarityMode(service: BalanceServiceClient): Promise<AmbientRarityMode> {
  const { data, error } = await service.from('ambient_drop_config').select('rarity_mode').eq('id', 1).maybeSingle()
  if (error) throw new Error(`시스템 드랍 등급 축 조회 실패: ${error.message}`)
  if (!data) throw new Error('시스템 드랍 등급 축 조회 실패: id=1 행이 없음')
  if (data.rarity_mode !== 'explicit' && data.rarity_mode !== 'random') throw new Error('시스템 드랍 등급 축 조회 실패: rarity_mode 값을 알 수 없음')
  return data.rarity_mode
}

export const AMBIENT_BINDING: BalanceSectionBinding = {
  id: AMBIENT_SECTION_ID,
  fields: AMBIENT_FIELDS,
  validateTogether: (values) => validateSumTo100(values, AMBIENT_RARITY_KEYS, AMBIENT_RARITY_GROUP),

  async read(service) {
    const { data, error } = await service.from('ambient_drop_config').select(AMBIENT_SELECT).eq('id', 1).maybeSingle()
    if (error) throw new Error(`시스템 드랍 설정 조회 실패: ${error.message}`)
    if (!data) throw new Error('시스템 드랍 설정 조회 실패: id=1 행이 없음')
    const row: Record<string, unknown> = data
    const values: BalanceValues = {}
    for (const key of AMBIENT_BALANCE_KEYS) {
      const n = dbNumber(row[key])
      if (n === null) throw new Error(`시스템 드랍 설정 조회 실패: ${key} 값을 숫자로 읽을 수 없음`)
      values[key] = isRarityKey(key) ? fractionToPercent(n) : n
    }
    return { values, updatedAt: data.updated_at }
  },

  async write(service, input) {
    const update: AmbientConfigUpdate = { updated_at: input.nextUpdatedAt }
    let columns = 0
    for (const key of AMBIENT_BALANCE_KEYS) {
      const value = input.values[key]
      if (value === undefined) continue
      update[key] = isRarityKey(key) ? percentToFraction(value) : value
      columns += 1
    }
    if (columns === 0) {
      console.error(`${LOG} ${AMBIENT_SECTION_ID} 바꿀 칸이 없는 쓰기 요청`)
      return { ok: false, reason: 'error', message: '바꿀 칸이 없음' }
    }
    const { data, error } = await service.from('ambient_drop_config').update(update).eq('id', 1).eq('updated_at', input.expectedUpdatedAt).select('updated_at')
    if (error) return { ok: false, reason: 'error', message: error.message }
    const row = data?.[0]
    if (!row) return { ok: false, reason: 'conflict' }
    return { ok: true, updatedAt: row.updated_at }
  },
}
