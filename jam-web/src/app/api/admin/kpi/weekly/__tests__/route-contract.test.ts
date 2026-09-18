/**
 * 주간 집계 API 라우트 — 계약 회귀 (티켓 20260918_1150)
 *
 * 지키는 것:
 * 1. GET만 export한다(쓰기 메서드 없음 — 순수 조회 리포트라 그 외 메서드가 필요 없다)
 * 2. `requireAdminRead(req)`로 인증한다(POST 전용 `requireAdmin()`을 GET에 섞지 않는다)
 * 3. 개인 식별 필드(nickname·email·user_id 등)를 응답에 실을 만한 select 패턴이 없다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/kpi/weekly/__tests__/route-contract.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROUTE_PATH = 'src/app/api/admin/kpi/weekly/route.ts'
const raw = readFileSync(join(process.cwd(), ROUTE_PATH), 'utf8')
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n')

describe('주간 집계 라우트 — GET 전용', () => {
  it('GET을 export한다', () => {
    expect(code).toMatch(/export\s+async\s+function\s+GET\s*\(/)
  })

  it('쓰기 메서드(POST/PUT/PATCH/DELETE)를 export하지 않는다', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(code).not.toMatch(new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`))
    }
  })

  it('requireAdminRead(req)로 인증한다', () => {
    expect(code).toMatch(/import\s*\{[^}]*\brequireAdminRead\b[^}]*\}\s*from\s*'@\/lib\/admin\/auth'/)
    expect(code).toMatch(/await\s+requireAdminRead\s*\(\s*req\s*\)/)
  })

  it("requireAdmin()(세션 전용)을 별도로 섞어 쓰지 않는다", () => {
    expect(code).not.toMatch(/\brequireAdmin\s*\(\s*\)/)
  })
})

describe('주간 집계 라우트 — 개인 식별 정보 미노출', () => {
  it('nickname·email 같은 식별 필드를 select하지 않는다', () => {
    for (const forbidden of ['nickname', 'email', "'name'", '"name"']) {
      expect(code).not.toContain(forbidden)
    }
  })
})
