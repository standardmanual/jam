/**
 * 조건 칸이 아닌 정수 칸의 저장 전 검사 (티켓 20261023_1940, 부모 20261023_1748)
 *
 * 배지 양식의 포인트 보상·패치 가격·레벨과 미션 양식의 공개 인원·선착순 인원·미션 포인트는 `type="number"` 칸이지만
 * 브라우저가 «1e3»을 올바른 숫자로 보고 통과시키고, 읽는 쪽(`parseInt`)은 «2.5»를 2로, «1e3»을 1로 잘라 읽는다.
 * 운영자가 쓴 값과 다른 값이 조용히 저장되므로, 읽기 전의 입력 글자를 먼저 검사한다. 읽기 동작은 그대로 둔다.
 *
 * 정수 판정과 «정수가 아님» 문구는 조건 칸 검사의 `isIntegerFormText`·`describeNonIntegerInputs`를 그대로 쓴다.
 * 이 파일이 더하는 문구는 «최소값 미만» 하나뿐이고 같은 문장 틀을 따른다.
 *
 * 순수 파일이다: 폼(클라이언트 컴포넌트)이 가져와도 서버 전용 의존이 없다.
 */
import { describeNonIntegerInputs, isIntegerFormText } from '@/lib/badge-engine/conditionRegistry'

/** 최소값이 있는 정수 칸 하나. `label`은 화면에 보이는 칸 이름이다 */
export interface IntegerRangeInput {
  field: string
  label: string
  /** 칸에 쓴 글자 그대로 */
  raw: string
  /** 허용하는 가장 작은 정수 */
  min: number
}

/**
 * 칸의 글자를 정수로 읽는다. 빈칸이거나 읽을 수 없으면 null이다.
 * `parseInt` 그대로라 «2.5»는 2, «1e3»은 1로 잘린다 — 그래서 읽기 전에 `describeIntegerRangeInputs`가 먼저 막는다.
 * 빈칸이 무슨 뜻인지(0·값 없음·제한 없음)는 칸마다 달라 읽는 쪽이 정한다.
 */
export function readIntegerInput(raw: string): number | null {
  const value = parseInt(raw, 10)
  return Number.isNaN(value) ? null : value
}

/**
 * 정수 칸들을 저장 전에 검사해 안내 한 문장을 돌려준다(통과하면 null).
 *
 * - 빈칸은 검사할 값이 없어 통과한다.
 * - 정수가 아닌 글자(«2.5»·«1e3»)가 있으면 조건 칸과 같은 문구다. 칸이 여럿이면 첫 칸만 보이고 나머지는 칸 수로 알린다.
 * - 정수는 맞는데 최소값보다 작은 칸이 있으면(정수가 아닌 칸을 모두 고친 뒤) 첫 칸을 같은 어조로 알린다.
 * 칸 순서는 호출하는 쪽이 화면 순서로 넘긴다.
 */
export function describeIntegerRangeInputs(inputs: readonly IntegerRangeInput[]): string | null {
  const nonInteger = inputs
    .filter(({ raw }) => !isIntegerFormText(raw))
    .map(({ field, label, raw }) => ({ field, label, raw: raw.trim() }))
  const nonIntegerMessage = describeNonIntegerInputs(nonInteger)
  if (nonIntegerMessage) return nonIntegerMessage

  const tooSmall = inputs.find(({ raw, min }) => {
    const value = readIntegerInput(raw)
    return value !== null && value < min
  })
  if (!tooSmall) return null
  const { label, raw, min } = tooSmall
  return `${label}에는 ${min} 이상의 정수만 쓸 수 있어요. ${min}보다 작은 값은 고쳐 주세요. (입력한 값: ${raw.trim()})`
}

/** 배지 양식의 정수 칸 글자와, 그 칸이 저장에 쓰이는지 가르는 상태 */
export interface BadgeIntegerFormInput {
  pointReward: string
  patchAvailable: boolean
  patchPriceKrw: string
  /** 레벨형 배지인가. 등급형이면 레벨 칸이 화면에 없다 */
  isLeveled: boolean
  level: string
}

/**
 * 배지 양식의 포인트 보상(0 이상, 빈칸은 0)·패치 가격(0 이상, 빈칸은 값 없음)·레벨(1 이상, 레벨형만)을 검사한다.
 * 패치 가격은 «패치 구매를 열어요»를 켠 때만, 레벨은 레벨형일 때만 저장에 쓰이므로 그때만 본다 — 닫힌 칸에 남은 글자 때문에
 * 저장이 막히면 안 된다. 순서는 화면 순서(레벨 → 포인트 보상 → 패치 가격)다.
 */
export function findBadgeIntegerInputError(input: BadgeIntegerFormInput): string | null {
  const inputs: IntegerRangeInput[] = []
  if (input.isLeveled) inputs.push({ field: 'level', label: '레벨', raw: input.level, min: 1 })
  inputs.push({ field: 'pointReward', label: '포인트 보상', raw: input.pointReward, min: 0 })
  if (input.patchAvailable) inputs.push({ field: 'patchPriceKrw', label: '패치 가격', raw: input.patchPriceKrw, min: 0 })
  return describeIntegerRangeInputs(inputs)
}

/** 미션 양식의 정수 칸 글자 */
export interface MissionIntegerFormInput {
  visibleRankCount: string
  rewardPoints: string
  maxCompletions: string
}

/**
 * 미션 양식의 공개 인원(1 이상, 빈칸은 제한 없음)·미션 포인트(0 이상, 빈칸은 0)·선착순 인원(1 이상, 빈칸은 제한 없음)을 검사한다.
 * 이름은 화면의 칸 이름이다(DB 열 `max_completions`가 화면에서는 «선착순 인원»). 순서는 화면 순서다.
 */
export function findMissionIntegerInputError(input: MissionIntegerFormInput): string | null {
  return describeIntegerRangeInputs([
    { field: 'visibleRankCount', label: '공개 인원', raw: input.visibleRankCount, min: 1 },
    { field: 'rewardPoints', label: '미션 포인트', raw: input.rewardPoints, min: 0 },
    { field: 'maxCompletions', label: '선착순 인원', raw: input.maxCompletions, min: 1 },
  ])
}
