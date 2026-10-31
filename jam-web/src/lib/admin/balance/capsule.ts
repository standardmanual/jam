/**
 * 밸런스 설정 «캡슐» 구역의 연결 (티켓 20261022_1132 2회, 운영 로직 5.2·5.4·19.1절)
 *
 * 두 표를 한 구역으로 편집한다.
 * - `capsule_policy` id=1 한 행: 확정·보너스 개수와 확률, 다른 트라이브 확률, 등급 확률 4칸(합 100), Epic 보정, 퀘스트 전 채울 양(열 칸).
 * - `capsule_chapter_costs` 챕터 1~10행: 챕터별 숫자 세 가지. **값만 바꾼다**(가정 자) — 챕터 번호를 늘리거나 줄이지 않는다(챕터 더하기는 7-2). 칸 이름은 이력에도 그대로 남는다.
 *   - `chapter:3` — 옛 열 `fill_amount`(옛 수동 채우기가 읽는다, 티켓 20261028_1733의 마지막 축소 단계까지 둔다)
 *   - `fill_v2:3` — `fill_amount_v2`(동기화 자동 채움이 읽는 채울 양, 145~365)
 *   - `advance:3` — `advance_count`(이 챕터에서 캡슐이 100%에 닿은 횟수가 이만큼이 되면 다음 챕터로 오른다). **챕터 1~9만** 칸이 있다. 챕터 10은 DB에서 NULL(마지막 챕터라 멈춤)이 정상이라 칸을 두지 않고 읽지도 쓰지도 않는다
 *
 * Common 연속 보정(`common_streak_threshold`)과 잠길 확률(`locked_roll_probability`)은 동기화와 한 값이라 **동기화 구역에서 편집**하고 여기에는 안내만 둔다(가정 아, `CapsuleSection`).
 *
 * «확률 안내에 반영되는 칸»은 확률 안내 페이지가 읽는 칸 목록(`CAPSULE_COLUMNS`)에서 가져오고 여기에 다시 적지 않는다(단일 원천). 퀘스트 전 채울 양과 챕터별 채울 양은 페이지가 읽지 않는다.
 * `pre_quest_unlock_required`(퀘스트 전 첫 잠긴 개체의 자리값)는 이 구역이 읽지도 쓰지도 않는다. 비용은 마이그레이션 304 트리거가 정하고, DB 열은 `inventory_items_lock_consistent` 제약 때문에 남아 있다(티켓 20261031_0458 3회).
 * 확정 개수와 보너스 개수는 0을 허용한다. 모두 0이면 경고만 보이고 막지 않는다(가정 바).
 *
 * **행 단위 설정이 공용 저장과 맞지 않는 곳을 이 연결 객체 안에서 처리한다.** 공용 저장(`saveBalanceSection`)은 구역마다 «값 묶음 하나 + 수정 시각 하나»를 가정하고 갱신을 `write` 한 번으로 맡기는데,
 * 이 구역은 표가 둘이고 챕터는 행마다 `updated_at`이 따로 있어 한 번의 조건부 갱신으로 끝나지 않는다. 그래서:
 * - 구역의 수정 시각(`updatedAt`)은 **정책 행과 챕터 행들의 수정 시각 중 가장 늦은 것**이다. 어느 행이든 저장하면 이 값이 올라가므로 화면이 읽은 뒤 누가 바꿨는지 구역 단위로 가려진다.
 * - `write`는 모든 행의 수정 시각을 다시 읽어 가장 늦은 값이 화면이 본 값(`expectedUpdatedAt`)과 같을 때만 시작하고(아니면 conflict), 행마다 «방금 읽은 수정 시각이 같을 때만» 갱신한다
 *   (읽은 뒤 다른 곳이 그 행을 바꾸면 0행이 되어 conflict).
 * - 여러 행을 쓰다가 중간에 실패하거나 0행이 되면 **이미 쓴 행을 이전 값과 이전 수정 시각으로 되돌린 뒤** 결과를 돌려준다(공용 저장의 이력 실패 되돌리기와 별개로, 부분 저장이 남지 않게 한다).
 *   되돌리기까지 실패하면 로그에 남기고 error로 답한다.
 * - 공용 저장이 이력을 쓰지 못해 부르는 되돌리기(`nextUpdatedAt` = 읽었던 때의 구역 수정 시각)도 같은 `write`로 처리한다: 바뀐 행의 수정 시각이 그 값이 되고, 구역의 가장 늦은 수정 시각이 원래 값으로 돌아온다.
 *
 * 구역의 칸 정의는 챕터 1~10으로 고정이다. DB에 열한 번째 챕터 행이 생겨도(7-2) 이 구역은 읽지도 쓰지도 않는다(그 수정 시각도 구역 수정 시각에 넣지 않는다).
 */
import { CAPSULE_COLUMNS } from '@/lib/probability/disclosure'
import { DEFAULT_CAPSULE_POLICY, VALIDATORS, type CapsulePolicy } from '@/lib/capsule/policy'
import type { Database } from '@/types/database.generated'
import { dbNumber, validateSumTo100 } from './fields'
import {
  INTEGER_MAX,
  type BalanceFieldDef,
  type BalanceSectionBinding,
  type BalanceServiceClient,
  type BalanceValues,
  type BalanceWriteResult,
} from './types'

export const CAPSULE_SECTION_ID = 'capsule'

/** 이 구역이 편집하는 `capsule_policy` 칸. 화면 순서와 같다. */
export const CAPSULE_POLICY_KEYS = [
  'guaranteed_count',
  'bonus_count',
  'bonus_probability',
  'other_tribe_probability',
  'rarity_common',
  'rarity_rare',
  'rarity_epic',
  'rarity_mystic',
  'pity_epic_threshold',
  'pre_quest_fill_amount',
] as const satisfies readonly (keyof CapsulePolicy)[]

export type CapsulePolicyKey = (typeof CAPSULE_POLICY_KEYS)[number]

/** 등급 확률 네 칸. 합이 100이어야 한다. */
export const CAPSULE_RARITY_KEYS = ['rarity_common', 'rarity_rare', 'rarity_epic', 'rarity_mystic'] as const

/** 챕터별 숫자를 가진 행 수. 마이그레이션 232가 1~10을 넣는다. 챕터 번호를 늘리거나 줄이지 않는다. */
export const CAPSULE_CHAPTER_COUNT = 10

/** 100% 횟수 칸이 있는 챕터 수(1~9). 마지막 챕터(10)는 다음 챕터가 없어 `advance_count`가 NULL이다. */
export const CAPSULE_ADVANCE_CHAPTER_COUNT = CAPSULE_CHAPTER_COUNT - 1

/**
 * 챕터별 채울 양의 기본값 — 마이그레이션 232 시드(운영 로직 5.4절)와 같다. 코드에 따로 있던 값이 아니라 이 화면이 «기본값»을 보이려고 두는 사본이다.
 * 시드를 바꾸는 마이그레이션을 쓰면 같은 티켓에서 이 상수도 바꾼다.
 */
export const CAPSULE_CHAPTER_DEFAULT_FILL: readonly number[] = [90, 100, 110, 120, 135, 150, 165, 180, 200, 220]

/** 챕터별 채울 양(자동 채움)의 기본값 — 마이그레이션 300 시드(운영 로직 5.4절)와 같다. 시드를 바꾸는 마이그레이션을 쓰면 같은 티켓에서 이 상수도 바꾼다. */
export const CAPSULE_CHAPTER_DEFAULT_FILL_V2: readonly number[] = [145, 160, 180, 200, 220, 245, 270, 300, 330, 365]

/** 챕터별 100% 횟수의 기본값(챕터 1~9) — 마이그레이션 300 시드와 같다. 챕터 10은 NULL이라 값이 없다. */
export const CAPSULE_CHAPTER_DEFAULT_ADVANCE: readonly number[] = [6, 7, 7, 8, 9, 9, 10, 11, 12]

/** 챕터 행의 칸 이름(`chapter:3`, 옛 `fill_amount`). 저장 본문·이력의 `field`와 같다. */
export function chapterKey(chapterNo: number): string {
  return `chapter:${chapterNo}`
}

/** 자동 채움의 채울 양 칸 이름(`fill_v2:3`, `fill_amount_v2`). 옛 칸 `chapter:N`과 겹치지 않는다. */
export function fillV2Key(chapterNo: number): string {
  return `fill_v2:${chapterNo}`
}

/** 100% 횟수 칸 이름(`advance:3`, `advance_count`). 챕터 1~9만 있다. */
export function advanceKey(chapterNo: number): string {
  return `advance:${chapterNo}`
}

/** `capsule_chapter_costs`에서 이 구역이 쓰는 세 열. */
export type CapsuleChapterColumn = 'fill_amount' | 'fill_amount_v2' | 'advance_count'

/** 칸 이름 → 챕터 번호와 열. 이 구역의 챕터 칸이 아니면(`advance:10`, `fill_v2:11` 포함) `null`. */
export function parseChapterColumnKey(key: string): { chapterNo: number; column: CapsuleChapterColumn } | null {
  const match = /^(chapter|fill_v2|advance):([1-9]\d*)$/.exec(key)
  if (!match) return null
  const chapterNo = Number(match[2])
  if (match[1] === 'advance') return chapterNo <= CAPSULE_ADVANCE_CHAPTER_COUNT ? { chapterNo, column: 'advance_count' } : null
  if (chapterNo > CAPSULE_CHAPTER_COUNT) return null
  return { chapterNo, column: match[1] === 'chapter' ? 'fill_amount' : 'fill_amount_v2' }
}

/** `chapter:3` → 3. 1~10 밖이거나 형식이 다르면 `null`. */
export function parseChapterKey(key: string): number | null {
  const match = /^chapter:([1-9]\d*)$/.exec(key)
  if (!match) return null
  const chapterNo = Number(match[1])
  return chapterNo >= 1 && chapterNo <= CAPSULE_CHAPTER_COUNT ? chapterNo : null
}

export const CAPSULE_CHAPTER_KEYS: readonly string[] = Array.from({ length: CAPSULE_CHAPTER_COUNT }, (_, index) => chapterKey(index + 1))
export const CAPSULE_FILL_V2_KEYS: readonly string[] = Array.from({ length: CAPSULE_CHAPTER_COUNT }, (_, index) => fillV2Key(index + 1))
export const CAPSULE_ADVANCE_KEYS: readonly string[] = Array.from({ length: CAPSULE_ADVANCE_CHAPTER_COUNT }, (_, index) => advanceKey(index + 1))

/** 확률 안내 페이지가 읽는 `capsule_policy` 칸(`CAPSULE_COLUMNS`) — 이 칸을 바꾸면 확률 안내가 함께 바뀐다. */
const DISCLOSED = new Set<string>(CAPSULE_COLUMNS)

const COUNT_GROUP = '나오는 개수'
const PROBABILITY_GROUP = '확률'
const RARITY_GROUP = '등급 확률'
const PITY_GROUP = '보정'
const PRE_QUEST_GROUP = '퀘스트 전 캡슐'
/** 옛 열 `fill_amount`. 옛 수동 채우기가 읽는 값이라 자동 채움 값과 헷갈리지 않게 제목에 밝힌다. */
export const CAPSULE_CHAPTER_GROUP = '챕터별 채울 양 (옛 수동 채우기)'
export const CAPSULE_FILL_V2_GROUP = '챕터별 채울 양 (동기화 자동 채움)'
export const CAPSULE_ADVANCE_GROUP = '챕터별 100% 횟수 (다음 챕터로 오르는 횟수)'

const PROBABILITY_HINT = '0과 1 사이의 소수로 써요. 0.2는 20%예요.'

type PolicyFieldInit = Omit<BalanceFieldDef, 'affectsDisclosure' | 'defaultValue'> & { key: CapsulePolicyKey }

function policyField(init: PolicyFieldInit): BalanceFieldDef {
  return { ...init, defaultValue: DEFAULT_CAPSULE_POLICY[init.key], affectsDisclosure: DISCLOSED.has(init.key) }
}

function chapterField(chapterNo: number): BalanceFieldDef {
  return {
    key: chapterKey(chapterNo),
    label: `챕터 ${chapterNo}`,
    unit: '잼',
    group: CAPSULE_CHAPTER_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: CAPSULE_CHAPTER_DEFAULT_FILL[chapterNo - 1],
    affectsDisclosure: false,
  }
}

function fillV2Field(chapterNo: number): BalanceFieldDef {
  return {
    key: fillV2Key(chapterNo),
    label: `챕터 ${chapterNo}`,
    unit: '잼',
    group: CAPSULE_FILL_V2_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: CAPSULE_CHAPTER_DEFAULT_FILL_V2[chapterNo - 1],
    affectsDisclosure: false,
  }
}

function advanceField(chapterNo: number): BalanceFieldDef {
  return {
    key: advanceKey(chapterNo),
    label: `챕터 ${chapterNo}`,
    unit: '번',
    hint:
      chapterNo === CAPSULE_ADVANCE_CHAPTER_COUNT
        ? '이 챕터에서 캡슐이 100%에 이만큼 닿으면 다음 챕터로 올라요. 챕터 10은 마지막이라 횟수가 없어요.'
        : '이 챕터에서 캡슐이 100%에 이만큼 닿으면 다음 챕터로 올라요.',
    group: CAPSULE_ADVANCE_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: CAPSULE_CHAPTER_DEFAULT_ADVANCE[chapterNo - 1],
    affectsDisclosure: false,
  }
}

/**
 * 칸 정의. 범위는 마이그레이션 232의 CHECK와 같다: 개수는 0 이상 정수(0 허용), 확률은 0~1(`NUMERIC(4,3)`, 소수 셋째 자리), 등급 확률은 0 이상(`NUMERIC(6,3)`)이고 합이 100이라 한 칸이 100을 넘을 수 없다,
 * Epic 보정·퀘스트 전 채울 양·챕터별 채울 양(옛·자동 채움)·챕터별 100% 횟수는 1 이상 정수(`fill_amount_v2`·`advance_count`의 CHECK는 NULL도 허용하지만 이 화면은 NULL로 바꾸지 않는다).
 */
export const CAPSULE_FIELDS: readonly BalanceFieldDef[] = [
  policyField({
    key: 'guaranteed_count',
    label: '확정 개수',
    unit: '개',
    hint: '캡슐을 열 때 확정으로 나오는 아이템 배지 수예요. 0도 쓸 수 있어요.',
    group: COUNT_GROUP,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
  }),
  policyField({
    key: 'bonus_count',
    label: '보너스 개수',
    unit: '개',
    hint: '확률로 더 나올 수 있는 아이템 배지 수예요. 0이면 더 나오지 않아요.',
    group: COUNT_GROUP,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
  }),
  policyField({
    key: 'bonus_probability',
    label: '보너스가 나올 확률',
    hint: `보너스 개수가 나올 확률이에요. ${PROBABILITY_HINT}`,
    group: PROBABILITY_GROUP,
    decimals: 3,
    min: 0,
    max: 1,
  }),
  policyField({
    key: 'other_tribe_probability',
    label: '다른 트라이브의 것일 확률',
    hint: `나온 아이템 배지마다 다른 트라이브의 것일 확률이에요. ${PROBABILITY_HINT}`,
    group: PROBABILITY_GROUP,
    decimals: 3,
    min: 0,
    max: 1,
  }),
  policyField({ key: 'rarity_common', label: 'Common', unit: '%', group: RARITY_GROUP, decimals: 3, min: 0, max: 100, sumTo: 100 }),
  policyField({ key: 'rarity_rare', label: 'Rare', unit: '%', group: RARITY_GROUP, decimals: 3, min: 0, max: 100, sumTo: 100 }),
  policyField({ key: 'rarity_epic', label: 'Epic', unit: '%', group: RARITY_GROUP, decimals: 3, min: 0, max: 100, sumTo: 100 }),
  policyField({ key: 'rarity_mystic', label: 'Mystic', unit: '%', group: RARITY_GROUP, decimals: 3, min: 0, max: 100, sumTo: 100 }),
  policyField({
    key: 'pity_epic_threshold',
    label: 'Epic 보정',
    unit: '번',
    hint: '이만큼 여는 동안 Epic 이상이 나오지 않으면 그다음 캡슐은 Epic 이상이 나와요.',
    group: PITY_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
  }),
  policyField({
    key: 'pre_quest_fill_amount',
    label: '채울 양',
    unit: '잼',
    hint: '챕터가 없는 유저(퀘스트 전)가 처음 만드는 캡슐의 채울 양이에요.',
    group: PRE_QUEST_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
  }),
  ...Array.from({ length: CAPSULE_CHAPTER_COUNT }, (_, index) => fillV2Field(index + 1)),
  ...Array.from({ length: CAPSULE_ADVANCE_CHAPTER_COUNT }, (_, index) => advanceField(index + 1)),
  ...Array.from({ length: CAPSULE_CHAPTER_COUNT }, (_, index) => chapterField(index + 1)),
]

/** 확정 개수와 보너스 개수가 모두 0이면 캡슐을 열어도 아이템 배지가 나오지 않는다(막지는 않는다, 가정 바). */
export const CAPSULE_NO_ITEM_WARNING =
  '아이템 배지가 나오지 않아요. 확정 개수와 보너스 개수가 모두 0이에요. 나오게 하려면 하나를 1 이상으로 바꿔 주세요. 의도한 설정이면 그대로 저장할 수 있어요.'

type CapsulePolicyUpdate = Database['public']['Tables']['capsule_policy']['Update']

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다. `CAPSULE_POLICY_KEYS`와 같아야 하고 시험이 지킨다). */
export const CAPSULE_POLICY_SELECT =
  'guaranteed_count, bonus_count, bonus_probability, other_tribe_probability, rarity_common, rarity_rare, rarity_epic, rarity_mystic, pity_epic_threshold, pre_quest_fill_amount, updated_at'
export const CAPSULE_CHAPTER_SELECT = 'chapter_no, fill_amount, fill_amount_v2, advance_count, updated_at'

type ChapterUpdate = Database['public']['Tables']['capsule_chapter_costs']['Update']

interface ChapterRow {
  /** 옛 `fill_amount` */
  fill: number
  /** `fill_amount_v2` */
  fillV2: number
  /** `advance_count`. 챕터 10은 NULL이 정상이라 `null`이다(읽지도 쓰지도 않는다). */
  advance: number | null
  stamp: string
}

interface CapsuleRows {
  policy: { values: BalanceValues; stamp: string }
  /** 챕터 번호 → 채울 양과 수정 시각. 1~10이 모두 있다. */
  chapters: Map<number, ChapterRow>
}

/** 수정 시각 가운데 가장 늦은 것(밀리초로 견주고, 같으면 먼저 나온 글자). 읽을 수 없는 글자가 있으면 던진다. */
function latestStamp(stamps: readonly string[]): string {
  let best: string | null = null
  let bestTime = Number.NEGATIVE_INFINITY
  for (const stamp of stamps) {
    const time = Date.parse(stamp)
    if (Number.isNaN(time)) throw new Error(`수정 시각을 읽을 수 없음: ${stamp}`)
    if (time > bestTime) {
      best = stamp
      bestTime = time
    }
  }
  if (best === null) throw new Error('수정 시각이 없음')
  return best
}

function rowsStamp(rows: CapsuleRows): string {
  return latestStamp([rows.policy.stamp, ...[...rows.chapters.values()].map((chapter) => chapter.stamp)])
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 두 표를 가공 없이 읽는다. 행이 없거나 숫자가 아닌 칸이 있으면 던진다(기본값으로 바꿔 보이지 않는다). */
async function readRows(service: BalanceServiceClient): Promise<CapsuleRows> {
  const [policyRes, chapterRes] = await Promise.all([
    service.from('capsule_policy').select(CAPSULE_POLICY_SELECT).eq('id', 1).maybeSingle(),
    service.from('capsule_chapter_costs').select(CAPSULE_CHAPTER_SELECT).order('chapter_no', { ascending: true }),
  ])
  if (policyRes.error) throw new Error(`캡슐 정책 조회 실패: ${policyRes.error.message}`)
  if (!policyRes.data) throw new Error('캡슐 정책 조회 실패: id=1 행이 없음')
  if (chapterRes.error) throw new Error(`챕터별 채울 양 조회 실패: ${chapterRes.error.message}`)

  const policyRow: Record<string, unknown> = policyRes.data
  const values: BalanceValues = {}
  for (const key of CAPSULE_POLICY_KEYS) {
    const n = dbNumber(policyRow[key])
    if (n === null) throw new Error(`캡슐 정책 조회 실패: ${key} 값을 숫자로 읽을 수 없음`)
    values[key] = n
  }

  const chapters = new Map<number, ChapterRow>()
  for (const row of chapterRes.data ?? []) {
    if (row.chapter_no < 1 || row.chapter_no > CAPSULE_CHAPTER_COUNT) continue
    const fill = dbNumber(row.fill_amount)
    if (fill === null) throw new Error(`챕터별 채울 양 조회 실패: 챕터 ${row.chapter_no} 값을 숫자로 읽을 수 없음`)
    const fillV2 = dbNumber(row.fill_amount_v2)
    if (fillV2 === null) throw new Error(`챕터별 채울 양 조회 실패: 챕터 ${row.chapter_no} fill_amount_v2 값을 숫자로 읽을 수 없음`)
    const advance = dbNumber(row.advance_count)
    if (advance === null && row.chapter_no <= CAPSULE_ADVANCE_CHAPTER_COUNT) {
      throw new Error(`챕터별 채울 양 조회 실패: 챕터 ${row.chapter_no} advance_count 값을 숫자로 읽을 수 없음`)
    }
    chapters.set(row.chapter_no, { fill, fillV2, advance, stamp: row.updated_at })
  }
  for (let chapterNo = 1; chapterNo <= CAPSULE_CHAPTER_COUNT; chapterNo += 1) {
    if (!chapters.has(chapterNo)) throw new Error(`챕터별 채울 양 조회 실패: 챕터 ${chapterNo} 행이 없음`)
  }
  return { policy: { values, stamp: policyRes.data.updated_at }, chapters }
}

function isPolicyKey(key: string): key is CapsulePolicyKey {
  return (CAPSULE_POLICY_KEYS as readonly string[]).includes(key)
}

/** 바꾸려던 열만 이전 값으로, 수정 시각도 이전 값으로 돌리는 갱신 본문. */
function restoreOf(patch: ChapterUpdate, before: ChapterRow): ChapterUpdate {
  const restore: ChapterUpdate = { updated_at: before.stamp }
  if (patch.fill_amount !== undefined) restore.fill_amount = before.fill
  if (patch.fill_amount_v2 !== undefined) restore.fill_amount_v2 = before.fillV2
  if (patch.advance_count !== undefined) restore.advance_count = before.advance
  return restore
}

/** 이미 쓴 행. 되돌릴 때 «방금 쓴 수정 시각이 같을 때만» 이전 값으로 돌린다. */
type AppliedRow = { kind: 'policy'; stamp: string } | { kind: 'chapter'; chapterNo: number; stamp: string }

export const CAPSULE_BINDING: BalanceSectionBinding = {
  id: CAPSULE_SECTION_ID,
  fields: CAPSULE_FIELDS,
  validators: {
    ...Object.fromEntries(CAPSULE_POLICY_KEYS.map((key) => [key, VALIDATORS[key]])),
    ...Object.fromEntries(
      [...CAPSULE_CHAPTER_KEYS, ...CAPSULE_FILL_V2_KEYS, ...CAPSULE_ADVANCE_KEYS].map((key) => [key, (n: number) => Number.isInteger(n) && n >= 1])
    ),
  },
  validateTogether: (values) => validateSumTo100(values, CAPSULE_RARITY_KEYS),
  zeroWarnings: [{ keys: ['guaranteed_count', 'bonus_count'], message: CAPSULE_NO_ITEM_WARNING }],

  async read(service) {
    const rows = await readRows(service)
    const values: BalanceValues = { ...rows.policy.values }
    // 칸 정의(`CAPSULE_FIELDS`)와 같은 순서: 자동 채움 채울 양 → 100% 횟수 → 옛 채울 양
    for (let chapterNo = 1; chapterNo <= CAPSULE_CHAPTER_COUNT; chapterNo += 1) {
      const chapter = rows.chapters.get(chapterNo)
      if (chapter) values[fillV2Key(chapterNo)] = chapter.fillV2
    }
    for (let chapterNo = 1; chapterNo <= CAPSULE_ADVANCE_CHAPTER_COUNT; chapterNo += 1) {
      const advance = rows.chapters.get(chapterNo)?.advance
      if (advance !== undefined && advance !== null) values[advanceKey(chapterNo)] = advance
    }
    for (let chapterNo = 1; chapterNo <= CAPSULE_CHAPTER_COUNT; chapterNo += 1) {
      const chapter = rows.chapters.get(chapterNo)
      if (chapter) values[chapterKey(chapterNo)] = chapter.fill
    }
    return { values, updatedAt: rowsStamp(rows) }
  },

  async write(service, input): Promise<BalanceWriteResult> {
    const policyPatch: CapsulePolicyUpdate = {}
    /** 챕터 번호 → 그 행에서 바꿀 열. 한 챕터의 여러 칸은 행 갱신 한 번으로 쓴다. */
    const chapterPatches = new Map<number, ChapterUpdate>()
    for (const [key, value] of Object.entries(input.values)) {
      if (isPolicyKey(key)) {
        policyPatch[key] = value
        continue
      }
      const parsed = parseChapterColumnKey(key)
      if (parsed) chapterPatches.set(parsed.chapterNo, { ...chapterPatches.get(parsed.chapterNo), [parsed.column]: value })
    }
    const chapterPatch = [...chapterPatches.entries()].sort(([a], [b]) => a - b).map(([chapterNo, patch]) => ({ chapterNo, patch }))
    const hasPolicy = Object.keys(policyPatch).length > 0
    if (!hasPolicy && chapterPatch.length === 0) return { ok: false, reason: 'error', message: '바꿀 칸이 없음' }

    let rows: CapsuleRows
    try {
      rows = await readRows(service)
    } catch (e) {
      return { ok: false, reason: 'error', message: messageOf(e) }
    }
    if (rowsStamp(rows) !== input.expectedUpdatedAt) return { ok: false, reason: 'conflict' }

    const applied: AppliedRow[] = []

    /** 이미 쓴 행을 이전 값과 이전 수정 시각으로 되돌린다(나중에 쓴 행부터). 하나라도 못 되돌리면 `false`. */
    async function undoApplied(): Promise<boolean> {
      let allUndone = true
      for (const item of [...applied].reverse()) {
        if (item.kind === 'policy') {
          const restore: CapsulePolicyUpdate = { updated_at: rows.policy.stamp }
          for (const key of CAPSULE_POLICY_KEYS) if (policyPatch[key] !== undefined) restore[key] = rows.policy.values[key]
          const { data, error } = await service.from('capsule_policy').update(restore).eq('id', 1).eq('updated_at', item.stamp).select('updated_at')
          if (error || !data?.[0]) allUndone = false
        } else {
          const before = rows.chapters.get(item.chapterNo)
          if (!before) {
            allUndone = false
            continue
          }
          const { data, error } = await service
            .from('capsule_chapter_costs')
            .update(restoreOf(chapterPatches.get(item.chapterNo) ?? {}, before))
            .eq('chapter_no', item.chapterNo)
            .eq('updated_at', item.stamp)
            .select('updated_at')
          if (error || !data?.[0]) allUndone = false
        }
      }
      return allUndone
    }

    async function abort(result: Exclude<BalanceWriteResult, { ok: true }>): Promise<BalanceWriteResult> {
      if (applied.length === 0) return result
      const undone = await undoApplied()
      if (!undone) {
        console.error(
          '[admin/balance] capsule 여러 행을 쓰다 멈췄고 이미 쓴 행을 되돌리지도 못했다 — 일부 행만 바뀌어 있을 수 있다:',
          JSON.stringify(applied)
        )
        return { ok: false, reason: 'error', message: `${result.reason === 'error' ? result.message : '다른 곳이 먼저 바꿈'} (되돌리기 실패)` }
      }
      return result
    }

    if (hasPolicy) {
      const { data, error } = await service
        .from('capsule_policy')
        .update({ ...policyPatch, updated_at: input.nextUpdatedAt })
        .eq('id', 1)
        .eq('updated_at', rows.policy.stamp)
        .select('updated_at')
      if (error) return abort({ ok: false, reason: 'error', message: error.message })
      const row = data?.[0]
      if (!row) return abort({ ok: false, reason: 'conflict' })
      applied.push({ kind: 'policy', stamp: row.updated_at })
    }

    for (const { chapterNo, patch } of chapterPatch) {
      const before = rows.chapters.get(chapterNo)
      if (!before) return abort({ ok: false, reason: 'error', message: `챕터 ${chapterNo} 행이 없음` })
      const { data, error } = await service
        .from('capsule_chapter_costs')
        .update({ ...patch, updated_at: input.nextUpdatedAt })
        .eq('chapter_no', chapterNo)
        .eq('updated_at', before.stamp)
        .select('updated_at')
      if (error) return abort({ ok: false, reason: 'error', message: error.message })
      const row = data?.[0]
      if (!row) return abort({ ok: false, reason: 'conflict' })
      applied.push({ kind: 'chapter', chapterNo, stamp: row.updated_at })
    }

    // 구역의 수정 시각 = 이번에 쓴 행들(모두 같은 시각)과 쓰지 않은 행들 가운데 가장 늦은 것
    const touchedChapters = new Set(chapterPatches.keys())
    const untouched = [
      ...(hasPolicy ? [] : [rows.policy.stamp]),
      ...[...rows.chapters.entries()].filter(([chapterNo]) => !touchedChapters.has(chapterNo)).map(([, chapter]) => chapter.stamp),
    ]
    return { ok: true, updatedAt: latestStamp([applied[0].stamp, ...untouched]) }
  },
}
