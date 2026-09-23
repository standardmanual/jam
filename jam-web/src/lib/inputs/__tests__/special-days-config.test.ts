/**
 * specialDayTags — 특일 이름 → holiday_today / seasonal_today / anniversary_today (티켓 20260924_0805)
 *
 * 실행: cd jam-web && npx vitest run src/lib/inputs/__tests__/special-days-config.test.ts
 */
import { describe, it, expect } from 'vitest'
import { specialDayTags } from '../special-days-config'

describe('specialDayTags', () => {
  it('빈 목록이면 태그가 없다', () => {
    expect(specialDayTags([])).toEqual([])
  })

  it('공휴일은 holiday_today만 켠다 (개천절)', () => {
    expect(specialDayTags([{ name: '개천절', type: 'holiday' }])).toEqual(['holiday_today'])
  })

  it('대체공휴일도 holiday_today를 켠다', () => {
    expect(specialDayTags([{ name: '대체공휴일(개천절)', type: 'holiday' }])).toEqual(['holiday_today'])
  })

  it('제외 목록의 공휴일(전국동시지방선거·제헌절)은 태그를 켜지 않는다', () => {
    expect(specialDayTags([{ name: '전국동시지방선거', type: 'holiday' }])).toEqual([])
    expect(specialDayTags([{ name: '제헌절', type: 'holiday' }])).toEqual([])
  })

  it('허용 목록의 절기는 seasonal_today를 켠다, 목록 밖 절기(한로)는 켜지 않는다', () => {
    expect(specialDayTags([{ name: '입춘', type: 'seasonal' }])).toEqual(['seasonal_today'])
    expect(specialDayTags([{ name: '한로', type: 'seasonal' }])).toEqual([])
  })

  it('잡절 3개(정월대보름·말복·칠석)는 seasonal_today를 켠다, 목록 밖 잡절(한식)은 켜지 않는다', () => {
    for (const name of ['정월대보름', '말복', '칠석']) {
      expect(specialDayTags([{ name, type: 'sundry' }])).toEqual(['seasonal_today'])
    }
    expect(specialDayTags([{ name: '한식', type: 'sundry' }])).toEqual([])
  })

  it('허용 목록의 기념일은 anniversary_today를 켜고, 국군의 날은 켜지 않는다', () => {
    expect(specialDayTags([{ name: '식목일', type: 'anniversary' }])).toEqual(['anniversary_today'])
    expect(specialDayTags([{ name: '국군의 날', type: 'anniversary' }])).toEqual([])
  })

  it('API 표기의 띄어쓰기 차이("어린이 날")를 흡수한다', () => {
    expect(specialDayTags([{ name: '어린이 날', type: 'anniversary' }])).toEqual(['anniversary_today'])
    expect(specialDayTags([{ name: '푸른 하늘의 날', type: 'anniversary' }])).toEqual(['anniversary_today'])
  })

  it('같은 날이 공휴일이면서 기념일이면 두 태그가 함께 켜진다 (어린이날)', () => {
    const tags = specialDayTags([
      { name: '어린이날', type: 'holiday' },
      { name: '어린이 날', type: 'anniversary' },
    ])
    expect(tags.sort()).toEqual(['anniversary_today', 'holiday_today'])
  })

  it('같은 태그가 여러 특일에서 켜져도 한 번만 담긴다', () => {
    const tags = specialDayTags([
      { name: '추석', type: 'holiday' },
      { name: '추석 연휴', type: 'holiday' },
    ])
    expect(tags).toEqual(['holiday_today'])
  })

  it('종류가 다르면 이름이 같아도 켜지지 않는다 (기념일 종류의 "입춘")', () => {
    expect(specialDayTags([{ name: '입춘', type: 'anniversary' }])).toEqual([])
  })
})
