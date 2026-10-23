/**
 * 조건 폼의 정수 칸 검사 — 레지스트리 쪽 회귀 테스트 (티켓 20261023_1748)
 *
 * 배경: 정수 읽기(`int()`)는 «2.5»를 2로, «7.9»를 7로, «1e3»을 1로 읽어 운영자가 쓴 값과 다른 값이 알림 없이
 * 저장됐다. `int()`의 동작은 그대로 두고, 읽기 전의 입력 글자를 `findNonIntegerFormInputs`가 저장 전에 검사한다.
 * 배지 양식과 미션 양식이 같은 함수·같은 문구를 쓰므로 문구와 판정은 여기서 고정한다.
 * 양식 state 전체를 지나는 시험(글자 → 읽기 → 저장 전 검사)은 각 양식 쪽 시험이 맡는다.
 *
 * 실행: `npx vitest run src/lib/badge-engine/__tests__/condition-registry-integer-fields.test.ts`
 */

import {
  CONDITION_FIELDS,
  INTEGER_FORM_FIELDS,
  describeNonIntegerInputs,
  findNonIntegerFormInputs,
  getConditionField,
  isIntegerFormField,
  isIntegerFormText,
  type AnyConditionFieldMeta,
} from '../conditionRegistry'

describe('isIntegerFormText — 정수로 쓴 글자만 통과한다', () => {
  it.each(['7', '+7', '-3', '0', '007', ' 7 ', '', '   '])('«%s»는 통과한다', (raw) => {
    expect(isIntegerFormText(raw)).toBe(true)
  })

  it.each(['2.5', '7.9', '1e3', '1E3', '1,000', 'abc', '٣', '--1', '7 8', '0x10', '.5', '5.', '+', '-', '1e', 'NaN', 'Infinity'])(
    '«%s»는 막는다',
    (raw) => {
      expect(isIntegerFormText(raw)).toBe(false)
    }
  )
})

describe('int() 읽기는 그대로다 — 잘림을 없애지 않고 검사가 먼저 막는다', () => {
  const read = (key: string, state: Record<string, string>) => getConditionField(key)!.form!.read(state)

  it('«2.5»·«7.9»·«1e3»은 여전히 2·7·1로 읽힌다', () => {
    expect(read('total_count', { totalCount: '2.5' })).toBe(2)
    expect(read('total_count', { totalCount: '7.9' })).toBe(7)
    expect(read('total_count', { totalCount: '1e3' })).toBe(1)
  })
})

describe('findNonIntegerFormInputs — 정수 칸에 든 정수 아닌 글자를 찾는다', () => {
  it('«2.5»와 «1e3»을 칸 이름·입력한 값과 함께 돌려준다', () => {
    expect(findNonIntegerFormInputs({ totalCount: '2.5' })).toEqual([
      { field: 'totalCount', label: '누적 활동 횟수', raw: '2.5' },
    ])
    expect(findNonIntegerFormInputs({ streakDays: '1e3' })).toEqual([
      { field: 'streakDays', label: '연속 활동 일수', raw: '1e3' },
    ])
  })

  it('«1,000»과 «abc»도 막는다', () => {
    expect(findNonIntegerFormInputs({ totalCount: '1,000' })).toHaveLength(1)
    expect(findNonIntegerFormInputs({ totalCount: 'abc' })).toHaveLength(1)
  })

  it('«7»·«+7»·빈 칸은 통과한다', () => {
    expect(findNonIntegerFormInputs({ totalCount: '7', streakDays: '+7', activeDaysCount: '' })).toEqual([])
  })

  it('입력한 값은 앞뒤 공백을 뺀 글자다', () => {
    expect(findNonIntegerFormInputs({ totalCount: ' 2.5 ' })[0].raw).toBe('2.5')
  })

  it('소수를 받는 칸과 체크박스·값이 없는 칸은 보지 않는다', () => {
    expect(findNonIntegerFormInputs({ distanceKm: '12.5', sameActivity: true, totalCount: undefined as never })).toEqual([])
  })

  it('짝 입력은 각 칸의 라벨로 알린다', () => {
    expect(findNonIntegerFormInputs({ activitiesWithinHoursHours: '1.5' })[0].label).toBe('기준 시간')
    expect(findNonIntegerFormInputs({ activitiesWithinHoursCount: '2.5' })[0].label).toBe('그 안의 활동 횟수')
  })

  it('전용 UI가 그리는 게이트 개수 칸은 게이트 이름을 붙여 알린다', () => {
    expect(findNonIntegerFormInputs({ crossInAxisMinCount: '1.5' })[0].label).toBe('축 내 교차의 필요 계열 수')
    expect(findNonIntegerFormInputs({ crossBetweenAxisMinCount: '1.5' })[0].label).toBe('축 간 교차의 필요 계열 수')
    expect(findNonIntegerFormInputs({ gateMissionBadgeMinCount: '1.5' })[0].label).toBe('미션 보상 배지의 필요 계열 수')
  })

  it('객체 조건 안쪽의 개수 칸도 본다', () => {
    expect(findNonIntegerFormInputs({ checkinCategoryCountCount: '2.5' })[0].label).toBe('보유 개수')
    expect(findNonIntegerFormInputs({ checkinBadgeCountCount: '1e1' })[0].label).toBe('보유 개수')
  })

  it('쉼표로 나눈 월 목록은 조각마다 보고, 틀린 조각을 입력한 값으로 알린다', () => {
    expect(findNonIntegerFormInputs({ month: '6, 7' })).toEqual([])
    expect(findNonIntegerFormInputs({ month: '6, 7.5' })).toEqual([{ field: 'month', label: '해당 월', raw: '7.5' }])
    expect(findNonIntegerFormInputs({ month: '1e1' })).toHaveLength(1)
  })

  it('조건 키를 주면 그 키의 칸만 본다', () => {
    const state = { totalCount: '2.5', streakDays: '1e3' }
    expect(findNonIntegerFormInputs(state, ['streak_days']).map((i) => i.field)).toEqual(['streakDays'])
    expect(findNonIntegerFormInputs(state, []).length).toBe(0)
    expect(findNonIntegerFormInputs(state).map((i) => i.field)).toEqual(['totalCount', 'streakDays'])
  })

  it('여러 칸이면 화면 순서(그룹 → 그룹 안 순서)로 돌려준다', () => {
    const found = findNonIntegerFormInputs({
      weeklyCount: '1.5',
      streakDays: '1.5',
      totalCount: '1.5',
      activeDaysCount: '1.5',
    })
    expect(found.map((i) => i.field)).toEqual(['totalCount', 'activeDaysCount', 'streakDays', 'weeklyCount'])
  })
})

describe('isIntegerFormField — 숫자 키패드를 걸 칸', () => {
  it('정수 칸은 true, 소수 칸·쉼표 목록 칸·모르는 칸은 false다', () => {
    expect(isIntegerFormField('totalCount')).toBe(true)
    expect(isIntegerFormField('activitiesWithinHoursHours')).toBe(true)
    expect(isIntegerFormField('crossInAxisMinCount')).toBe(true)
    expect(isIntegerFormField('checkinBadgeCountCount')).toBe(true)
    expect(isIntegerFormField('distanceKm')).toBe(false)
    expect(isIntegerFormField('month')).toBe(false) // 쉼표를 쓰는 글자 칸이라 숫자 키패드를 걸 수 없다
    expect(isIntegerFormField('nope')).toBe(false)
  })

  it('목록은 중복 없이 정수 칸을 모두 담는다', () => {
    expect(new Set(INTEGER_FORM_FIELDS).size).toBe(INTEGER_FORM_FIELDS.length)
    expect(INTEGER_FORM_FIELDS.length).toBeGreaterThan(60)
  })
})

describe('describeNonIntegerInputs — 두 양식이 같이 쓰는 문구', () => {
  const one = { field: 'totalCount', label: '누적 활동 횟수', raw: '2.5' }

  it('칸이 없으면 null이다', () => {
    expect(describeNonIntegerInputs([])).toBeNull()
  })

  it('한 칸이면 칸 이름과 입력한 값이 든 안내 한 문장 묶음이다', () => {
    expect(describeNonIntegerInputs([one])).toBe(
      '누적 활동 횟수에는 정수만 쓸 수 있어요. 소수나 e가 든 값은 정수로 고쳐 주세요. (입력한 값: 2.5)'
    )
  })

  it('여러 칸이면 첫 칸만 보이고 나머지는 칸 수로 알린다', () => {
    const message = describeNonIntegerInputs([one, { ...one, field: 'streakDays', label: '연속 활동 일수' }, { ...one, field: 'weeklyCount' }])
    expect(message).toBe(
      '누적 활동 횟수에는 정수만 쓸 수 있어요. 소수나 e가 든 값은 정수로 고쳐 주세요. (입력한 값: 2.5) 이 밖에 2칸에도 정수가 아닌 값이 있어요.'
    )
  })

  it('엠대시를 쓰지 않는다', () => {
    expect(describeNonIntegerInputs([one, one])).not.toMatch(/[—–]/)
  })
})

describe('정수 칸 목록의 누락 방지 — 소수가 잘리는 칸은 모두 목록에 있다', () => {
  /** 바인딩 안의 칸 하나가 정수로 읽히는지(잘림이 일어나는지)를 읽기 결과 비교로 찾는다 */
  function truncatingStateKeys(): Set<string> {
    const found = new Set<string>()
    for (const field of CONDITION_FIELDS) {
      const form = (field as AnyConditionFieldMeta).form
      if (!form) continue
      for (const stateKey of form.fields) {
        // 같은 바인딩의 다른 칸은 «2»로 채워 둔다 — 짝이 있어야 값이 만들어지는 칸도 읽히게
        const base = Object.fromEntries(form.fields.map((k) => [k, '2']))
        const read = (value: string) => JSON.stringify(form.read({ ...base, [stateKey]: value }) ?? null)
        // 읽기에 쓰이고(«2»와 빈 칸의 결과가 다르다), «2.5»가 «2»와 같게 읽히면 소수가 잘린 것이다
        if (read('2') !== read('') && read('2.5') === read('2')) found.add(stateKey)
      }
    }
    return found
  }

  const declared = new Set<string>(
    CONDITION_FIELDS.flatMap((f) => {
      const form = (f as AnyConditionFieldMeta).form
      return [...(form?.integerFields ?? []), ...(form?.integerListFields ?? [])]
    })
  )

  it('«2.5»가 «2»로 잘려 읽히는 칸이 정수 목록에 모두 있다 (정수 칸을 새로 만들고 목록에 빠뜨리면 여기서 알린다)', () => {
    const missing = [...truncatingStateKeys()].filter((k) => !declared.has(k))
    expect(missing).toEqual([])
  })

  it('반대로, 목록에 있는데 소수를 잘라 읽지 않는 칸이 없다 (소수 칸을 잘못 막지 않는다)', () => {
    const stale = [...declared].filter((k) => !truncatingStateKeys().has(k))
    expect(stale).toEqual([])
  })

  it('표본이 비어 있지 않다 — 위 두 검사가 빈 목록으로 통과하지 않는다', () => {
    const truncating = truncatingStateKeys()
    for (const key of ['totalCount', 'month', 'crossInAxisMinCount', 'activitiesWithinHoursHours', 'checkinBadgeCountCount']) {
      expect(truncating.has(key), key).toBe(true)
    }
  })
})
