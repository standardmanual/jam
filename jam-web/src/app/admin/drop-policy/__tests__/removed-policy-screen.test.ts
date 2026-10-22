/**
 * 어드민 «드랍 정책» 화면이 사라진 뒤의 정합 (티켓 20261022_0938)
 *
 * 옛 드랍 엔진의 파라미터 폼(`/admin/drop-policy`)과 저장 API를 지웠다. «드랍 제외 관리»(`/admin/drop-policy/exclusions`)는
 * 같은 폴더 아래라 남는다. 지운 화면으로 돌아가는 링크가 남으면 404로 간다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/drop-policy/__tests__/removed-policy-screen.test.ts
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const APP = join(__dirname, '..', '..', '..')

describe('«드랍 정책» 화면 삭제', () => {
  it.each([
    'app/admin/drop-policy/page.tsx',
    'app/admin/drop-policy/DropPolicyForm.tsx',
    'app/api/admin/drop-policy/route.ts',
    'app/api/admin/test/simulate/route.ts',
  ])('%s가 없다', (path) => {
    expect(existsSync(join(APP, '..', path)), `${path}가 다시 생겼다`).toBe(false)
  })

  it('«드랍 제외 관리» 화면과 API는 남아 있다', () => {
    for (const path of [
      'app/admin/drop-policy/exclusions/page.tsx',
      'app/api/admin/drop-policy/exclusions/bulk/route.ts',
      'app/api/admin/drop-policy/exclusions/ids/route.ts',
    ]) {
      expect(existsSync(join(APP, '..', path)), `${path}가 없다`).toBe(true)
    }
  })

  it('«드랍 제외 관리» 화면에 지운 화면으로 가는 링크가 없다', () => {
    const page = readFileSync(join(APP, 'admin/drop-policy/exclusions/page.tsx'), 'utf-8')
    expect(page).not.toMatch(/href=["']\/admin\/drop-policy["']/)
    expect(page).not.toContain('드랍 정책 파라미터')
  })
})
