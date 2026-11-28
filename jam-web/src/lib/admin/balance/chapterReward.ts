/**
 * 밸런스 설정 «챕터 보상» 구역의 연결 (티켓 20261127_1740 C9b, 표는 마이그레이션 366)
 *
 * 챕터를 마칠 때 한 번 받는 아이템 배지 보상(챕터 오름 보상)의 개수와 확률을 편집한다. 두 표를 한 구역으로 묶는다(`capsule.ts`와 같은 모델).
 * - `chapter_reward_policy` id=1 한 행: 등급 확률 네 칸(합 100), 다른 트라이브 확률(0~1), Epic 보정 횟수(1 이상 정수). 칸 이름은 열 이름 그대로.
 * - `chapter_definitions.reward_count`: 챕터 1~9를 마칠 때 받는 개수(1 이상 정수). 칸 이름은 `reward_count:3` 형식이고 이력에도 그대로 남는다.
 *   챕터 10은 마지막이라 NULL이 정상이어서 칸이 없고 읽지도 쓰지도 않는다(수정 시각도 구역 수정 시각에 넣지 않는다).
 *
 * 같은 등급 연속 보정(`common_streak_threshold`)과 잠길 확률(`locked_roll_probability`)은 동기화와 한 값(`jam_policy`)이라 **동기화 구역에서 편집**하고 여기에는 안내만 둔다.
 * 챕터별 필요 잼(`required_jam`)은 «챕터» 구역(`chapter.ts`)이 같은 `chapter_definitions` 행의 **다른 열**로 편집한다. 서로 다른 열이라 값은 겹치지 않지만
 * 한 행의 `updated_at`은 하나라서, 어느 구역이든 챕터 행을 저장하면 다른 구역 화면이 읽은 수정 시각이 낡아 그 구역의 저장이 conflict(409)가 될 수 있다.
 *
 * 확률 안내에 반영되는 정책 칸은 `CHAPTER_REWARD_COLUMNS`(`lib/probability/disclosure.ts`)에서 가져오고 여기에 다시 적지 않는다(단일 원천).
 * 챕터별 개수도 확률 안내 «개수» 표에 보이는 값이라 `affectsDisclosure`다.
 *
 * 읽기는 **가공하지 않은 행**을 읽는다(비정상 값을 기본값으로 바꿔 보이지 않는다). 정책 행이 없거나 챕터 1~9의 `reward_count`가 NULL이면 던진다.
 * 쓰기는 행 단위다. 구역의 수정 시각은 정책 행과 챕터 1~9 행의 수정 시각 중 가장 늦은 것이고, 행 단위 갱신·되돌림은 공용 모듈(`rowwise.ts`)에 맡긴다.
 */
import { CHAPTER_REWARD_COLUMNS } from '@/lib/probability/disclosure'
import type { Database } from '@/types/database.generated'
import { dbNumber, validateSumTo100 } from './fields'
import { didUndo, latestStamp, runRowOps, toRowOutcome, type RowOp } from './rowwise'
import {
  INTEGER_MAX,
  type BalanceFieldDef,
  type BalanceSectionBinding,
  type BalanceServiceClient,
  type BalanceValues,
  type BalanceWriteResult,
} from './types'

export const CHAPTER_REWARD_SECTION_ID = 'chapter_reward'

/** 이 구역이 편집하는 `chapter_reward_policy` 칸. 화면 순서와 같다. */
export const CHAPTER_REWARD_POLICY_KEYS = [
  'rarity_common',
  'rarity_rare',
  'rarity_epic',
  'rarity_mystic',
  'other_tribe_probability',
  'pity_epic_threshold',
] as const

type PolicyKey = (typeof CHAPTER_REWARD_POLICY_KEYS)[number]

/** 등급 확률 네 칸. 합이 100이어야 한다. */
export const CHAPTER_REWARD_RARITY_KEYS = ['rarity_common', 'rarity_rare', 'rarity_epic', 'rarity_mystic'] as const

/** 개수 칸이 있는 챕터 수(1~9). 챕터 10은 마지막이라 `reward_count`가 NULL이다. */
export const CHAPTER_REWARD_COUNT_CHAPTERS = 9

/**
 * 정책 기본값 — 마이그레이션 366 시드(A3 후보 E)와 같다. 코드에 따로 있던 값이 아니라 이 화면이 «기본값»을 보이려고 두는 사본이다.
 * 시드를 바꾸는 마이그레이션을 쓰면 같은 티켓에서 이 상수도 바꾼다(시험이 시드 SQL과 대조한다).
 */
export const CHAPTER_REWARD_DEFAULT_POLICY: Readonly<Record<PolicyKey, number>> = {
  rarity_common: 30,
  rarity_rare: 40,
  rarity_epic: 22,
  rarity_mystic: 8,
  other_tribe_probability: 0.2,
  pity_epic_threshold: 15,
}

/** 챕터별 개수의 기본값(챕터 1~9) — 마이그레이션 366 시드와 같다. */
export const CHAPTER_REWARD_DEFAULT_COUNTS: readonly number[] = [3, 3, 3, 4, 4, 4, 5, 5, 5]

/** 개수 칸의 이름(`reward_count:3`). 저장 본문·이력의 `field`와 같다. */
export function rewardCountKey(chapterNo: number): string {
  return `reward_count:${chapterNo}`
}

/** `reward_count:3` → 3. 개수 칸이 있는 챕터(1~9) 밖이거나 형식이 다르면 `null`(챕터 10 포함). */
export function parseRewardCountKey(key: string): number | null {
  const match = /^reward_count:([1-9]\d*)$/.exec(key)
  if (!match) return null
  const chapterNo = Number(match[1])
  return chapterNo <= CHAPTER_REWARD_COUNT_CHAPTERS ? chapterNo : null
}

/** 개수 칸이 있는 챕터 번호(1~9). */
export const CHAPTER_REWARD_CHAPTER_NUMBERS: readonly number[] = Array.from({ length: CHAPTER_REWARD_COUNT_CHAPTERS }, (_, index) => index + 1)

export const CHAPTER_REWARD_COUNT_KEYS: readonly string[] = CHAPTER_REWARD_CHAPTER_NUMBERS.map(rewardCountKey)

/** 확률 안내가 읽는 정책 칸 — 이 칸을 바꾸면 확률 안내가 함께 바뀐다. */
const DISCLOSED = new Set<string>(CHAPTER_REWARD_COLUMNS)

export const CHAPTER_REWARD_COUNT_GROUP = '챕터를 마칠 때 받는 개수'
export const CHAPTER_REWARD_RARITY_GROUP = '등급 확률'
const PROBABILITY_GROUP = '확률'
const PITY_GROUP = '보정'

const PROBABILITY_HINT = '0과 1 사이의 소수로 써요. 0.2는 20%예요.'

/** Epic 보정 안내. 챕터 오름 보상은 챕터 1~9에서 최대 9번뿐이라 큰 값의 뜻을 알려 준다. */
export const CHAPTER_REWARD_PITY_HINT =
  '챕터 오름 보상은 챕터 1~9에서 최대 9번이라, 이 값이 9보다 크면 이관된 유저의 기록이 있을 때만 이 보정에 닿아요.'

type PolicyFieldInit = Omit<BalanceFieldDef, 'affectsDisclosure' | 'defaultValue'> & { key: PolicyKey }

function policyField(init: PolicyFieldInit): BalanceFieldDef {
  return { ...init, defaultValue: CHAPTER_REWARD_DEFAULT_POLICY[init.key], affectsDisclosure: DISCLOSED.has(init.key) }
}

function countField(chapterNo: number): BalanceFieldDef {
  return {
    key: rewardCountKey(chapterNo),
    label: `챕터 ${chapterNo}`,
    unit: '개',
    hint: chapterNo === CHAPTER_REWARD_COUNT_CHAPTERS ? '이 챕터를 마칠 때 받는 아이템 배지 수예요. 챕터 10은 마지막이라 받는 보상이 없어요.' : undefined,
    group: CHAPTER_REWARD_COUNT_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
    defaultValue: CHAPTER_REWARD_DEFAULT_COUNTS[chapterNo - 1],
    // 확률 안내 «개수» 표에 보이는 값이다
    affectsDisclosure: true,
  }
}

/**
 * 칸 정의. 범위는 마이그레이션 366의 CHECK와 같되 개수는 이 화면이 1 이상으로 더 좁힌다: 등급 확률은 0 이상(합 100이라 한 칸이 100을 넘을 수 없다), 다른 트라이브 확률은 0~1, Epic 보정은 1 이상 정수.
 */
export const CHAPTER_REWARD_FIELDS: readonly BalanceFieldDef[] = [
  ...CHAPTER_REWARD_CHAPTER_NUMBERS.map(countField),
  policyField({ key: 'rarity_common', label: 'Common', unit: '%', group: CHAPTER_REWARD_RARITY_GROUP, decimals: 3, min: 0, max: 100, sumTo: 100 }),
  policyField({ key: 'rarity_rare', label: 'Rare', unit: '%', group: CHAPTER_REWARD_RARITY_GROUP, decimals: 3, min: 0, max: 100, sumTo: 100 }),
  policyField({ key: 'rarity_epic', label: 'Epic', unit: '%', group: CHAPTER_REWARD_RARITY_GROUP, decimals: 3, min: 0, max: 100, sumTo: 100 }),
  policyField({ key: 'rarity_mystic', label: 'Mystic', unit: '%', group: CHAPTER_REWARD_RARITY_GROUP, decimals: 3, min: 0, max: 100, sumTo: 100 }),
  policyField({
    key: 'other_tribe_probability',
    label: '다른 트라이브의 것일 확률',
    hint: `나온 아이템 배지마다 다른 트라이브의 것일 확률이에요. ${PROBABILITY_HINT}`,
    group: PROBABILITY_GROUP,
    decimals: 3,
    min: 0,
    max: 1,
  }),
  policyField({
    key: 'pity_epic_threshold',
    label: 'Epic 보정',
    unit: '번',
    hint: CHAPTER_REWARD_PITY_HINT,
    group: PITY_GROUP,
    decimals: 0,
    min: 1,
    max: INTEGER_MAX,
  }),
]

type PolicyUpdate = Database['public']['Tables']['chapter_reward_policy']['Update']
type DefinitionUpdate = Database['public']['Tables']['chapter_definitions']['Update']

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다. `CHAPTER_REWARD_POLICY_KEYS`와 같아야 하고 시험이 지킨다). */
export const CHAPTER_REWARD_POLICY_SELECT =
  'rarity_common, rarity_rare, rarity_epic, rarity_mystic, other_tribe_probability, pity_epic_threshold, updated_at'
export const CHAPTER_REWARD_DEFINITION_SELECT = 'chapter_no, reward_count, updated_at'

interface Rows {
  policy: { values: BalanceValues; stamp: string }
  /** 챕터 번호(1~9) → 개수와 수정 시각. 챕터 번호 순서로 들어 있다. */
  chapters: Map<number, { count: number; stamp: string }>
}

/** 구역의 수정 시각. 정책 → 챕터 1~9 순서로 고정해 밀리초가 같은 행이 여럿이어도 항상 같은 글자를 고른다. */
function sectionStamp(policyStamp: string, chapterStamps: ReadonlyMap<number, string>): string {
  return latestStamp([policyStamp, ...chapterStamps.values()])
}

function rowsStamp(rows: Rows): string {
  return sectionStamp(rows.policy.stamp, new Map([...rows.chapters].map(([chapterNo, row]) => [chapterNo, row.stamp])))
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 두 표를 가공 없이 읽는다. 행이 없거나 숫자가 아닌 칸이 있으면 던진다(챕터 1~9의 NULL 포함, 기본값으로 바꿔 보이지 않는다). */
async function readRows(service: BalanceServiceClient): Promise<Rows> {
  const [policyRes, definitionRes] = await Promise.all([
    service.from('chapter_reward_policy').select(CHAPTER_REWARD_POLICY_SELECT).eq('id', 1).maybeSingle(),
    service.from('chapter_definitions').select(CHAPTER_REWARD_DEFINITION_SELECT).order('chapter_no', { ascending: true }),
  ])
  if (policyRes.error) throw new Error(`챕터 보상 설정 조회 실패: ${policyRes.error.message}`)
  if (!policyRes.data) throw new Error('챕터 보상 설정 조회 실패: id=1 행이 없음')
  if (definitionRes.error) throw new Error(`챕터별 보상 개수 조회 실패: ${definitionRes.error.message}`)

  const policyRow: Record<string, unknown> = policyRes.data
  const values: BalanceValues = {}
  for (const key of CHAPTER_REWARD_POLICY_KEYS) {
    const n = dbNumber(policyRow[key])
    if (n === null) throw new Error(`챕터 보상 설정 조회 실패: ${key} 값을 숫자로 읽을 수 없음`)
    values[key] = n
  }

  const byNo = new Map<number, { count: number; stamp: string }>()
  for (const row of definitionRes.data ?? []) {
    if (row.chapter_no < 1 || row.chapter_no > CHAPTER_REWARD_COUNT_CHAPTERS) continue
    const count = dbNumber(row.reward_count)
    if (count === null) throw new Error(`챕터별 보상 개수 조회 실패: 챕터 ${row.chapter_no} 값을 숫자로 읽을 수 없음`)
    byNo.set(row.chapter_no, { count, stamp: row.updated_at })
  }
  const chapters = new Map<number, { count: number; stamp: string }>()
  for (const chapterNo of CHAPTER_REWARD_CHAPTER_NUMBERS) {
    const row = byNo.get(chapterNo)
    if (!row) throw new Error(`챕터별 보상 개수 조회 실패: 챕터 ${chapterNo} 행이 없음`)
    chapters.set(chapterNo, row)
  }
  return { policy: { values, stamp: policyRes.data.updated_at }, chapters }
}

function isPolicyKey(key: string): key is PolicyKey {
  return (CHAPTER_REWARD_POLICY_KEYS as readonly string[]).includes(key)
}

export const CHAPTER_REWARD_BINDING: BalanceSectionBinding = {
  id: CHAPTER_REWARD_SECTION_ID,
  fields: CHAPTER_REWARD_FIELDS,
  validators: {
    ...Object.fromEntries(
      CHAPTER_REWARD_RARITY_KEYS.map((key): [string, (n: number) => boolean] => [key, (n) => Number.isFinite(n) && n >= 0 && n <= 100])
    ),
    other_tribe_probability: (n) => Number.isFinite(n) && n >= 0 && n <= 1,
    pity_epic_threshold: (n) => Number.isInteger(n) && n >= 1,
    ...Object.fromEntries(CHAPTER_REWARD_COUNT_KEYS.map((key): [string, (n: number) => boolean] => [key, (n) => Number.isInteger(n) && n >= 1])),
  },
  validateTogether: (values) => validateSumTo100(values, CHAPTER_REWARD_RARITY_KEYS),

  async read(service) {
    const rows = await readRows(service)
    const values: BalanceValues = {}
    // 칸 정의(`CHAPTER_REWARD_FIELDS`)와 같은 순서: 챕터별 개수 → 정책 칸
    for (const chapterNo of CHAPTER_REWARD_CHAPTER_NUMBERS) values[rewardCountKey(chapterNo)] = rows.chapters.get(chapterNo)?.count ?? 0
    for (const key of CHAPTER_REWARD_POLICY_KEYS) values[key] = rows.policy.values[key]
    return { values, updatedAt: rowsStamp(rows) }
  },

  async write(service, input): Promise<BalanceWriteResult> {
    const policyPatch: PolicyUpdate = {}
    const countPatch: Array<{ chapterNo: number; value: number }> = []
    for (const [key, value] of Object.entries(input.values)) {
      if (isPolicyKey(key)) {
        policyPatch[key] = value
        continue
      }
      const chapterNo = parseRewardCountKey(key)
      if (chapterNo !== null) countPatch.push({ chapterNo, value })
    }
    countPatch.sort((a, b) => a.chapterNo - b.chapterNo)
    const hasPolicy = Object.keys(policyPatch).length > 0
    if (!hasPolicy && countPatch.length === 0) return { ok: false, reason: 'error', message: '바꿀 칸이 없음' }

    let rows: Rows
    try {
      rows = await readRows(service)
    } catch (e) {
      return { ok: false, reason: 'error', message: messageOf(e) }
    }
    if (rowsStamp(rows) !== input.expectedUpdatedAt) return { ok: false, reason: 'conflict' }

    // 정책 행 → 챕터 번호 순서로 쓴다. 행마다 갱신 뒤의 수정 시각을 반영할 함수를 나란히 둔다.
    const ops: RowOp[] = []
    const commits: Array<(stamp: string) => void> = []
    let policyStamp = rows.policy.stamp
    const chapterStamps = new Map([...rows.chapters].map(([chapterNo, row]) => [chapterNo, row.stamp]))

    if (hasPolicy) {
      const before = rows.policy
      ops.push({
        label: 'chapter_reward_policy',
        apply: async () =>
          toRowOutcome(
            await service
              .from('chapter_reward_policy')
              .update({ ...policyPatch, updated_at: input.nextUpdatedAt })
              .eq('id', 1)
              .eq('updated_at', before.stamp)
              .select('updated_at')
          ),
        undo: async (appliedStamp) => {
          const restore: PolicyUpdate = { updated_at: before.stamp }
          for (const key of CHAPTER_REWARD_POLICY_KEYS) if (policyPatch[key] !== undefined) restore[key] = before.values[key]
          return didUndo(await service.from('chapter_reward_policy').update(restore).eq('id', 1).eq('updated_at', appliedStamp).select('updated_at'))
        },
      })
      commits.push((stamp) => {
        policyStamp = stamp
      })
    }

    for (const { chapterNo, value } of countPatch) {
      const before = rows.chapters.get(chapterNo)
      if (!before) return { ok: false, reason: 'error', message: `챕터 ${chapterNo} 행이 없음` }
      ops.push({
        label: rewardCountKey(chapterNo),
        apply: async () =>
          toRowOutcome(
            await service
              .from('chapter_definitions')
              .update({ reward_count: value, updated_at: input.nextUpdatedAt } satisfies DefinitionUpdate)
              .eq('chapter_no', chapterNo)
              .eq('updated_at', before.stamp)
              .select('updated_at')
          ),
        undo: async (appliedStamp) =>
          didUndo(
            await service
              .from('chapter_definitions')
              .update({ reward_count: before.count, updated_at: before.stamp } satisfies DefinitionUpdate)
              .eq('chapter_no', chapterNo)
              .eq('updated_at', appliedStamp)
              .select('updated_at')
          ),
      })
      commits.push((stamp) => chapterStamps.set(chapterNo, stamp))
    }

    const result = await runRowOps(CHAPTER_REWARD_SECTION_ID, ops)
    if (!result.ok) return result

    // 구역의 수정 시각 = 다음 읽기가 계산할 값. 쓴 행은 DB가 돌려준 새 시각으로, 쓰지 않은 행은 읽은 시각 그대로 두고 같은 고정 순서로 계산한다.
    result.stamps.forEach((stamp, index) => commits[index](stamp))
    return { ok: true, updatedAt: sectionStamp(policyStamp, chapterStamps) }
  },
}
