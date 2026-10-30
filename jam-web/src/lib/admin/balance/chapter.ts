/**
 * 밸런스 설정 «챕터» 구역의 연결 (티켓 20261022_1133 2회, 운영 로직 12.2·12.4·19.1절)
 *
 * `chapter_definitions` 챕터 1~10행을 편집한다. **지금 있는 챕터의 값만 바꾼다**(챕터 더하기는 후속 티켓 20261022_1718, 줄이기는 만들지 않는다).
 * - 챕터에 오르는 데 필요한 누적 점수(`required_score`). 챕터 1은 퀘스트를 마치면 얻어서 0으로 고정이라 **읽기만** 하고(편집 칸이 없다), 챕터 2~10만 편집한다.
 *   칸 이름은 `required:3` 형식이고 이력에도 그대로 남는다. 앞 챕터보다 커야 한다(`validateTogether`).
 * - 활동 12종의 단위당 점수 규칙(`chapter_score_rules`)은 쓰기를 멈췄고 편집 칸·읽기·쓰기를 걷었다(티켓 20261028_1742 2회). 서비스 활동으로 받는 잼은 서비스 활동 잼 구역에서 정한다.
 *
 * 챕터 11 이상 행이 생겨도 이 구역은 읽지도 쓰지도 않는다(그 수정 시각도 구역 수정 시각에 넣지 않는다, 7-1 캡슐 구역과 같은 방식).
 * 챕터는 캡슐이 100%에 닿은 횟수로 오르고(운영 로직 12.2절), 이 칸은 프로필 «다음 챕터까지» 게이지에만 쓰인다(게이지는 아직 점수로 계산한다, 티켓 20261030_1738이 정한다). 챕터는 내려가지 않는다.
 * 확률 안내 페이지가 읽는 칸이 없어 모든 칸의 `affectsDisclosure`는 `false`다(확인창 없음).
 *
 * 읽기는 **가공하지 않은 행**을 읽는다(비정상 값을 기본값으로 바꿔 보이지 않는다). **정렬해서** 읽고(`chapter_no`),
 * 구역 수정 시각은 DB가 돌려준 순서가 아니라 고정된 순서(챕터 번호 순)로 계산한다. 수정 시각이 밀리초까지 같고 마이크로초만 다른 행이 있을 때
 * `latestStamp`가 호출마다 다른 글자를 골라 불필요한 409가 나는 일을 막는다(티켓 20261022_1133 잔여 이슈).
 * 쓰기는 챕터마다 한 행씩이라 한 번의 조건부 갱신으로 끝나지 않는다. 행 단위 갱신·되돌림은 공용 모듈(`rowwise.ts`)에 맡기고, 이 파일은 표에 맞는 갱신·되돌림 함수만 만든다.
 */
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

/** 편집하는 챕터 번호(2~10). */
export const CHAPTER_EDITABLE_NUMBERS: readonly number[] = Array.from({ length: CHAPTER_COUNT - 1 }, (_, index) => index + 2)

export const CHAPTER_REQUIRED_KEYS: readonly string[] = CHAPTER_EDITABLE_NUMBERS.map(requiredKey)

export const CHAPTER_REQUIRED_GROUP = '챕터별 필요 누적 점수'

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

/**
 * 칸 정의. 범위는 마이그레이션 221의 CHECK와 같다: 필요 누적 점수는 0 이상 정수(앞 챕터보다 커야 하므로 칸은 1 이상).
 */
export const CHAPTER_FIELDS: readonly BalanceFieldDef[] = CHAPTER_EDITABLE_NUMBERS.map(requiredField)

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다). */
export const CHAPTER_DEFINITION_SELECT = 'chapter_no, required_score, updated_at'

interface DefinitionRow {
  required: number
  stamp: string
}

interface ChapterRows {
  /** 챕터 번호 → 필요 점수와 수정 시각. 1~10이 모두 있고 **챕터 번호 순서**로 들어 있다. */
  definitions: Map<number, DefinitionRow>
}

/** 행마다의 수정 시각. 쓰기 뒤 «다음 읽기가 계산할 구역 수정 시각»을 미리 구할 때도 같은 모양을 쓴다. */
interface StampSet {
  definitions: Map<number, string>
}

function stampSetOf(rows: ChapterRows): StampSet {
  return {
    definitions: new Map([...rows.definitions].map(([chapterNo, row]) => [chapterNo, row.stamp])),
  }
}

/** 구역의 수정 시각. 맵이 고정된 순서로 들어 있어 밀리초가 같은 행이 여럿이어도 항상 같은 글자를 고른다. */
function sectionStamp(stamps: StampSet): string {
  return latestStamp([...stamps.definitions.values()])
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * 챕터 정의를 정렬해 가공 없이 읽는다. 챕터 1~10 행이 없거나 숫자가 아닌 칸이 있으면 던진다(기본값으로 바꿔 보이지 않는다).
 * 돌려주는 맵은 DB가 준 순서와 상관없이 고정된 순서로 만든다.
 */
async function readRows(service: BalanceServiceClient): Promise<ChapterRows> {
  const definitionRes = await service.from('chapter_definitions').select(CHAPTER_DEFINITION_SELECT).order('chapter_no', { ascending: true })
  if (definitionRes.error) throw new Error(`챕터별 필요 점수 조회 실패: ${definitionRes.error.message}`)

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

  return { definitions }
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

export const CHAPTER_BINDING: BalanceSectionBinding = {
  id: CHAPTER_SECTION_ID,
  fields: CHAPTER_FIELDS,
  validators: Object.fromEntries(
    CHAPTER_FIELDS.map((def): [string, (n: number) => boolean] => [def.key, (n) => Number.isInteger(n) && n >= 1])
  ),
  validateTogether: validateRequiredOrder,

  async read(service) {
    const rows = await readRows(service)
    const values: BalanceValues = {}
    for (const chapterNo of CHAPTER_EDITABLE_NUMBERS) values[requiredKey(chapterNo)] = rows.definitions.get(chapterNo)?.required ?? 0
    return { values, updatedAt: sectionStamp(stampSetOf(rows)) }
  },

  async write(service, input): Promise<BalanceWriteResult> {
    const requiredPatch: Array<{ chapterNo: number; value: number }> = []
    for (const [key, value] of Object.entries(input.values)) {
      const chapterNo = parseRequiredKey(key)
      if (chapterNo !== null) requiredPatch.push({ chapterNo, value })
    }
    requiredPatch.sort((a, b) => a.chapterNo - b.chapterNo)
    if (requiredPatch.length === 0) return { ok: false, reason: 'error', message: '바꿀 칸이 없음' }

    let rows: ChapterRows
    try {
      rows = await readRows(service)
    } catch (e) {
      return { ok: false, reason: 'error', message: messageOf(e) }
    }
    const stamps = stampSetOf(rows)
    if (sectionStamp(stamps) !== input.expectedUpdatedAt) return { ok: false, reason: 'conflict' }

    // 챕터 번호 순서로 쓴다. 행마다 갱신 뒤의 수정 시각을 `stamps`에 반영할 함수를 나란히 둔다.
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

    const result = await runRowOps(CHAPTER_SECTION_ID, ops)
    if (!result.ok) return result

    // 구역의 수정 시각 = 다음 읽기가 계산할 값. 쓴 행은 DB가 돌려준 새 시각으로, 쓰지 않은 행은 읽은 시각 그대로 두고 같은 고정 순서로 계산한다.
    result.stamps.forEach((stamp, index) => commits[index](stamp))
    return { ok: true, updatedAt: sectionStamp(stamps) }
  },
}
