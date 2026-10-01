/**
 * 신호 기준값 설정의 순수 논리 (티켓 20260930_1459 조각 C, 채원 확정 설계 「조각 C」)
 *
 * 지키는 것:
 * - 칸 정의표의 키가 `thresholds.ts`의 25개와 같다(키를 더하면 `FIELD_RULES` 타입과 이 테스트가 막는다). 편집 24 + 읽기 전용 1
 * - 신호별 카드 9장과 그룹 3개(중단·주의·참고). 한 카드 안에서 「실측 아님」이 섞이지 않고 「실측 아님」 카드는 4장이다
 * - 칸별 범위와 검증 문구(시 24·−1·소수, 월간 날짜 29, 배수 1.0·10.1·2.55, 최소 장수 0, 요일)
 * - 맞물림(최소 6·최대 5, 기간 5·연속 6, 최소만 따로 저장해도 오류)과 오류가 걸리는 칸
 * - 저장된 행 읽기(범위 밖 0·모양 틀림은 읽을 수 없음), 칸 상태 만들기, 「바꾼 값이에요 · 기본값 …」 줄, 「바꾼 값 N」, 마지막 변경 줄
 * - 초안: 고친 칸만 확인하고 읽을 수 없는 저장값이 같은 카드의 다른 칸 저장을 막지 않는다, 저장 본문의 칸별 수정 시각(행 없음은 `null`)
 * - 결과 문장 9개(채원 확정 문구)와 칸이 틀리면 문장이 없는 것
 */
import { describe, it, expect } from 'vitest'
import { OPS_SIGNAL_THRESHOLD_KEYS, OPS_SIGNAL_THRESHOLDS, DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES, type OpsSignalThresholdKey } from '../thresholds'
import {
  SIGNAL_CARDS,
  SIGNAL_CARD_GROUPS,
  THRESHOLD_ERRORS,
  THRESHOLD_FIELDS,
  UNREADABLE_STORED_MESSAGE,
  changedFieldLine,
  checkSignalDraft,
  checkThresholdInput,
  draftAfterRevert,
  draftFromSignalRecords,
  formatThresholdDisplay,
  isThresholdKey,
  readOnlyTimeText,
  readStoredThresholdValue,
  recordMapOf,
  signalCard,
  signalChangedCount,
  signalDraftChangedKeys,
  signalDraftToPatch,
  signalLastChangeLine,
  signalResultSentence,
  textToThresholdInput,
  thresholdField,
  thresholdInterlockErrors,
  toThresholdRecord,
  type SignalDraft,
  type SignalThresholdRecord,
  type ThresholdRow,
} from '../thresholdSettings'

const T0 = '2026-10-01T06:20:00+00:00' // 10/1(목) 15:20 KST
const T1 = '2026-10-02T01:05:00+00:00' // 10/2(금) 10:05 KST

function row(key: OpsSignalThresholdKey, value: unknown, over: Partial<ThresholdRow> = {}): ThresholdRow {
  return { rule_key: key, value: value as never, updated_at: T0, previous_value: null, ...over }
}

/** 모든 기준값 25개의 칸 상태(기본값). `rows`의 칸만 바꾼 행으로 만든다. */
function records(rows: ThresholdRow[] = []): Record<string, SignalThresholdRecord> {
  const byKey = new Map(rows.map((r) => [r.rule_key, r]))
  return recordMapOf(OPS_SIGNAL_THRESHOLD_KEYS.map((key) => toThresholdRecord(key, byKey.get(key))))
}

const card = (signal: string) => signalCard(signal)!

describe('칸 정의표와 카드 구성', () => {
  it('칸 25개가 thresholds.ts의 키와 같은 순서로 있고 편집 24개 + 읽기 전용 1개다(키를 더하면 여기서 깨진다)', () => {
    expect(THRESHOLD_FIELDS.map((field) => field.key)).toEqual([...OPS_SIGNAL_THRESHOLD_KEYS])
    expect(THRESHOLD_FIELDS).toHaveLength(25)
    expect(THRESHOLD_FIELDS.filter((field) => !field.readOnly)).toHaveLength(24)
    expect(THRESHOLD_FIELDS.filter((field) => field.readOnly).map((field) => field.key)).toEqual(['routineCheckStartsAt'])
    expect(OPS_SIGNAL_THRESHOLD_KEYS.every((key) => isThresholdKey(key))).toBe(true)
    expect(isThresholdKey('nope')).toBe(false)
    expect(thresholdField('nope')).toBeUndefined()
  })

  it('칸 이름표는 thresholds.ts의 label을 쓰고 UI 전용 문구는 요일 2·시각 1·지표별 최소 건수 5칸뿐이다', () => {
    const different = THRESHOLD_FIELDS.filter((field) => field.label !== OPS_SIGNAL_THRESHOLDS[field.key].label).map((field) => field.key)
    expect(different.sort()).toEqual(
      [
        'weeklyRoutineWeekday',
        'routineCheckStartsAt',
        'nextWeekCheckFromWeekday',
        'actionSpikeMinMixAttempt',
        'actionSpikeMinUserDrop',
        'actionSpikeMinPickup',
        'actionSpikeMinMissionComplete',
        'actionSpikeMinCollectionComplete',
      ].sort()
    )
    expect(thresholdField('weeklyRoutineWeekday')?.label).toBe('주간 루틴 마감 요일')
    expect(thresholdField('nextWeekCheckFromWeekday')?.label).toBe('다음 주 편성을 검사하기 시작하는 요일')
    expect(thresholdField('routineCheckStartsAt')?.label).toBe('루틴 점검을 시작하는 시각')
    expect(thresholdField('actionSpikeMinMixAttempt')?.label).toBe('믹스 시도')
  })

  it('신호별 카드 9장이 catalog 순서로 있고 모든 기준값이 정확히 한 카드에 들어 있다', () => {
    expect(SIGNAL_CARDS.map((c) => c.signal)).toEqual([
      'execution_failed',
      'missed_schedule',
      'routine_failed',
      'empty_content',
      'no_new_content',
      'approval_deadline',
      'overlap',
      'monotony',
      'action_spike',
    ])
    const keys = SIGNAL_CARDS.flatMap((c) => c.fields.map((field) => field.key))
    expect(keys.sort()).toEqual([...OPS_SIGNAL_THRESHOLD_KEYS].sort())
    expect(new Set(keys).size).toBe(25)
    expect(card('routine_failed').fields.map((field) => field.key)).toEqual([
      'weeklyRoutineWeekday',
      'weeklyRoutineDeadlineHour',
      'monthlyRoutineDay',
      'monthlyRoutineDeadlineHour',
      'routineCheckStartsAt',
    ])
    expect(card('routine_failed').editableFields).toHaveLength(4)
  })

  it('그룹은 신호 수준 3개이고 카드가 3장씩이다(중단 · 주의 · 참고)', () => {
    expect(SIGNAL_CARD_GROUPS.map((g) => [g.level, g.cards.map((c) => c.signal)])).toEqual([
      ['stop', ['execution_failed', 'missed_schedule', 'routine_failed']],
      ['warn', ['empty_content', 'no_new_content', 'approval_deadline']],
      ['info', ['overlap', 'monotony', 'action_spike']],
    ])
  })

  it('한 카드 안에서 notMeasured가 섞이지 않고, 「실측 아님」 카드는 4장이다', () => {
    for (const c of SIGNAL_CARDS) {
      const flags = new Set(c.editableFields.map((field) => field.notMeasured))
      expect(flags.size, c.signal).toBe(1)
      expect(c.notMeasured, c.signal).toBe([...flags][0])
    }
    expect(SIGNAL_CARDS.filter((c) => c.notMeasured).map((c) => c.signal)).toEqual([
      'missed_schedule',
      'routine_failed',
      'approval_deadline',
      'action_spike',
    ])
  })

  it('허용 범위 표(채원 확정 설계)', () => {
    const range = (key: OpsSignalThresholdKey) => {
      const field = thresholdField(key)!
      return [field.kind, field.min, field.max]
    }
    expect(range('failureLookbackDays')).toEqual(['integer', 1, 30])
    expect(range('missedScheduleMinutes')).toEqual(['integer', 1, 1440])
    expect(range('weeklyRoutineDeadlineHour')).toEqual(['integer', 0, 23])
    expect(range('monthlyRoutineDeadlineHour')).toEqual(['integer', 0, 23])
    expect(range('monthlyRoutineDay')).toEqual(['integer', 1, 28])
    expect(range('approvalDeadlineHours')).toEqual(['integer', 1, 168])
    expect(range('minLiveCards')).toEqual(['integer', 1, 20])
    expect(range('maxLiveCards')).toEqual(['integer', 1, 20])
    expect(range('minNewContentCards')).toEqual(['integer', 1, 10])
    expect(range('minNonImageShapeCards')).toEqual(['integer', 1, 20])
    expect(range('overlapImageShapeCards')).toEqual(['integer', 1, 20])
    expect(range('maxNewUserCards')).toEqual(['integer', 1, 20])
    expect(range('monotonyWindowDays')).toEqual(['integer', 2, 14])
    expect(range('monotonySamePatternCount')).toEqual(['integer', 2, 14])
    expect(range('monotonySameShapeDays')).toEqual(['integer', 2, 14])
    expect(range('actionSpikeMultiplier')).toEqual(['multiplier', 1.1, 10])
    expect(range('actionSpikeBaselineWeeks')).toEqual(['integer', 1, 12])
    for (const key of ['MixAttempt', 'UserDrop', 'Pickup', 'MissionComplete', 'CollectionComplete']) {
      expect(range(`actionSpikeMin${key}` as OpsSignalThresholdKey)).toEqual(['integer', 1, 10000])
    }
    // 요일 칸: 주간 루틴 마감 요일은 월~일 순(일요일 저장값은 0), 다음 주 검사 요일은 월~토 6개
    expect(thresholdField('weeklyRoutineWeekday')?.weekdays).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(thresholdField('nextWeekCheckFromWeekday')?.weekdays).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('지표별 최소 건수 5칸만 한 묶음이고 요일 칸·시각 칸은 단위가 없다', () => {
    expect(THRESHOLD_FIELDS.filter((field) => field.inMinCountGroup).map((field) => field.key)).toEqual([
      'actionSpikeMinMixAttempt',
      'actionSpikeMinUserDrop',
      'actionSpikeMinPickup',
      'actionSpikeMinMissionComplete',
      'actionSpikeMinCollectionComplete',
    ])
    expect(thresholdField('weeklyRoutineWeekday')?.unit).toBe('')
    expect(thresholdField('routineCheckStartsAt')?.unit).toBe('')
    expect(thresholdField('approvalDeadlineHours')?.unit).toBe('시간')
  })
})

describe('칸 검증 — 경계값과 문구', () => {
  it('시: 0·23은 통과, 24와 −1은 범위 오류, 7.5는 정수 오류', () => {
    expect(checkThresholdInput('weeklyRoutineDeadlineHour', 0)).toBeNull()
    expect(checkThresholdInput('weeklyRoutineDeadlineHour', 23)).toBeNull()
    expect(checkThresholdInput('weeklyRoutineDeadlineHour', 24)).toBe('0 이상 23 이하의 정수로 적어 주세요')
    expect(checkThresholdInput('weeklyRoutineDeadlineHour', -1)).toBe('0 이상 23 이하의 정수로 적어 주세요')
    expect(checkThresholdInput('weeklyRoutineDeadlineHour', 7.5)).toBe('정수로 적어 주세요 (예: 12)')
  })

  it('월간 날짜: 28까지, 29부터는 없는 달 안내가 붙는다', () => {
    expect(checkThresholdInput('monthlyRoutineDay', 28)).toBeNull()
    expect(checkThresholdInput('monthlyRoutineDay', 29)).toBe('1 이상 28 이하의 정수로 적어 주세요 (29일부터는 없는 달이 있어요)')
    expect(checkThresholdInput('monthlyRoutineDay', 0)).toBe('1 이상 28 이하의 정수로 적어 주세요 (29일부터는 없는 달이 있어요)')
  })

  it('정수 아님 문구는 그 칸의 기본값을 예로 든다', () => {
    expect(checkThresholdInput('missedScheduleMinutes', 'abc')).toBe('정수로 적어 주세요 (예: 30)')
    expect(checkThresholdInput('approvalDeadlineHours', 1.5)).toBe('정수로 적어 주세요 (예: 48)')
    expect(checkThresholdInput('minLiveCards', Number.NaN)).toBe('정수로 적어 주세요 (예: 3)')
  })

  it('빈 칸은 「값을 적어 주세요」다', () => {
    for (const empty of ['', '  ', null, undefined]) expect(checkThresholdInput('minLiveCards', empty)).toBe(THRESHOLD_ERRORS.empty)
    expect(THRESHOLD_ERRORS.empty).toBe('값을 적어 주세요')
  })

  it('최소 장수 0은 범위 오류이고 20장·10건 같은 위 끝은 통과한다', () => {
    expect(checkThresholdInput('minLiveCards', 0)).toBe('1 이상 20 이하의 정수로 적어 주세요')
    expect(checkThresholdInput('minLiveCards', 20)).toBeNull()
    expect(checkThresholdInput('minLiveCards', 21)).toBe('1 이상 20 이하의 정수로 적어 주세요')
    expect(checkThresholdInput('minNewContentCards', 11)).toBe('1 이상 10 이하의 정수로 적어 주세요')
    expect(checkThresholdInput('actionSpikeMinPickup', 10000)).toBeNull()
    expect(checkThresholdInput('actionSpikeMinPickup', 10001)).toBe('1 이상 10000 이하의 정수로 적어 주세요')
  })

  it('배수: 1.1~10, 소수 첫째 자리까지. 1.0·10.1·2.55는 막힌다', () => {
    const message = '1.1 이상 10 이하의 숫자로 적어 주세요 (소수 첫째 자리까지, 예: 1.5)'
    expect(checkThresholdInput('actionSpikeMultiplier', 1.1)).toBeNull()
    expect(checkThresholdInput('actionSpikeMultiplier', 1.5)).toBeNull()
    expect(checkThresholdInput('actionSpikeMultiplier', 2)).toBeNull()
    expect(checkThresholdInput('actionSpikeMultiplier', 10)).toBeNull()
    expect(checkThresholdInput('actionSpikeMultiplier', 1.0)).toBe(message)
    expect(checkThresholdInput('actionSpikeMultiplier', 10.1)).toBe(message)
    expect(checkThresholdInput('actionSpikeMultiplier', 2.55)).toBe(message)
    expect(checkThresholdInput('actionSpikeMultiplier', 'abc')).toBe(message)
    expect(checkThresholdInput('actionSpikeMultiplier', '')).toBe('값을 적어 주세요')
  })

  it('요일: 주간 루틴 마감 요일은 0~6(일 포함), 다음 주 검사 요일은 일요일(0)이 없다', () => {
    for (const day of [0, 1, 2, 3, 4, 5, 6]) expect(checkThresholdInput('weeklyRoutineWeekday', day)).toBeNull()
    expect(checkThresholdInput('weeklyRoutineWeekday', 7)).toBe('요일을 골라 주세요')
    expect(checkThresholdInput('weeklyRoutineWeekday', '')).toBe('요일을 골라 주세요')
    for (const day of [1, 2, 3, 4, 5, 6]) expect(checkThresholdInput('nextWeekCheckFromWeekday', day)).toBeNull()
    expect(checkThresholdInput('nextWeekCheckFromWeekday', 0)).toBe('월요일부터 토요일 중에서 골라 주세요')
    expect(checkThresholdInput('nextWeekCheckFromWeekday', '')).toBe('월요일부터 토요일 중에서 골라 주세요')
  })

  it('읽기 전용 칸은 어떤 값도 받지 않는다', () => {
    expect(checkThresholdInput('routineCheckStartsAt', '2026-10-06T00:00:00+09:00')).toBe('이 값은 바꿀 수 없어요')
  })

  it('글자로 온 숫자는 정수로 보지 않는다(화면이 숫자로 바꿔 넘긴다)', () => {
    expect(checkThresholdInput('minLiveCards', '3')).toBe('정수로 적어 주세요 (예: 3)')
    expect(textToThresholdInput('minLiveCards', ' 3 ')).toBe(3)
    expect(textToThresholdInput('minLiveCards', '3.5')).toBe('3.5')
    expect(textToThresholdInput('minLiveCards', '')).toBe('')
    expect(textToThresholdInput('actionSpikeMultiplier', '1.5')).toBe(1.5)
    expect(textToThresholdInput('actionSpikeMultiplier', 'abc')).toBe('abc')
  })
})

describe('맞물린 값', () => {
  it('최소 장수가 최대 장수보다 크면 두 칸 모두 오류다(최소 6·최대 5)', () => {
    expect(thresholdInterlockErrors({ minLiveCards: 6, maxLiveCards: 5 })).toEqual({
      minLiveCards: '최소 장수는 최대 장수(5장)보다 클 수 없어요',
      maxLiveCards: '최대 장수는 최소 장수(6장)보다 작을 수 없어요',
    })
    expect(thresholdInterlockErrors({ minLiveCards: 5, maxLiveCards: 5 })).toEqual({})
  })

  it('같은 모양 연속 일수가 기간보다 크면 기간 칸과 그 칸에 오류다(기간 5·연속 6)', () => {
    expect(thresholdInterlockErrors({ monotonyWindowDays: 5, monotonySameShapeDays: 6, monotonySamePatternCount: 3 })).toEqual({
      monotonySameShapeDays: '되돌아보는 기간(5일)보다 클 수 없어요',
      monotonyWindowDays: '되돌아보는 기간은 6일보다 짧을 수 없어요',
    })
  })

  it('같은 패턴 횟수가 기간보다 크면 그 칸과 기간 칸에 오류이고, 기간 문구는 두 값 가운데 큰 값을 말한다', () => {
    expect(thresholdInterlockErrors({ monotonyWindowDays: 4, monotonySamePatternCount: 6, monotonySameShapeDays: 5 })).toEqual({
      monotonySamePatternCount: '되돌아보는 기간(4일)보다 클 수 없어요',
      monotonySameShapeDays: '되돌아보는 기간(4일)보다 클 수 없어요',
      monotonyWindowDays: '되돌아보는 기간은 6일보다 짧을 수 없어요',
    })
    expect(thresholdInterlockErrors({ monotonyWindowDays: 7, monotonySamePatternCount: 7, monotonySameShapeDays: 7 })).toEqual({})
  })

  it('값이 없는 칸은 견주지 않는다', () => {
    expect(thresholdInterlockErrors({ minLiveCards: 9 })).toEqual({})
    expect(thresholdInterlockErrors({ monotonySameShapeDays: 9 })).toEqual({})
  })
})

describe('저장된 행 읽기와 칸 상태', () => {
  it('값이 칸의 범위를 지키면 읽을 수 있고 0·범위 밖·모양 틀림은 읽을 수 없다', () => {
    expect(readStoredThresholdValue('minLiveCards', { value: 4 })).toEqual({ ok: true, value: 4 })
    expect(readStoredThresholdValue('minLiveCards', { value: 0 })).toEqual({ ok: false })
    expect(readStoredThresholdValue('minLiveCards', { value: '4' })).toEqual({ ok: false })
    expect(readStoredThresholdValue('minLiveCards', { value: 4.5 })).toEqual({ ok: false })
    expect(readStoredThresholdValue('minLiveCards', 4)).toEqual({ ok: false })
    expect(readStoredThresholdValue('minLiveCards', null)).toEqual({ ok: false })
    expect(readStoredThresholdValue('minLiveCards', [4])).toEqual({ ok: false })
    expect(readStoredThresholdValue('nextWeekCheckFromWeekday', { value: 0 })).toEqual({ ok: false })
    expect(readStoredThresholdValue('actionSpikeMultiplier', { value: 1.5 })).toEqual({ ok: true, value: 1.5 })
    expect(readStoredThresholdValue('actionSpikeMultiplier', { value: 1.25 })).toEqual({ ok: false })
  })

  it('읽기 전용 시각은 시각으로 읽히는 글이어야 읽을 수 있다', () => {
    expect(readStoredThresholdValue('routineCheckStartsAt', { value: '2026-10-06T00:00:00+09:00' }).ok).toBe(true)
    expect(readStoredThresholdValue('routineCheckStartsAt', { value: 'not a date' })).toEqual({ ok: false })
    expect(readStoredThresholdValue('routineCheckStartsAt', { value: 20261006 })).toEqual({ ok: false })
    expect(readStoredThresholdValue('routineCheckStartsAt', { value: '' })).toEqual({ ok: false })
  })

  it('행이 없으면 기본값 그대로이고 수정 시각이 null이다', () => {
    expect(toThresholdRecord('approvalDeadlineHours')).toEqual({
      ruleKey: 'approvalDeadlineHours',
      group: 'signal',
      signal: 'approval_deadline',
      readOnly: false,
      value: 48,
      defaultValue: 48,
      changed: false,
      unreadable: false,
      previousValue: null,
      updatedAt: null,
    })
  })

  it('바꾼 값이 읽히면 그 값이 현재 값이고, 읽을 수 없으면 기본값이며 unreadable이다. 관리자 ID 칸은 없다', () => {
    const changed = toThresholdRecord('minLiveCards', row('minLiveCards', { value: 4 }, { previous_value: { value: 3 } }))
    expect(changed).toMatchObject({ value: 4, defaultValue: 3, changed: true, unreadable: false, previousValue: 3, updatedAt: T0 })
    expect(Object.keys(changed)).not.toContain('updatedBy')
    expect(Object.keys(changed)).not.toContain('updated_by')

    const zero = toThresholdRecord('minLiveCards', row('minLiveCards', { value: 0 }))
    expect(zero).toMatchObject({ value: 3, changed: true, unreadable: true, previousValue: null })
  })

  it('읽을 수 없는 직전 값은 null이다', () => {
    expect(toThresholdRecord('minLiveCards', row('minLiveCards', { value: 4 }, { previous_value: { value: 'x' } })).previousValue).toBeNull()
  })

  it('「바꾼 값이에요 · 기본값 …」 줄: 첫 저장(직전 값 = 기본값)은 직전 값을 빼고, 직전 값이 기본값과 다르면 붙인다', () => {
    const first = toThresholdRecord('missedScheduleMinutes', row('missedScheduleMinutes', { value: 20 }, { previous_value: { value: 30 } }))
    expect(changedFieldLine(first)).toBe('바꾼 값이에요 · 기본값 30분')
    const second = toThresholdRecord('missedScheduleMinutes', row('missedScheduleMinutes', { value: 10 }, { previous_value: { value: 20 } }))
    expect(changedFieldLine(second)).toBe('바꾼 값이에요 · 기본값 30분 · 직전 값 20분')
    expect(changedFieldLine(toThresholdRecord('missedScheduleMinutes'))).toBeNull()
    expect(changedFieldLine(toThresholdRecord('minLiveCards', row('minLiveCards', { value: 0 })))).toBeNull()
  })

  it('값 보이기: 단위·요일·배·시각', () => {
    expect(formatThresholdDisplay('weeklyRoutineDeadlineHour', 12)).toBe('12시')
    expect(formatThresholdDisplay('weeklyRoutineWeekday', 2)).toBe('화요일')
    expect(formatThresholdDisplay('weeklyRoutineWeekday', 0)).toBe('일요일')
    expect(formatThresholdDisplay('actionSpikeMultiplier', 1.5)).toBe('1.5배')
    expect(formatThresholdDisplay('approvalDeadlineHours', 48)).toBe('48시간')
    expect(formatThresholdDisplay('routineCheckStartsAt', '2026-10-05T15:00:00.000Z')).toBe('10/6(화) 00:00')
    expect(formatThresholdDisplay('routineCheckStartsAt', null)).toBe('없음')
  })

  it('읽기 전용 시각의 세 상태: 값 있음·없음·못 읽음', () => {
    expect(readOnlyTimeText(toThresholdRecord('routineCheckStartsAt', row('routineCheckStartsAt', { value: '2026-10-06T00:00:00+09:00' })))).toBe(
      '10/6(화) 00:00'
    )
    expect(readOnlyTimeText(toThresholdRecord('routineCheckStartsAt'))).toBe('아직 정해지지 않았어요')
    expect(readOnlyTimeText(toThresholdRecord('routineCheckStartsAt', row('routineCheckStartsAt', { value: 'garbage' })))).toBe('시각을 읽을 수 없어요')
    expect(readOnlyTimeText(undefined)).toBe('시각을 읽을 수 없어요')
  })

  it('「바꾼 값 N」은 읽을 수 있는 바꾼 칸만 세고 읽기 전용 칸은 세지 않는다', () => {
    const map = records([
      row('failureLookbackDays', { value: 10 }),
      row('missedScheduleMinutes', { value: 0 }), // 읽을 수 없음
      row('weeklyRoutineDeadlineHour', { value: 9 }),
      row('routineCheckStartsAt', { value: '2026-10-06T00:00:00+09:00' }), // 읽기 전용
    ])
    expect(signalChangedCount(card('execution_failed'), map)).toBe(1)
    expect(signalChangedCount(card('missed_schedule'), map)).toBe(0)
    expect(signalChangedCount(card('routine_failed'), map)).toBe(1)
  })

  it('마지막 줄: 바꾼 칸 가운데 가장 늦은 시각, 없으면 칸 수에 따라 「기본값 그대로예요」·「모두 기본값 그대로예요」, 읽을 수 없는 행만 있으면 줄이 없다', () => {
    expect(signalLastChangeLine(card('missed_schedule'), records())).toBe('기본값 그대로예요')
    expect(signalLastChangeLine(card('routine_failed'), records())).toBe('모두 기본값 그대로예요')
    const map = records([row('weeklyRoutineDeadlineHour', { value: 9 }, { updated_at: T0 }), row('monthlyRoutineDay', { value: 5 }, { updated_at: T1 })])
    expect(signalLastChangeLine(card('routine_failed'), map)).toBe('마지막으로 바꾼 사람 관리자 · 10/2(금) 10:05')
    expect(signalLastChangeLine(card('missed_schedule'), records([row('missedScheduleMinutes', { value: 0 })]))).toBeNull()
    // 읽기 전용 행은 마지막 변경에 넣지 않는다
    expect(signalLastChangeLine(card('routine_failed'), records([row('routineCheckStartsAt', { value: '2026-10-06T00:00:00+09:00' })]))).toBe(
      '모두 기본값 그대로예요'
    )
  })
})

describe('초안', () => {
  it('저장된 칸에서 초안을 만든다(읽을 수 없는 칸은 빈 글)', () => {
    const map = records([row('failureLookbackDays', { value: 0 }), row('weeklyRoutineDeadlineHour', { value: 9 })])
    expect(draftFromSignalRecords(card('execution_failed'), map)).toEqual({ failureLookbackDays: '' })
    expect(draftFromSignalRecords(card('routine_failed'), map)).toEqual({
      weeklyRoutineWeekday: '2',
      weeklyRoutineDeadlineHour: '9',
      monthlyRoutineDay: '1',
      monthlyRoutineDeadlineHour: '12',
    })
  })

  it('고친 칸만 바뀐 것으로 본다. 숫자로 같은 값(「06」과 「6」)은 바꾼 것이 아니다', () => {
    const c = card('routine_failed')
    const map = records()
    const base = draftFromSignalRecords(c, map)
    expect(signalDraftChangedKeys(c, map, base)).toEqual([])
    expect(signalDraftChangedKeys(c, map, { ...base, weeklyRoutineDeadlineHour: '12 ' })).toEqual([])
    expect(signalDraftChangedKeys(c, map, { ...base, weeklyRoutineDeadlineHour: '012' })).toEqual([])
    expect(signalDraftChangedKeys(c, map, { ...base, weeklyRoutineDeadlineHour: '9', monthlyRoutineDay: '' })).toEqual([
      'weeklyRoutineDeadlineHour',
      'monthlyRoutineDay',
    ])
  })

  it('고친 칸만 확인한다: 틀린 칸은 오류, 맞는 칸은 값이 된다', () => {
    const c = card('routine_failed')
    const map = records()
    const check = checkSignalDraft(c, map, { ...draftFromSignalRecords(c, map), weeklyRoutineDeadlineHour: '24', monthlyRoutineDay: '5' })
    expect(check.errors).toEqual({ weeklyRoutineDeadlineHour: '0 이상 23 이하의 정수로 적어 주세요' })
    expect(check.typed).toEqual({ monthlyRoutineDay: 5 })
  })

  it('읽을 수 없는 저장값은 같은 카드의 다른 칸 저장을 막지 않는다(고치지 않은 칸은 확인하지 않는다)', () => {
    const c = card('routine_failed')
    const map = records([row('weeklyRoutineDeadlineHour', { value: 99 })]) // 범위 밖: 읽을 수 없음
    const draft = draftFromSignalRecords(c, map)
    expect(draft.weeklyRoutineDeadlineHour).toBe('')
    expect(checkSignalDraft(c, map, { ...draft, monthlyRoutineDay: '5' }).errors).toEqual({})
    // 읽을 수 없는 칸에 새 값을 적으면 그 값을 확인한다
    expect(checkSignalDraft(c, map, { ...draft, weeklyRoutineDeadlineHour: '25' }).errors).toEqual({
      weeklyRoutineDeadlineHour: '0 이상 23 이하의 정수로 적어 주세요',
    })
    expect(UNREADABLE_STORED_MESSAGE).toBe('저장된 값을 읽을 수 없어요. 새 값을 적거나 기본값으로 되돌려 주세요')
  })

  it('맞물림은 고친 값과 저장된 값(없으면 기본값)을 합쳐서 확인한다: 최소만 6으로 고쳐도 최대(기본 5)와 부딪힌다', () => {
    const c = card('empty_content')
    const map = records()
    const check = checkSignalDraft(c, map, { ...draftFromSignalRecords(c, map), minLiveCards: '6' })
    expect(check.errors).toEqual({
      minLiveCards: '최소 장수는 최대 장수(5장)보다 클 수 없어요',
      maxLiveCards: '최대 장수는 최소 장수(6장)보다 작을 수 없어요',
    })
    // 저장된 최대(8)와 합쳐 보면 통과한다
    expect(checkSignalDraft(c, records([row('maxLiveCards', { value: 8 })]), { ...draftFromSignalRecords(c, records([row('maxLiveCards', { value: 8 })])), minLiveCards: '6' }).errors).toEqual({})
  })

  it('칸 하나를 되돌리면 그 칸만 기본값이 되고 같은 카드 다른 칸의 입력 중 값은 남는다', () => {
    const c = card('routine_failed')
    const map = records([row('weeklyRoutineDeadlineHour', { value: 9 }), row('monthlyRoutineDay', { value: 5 })])
    const typing: SignalDraft = { ...draftFromSignalRecords(c, map), weeklyRoutineDeadlineHour: '10', monthlyRoutineDay: '6' }
    const after = draftAfterRevert(typing, toThresholdRecord('weeklyRoutineDeadlineHour'))
    expect(after).toEqual({ ...typing, weeklyRoutineDeadlineHour: '12' })
    // 되돌린 뒤 저장된 칸 상태(행이 지워짐)로 견주면 되돌린 칸은 바꾼 것이 아니고 입력 중이던 다른 칸만 바꾼 것이다
    const mapAfter = { ...map, weeklyRoutineDeadlineHour: toThresholdRecord('weeklyRoutineDeadlineHour') }
    expect(signalDraftChangedKeys(c, mapAfter, after)).toEqual(['monthlyRoutineDay'])
  })

  it('저장 본문: 고친 칸의 값과 칸별 수정 시각(행이 없으면 null)을 담는다', () => {
    const c = card('routine_failed')
    const map = records([row('weeklyRoutineDeadlineHour', { value: 9 }, { updated_at: T1 })])
    const draft: SignalDraft = { ...draftFromSignalRecords(c, map), weeklyRoutineDeadlineHour: '10', monthlyRoutineDay: '5' }
    expect(signalDraftToPatch(c, map, draft)).toEqual({
      values: { weeklyRoutineDeadlineHour: 10, monthlyRoutineDay: 5 },
      expectedUpdatedAt: { weeklyRoutineDeadlineHour: T1, monthlyRoutineDay: null },
    })
    // 바꾼 것이 없으면 빈 본문이다
    expect(signalDraftToPatch(c, map, draftFromSignalRecords(c, map))).toEqual({ values: {}, expectedUpdatedAt: {} })
  })
})

describe('결과 문장 9개(채원 확정 문구, 기본값 기준)', () => {
  const defaults = records()
  const sentence = (signal: string, draftOver: SignalDraft = {}, map = defaults) =>
    signalResultSentence(card(signal), map, { ...draftFromSignalRecords(card(signal), map), ...draftOver })

  it('신호마다 기본값으로 문장이 나온다', () => {
    expect(sentence('execution_failed')).toBe('최근 7일 안에 실패로 바뀐 항목이 있으면 알려요')
    expect(sentence('missed_schedule')).toBe('공개 시각이 지나고 30분이 지나도 공개되지 않으면 알려요')
    expect(sentence('routine_failed')).toBe('주간 루틴은 화요일 12시까지, 월간 루틴은 매월 1일 12시까지 기획안이 나오지 않으면 알려요')
    expect(sentence('empty_content')).toBe('하루에 게재하는 카드가 3장보다 적거나 5장보다 많은 날을 알려요. 다음 주 편성은 금요일부터 검사해요')
    expect(sentence('no_new_content')).toBe('그날 새로 게재를 시작하는 홈피드 카드가 1장보다 적으면 알려요')
    expect(sentence('approval_deadline')).toBe('공개 시각 48시간 전까지 승인되지 않은 항목이 있으면 알려요')
    expect(sentence('overlap')).toBe(
      '같은 날 이미지가 있는 모양의 카드가 3장 이상이거나, 이미지가 없는 모양의 카드가 1장보다 적거나, 신규 유저에게 보이는 카드가 3장보다 많으면 알려요'
    )
    expect(sentence('monotony')).toBe('최근 7일의 대표 카드에서 같은 패턴·트라이브가 3번 이상 나오거나 같은 모양이 3일 연속 대표이면 알려요')
    expect(sentence('action_spike')).toBe('최근 7일 합계가 직전 4주 주평균의 2배 이상이고 지표별 최소 건수 이상이면 알려요')
  })

  it('값을 고치는 동안 바로 바뀐다', () => {
    expect(sentence('missed_schedule', { missedScheduleMinutes: '45' })).toBe('공개 시각이 지나고 45분이 지나도 공개되지 않으면 알려요')
    expect(sentence('routine_failed', { weeklyRoutineWeekday: '0' })).toBe('주간 루틴은 일요일 12시까지, 월간 루틴은 매월 1일 12시까지 기획안이 나오지 않으면 알려요')
    expect(sentence('empty_content', { nextWeekCheckFromWeekday: '4' })).toContain('다음 주 편성은 목요일부터 검사해요')
    expect(sentence('action_spike', { actionSpikeMultiplier: '1.5' })).toContain('주평균의 1.5배 이상')
  })

  it('칸이 하나라도 틀리면 문장이 없다(그때는 칸 오류만 보인다). 맞물림 오류도 마찬가지다', () => {
    expect(sentence('missed_schedule', { missedScheduleMinutes: '' })).toBeNull()
    expect(sentence('missed_schedule', { missedScheduleMinutes: '0' })).toBeNull()
    expect(sentence('empty_content', { minLiveCards: '9' })).toBeNull()
  })

  it('읽을 수 없는 저장값이 있는 카드는 그 칸을 기본값으로 읽은 문장이다(신호 계산도 기본값을 쓴다)', () => {
    const map = records([row('missedScheduleMinutes', { value: 0 })])
    expect(sentence('missed_schedule', {}, map)).toBe('공개 시각이 지나고 30분이 지나도 공개되지 않으면 알려요')
  })
})

describe('기본값은 한 곳에만 있다', () => {
  it('칸 정의표의 기본값이 thresholds.ts의 값과 같다(표가 값을 복사하지 않는다)', () => {
    for (const key of OPS_SIGNAL_THRESHOLD_KEYS) {
      expect(toThresholdRecord(key).defaultValue).toBe(DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES[key])
    }
  })
})
