/**
 * 밸런스 설정 «챕터» 구역의 연결 (티켓 20261022_1133 2회, 운영 로직 12.2·12.4·19.1절)
 *
 * 두 표를 한 구역으로 편집한다. **지금 있는 챕터와 활동의 값만 바꾼다**(챕터 더하기는 후속 티켓 20261022_1718, 줄이기는 만들지 않는다).
 * - `chapter_definitions` 챕터 1~10행: 챕터에 오르는 데 필요한 누적 점수(`required_score`). 챕터 1은 퀘스트를 마치면 얻어서 0으로 고정이라 **읽기만** 하고(편집 칸이 없다), 챕터 2~10만 편집한다.
 *   칸 이름은 `required:3` 형식이고 이력에도 그대로 남는다. 앞 챕터보다 커야 한다(`validateTogether`).
 * - `chapter_score_rules` 활동 12행(`CHAPTER_SCORE_KINDS`): 활동마다 단위당 점수(`points_per_unit`, 소수 둘째 자리), 주간 상한(`weekly_cap`), 상한을 넘은 점수를 세는 비율(`over_cap_ratio`, 소수 셋째 자리).
 *   칸 이름은 `rule:<활동>:points`·`:cap`·`:ratio`다. **주간 상한 0은 «상한 없음»이고 DB에는 NULL로 쓴다**(공용 폼은 숫자 칸만 다룬다. DB에서 상한 0을 일부러 둘 일은 없다). 읽을 때는 NULL을 0으로 보인다.
 *   상한 칸이 필요한 까닭은 운영 로직 12.2절의 «드랍·픽업 5점에 상한이 없어 반복하면 점수가 쌓이는 틈»을 이 화면에서 막을 수 있어야 해서다.
 *
 * 챕터 11 이상 행이 생겨도 이 구역은 읽지도 쓰지도 않는다(그 수정 시각도 구역 수정 시각에 넣지 않는다, 7-1 캡슐 구역과 같은 방식). 모르는 활동 종류의 행도 같다.
 * 챕터 필요 점수를 낮추면 이미 점수가 넘은 유저는 바로 오르지 않고 다음에 점수가 쌓일 때 오른다(`chapter_add_score`만 챕터를 올린다). 챕터는 내려가지 않는다.
 * 「챕터 점수」(`collection_complete_*`)와 컬렉션과 믹스 구역의 「포인트」는 값이 같아도 다른 설정이다. 확률 안내 페이지가 읽는 칸이 없어 모든 칸의 `affectsDisclosure`는 `false`다(확인창 없음).
 *
 * 읽기는 **가공하지 않은 행**을 읽는다(비정상 값을 기본값으로 바꿔 보이지 않는다). 두 표 모두 **정렬해서** 읽고(`chapter_no`, `activity_kind`),
 * 구역 수정 시각은 DB가 돌려준 순서가 아니라 고정된 순서(챕터 번호 순, 그다음 활동 종류 표 순서)로 계산한다. 수정 시각이 밀리초까지 같고 마이크로초만 다른 행이 있을 때
 * `latestStamp`가 호출마다 다른 글자를 골라 불필요한 409가 나는 일을 막는다(티켓 20261022_1133 잔여 이슈).
 * 쓰기는 두 표라 한 번의 조건부 갱신으로 끝나지 않는다. 행 단위 갱신·되돌림은 공용 모듈(`rowwise.ts`)에 맡기고, 이 파일은 표에 맞는 갱신·되돌림 함수만 만든다.
 */
import { CHAPTER_SCORE_KINDS, type ChapterScoreKind } from '@/lib/chapter/kinds'
import type { Database } from '@/types/database.generated'
import { dbNumber, formatBalanceNumber } from './fields'
import { didUndo, latestStamp, runRowOps, toRowOutcome, type RowOp } from './rowwise'
import {
  INTEGER_MAX,
  type BalanceFieldDef,
  type BalanceSectionBinding,
  type BalanceServiceClient,
  type BalanceValues,
  type BalanceWriteResult,
} from './types'

export const CHAPTER_SECTION_ID = 'chapter'

/** 이 구역이 읽는 챕터 행 수. 마이그레이션 221이 1~10을 넣는다. 챕터 번호를 늘리거나 줄이지 않는다. */
export const CHAPTER_COUNT = 10

/**
 * 챕터별 필요 누적 점수의 기본값 — 마이그레이션 221 시드(운영 로직 12.4절)와 같다. 첫 값이 챕터 1(0, 편집하지 않는다)이다.
 * 코드에 따로 있던 값이 아니라 이 화면이 «기본값»을 보이려고 두는 사본이다. 시드를 바꾸는 마이그레이션을 쓰면 같은 티켓에서 이 상수도 바꾼다(시험이 시드 SQL과 대조한다).
 */
export const CHAPTER_DEFAULT_REQUIRED: readonly number[] = [0, 1000, 2300, 3800, 5700, 8500, 11500, 15000, 19000, 23000]

export interface ChapterRuleDefault {
  points: number
  /** `null`은 상한 없음. 화면에서는 0으로 보인다. */
  cap: number | null
  ratio: number
}

/** 활동별 점수 규칙의 기본값 — 마이그레이션 221 시드(운영 로직 12.2절)와 같다. 위 상수와 같은 규칙으로 시험이 대조한다. */
export const CHAPTER_RULE_DEFAULTS: Readonly<Record<ChapterScoreKind, ChapterRuleDefault>> = {
  jam_earned: { points: 1, cap: 300, ratio: 0.5 },
  capsule_open: { points: 20, cap: null, ratio: 0.5 },
  locked_item_badge_open: { points: 10, cap: null, ratio: 0.5 },
  badge_receive: { points: 10, cap: null, ratio: 0.5 },
  collection_complete_common: { points: 100, cap: null, ratio: 0.5 },
  collection_complete_rare: { points: 200, cap: null, ratio: 0.5 },
  collection_complete_epic: { points: 400, cap: null, ratio: 0.5 },
  collection_complete_mystic: { points: 800, cap: null, ratio: 0.5 },
  mix_success: { points: 20, cap: null, ratio: 0.5 },
  mission_complete: { points: 50, cap: null, ratio: 0.5 },
  drop: { points: 5, cap: null, ratio: 0.5 },
  pickup: { points: 5, cap: null, ratio: 0.5 },
}

/** 화면 묶음 제목(활동 이름)과 «단위당 점수» 칸 아래 안내에 쓰는 단위 설명. 활동 종류는 `CHAPTER_SCORE_KINDS`가 기준이다. */
export const CHAPTER_ACTIVITY_LABELS: Readonly<Record<ChapterScoreKind, { label: string; unitPhrase: string }>> = {
  jam_earned: { label: '모은 잼', unitPhrase: '잼 1당' },
  capsule_open: { label: '캡슐 열기', unitPhrase: '캡슐을 1번 열 때마다' },
  locked_item_badge_open: { label: '잠긴 아이템 배지 열기', unitPhrase: '잠긴 아이템 배지를 1개 열 때마다' },
  badge_receive: { label: '배지 받기', unitPhrase: '배지를 1개 받을 때마다' },
  collection_complete_common: { label: '컬렉션 완성 · Common', unitPhrase: '컬렉션을 1번 완성할 때마다' },
  collection_complete_rare: { label: '컬렉션 완성 · Rare', unitPhrase: '컬렉션을 1번 완성할 때마다' },
  collection_complete_epic: { label: '컬렉션 완성 · Epic', unitPhrase: '컬렉션을 1번 완성할 때마다' },
  collection_complete_mystic: { label: '컬렉션 완성 · Mystic', unitPhrase: '컬렉션을 1번 완성할 때마다' },
  mix_success: { label: '믹스 성공', unitPhrase: '믹스에 1번 성공할 때마다' },
  mission_complete: { label: '미션 완료', unitPhrase: '미션을 1개 완료할 때마다' },
  drop: { label: '드랍', unitPhrase: '1번 드랍할 때마다' },
  pickup: { label: '픽업', unitPhrase: '1번 픽업할 때마다' },
}

/** 규칙 한 행에서 편집하는 칸. */
export const CHAPTER_RULE_COLUMNS = ['points', 'cap', 'ratio'] as const
export type ChapterRuleColumn = (typeof CHAPTER_RULE_COLUMNS)[number]

/** 필요 점수 칸의 이름(`required:3`). 저장 본문·이력의 `field`와 같다. */
export function requiredKey(chapterNo: number): string {
  return `required:${chapterNo}`
}

/** `required:3` → 3. 편집하는 챕터(2~10) 밖이거나 형식이 다르면 `null`. 챕터 1은 편집하지 않는다. */
export function parseRequiredKey(key: string): number | null {
  const match = /^required:([1-9]\d*)$/.exec(key)
  if (!match) return null
  const chapterNo = Number(match[1])
  return chapterNo >= 2 && chapterNo <= CHAPTER_COUNT ? chapterNo : null
}

/** 활동 규칙 칸의 이름(`rule:jam_earned:cap`). 저장 본문·이력의 `field`와 같다. */
export function ruleKey(kind: ChapterScoreKind, column: ChapterRuleColumn): string {
  return `rule:${kind}:${column}`
}

/** `rule:jam_earned:cap` → `{ kind, column }`. 모르는 활동이나 칸이면 `null`. */
export function parseRuleKey(key: string): { kind: ChapterScoreKind; column: ChapterRuleColumn } | null {
  const match = /^rule:([a-z_]+):(points|cap|ratio)$/.exec(key)
  if (!match) return null
  const kind = (CHAPTER_SCORE_KINDS as readonly string[]).includes(match[1]) ? (match[1] as ChapterScoreKind) : null
  return kind === null ? null : { kind, column: match[2] as ChapterRuleColumn }
}

/** 편집하는 챕터 번호(2~10). */
export const CHAPTER_EDITABLE_NUMBERS: readonly number[] = Array.from({ length: CHAPTER_COUNT - 1 }, (_, index) => index + 2)

export const CHAPTER_REQUIRED_KEYS: readonly string[] = CHAPTER_EDITABLE_NUMBERS.map(requiredKey)

export const CHAPTER_REQUIRED_GROUP = '챕터별 필요 누적 점수'

/** `points_per_unit`은 `NUMERIC(10,2)`라 이 값이 DB가 받는 가장 큰 값이다(마이그레이션 221). */
const POINTS_MAX = 99_999_999.99

function requiredField(chapterNo: number): BalanceFieldDef {
  return {
    key: requiredKey(chapterNo),
    label: `챕터 ${chapterNo}`,
    unit: '점',
    group: CHAPTER_REQUIRED_GROUP,
    decimals: 0,
    // DB CHECK는 0 이상이지만 앞 챕터(최소 챕터 1의 0)보다 커야 하므로 1 이상이다. 순서는 `validateTogether`가 검사한다.
    min: 1,
    max: INTEGER_MAX,
    defaultValue: CHAPTER_DEFAULT_REQUIRED[chapterNo - 1],
    affectsDisclosure: false,
  }
}

function ruleFields(kind: ChapterScoreKind): BalanceFieldDef[] {
  const { label, unitPhrase } = CHAPTER_ACTIVITY_LABELS[kind]
  const defaults = CHAPTER_RULE_DEFAULTS[kind]
  return [
    {
      key: ruleKey(kind, 'points'),
      label: '단위당 점수',
      unit: '점',
      hint: `${unitPhrase} 세는 점수예요. 소수 둘째 자리까지 쓸 수 있어요.`,
      group: label,
      decimals: 2,
      min: 0,
      max: POINTS_MAX,
      defaultValue: defaults.points,
      affectsDisclosure: false,
    },
    {
      key: ruleKey(kind, 'cap'),
      label: '주간 상한',
      unit: '점',
      hint: '한 주(월~일)에 이 활동으로 그대로 셀 수 있는 점수예요. 0이면 상한이 없어요.',
      group: label,
      decimals: 0,
      min: 0,
      max: INTEGER_MAX,
      defaultValue: defaults.cap ?? 0,
      affectsDisclosure: false,
    },
    {
      key: ruleKey(kind, 'ratio'),
      label: '상한 넘은 점수 비율',
      hint: '주간 상한을 넘은 점수를 세는 비율이에요. 0.5는 절반, 0은 세지 않아요. 상한이 없으면 쓰이지 않아요.',
      group: label,
      decimals: 3,
      min: 0,
      max: 1,
      defaultValue: defaults.ratio,
      affectsDisclosure: false,
    },
  ]
}

/**
 * 칸 정의. 범위는 마이그레이션 221의 CHECK와 같다: 필요 누적 점수는 0 이상 정수(앞 챕터보다 커야 하므로 칸은 1 이상), 단위당 점수는 0 이상 `NUMERIC(10,2)`,
 * 주간 상한은 0 이상 정수(0은 상한 없음으로 NULL에 쓴다), 초과 비율은 0~1 `NUMERIC(4,3)`.
 */
export const CHAPTER_FIELDS: readonly BalanceFieldDef[] = [
  ...CHAPTER_EDITABLE_NUMBERS.map(requiredField),
  ...CHAPTER_SCORE_KINDS.flatMap(ruleFields),
]

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다). */
export const CHAPTER_DEFINITION_SELECT = 'chapter_no, required_score, updated_at'
export const CHAPTER_RULE_SELECT = 'activity_kind, points_per_unit, weekly_cap, over_cap_ratio, updated_at'

type RuleUpdate = Database['public']['Tables']['chapter_score_rules']['Update']

interface DefinitionRow {
  required: number
  stamp: string
}

interface RuleRow {
  points: number
  /** `null`은 상한 없음. */
  cap: number | null
  ratio: number
  stamp: string
}

interface ChapterRows {
  /** 챕터 번호 → 필요 점수와 수정 시각. 1~10이 모두 있고 **챕터 번호 순서**로 들어 있다. */
  definitions: Map<number, DefinitionRow>
  /** 활동 종류 → 규칙과 수정 시각. 12종이 모두 있고 **`CHAPTER_SCORE_KINDS` 순서**로 들어 있다. */
  rules: Map<ChapterScoreKind, RuleRow>
}

/** 행마다의 수정 시각. 쓰기 뒤 «다음 읽기가 계산할 구역 수정 시각»을 미리 구할 때도 같은 모양을 쓴다. */
interface StampSet {
  definitions: Map<number, string>
  rules: Map<ChapterScoreKind, string>
}

function stampSetOf(rows: ChapterRows): StampSet {
  return {
    definitions: new Map([...rows.definitions].map(([chapterNo, row]) => [chapterNo, row.stamp])),
    rules: new Map([...rows.rules].map(([kind, row]) => [kind, row.stamp])),
  }
}

/** 구역의 수정 시각. 두 맵이 고정된 순서로 들어 있어 밀리초가 같은 행이 여럿이어도 항상 같은 글자를 고른다. */
function sectionStamp(stamps: StampSet): string {
  return latestStamp([...stamps.definitions.values(), ...stamps.rules.values()])
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * 두 표를 정렬해 가공 없이 읽는다. 챕터 1~10 행이나 활동 12종 행이 없거나 숫자가 아닌 칸이 있으면 던진다(기본값으로 바꿔 보이지 않는다).
 * 돌려주는 맵은 DB가 준 순서와 상관없이 고정된 순서로 만든다.
 */
async function readRows(service: BalanceServiceClient): Promise<ChapterRows> {
  const [definitionRes, ruleRes] = await Promise.all([
    service.from('chapter_definitions').select(CHAPTER_DEFINITION_SELECT).order('chapter_no', { ascending: true }),
    service.from('chapter_score_rules').select(CHAPTER_RULE_SELECT).order('activity_kind', { ascending: true }),
  ])
  if (definitionRes.error) throw new Error(`챕터별 필요 점수 조회 실패: ${definitionRes.error.message}`)
  if (ruleRes.error) throw new Error(`챕터 점수 규칙 조회 실패: ${ruleRes.error.message}`)

  const definitionByNo = new Map<number, DefinitionRow>()
  for (const row of definitionRes.data ?? []) {
    if (row.chapter_no < 1 || row.chapter_no > CHAPTER_COUNT) continue
    const required = dbNumber(row.required_score)
    if (required === null) throw new Error(`챕터별 필요 점수 조회 실패: 챕터 ${row.chapter_no} 값을 숫자로 읽을 수 없음`)
    definitionByNo.set(row.chapter_no, { required, stamp: row.updated_at })
  }
  const definitions = new Map<number, DefinitionRow>()
  for (let chapterNo = 1; chapterNo <= CHAPTER_COUNT; chapterNo += 1) {
    const row = definitionByNo.get(chapterNo)
    if (!row) throw new Error(`챕터별 필요 점수 조회 실패: 챕터 ${chapterNo} 행이 없음`)
    definitions.set(chapterNo, row)
  }

  const ruleByKind = new Map<string, RuleRow>()
  for (const row of ruleRes.data ?? []) {
    if (!(CHAPTER_SCORE_KINDS as readonly string[]).includes(row.activity_kind)) continue
    const points = dbNumber(row.points_per_unit)
    if (points === null) throw new Error(`챕터 점수 규칙 조회 실패: ${row.activity_kind} 단위당 점수를 숫자로 읽을 수 없음`)
    const ratio = dbNumber(row.over_cap_ratio)
    if (ratio === null) throw new Error(`챕터 점수 규칙 조회 실패: ${row.activity_kind} 초과 비율을 숫자로 읽을 수 없음`)
    const cap = row.weekly_cap === null ? null : dbNumber(row.weekly_cap)
    if (row.weekly_cap !== null && cap === null) throw new Error(`챕터 점수 규칙 조회 실패: ${row.activity_kind} 주간 상한을 숫자로 읽을 수 없음`)
    ruleByKind.set(row.activity_kind, { points, cap, ratio, stamp: row.updated_at })
  }
  const rules = new Map<ChapterScoreKind, RuleRow>()
  for (const kind of CHAPTER_SCORE_KINDS) {
    const row = ruleByKind.get(kind)
    if (!row) throw new Error(`챕터 점수 규칙 조회 실패: ${kind} 행이 없음`)
    rules.set(kind, row)
  }
  return { definitions, rules }
}

/** 필요 누적 점수는 앞 챕터보다 커야 한다. 챕터 2의 앞은 챕터 1의 0이다. 어긋나면 **뒤쪽 챕터** 칸에 문장을 붙인다. */
export function validateRequiredOrder(values: BalanceValues): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const chapterNo of CHAPTER_EDITABLE_NUMBERS) {
    const current = values[requiredKey(chapterNo)]
    const previous = chapterNo === 2 ? 0 : values[requiredKey(chapterNo - 1)]
    if (typeof current !== 'number' || typeof previous !== 'number') continue
    if (current <= previous) errors[requiredKey(chapterNo)] = `챕터 ${chapterNo - 1}(${formatBalanceNumber(previous)}점)보다 커야 해요.`
  }
  return errors
}

interface RulePatch {
  points?: number
  cap?: number
  ratio?: number
}

export const CHAPTER_BINDING: BalanceSectionBinding = {
  id: CHAPTER_SECTION_ID,
  fields: CHAPTER_FIELDS,
  validators: Object.fromEntries(
    CHAPTER_FIELDS.map((def): [string, (n: number) => boolean] => {
      const rule = parseRuleKey(def.key)
      if (rule === null) return [def.key, (n) => Number.isInteger(n) && n >= 1]
      if (rule.column === 'points') return [def.key, (n) => n >= 0]
      if (rule.column === 'cap') return [def.key, (n) => Number.isInteger(n) && n >= 0]
      return [def.key, (n) => n >= 0 && n <= 1]
    })
  ),
  validateTogether: validateRequiredOrder,

  async read(service) {
    const rows = await readRows(service)
    const values: BalanceValues = {}
    for (const chapterNo of CHAPTER_EDITABLE_NUMBERS) values[requiredKey(chapterNo)] = rows.definitions.get(chapterNo)?.required ?? 0
    for (const kind of CHAPTER_SCORE_KINDS) {
      const rule = rows.rules.get(kind)
      values[ruleKey(kind, 'points')] = rule?.points ?? 0
      values[ruleKey(kind, 'cap')] = rule?.cap ?? 0
      values[ruleKey(kind, 'ratio')] = rule?.ratio ?? 0
    }
    return { values, updatedAt: sectionStamp(stampSetOf(rows)) }
  },

  async write(service, input): Promise<BalanceWriteResult> {
    const requiredPatch: Array<{ chapterNo: number; value: number }> = []
    const rulePatch = new Map<ChapterScoreKind, RulePatch>()
    for (const [key, value] of Object.entries(input.values)) {
      const chapterNo = parseRequiredKey(key)
      if (chapterNo !== null) {
        requiredPatch.push({ chapterNo, value })
        continue
      }
      const rule = parseRuleKey(key)
      if (rule !== null) rulePatch.set(rule.kind, { ...rulePatch.get(rule.kind), [rule.column]: value })
    }
    requiredPatch.sort((a, b) => a.chapterNo - b.chapterNo)
    if (requiredPatch.length === 0 && rulePatch.size === 0) return { ok: false, reason: 'error', message: '바꿀 칸이 없음' }

    let rows: ChapterRows
    try {
      rows = await readRows(service)
    } catch (e) {
      return { ok: false, reason: 'error', message: messageOf(e) }
    }
    const stamps = stampSetOf(rows)
    if (sectionStamp(stamps) !== input.expectedUpdatedAt) return { ok: false, reason: 'conflict' }

    // 챕터 번호 순서, 그다음 활동 종류 표 순서로 쓴다. 행마다 갱신 뒤의 수정 시각을 `stamps`에 반영할 함수를 나란히 둔다.
    const ops: RowOp[] = []
    const commits: Array<(stamp: string) => void> = []

    for (const { chapterNo, value } of requiredPatch) {
      const before = rows.definitions.get(chapterNo)
      if (!before) return { ok: false, reason: 'error', message: `챕터 ${chapterNo} 행이 없음` }
      ops.push({
        label: requiredKey(chapterNo),
        apply: async () =>
          toRowOutcome(
            await service
              .from('chapter_definitions')
              .update({ required_score: value, updated_at: input.nextUpdatedAt })
              .eq('chapter_no', chapterNo)
              .eq('updated_at', before.stamp)
              .select('updated_at')
          ),
        undo: async (appliedStamp) =>
          didUndo(
            await service
              .from('chapter_definitions')
              .update({ required_score: before.required, updated_at: before.stamp })
              .eq('chapter_no', chapterNo)
              .eq('updated_at', appliedStamp)
              .select('updated_at')
          ),
      })
      commits.push((stamp) => stamps.definitions.set(chapterNo, stamp))
    }

    for (const kind of CHAPTER_SCORE_KINDS) {
      const patch = rulePatch.get(kind)
      if (!patch) continue
      const before = rows.rules.get(kind)
      if (!before) return { ok: false, reason: 'error', message: `${kind} 행이 없음` }
      const update: RuleUpdate = { updated_at: input.nextUpdatedAt }
      if (patch.points !== undefined) update.points_per_unit = patch.points
      if (patch.cap !== undefined) update.weekly_cap = patch.cap === 0 ? null : patch.cap
      if (patch.ratio !== undefined) update.over_cap_ratio = patch.ratio
      ops.push({
        label: `rule:${kind}`,
        apply: async () =>
          toRowOutcome(await service.from('chapter_score_rules').update(update).eq('activity_kind', kind).eq('updated_at', before.stamp).select('updated_at')),
        undo: async (appliedStamp) =>
          didUndo(
            await service
              .from('chapter_score_rules')
              .update({ points_per_unit: before.points, weekly_cap: before.cap, over_cap_ratio: before.ratio, updated_at: before.stamp })
              .eq('activity_kind', kind)
              .eq('updated_at', appliedStamp)
              .select('updated_at')
          ),
      })
      commits.push((stamp) => stamps.rules.set(kind, stamp))
    }

    const result = await runRowOps(CHAPTER_SECTION_ID, ops)
    if (!result.ok) return result

    // 구역의 수정 시각 = 다음 읽기가 계산할 값. 쓴 행은 DB가 돌려준 새 시각으로, 쓰지 않은 행은 읽은 시각 그대로 두고 같은 고정 순서로 계산한다.
    result.stamps.forEach((stamp, index) => commits[index](stamp))
    return { ok: true, updatedAt: sectionStamp(stamps) }
  },
}
