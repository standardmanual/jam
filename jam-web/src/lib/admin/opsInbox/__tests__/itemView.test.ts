/**
 * 기획 상세 화면의 항목 읽기 순수 함수 (티켓 20260930_1817)
 */
import { describe, it, expect } from 'vitest'
import type { Json } from '@/types/database.generated'
import {
  asRecord,
  countByItemFilter,
  defaultSelectedItem,
  describeValue,
  entriesOf,
  groupItemsByDay,
  itemField,
  linksOf,
  matchesItemFilter,
  truncateText,
  userExperienceOf,
  worldReviewOf,
} from '@/lib/admin/opsInbox/itemView'

const item = (original: Json, edited: Json | null = null) => ({ original, edited })

describe('itemField · 문자열 읽기', () => {
  it('제출 원본의 값을 읽는다', () => {
    expect(itemField(item({ user_experience: '월요일 카드예요' }), 'user_experience')).toBe('월요일 카드예요')
  })

  it('수정본에 값이 있으면 수정본을 먼저 읽는다', () => {
    const it2 = item({ user_experience: '원본' }, { user_experience: '수정본' })
    expect(userExperienceOf(it2)).toBe('수정본')
  })

  it('수정본에 그 칸이 없거나 null이면 원본으로 돌아간다', () => {
    expect(userExperienceOf(item({ user_experience: '원본' }, { copy: 'x' }))).toBe('원본')
    expect(userExperienceOf(item({ user_experience: '원본' }, { user_experience: null }))).toBe('원본')
  })

  it('객체가 아닌 원본({ value })이나 배열은 빈 값이다', () => {
    expect(userExperienceOf(item({ value: 5 }))).toBe('')
    expect(userExperienceOf(item([1, 2]))).toBe('')
    expect(userExperienceOf(item('text'))).toBe('')
    expect(userExperienceOf(item(null))).toBe('')
  })

  it('문자열이 아니면 빈 문자열이고, 앞뒤 공백은 뗀다', () => {
    expect(userExperienceOf(item({ user_experience: 5 }))).toBe('')
    expect(userExperienceOf(item({ user_experience: '  안녕  ' }))).toBe('안녕')
    expect(userExperienceOf(item({ user_experience: '   ' }))).toBe('')
  })
})

describe('linksOf', () => {
  it('문자열만 남긴다', () => {
    expect(linksOf(item({ links: ['a', 5, '', '  ', 'b', null] }))).toEqual(['a', 'b'])
  })

  it('배열이 아니면 빈 배열이다', () => {
    expect(linksOf(item({ links: 'a' }))).toEqual([])
    expect(linksOf(item({}))).toEqual([])
  })
})

describe('worldReviewOf', () => {
  it('세 칸을 읽는다', () => {
    expect(worldReviewOf(item({ world_review: { world_related: true, winter_reviewed: false, reason: ' 이유예요 ' } }))).toEqual({
      worldRelated: true,
      winterReviewed: false,
      reason: '이유예요',
    })
  })

  it('불리언이 아닌 칸은 null(모름)이다', () => {
    expect(worldReviewOf(item({ world_review: { world_related: 'yes', reason: 3 } }))).toEqual({
      worldRelated: null,
      winterReviewed: null,
      reason: '',
    })
  })

  it('객체가 아니면 null이다', () => {
    expect(worldReviewOf(item({ world_review: 'ok' }))).toBeNull()
    expect(worldReviewOf(item({}))).toBeNull()
  })
})

describe('describeValue · entriesOf · truncateText', () => {
  it('문자열은 그대로, 숫자·불리언은 글자로, 객체·배열은 JSON 한 줄', () => {
    expect(describeValue('안녕')).toBe('안녕')
    expect(describeValue(3)).toBe('3')
    expect(describeValue(false)).toBe('false')
    expect(describeValue({ a: 1 })).toBe('{"a":1}')
    expect(describeValue([1, 2])).toBe('[1,2]')
    expect(describeValue(null)).toBe('')
    expect(describeValue(undefined)).toBe('')
  })

  it('HTML 문자열도 글자 그대로 돌려준다(해석하지 않는다)', () => {
    expect(describeValue('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>')
  })

  it('entriesOf는 객체만 받고 빈 칸은 뺀다', () => {
    expect(entriesOf({ title: '제목', empty: '', none: null, n: 2 })).toEqual([
      { key: 'title', text: '제목' },
      { key: 'n', text: '2' },
    ])
    expect(entriesOf('x')).toBeNull()
    expect(entriesOf([1])).toBeNull()
    expect(entriesOf(null)).toBeNull()
  })

  it('asRecord는 배열·null을 객체로 보지 않는다', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 })
    expect(asRecord([])).toBeNull()
    expect(asRecord(null)).toBeNull()
    expect(asRecord('s')).toBeNull()
  })

  it('truncateText는 넘칠 때만 자른다', () => {
    expect(truncateText('가나다라', 4)).toBe('가나다라')
    expect(truncateText('가나다라마', 4)).toBe('가나다라…')
  })
})

describe('groupItemsByDay — 공개 시각(KST) 날짜별 묶음', () => {
  const make = (id: string, startsAt: string | null, position: number, status = 'reviewing') => ({
    id,
    startsAt,
    position,
    status,
    formatErrors: [] as string[],
  })

  it('날짜는 이른 순, 같은 날은 공개 시각 순이다', () => {
    const groups = groupItemsByDay([
      make('c', '2026-10-06T09:00:00+09:00', 2),
      make('a', '2026-10-05T18:00:00+09:00', 0),
      make('b', '2026-10-05T09:00:00+09:00', 1),
    ])
    expect(groups.map((g) => g.dayKey)).toEqual(['2026-10-05', '2026-10-06'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['b', 'a'])
    expect(groups[0].dayLabel).toBe('10/5(월)')
  })

  it('날짜는 KST 기준이다(UTC 자정 직전은 다음 날)', () => {
    const groups = groupItemsByDay([make('a', '2026-10-05T15:30:00Z', 0), make('b', '2026-10-05T14:30:00Z', 1)])
    expect(groups.map((g) => g.dayKey)).toEqual(['2026-10-05', '2026-10-06'])
  })

  it('공개 시각이 없거나 읽을 수 없는 항목은 맨 끝 묶음에 제출 순서대로 둔다', () => {
    const groups = groupItemsByDay([
      make('x', null, 3),
      make('a', '2026-10-05T09:00:00+09:00', 1),
      make('y', 'not-a-date', 0),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[1]).toMatchObject({ dayKey: null, dayLabel: null })
    expect(groups[1].items.map((i) => i.id)).toEqual(['y', 'x'])
  })

  it('같은 시각이면 제출 순서를 지킨다', () => {
    const groups = groupItemsByDay([make('b', '2026-10-05T09:00:00+09:00', 5), make('a', '2026-10-05T09:00:00+09:00', 2)])
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('항목이 없으면 묶음도 없다', () => {
    expect(groupItemsByDay([])).toEqual([])
  })

  it('처음 선택은 목록 순서에서 결정 전 첫 항목이고, 없으면 첫 행이다', () => {
    const items = [
      make('a', '2026-10-05T09:00:00+09:00', 0, 'approved'),
      make('b', '2026-10-06T09:00:00+09:00', 1, 'reviewing'),
      make('c', '2026-10-07T09:00:00+09:00', 2, 'arrived'),
    ]
    expect(defaultSelectedItem(items)?.id).toBe('b')
    expect(defaultSelectedItem(items.map((i) => ({ ...i, status: 'ended' })))?.id).toBe('a')
    expect(defaultSelectedItem([])).toBeNull()
  })
})

describe('가운데 열 탭 — 전체 · 결정할 것 · 형식 오류 · 멈춘 것', () => {
  const rows = [
    { status: 'arrived', formatErrors: [] as string[] },
    { status: 'reviewing', formatErrors: ['a', 'b'] },
    { status: 'approved', formatErrors: [] },
    { status: 'rejected', formatErrors: [] },
    { status: 'cancelled', formatErrors: ['c'] },
    { status: 'failed', formatErrors: [] },
    { status: 'live', formatErrors: [] },
  ]

  it('개수를 센다', () => {
    expect(countByItemFilter(rows)).toEqual({ all: 7, decide: 2, error: 2, stopped: 3 })
  })

  it('결정할 것은 도착·검토중, 멈춘 것은 반려·취소·실패다', () => {
    expect(rows.filter((r) => matchesItemFilter(r, 'decide')).map((r) => r.status)).toEqual(['arrived', 'reviewing'])
    expect(rows.filter((r) => matchesItemFilter(r, 'stopped')).map((r) => r.status)).toEqual([
      'rejected',
      'cancelled',
      'failed',
    ])
    expect(rows.filter((r) => matchesItemFilter(r, 'error'))).toHaveLength(2)
  })

  it('항목이 없으면 모두 0이다', () => {
    expect(countByItemFilter([])).toEqual({ all: 0, decide: 0, error: 0, stopped: 0 })
  })
})
