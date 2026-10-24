/**
 * 조건 칸이 아닌 정수 칸의 저장 전 검사 (티켓 20261023_1940, 부모 20261023_1748)
 *
 * 배지 양식(포인트 보상·패치 가격·레벨)과 미션 양식(공개 인원·미션 포인트·선착순 인원) 여섯 칸을 1748의 시험과 같은
 * 입력 칸 경로(입력 글자 → 읽기 → 저장 전 검사)로 고정한다.
 *   - 읽기: 폼이 쓰는 `readIntegerInput`(`parseInt`)은 «2.5»를 2로, «1e3»을 1로 잘라 읽는다. 운영자가 쓴 값과 다른 값이다.
 *   - 검사: 그 글자를 읽기 전에 조건 칸과 같은 문구로 막는다. 읽는 쪽은 그대로다.
 *   - 연결: 폼이 이 검사를 저장 전에 부르고, 읽기에 같은 함수를 쓰는지는 소스를 스캔해 고정한다
 *     (`hidden-branch-form-contract.test.ts`와 같은 방식. 폼 구성 요소에는 렌더 시험이 없다).
 *
 * 실행: `npx vitest run src/lib/admin/__tests__/integerRangeInput.test.ts`
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describeNonIntegerInputs } from '@/lib/badge-engine/conditionRegistry'
import {
  describeIntegerRangeInputs,
  findBadgeIntegerInputError,
  findMissionIntegerInputError,
  readIntegerInput,
  type BadgeIntegerFormInput,
  type MissionIntegerFormInput,
} from '../integerRangeInput'

const BADGE_BASE: BadgeIntegerFormInput = { pointReward: '0', patchAvailable: true, patchPriceKrw: '', isLeveled: true, level: '1' }
const MISSION_BASE: MissionIntegerFormInput = { visibleRankCount: '', rewardPoints: '100', maxCompletions: '' }

/** 여섯 칸 — 칸마다 화면 이름, 최소값, 검사를 부르는 방법. 읽기는 모두 폼이 쓰는 `readIntegerInput`이다 */
const FIELDS: { name: string; label: string; min: number; check: (text: string) => string | null; valid: string[] }[] = [
  {
    name: '배지 포인트 보상',
    label: '포인트 보상',
    min: 0,
    check: (pointReward) => findBadgeIntegerInputError({ ...BADGE_BASE, pointReward }),
    valid: ['0', '15', '+15'],
  },
  {
    name: '배지 패치 가격',
    label: '패치 가격',
    min: 0,
    check: (patchPriceKrw) => findBadgeIntegerInputError({ ...BADGE_BASE, patchPriceKrw }),
    valid: ['0', '9900'],
  },
  {
    name: '배지 레벨',
    label: '레벨',
    min: 1,
    check: (level) => findBadgeIntegerInputError({ ...BADGE_BASE, level }),
    valid: ['1', '12'],
  },
  {
    name: '미션 공개 인원',
    label: '공개 인원',
    min: 1,
    check: (visibleRankCount) => findMissionIntegerInputError({ ...MISSION_BASE, visibleRankCount }),
    valid: ['1', '10'],
  },
  {
    name: '미션 선착순 인원(최대 완료 횟수)',
    label: '선착순 인원',
    min: 1,
    check: (maxCompletions) => findMissionIntegerInputError({ ...MISSION_BASE, maxCompletions }),
    valid: ['1', '100'],
  },
  {
    name: '미션 포인트(보상 포인트)',
    label: '미션 포인트',
    min: 0,
    check: (rewardPoints) => findMissionIntegerInputError({ ...MISSION_BASE, rewardPoints }),
    valid: ['0', '100'],
  },
]

describe('readIntegerInput — 폼이 쓰는 읽기', () => {
  it('정수로 쓴 글자는 그 값으로 읽는다', () => {
    expect(readIntegerInput('12')).toBe(12)
    expect(readIntegerInput('+7')).toBe(7)
    expect(readIntegerInput('0')).toBe(0)
    expect(readIntegerInput(' 5 ')).toBe(5)
  })

  it('빈칸·읽을 수 없는 글자는 null이다', () => {
    expect(readIntegerInput('')).toBeNull()
    expect(readIntegerInput('   ')).toBeNull()
    expect(readIntegerInput('abc')).toBeNull()
  })

  it('읽기 동작은 그대로다 — «2.5»는 2로, «1e3»은 1로 잘린다 (그래서 읽기 전에 검사가 막는다)', () => {
    expect(readIntegerInput('2.5')).toBe(2)
    expect(readIntegerInput('7.9')).toBe(7)
    expect(readIntegerInput('1e3')).toBe(1)
  })
})

describe('describeIntegerRangeInputs — 정수가 아님 / 최소값 미만 / 통과', () => {
  const one = (raw: string, min = 0) => [{ field: 'pointReward', label: '포인트 보상', raw, min }]

  it('빈칸·정수·최소값 이상은 통과한다', () => {
    expect(describeIntegerRangeInputs([])).toBeNull()
    expect(describeIntegerRangeInputs(one(''))).toBeNull()
    expect(describeIntegerRangeInputs(one('   '))).toBeNull()
    expect(describeIntegerRangeInputs(one('0'))).toBeNull()
    expect(describeIntegerRangeInputs(one('3', 3))).toBeNull()
    expect(describeIntegerRangeInputs(one('+3', 3))).toBeNull()
  })

  it('정수가 아닌 글자는 조건 칸과 같은 함수·같은 문구다', () => {
    const message = describeIntegerRangeInputs(one('2.5'))
    expect(message).toBe('포인트 보상에는 정수만 쓸 수 있어요. 소수나 e가 든 값은 정수로 고쳐 주세요. (입력한 값: 2.5)')
    expect(message).toBe(describeNonIntegerInputs([{ field: 'pointReward', label: '포인트 보상', raw: '2.5' }]))
    expect(describeIntegerRangeInputs(one('1e3'))).toContain('(입력한 값: 1e3)')
    expect(describeIntegerRangeInputs(one('1,000'))).toContain('(입력한 값: 1,000)')
  })

  it('입력 글자의 앞뒤 공백은 문구에 넣지 않는다', () => {
    expect(describeIntegerRangeInputs(one(' 2.5 '))).toContain('(입력한 값: 2.5)')
    expect(describeIntegerRangeInputs(one(' -1 '))).toContain('(입력한 값: -1)')
  })

  it('정수인데 최소값보다 작으면 같은 어조로 알리고 입력한 값을 보인다', () => {
    expect(describeIntegerRangeInputs([{ field: 'patchPriceKrw', label: '패치 가격', raw: '-1', min: 0 }])).toBe(
      '패치 가격에는 0 이상의 정수만 쓸 수 있어요. 0보다 작은 값은 고쳐 주세요. (입력한 값: -1)'
    )
    expect(describeIntegerRangeInputs([{ field: 'level', label: '레벨', raw: '0', min: 1 }])).toBe(
      '레벨에는 1 이상의 정수만 쓸 수 있어요. 1보다 작은 값은 고쳐 주세요. (입력한 값: 0)'
    )
    // «-0»은 0이라 최소값 0은 통과하고, 최소값 1은 막힌다
    expect(describeIntegerRangeInputs(one('-0'))).toBeNull()
    expect(describeIntegerRangeInputs(one('-0', 1))).not.toBeNull()
  })

  it('정수가 아닌 칸이 먼저고, 칸이 여럿이면 첫 칸만 보이고 나머지는 칸 수로 알린다', () => {
    const message = describeIntegerRangeInputs([
      { field: 'level', label: '레벨', raw: '0', min: 1 },
      { field: 'pointReward', label: '포인트 보상', raw: '1e3', min: 0 },
      { field: 'patchPriceKrw', label: '패치 가격', raw: '9.9', min: 0 },
    ])
    expect(message).toBe(
      '포인트 보상에는 정수만 쓸 수 있어요. 소수나 e가 든 값은 정수로 고쳐 주세요. (입력한 값: 1e3) 이 밖에 1칸에도 정수가 아닌 값이 있어요.'
    )
  })

  it('최소값 미만이 여럿이면 순서상 첫 칸을 알린다', () => {
    const message = describeIntegerRangeInputs([
      { field: 'a', label: '가', raw: '5', min: 0 },
      { field: 'b', label: '나', raw: '-2', min: 0 },
      { field: 'c', label: '다', raw: '-9', min: 0 },
    ])
    expect(message).toBe('나에는 0 이상의 정수만 쓸 수 있어요. 0보다 작은 값은 고쳐 주세요. (입력한 값: -2)')
  })

  it('엠대시를 쓰지 않는다', () => {
    expect(describeIntegerRangeInputs(one('2.5'))).not.toMatch(/[—–]/)
    expect(describeIntegerRangeInputs(one('-1'))).not.toMatch(/[—–]/)
  })
})

describe.each(FIELDS)('입력 칸 경로: $name', ({ label, min, check, valid }) => {
  it.each([
    ['2.5', 2],
    ['7.9', 7],
    ['1e3', 1],
    ['1E3', 1],
    ['1,000', 1],
  ])('«%s»는 읽으면 %i로 잘려 운영자가 쓴 값과 달라지므로 저장 전에 조건 칸과 같은 문구로 막는다', (text, silentlyRead) => {
    expect(readIntegerInput(text), '읽기가 글자를 잘라 읽어야 이 검사가 필요한 이유가 선다').toBe(silentlyRead)
    expect(check(text)).toBe(describeNonIntegerInputs([{ field: 'x', label, raw: text }]))
  })

  it('최소값보다 작은 정수는 최소값을 알리며 막는다', () => {
    const text = String(min - 1)
    expect(check(text)).toBe(`${label}에는 ${min} 이상의 정수만 쓸 수 있어요. ${min}보다 작은 값은 고쳐 주세요. (입력한 값: ${text})`)
  })

  it('최소값 이상의 정수는 통과하고 쓴 값 그대로 읽힌다', () => {
    for (const text of valid) {
      expect(check(text), text).toBeNull()
      expect(readIntegerInput(text), text).toBe(Number(text))
      expect(readIntegerInput(text)!).toBeGreaterThanOrEqual(min)
    }
  })

  it('빈칸은 통과한다 — 빈칸의 뜻(0·값 없음·제한 없음)은 읽는 쪽이 정한다', () => {
    expect(check('')).toBeNull()
    expect(readIntegerInput('')).toBeNull()
  })
})

describe('배지 양식 — 닫힌 칸과 칸 순서', () => {
  it('패치 구매를 열지 않았으면 패치 가격 칸에 남은 글자는 막지 않는다', () => {
    expect(findBadgeIntegerInputError({ ...BADGE_BASE, patchAvailable: false, patchPriceKrw: '1e3' })).toBeNull()
    expect(findBadgeIntegerInputError({ ...BADGE_BASE, patchAvailable: true, patchPriceKrw: '1e3' })).not.toBeNull()
  })

  it('등급형이면 레벨 칸에 남은 글자는 막지 않는다', () => {
    expect(findBadgeIntegerInputError({ ...BADGE_BASE, isLeveled: false, level: '1e3' })).toBeNull()
    expect(findBadgeIntegerInputError({ ...BADGE_BASE, isLeveled: false, level: '0' })).toBeNull()
    expect(findBadgeIntegerInputError({ ...BADGE_BASE, isLeveled: true, level: '1e3' })).not.toBeNull()
  })

  it('정상 값 조합은 통과한다', () => {
    expect(findBadgeIntegerInputError({ pointReward: '50', patchAvailable: true, patchPriceKrw: '9900', isLeveled: true, level: '3' })).toBeNull()
    expect(findBadgeIntegerInputError({ pointReward: '', patchAvailable: false, patchPriceKrw: '', isLeveled: false, level: '' })).toBeNull()
  })

  it('여러 칸이 틀리면 화면 순서(레벨, 포인트 보상, 패치 가격)의 첫 칸을 보이고 나머지는 칸 수로 알린다', () => {
    expect(findBadgeIntegerInputError({ pointReward: '2.5', patchAvailable: true, patchPriceKrw: '1e3', isLeveled: true, level: '1.5' })).toBe(
      '레벨에는 정수만 쓸 수 있어요. 소수나 e가 든 값은 정수로 고쳐 주세요. (입력한 값: 1.5) 이 밖에 2칸에도 정수가 아닌 값이 있어요.'
    )
  })
})

describe('미션 양식 — 칸 순서', () => {
  it('정상 값 조합은 통과한다', () => {
    expect(findMissionIntegerInputError({ visibleRankCount: '20', rewardPoints: '0', maxCompletions: '100' })).toBeNull()
    expect(findMissionIntegerInputError({ visibleRankCount: '', rewardPoints: '', maxCompletions: '' })).toBeNull()
  })

  it('여러 칸이 틀리면 화면 순서(공개 인원, 미션 포인트, 선착순 인원)의 첫 칸을 보이고 나머지는 칸 수로 알린다', () => {
    expect(findMissionIntegerInputError({ visibleRankCount: '2.5', rewardPoints: '1e3', maxCompletions: '0.5' })).toBe(
      '공개 인원에는 정수만 쓸 수 있어요. 소수나 e가 든 값은 정수로 고쳐 주세요. (입력한 값: 2.5) 이 밖에 2칸에도 정수가 아닌 값이 있어요.'
    )
  })

  it('0은 공개 인원·선착순 인원에서는 막고(1 이상) 미션 포인트에서는 통과한다(0 이상)', () => {
    expect(findMissionIntegerInputError({ ...MISSION_BASE, visibleRankCount: '0' })).toContain('공개 인원에는 1 이상')
    expect(findMissionIntegerInputError({ ...MISSION_BASE, maxCompletions: '0' })).toContain('선착순 인원에는 1 이상')
    expect(findMissionIntegerInputError({ ...MISSION_BASE, rewardPoints: '0' })).toBeNull()
  })
})

// ── 폼 연결 (소스 스캔) ───────────────────────────────────────────────────

const BADGE_FORM = readFileSync(join(__dirname, '..', '..', '..', 'app', 'admin', 'badges', 'BadgeForm.tsx'), 'utf-8')
const MISSION_FORM = readFileSync(join(__dirname, '..', '..', '..', 'app', 'admin', 'missions', 'MissionForm.tsx'), 'utf-8')

/** 함수 본문만 떼어낸다 — 다른 함수의 같은 줄로 통과하지 않게 한다 */
function bodyOf(source: string, header: string): string {
  const start = source.indexOf(header)
  expect(start, `${header}를 찾지 못했다`).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('\n  }\n', start)
  expect(end, `${header}의 끝을 찾지 못했다`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('배지 양식 연결', () => {
  const submit = bodyOf(BADGE_FORM, 'const handleSubmit = async (e: React.FormEvent) => {')

  it('저장 전에 정수 칸을 검사하고 막히면 저장하지 않는다', () => {
    const call = submit.indexOf('findBadgeIntegerInputError({ pointReward, patchAvailable, patchPriceKrw, isLeveled, level })')
    expect(call).toBeGreaterThan(0)
    expect(submit.slice(call, call + 260)).toMatch(/if \(integerInputError\) \{\s*setError\(integerInputError\)\s*return\s*\}/)
  })

  it('검사는 포인트를 읽는 숨김 배지 검사와 저장 본문 조립보다 앞에 있다', () => {
    const call = submit.indexOf('findBadgeIntegerInputError(')
    expect(call).toBeLessThan(submit.indexOf('findHiddenBadgeError({'))
    expect(call).toBeLessThan(submit.indexOf('const body = {'))
    expect(call).toBeLessThan(submit.indexOf("fetch(isEdit ?"))
  })

  it('저장 본문의 정수 읽기는 폼이 검사하는 같은 함수를 쓴다', () => {
    expect(submit).toContain('level: isLeveled ? readIntegerInput(level) : null,')
    expect(submit).toContain('patch_price_krw: patchAvailable && patchPriceKrw ? Math.max(0, readIntegerInput(patchPriceKrw) ?? 0) : null,')
    expect(submit).toContain('point_reward: Math.max(0, readIntegerInput(pointReward) ?? 0),')
    expect(submit).toContain('pointReward: Math.max(0, readIntegerInput(pointReward) ?? 0),')
    expect(submit).not.toMatch(/parseInt\((level|patchPriceKrw|pointReward),/)
  })
})

describe('미션 양식 연결', () => {
  const save = bodyOf(MISSION_FORM, 'async function handleSave() {')

  it('저장 전에 세 칸의 입력 글자를 검사하고 막히면 저장 버튼 옆에 알리며 저장하지 않는다', () => {
    const call = save.indexOf('findMissionIntegerInputError({')
    expect(call).toBeGreaterThan(0)
    expect(save.slice(call, call + 420)).toMatch(
      /visibleRankCount: form\.visible_rank_count,\s*rewardPoints: form\.reward_points,\s*maxCompletions: form\.max_completions,\s*\}\)\s*if \(integerInputError\) \{\s*setSaveError\(integerInputError\)\s*return\s*\}/
    )
  })

  it('검사는 저장 요청을 만들기 전에 있다', () => {
    const call = save.indexOf('findMissionIntegerInputError(')
    expect(call).toBeLessThan(save.indexOf('setSaving(true)'))
    expect(call).toBeLessThan(save.indexOf('const body = {'))
    expect(call).toBeLessThan(save.indexOf('fetch(editingId'))
  })

  it('저장 본문의 정수 읽기는 검사하는 같은 함수를 쓴다', () => {
    expect(save).toContain('visible_rank_count: readIntegerInput(form.visible_rank_count),')
    expect(save).toContain('max_completions: readIntegerInput(form.max_completions),')
    expect(MISSION_FORM).toContain('const missionPoints = readIntegerInput(form.reward_points) ?? 0')
    expect(save).not.toMatch(/Number\(form\.(visible_rank_count|max_completions)\)/)
  })

  it('미션 포인트 칸은 입력 글자를 그대로 state에 둔다 — 숫자로 바꿔 두면 «2.5»·«1e3» 글자가 사라져 검사할 수 없다', () => {
    expect(MISSION_FORM).toContain('reward_points: e.target.value')
    expect(MISSION_FORM).not.toMatch(/reward_points: Number\(/)
    expect(MISSION_FORM).toContain('reward_points: String(m.reward_points ?? 0),')
    expect(MISSION_FORM).toMatch(/reward_points: '100' as string,/)
  })
})
