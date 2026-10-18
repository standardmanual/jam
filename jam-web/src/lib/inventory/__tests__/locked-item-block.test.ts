/**
 * 막힌 장착·믹스·드랍 판별 (티켓 20261018_0056) — `suspension/suspended-block.ts`의 정지 403 판별과 같은 모양
 *
 * 실행: cd jam-web && npx vitest run src/lib/inventory/__tests__/locked-item-block.test.ts
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOCKED_ITEM_NOT_ALLOWED_CODE, isLockedItemBody } from '../locked-item-block'
import { LOCKED_ITEM_NOT_ALLOWED_CODE as REEXPORTED_CODE } from '../lockedItem'

describe('isLockedItemBody', () => {
  it('409이고 code가 locked_item_not_allowed일 때 참이다 (장착·드랍 응답)', () => {
    expect(isLockedItemBody(409, { error: '잠김', code: 'locked_item_not_allowed' })).toBe(true)
  })

  it('믹스 응답처럼 reason에만 같은 값이 있어도 참이다', () => {
    expect(isLockedItemBody(409, { success: false, reason: 'locked_item_not_allowed' })).toBe(true)
  })

  it('다른 코드·다른 상태·본문이 객체가 아니면 거짓이다', () => {
    expect(isLockedItemBody(409, { code: 'pending_results_exist' })).toBe(false)
    // 가득 참 해제 거절은 잠김이 아니다
    expect(isLockedItemBody(409, { code: 'inventory_full' })).toBe(false)
    expect(isLockedItemBody(403, { code: 'locked_item_not_allowed' })).toBe(false)
    expect(isLockedItemBody(500, { code: 'locked_item_not_allowed' })).toBe(false)
    expect(isLockedItemBody(409, null)).toBe(false)
    expect(isLockedItemBody(409, 'locked_item_not_allowed')).toBe(false)
    expect(isLockedItemBody(409, undefined)).toBe(false)
  })
})

describe('경계', () => {
  it('서버 모듈의 상수와 같은 값이다 (원천은 이 순수 모듈)', () => {
    expect(REEXPORTED_CODE).toBe(LOCKED_ITEM_NOT_ALLOWED_CODE)
  })

  it('순수 모듈이라 서버 모듈을 가져오지 않는다', () => {
    const source = readFileSync(path.resolve(__dirname, '../locked-item-block.ts'), 'utf8')
    expect(source).not.toMatch(/^import\s/m)
  })
})
