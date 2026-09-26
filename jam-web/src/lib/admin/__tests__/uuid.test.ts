/**
 * isUuid 경계 — 5개 이상 어드민 라우트가 공용으로 쓰는 형식 판정이라 라우트 테스트와 별개로 고정한다
 * (티켓 20260926_1601).
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/uuid.test.ts
 */
import { describe, it, expect } from 'vitest'
import { isUuid } from '../uuid'

const VALID = '3f2a9c1e-0000-4000-8000-0000000000a1'

describe('isUuid', () => {
  it('소문자 UUID는 통과한다', () => {
    expect(isUuid(VALID)).toBe(true)
  })

  it('대문자 16진수도 통과한다(대소문자 무시)', () => {
    expect(isUuid(VALID.toUpperCase())).toBe(true)
    expect(isUuid('3F2a9C1e-0000-4000-8000-0000000000A1')).toBe(true)
  })

  it('버전·변형 자리를 가리지 않고 형식만 본다', () => {
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true)
  })

  it.each([
    ['빈 문자열', ''],
    ['앞 공백', ` ${VALID}`],
    ['뒤 공백', `${VALID} `],
    ['뒤 줄바꿈', `${VALID}\n`],
    ['중괄호 표기', `{${VALID}}`],
    ['urn 접두', `urn:uuid:${VALID}`],
    ['하이픈 없음', VALID.replaceAll('-', '')],
    ['하이픈 위치 어긋남', '3f2a9c1e0-000-4000-8000-0000000000a1'],
    ['하이픈 하나 더', '3f2a9c1e-0000-4000-8000-00000000-00a1'],
    ['한 자리 짧음', VALID.slice(0, -1)],
    ['한 자리 김', `${VALID}0`],
    ['16진수가 아닌 문자', '3f2a9c1e-0000-4000-8000-0000000000g1'],
    ['숫자 id', '3'],
  ])('%s은 거절한다', (_label, value) => {
    expect(isUuid(value)).toBe(false)
  })
})
