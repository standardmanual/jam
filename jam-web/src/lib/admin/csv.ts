/**
 * 어드민 내보내기 CSV 생성 공용 함수(티켓 20260924_0940, 상위 티켓 §1-8 이름 검색·내보내기).
 * 엑셀에서 바로 열어도 한글이 깨지지 않도록 BOM을 붙이고, 셀 값이 `=`·`+`·`-`·`@`로
 * 시작하면 엑셀이 수식으로 해석해 실행하는 "CSV 인젝션"을 막는다.
 */

export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null
}

const FORMULA_PREFIX_RE = /^[=+\-@]/

function escapeCsvCell(raw: string | number | null): string {
  if (raw === null) return ''
  if (typeof raw === 'number') return String(raw)

  const guarded = FORMULA_PREFIX_RE.test(raw) ? `'${raw}` : raw
  const needsQuote = /[",\r\n]/.test(guarded)
  const escaped = guarded.replace(/"/g, '""')
  return needsQuote ? `"${escaped}"` : escaped
}

/** 엑셀 호환 CSV 문자열을 만든다(BOM + CRLF). 숫자 값은 수식 주입 검사 대상이 아니다 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => escapeCsvCell(c.header)).join(',')
  const bodyLines = rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(','))
  return '﻿' + [headerLine, ...bodyLines].join('\r\n')
}
