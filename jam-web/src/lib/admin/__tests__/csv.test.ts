/**
 * 어드민 CSV 내보내기 회귀 테스트(티켓 20260924_0940). 엑셀 호환 규격 따옴표 처리와
 * 수식 주입(CSV injection) 차단을 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { toCsv } from '@/lib/admin/csv'

describe('toCsv', () => {
  it('맨 앞에 BOM을 붙인다', () => {
    const csv = toCsv([{ name: '홍길동' }], [{ header: '이름', value: (r) => r.name }])
    expect(csv.startsWith('﻿')).toBe(true)
  })

  it('쉼표·큰따옴표·줄바꿈이 있으면 따옴표로 감싸고 큰따옴표는 두 번 쓴다', () => {
    const rows = [{ v: '홍길동, "별명" 포함' }, { v: '줄바꿈\n있음' }]
    const csv = toCsv(rows, [{ header: 'v', value: (r) => r.v }])
    const lines = csv.slice(1).split('\r\n')
    expect(lines[1]).toBe('"홍길동, ""별명"" 포함"')
    expect(lines[2]).toBe('"줄바꿈\n있음"')
  })

  it('=·+·-·@로 시작하는 문자열은 수식 주입을 막기 위해 앞에 작은따옴표를 붙인다', () => {
    const rows = [{ v: '=SUM(A1:A2)' }, { v: '+1' }, { v: '-1' }, { v: '@user' }]
    const csv = toCsv(rows, [{ header: 'v', value: (r) => r.v }])
    const lines = csv.slice(1).split('\r\n').slice(1)
    expect(lines).toEqual(["'=SUM(A1:A2)", "'+1", "'-1", "'@user"])
  })

  it('숫자 값은 수식 주입 검사를 하지 않고 그대로 쓴다', () => {
    const csv = toCsv([{ v: -1 }], [{ header: 'v', value: (r) => r.v }])
    expect(csv.slice(1).split('\r\n')[1]).toBe('-1')
  })

  it('null은 빈 칸으로 쓴다', () => {
    const csv = toCsv([{ v: null }], [{ header: 'v', value: (r) => r.v }])
    expect(csv.slice(1).split('\r\n')[1]).toBe('')
  })
})
