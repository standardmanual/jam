/**
 * 어드민 배지 폼 — 장소 연결 저장 계약 (티켓 20261018_1813, 원인 티켓 20261006_1028)
 *
 * jsdom이 없어 폼을 렌더하지 못하므로 소스를 스캔해 고정한다
 * (`type-switch-hidden-values-contract.test.ts`와 같은 방식). 두 가지가 «없어도 조용히 통과»한다.
 *
 * 1. 불러오기 완료 표시는 요청이 성공한 뒤에 한다 — 요청 전에 표시하면 개발 모드의 이중 실행에서
 *    두 번째 실행이 건너뛰어져 목록이 빈 채로 남고, 그 상태로 저장하면 기존 연결이 지워진다.
 * 2. 저장 함수는 어떤 fetch보다 먼저 불러오기 가드를 거친다 — 가드가 poi-links PUT 앞에만 있으면
 *    배지 본문은 저장된 뒤라 «반쯤 저장된» 상태가 된다.
 *
 * 실행: `npx vitest run src/app/admin/badges/__tests__/poi-links-save-contract.test.ts`
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FORM = readFileSync(join(__dirname, '..', 'BadgeForm.tsx'), 'utf-8')

function sliceBetween(source: string, from: string, to: string): string {
  const start = source.indexOf(from)
  expect(start, `${from}를 찾지 못했다`).toBeGreaterThanOrEqual(0)
  const end = source.indexOf(to, start)
  expect(end, `${to}를 찾지 못했다`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('장소 연결 불러오기', () => {
  const effect = sliceBetween(FORM, 'useEffect(() => {\n    if (!isEdit || !badge || type !==', '  const searchPois')

  it('불러오기 완료 표시는 요청 성공 뒤에만 한다', () => {
    const fetchAt = effect.indexOf('await fetch(')
    const markAt = effect.indexOf('poiLinksLoadedRef.current = true')
    expect(fetchAt).toBeGreaterThanOrEqual(0)
    expect(markAt).toBeGreaterThan(fetchAt)
    // 요청 전 구간에는 완료 표시가 없다
    expect(effect.slice(0, fetchAt)).not.toContain('poiLinksLoadedRef.current = true')
  })

  it('실패하면 failed 상태로 두고 완료 표시를 하지 않는다', () => {
    const catchBody = effect.slice(effect.indexOf('} catch'))
    expect(catchBody).toContain("setPoiLinksState('failed')")
    expect(catchBody).not.toContain('poiLinksLoadedRef.current = true')
  })
})

describe('배지 저장 함수', () => {
  const submit = sliceBetween(FORM, 'const handleSubmit = async', 'const handleDelete = async')

  it('어떤 fetch보다 먼저 장소 연결 불러오기 가드를 거친다', () => {
    const guardAt = submit.indexOf('findPoiLinksNotLoadedError(type, isEdit, poiLinksState)')
    const firstFetchAt = submit.indexOf('fetch(')
    expect(guardAt).toBeGreaterThanOrEqual(0)
    expect(firstFetchAt).toBeGreaterThan(guardAt)
  })

  it('poi-links PUT은 한 곳뿐이다', () => {
    expect(submit.split('/poi-links`').length - 1).toBe(1)
  })
})
