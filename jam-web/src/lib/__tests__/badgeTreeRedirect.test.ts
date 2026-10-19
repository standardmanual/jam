/**
 * 옛 배지 트리 주소의 이동 (티켓 20261018_1817, 2회)
 *
 * 배지 트리 화면을 걷어냈으므로 `/badges/tree`는 `next.config`의 redirects로 `/badges`에
 * 임시(307) 이동시킨다. `permanent: false`가 307이다(영구면 308).
 *
 * 실행: cd jam-web && npx vitest run src/lib/__tests__/badgeTreeRedirect.test.ts
 */
import { describe, it, expect } from 'vitest'
import nextConfig from '../../../next.config'

describe('/badges/tree 이동', () => {
  it('/badges로 임시(307) 이동한다', async () => {
    const redirects = await nextConfig.redirects!()
    const rule = redirects.find((r) => r.source === '/badges/tree')
    expect(rule).toBeDefined()
    expect(rule!.destination).toBe('/badges')
    expect(rule!.permanent).toBe(false)
  })
})
