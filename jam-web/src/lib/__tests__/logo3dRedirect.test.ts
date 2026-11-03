/**
 * 옛 3D 로고 화면 주소의 이동 (티켓 20261103_1738)
 *
 * 3D 로고 별도 화면을 걷어냈으므로 `/admin/logo-3d`는 `next.config`의 redirects로
 * `/admin/assets?mode=3d`에 임시(307) 이동시킨다. 에셋 화면이 `mode` 쿼리로 3D 모드를 연다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/__tests__/logo3dRedirect.test.ts
 */
import { describe, it, expect } from 'vitest'
import nextConfig from '../../../next.config'

describe('/admin/logo-3d 이동', () => {
  it('/admin/assets?mode=3d로 임시(307) 이동한다', async () => {
    const redirects = await nextConfig.redirects!()
    const rule = redirects.find((r) => r.source === '/admin/logo-3d')
    expect(rule).toBeDefined()
    expect(rule!.destination).toBe('/admin/assets?mode=3d')
    expect(rule!.permanent).toBe(false)
  })
})
