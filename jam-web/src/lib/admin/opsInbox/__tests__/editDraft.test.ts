/**
 * 수정 양식의 초안 계산 (티켓 20260930_1818)
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/opsInbox/__tests__/editDraft.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { Json } from '@/types/database.generated'
import { computeDraftDiff, kstLocalInputToIso, splitFieldErrors, valuesFromDiff } from '../editDraft'
import { readEditableValues } from '../edit'

const ITEM: { original: Json; edited: Json | null } = {
  original: {
    user_experience: '비 오는 월요일 아침',
    copy: { title: '우산 챙겨 달리기', body: '오늘은 가볍게' },
    colors: { background: '#1a2b3c' },
    starts_at: '2026-10-05T00:00:00.000Z',
    ends_at: '2026-10-06T00:00:00.000Z',
    segment: 'all',
  },
  edited: null,
}

describe('kstLocalInputToIso', () => {
  it('KST 입력값을 UTC ISO 문자열로 바꾼다', () => {
    expect(kstLocalInputToIso('2026-10-05T09:00')).toBe('2026-10-05T00:00:00.000Z')
  })

  it('비었으면 빈 문자열, 읽을 수 없는 값은 그대로 둔다(서버 검사가 잡는다)', () => {
    expect(kstLocalInputToIso('')).toBe('')
    expect(kstLocalInputToIso('오늘')).toBe('오늘')
  })
})

describe('computeDraftDiff', () => {
  it('손대지 않은 초안은 차이가 없다', () => {
    expect(computeDraftDiff(ITEM, readEditableValues(ITEM))).toEqual({ diff: [], errors: {} })
  })

  it('바뀐 칸만 차이가 된다', () => {
    const values = { ...readEditableValues(ITEM), 'copy.body': '오늘은 천천히' }
    const { diff, errors } = computeDraftDiff(ITEM, values)
    expect(diff).toEqual([{ path: 'copy.body', before: '오늘은 가볍게', after: '오늘은 천천히' }])
    expect(errors).toEqual({})
  })

  it('한 칸이 틀려도 다른 칸의 차이는 남고, 틀린 칸에 문장이 붙는다', () => {
    const values = { ...readEditableValues(ITEM), user_experience: '한 문장', ends_at: '' }
    const { diff, errors } = computeDraftDiff(ITEM, values)
    expect(diff.map((entry) => entry.path)).toEqual(['user_experience'])
    expect(errors.ends_at).toContain('비울 수 없어요')
  })

  it('색이 #rrggbb가 아니면 그 칸에 문장이 붙는다', () => {
    const { errors } = computeDraftDiff(ITEM, { ...readEditableValues(ITEM), 'colors.background': 'red' })
    expect(errors['colors.background']).toContain('#rrggbb')
  })

  it('고칠 수 없는 칸이 들어오면 그 칸에 문장이 붙는다', () => {
    const { diff, errors } = computeDraftDiff(ITEM, { kind: 'mission' })
    expect(diff).toEqual([])
    expect(errors.kind).toBe('고칠 수 없는 칸이에요.')
  })
})

describe('valuesFromDiff', () => {
  it('바뀐 칸만 경로 → 새 값으로 만든다', () => {
    expect(valuesFromDiff([{ path: 'copy.body', before: 'a', after: 'b' }])).toEqual({ 'copy.body': 'b' })
  })
})

describe('splitFieldErrors', () => {
  it('칸 경로·묶음 이름·나머지로 나눈다', () => {
    const split = splitFieldErrors(
      { 'copy.body': 'a', copy: 'b', colors: 'c', ends_at: 'd', mystery: 'e' },
      ['copy.body', 'ends_at', 'user_experience']
    )
    expect(split.byPath).toEqual({ 'copy.body': 'a', ends_at: 'd' })
    expect(split.groups).toEqual({ copy: 'b', colors: 'c' })
    expect(split.other).toEqual(['e'])
  })
})
