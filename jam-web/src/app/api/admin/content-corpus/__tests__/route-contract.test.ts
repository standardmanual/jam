/**
 * content-corpus 어드민 읽기 라우트 — 계약 회귀 (티켓 20260923_2325)
 *
 * 지키는 것:
 * 1. GET만 export한다(쓰기 메서드 없음)
 * 2. `requireAdminRead(req)`로 인증한다
 * 3. POST 전용 `requireAdmin()`을 섞어 쓰지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/content-corpus/__tests__/route-contract.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raw = readFileSync(join(process.cwd(), 'src/app/api/admin/content-corpus/route.ts'), 'utf8')
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n')

describe('content-corpus 라우트 — 인증 계약', () => {
  it('GET만 export하고 쓰기 메서드는 export하지 않는다', () => {
    expect(code).toMatch(/export\s+async\s+function\s+GET\s*\(/)
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(code).not.toMatch(new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`))
    }
  })

  it('requireAdminRead(req)로 인증한다', () => {
    expect(code).toMatch(/import\s*\{[^}]*\brequireAdminRead\b[^}]*\}\s*from\s*'@\/lib\/admin\/auth'/)
    expect(code).toMatch(/await\s+requireAdminRead\s*\(\s*req\s*\)/)
  })

  it('requireAdmin()(세션 전용)을 섞어 쓰지 않는다', () => {
    expect(code).not.toMatch(/\brequireAdmin\s*\(\s*\)/)
  })
})
