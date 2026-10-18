/**
 * 이용 정지 403 판별 (티켓 20261018_0054 1회) — `sync-flow`가 쓰던 판별을 옮겨 캡슐 클라이언트와 같이 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/suspension/__tests__/suspended-block.test.ts
 */
import { describe, expect, it } from 'vitest'
import { isSuspendedBlock, isSuspendedBody } from '../suspended-block'

describe('isSuspendedBody', () => {
  it('403이고 code가 user_suspended일 때만 참이다', () => {
    expect(isSuspendedBody(403, { error: '정지', code: 'user_suspended' })).toBe(true)
    expect(isSuspendedBody(403, { code: 'other' })).toBe(false)
    expect(isSuspendedBody(403, null)).toBe(false)
    expect(isSuspendedBody(403, 'user_suspended')).toBe(false)
    expect(isSuspendedBody(409, { code: 'user_suspended' })).toBe(false)
    expect(isSuspendedBody(200, { code: 'user_suspended' })).toBe(false)
  })
})

describe('isSuspendedBlock', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

  it('403 + user_suspended 응답이면 참이다', async () => {
    expect(await isSuspendedBlock(json(403, { code: 'user_suspended' }))).toBe(true)
  })

  it('403이 아니면 본문을 읽지 않고 거짓이다', async () => {
    const res = json(409, { code: 'user_suspended' })
    expect(await isSuspendedBlock(res)).toBe(false)
    expect(res.bodyUsed).toBe(false)
  })

  it('403이어도 본문이 JSON이 아니면 거짓이다', async () => {
    expect(await isSuspendedBlock(new Response('Forbidden', { status: 403 }))).toBe(false)
  })
})
