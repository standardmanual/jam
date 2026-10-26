/**
 * 읽기 토큰의 쓰기 권한은 제출 라우트와 루틴 시작 기록 라우트 둘에만 — 계약 회귀 (티켓 20260930_1816, 20261026_2032)
 *
 * 읽기 토큰(`x-admin-read-token`)은 원래 GET 전용이다. 운영 묶음 제출(`POST /api/admin/ops-inbox`)에만 쓰기
 * 예외를 열었고, 이 테스트가 그 예외가 다른 곳으로 번지지 않는지 소스를 훑어 확인한다(기존
 * `route-contract.test.ts`들이 라우트 하나의 인증 계약을 고정하던 방식을 어드민 전체로 넓힌 것이다).
 *
 * 지키는 것:
 * 1. 토큰 쓰기 검사(`requireOpsInboxSubmit`·`isOpsInboxTokenRequest`)를 부르는 `route.ts`는 제출 라우트와 루틴 시작 기록 라우트(티켓 20261026_2032) 둘뿐이다
 * 2. 그 두 라우트는 POST만 export하고, 래퍼 `requireOpsInboxSubmit`으로 인증한다
 * 3. 다른 `route.ts`는 읽기 토큰 헤더나 `isValidAdminReadToken`을 직접 다루지 않는다(`requireAdminRead`만 쓴다)
 * 4. 토큰 쓰기 판정 함수는 auth.ts·래퍼·proxy.ts 밖의 서비스 코드에서 쓰이지 않는다
 * 5. 제출 경로 상수와 라우트 파일 위치가 같다
 * 6. 규칙 읽기·바꾸기(`ops-rules`, 티켓 20260930_1459 조각 B·C): 읽기(`GET`)는 `requireAdminRead`로 토큰이 되고, 바꾸기(`PATCH`)·신호 기준값 저장(`PATCH`)·
 *    기본값으로 되돌리기(`DELETE`)는 `getAdminUser()`로 관리자 세션만 통과한다 — 토큰 쓰기 예외가 늘지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/__tests__/token-write-contract.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { OPS_INBOX_PATH, OPS_INBOX_TOKEN_WRITE_PATHS, OPS_ROUTINE_START_PATH } from '@/lib/admin/opsInbox/constants'

const SRC = join(process.cwd(), 'src')
const API_ROOT = join(SRC, 'app/api')

function walk(dir: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

function rel(file: string): string {
  return relative(SRC, file).split(sep).join('/')
}

function readRaw(file: string): string {
  return readFileSync(file, 'utf8')
}

function readCode(file: string): string {
  return stripComments(readRaw(file))
}

const routeFiles = walk(API_ROOT).filter((f) => f.endsWith(`${sep}route.ts`))
const adminRouteFiles = routeFiles.filter((f) => rel(f).startsWith('app/api/admin/'))
// 제출 경로 상수(`/api/admin/ops-inbox`)가 가리키는 라우트 파일.
const SUBMIT_ROUTE = `app${OPS_INBOX_PATH}/route.ts`
// 루틴 시작 기록 경로 상수(`/api/admin/ops-inbox/routine-start`, 티켓 20261026_2032)가 가리키는 라우트 파일.
const ROUTINE_START_ROUTE = `app${OPS_ROUTINE_START_PATH}/route.ts`
// 토큰 쓰기 검사를 부르는 라우트는 이 둘뿐이다.
const TOKEN_WRITE_ROUTES = [SUBMIT_ROUTE, ROUTINE_START_ROUTE]

const TOKEN_WRITE_CHECKS = /\b(requireOpsInboxSubmit|isOpsInboxTokenRequest)\b/

describe('읽기 토큰의 쓰기 권한 — 제출 라우트와 루틴 시작 기록 라우트 둘', () => {
  it('어드민 라우트 파일을 실제로 찾았다(빈 목록으로 통과하지 않는다)', () => {
    expect(adminRouteFiles.length).toBeGreaterThan(50)
    expect(adminRouteFiles.map(rel)).toContain(SUBMIT_ROUTE)
    expect(adminRouteFiles.map(rel)).toContain(ROUTINE_START_ROUTE)
  })

  it('토큰 쓰기 검사를 부르는 route.ts는 제출 라우트와 루틴 시작 기록 라우트 둘뿐이다(app/api 전체)', () => {
    // 주석을 벗기지 않은 원문으로 본다 — 주석 제거가 코드를 삼켜 호출을 놓치지 않게, 과하게 잡는 쪽으로 판정한다.
    const callers = routeFiles.filter((f) => TOKEN_WRITE_CHECKS.test(readRaw(f))).map(rel)
    expect([...callers].sort()).toEqual([...TOKEN_WRITE_ROUTES].sort())
  })

  describe.each([
    ['제출 라우트', SUBMIT_ROUTE],
    ['루틴 시작 기록 라우트', ROUTINE_START_ROUTE],
  ])('%s', (_name, routePath) => {
    const routeFile = join(SRC, routePath)
    const code = readRaw(routeFile)

    it('POST만 export한다(GET·PUT·PATCH·DELETE·HEAD·OPTIONS 없음)', () => {
      expect(code).toMatch(/export\s+async\s+function\s+POST\s*\(/)
      for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
        expect(code).not.toMatch(new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\s*\\(`))
        expect(code).not.toMatch(new RegExp(`export\\s+(const|let|var)\\s+${method}\\b`))
        expect(code).not.toMatch(new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`))
      }
    })

    it('래퍼 requireOpsInboxSubmit(req)로 인증한다', () => {
      expect(code).toMatch(
        /import\s*\{[^}]*\brequireOpsInboxSubmit\b[^}]*\}\s*from\s*'@\/lib\/admin\/opsInbox\/auth'/
      )
      expect(code).toMatch(/await\s+requireOpsInboxSubmit\s*\(\s*req\s*\)/)
    })

    it('토큰 판정을 라우트에서 직접 다루지 않는다(래퍼 하나로만)', () => {
      const withoutComments = readCode(routeFile)
      expect(withoutComments).not.toMatch(/\bisOpsInboxTokenRequest\b/)
      expect(withoutComments).not.toMatch(/\bisValidAdminReadToken\b/)
      expect(withoutComments).not.toMatch(/x-admin-read-token/)
    })
  })

  it('다른 route.ts는 읽기 토큰 헤더나 isValidAdminReadToken을 직접 다루지 않는다', () => {
    const offenders = routeFiles
      .filter((f) => !TOKEN_WRITE_ROUTES.includes(rel(f)))
      .filter((f) => /x-admin-read-token|\bisValidAdminReadToken\b|ADMIN_API_READ_TOKEN/.test(readCode(f)))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('토큰 쓰기 판정 함수는 auth.ts·래퍼·proxy.ts 밖의 서비스 코드에서 쓰이지 않는다', () => {
    const allowed = new Set([
      'lib/admin/auth.ts',
      'lib/admin/opsInbox/auth.ts',
      'proxy.ts',
      ...TOKEN_WRITE_ROUTES, // requireOpsInboxSubmit 호출(위에서 래퍼 경유만 허용했다)
    ])
    const offenders = walk(SRC)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(`${sep}__tests__${sep}`) && !/\.test\.tsx?$/.test(f))
      .filter((f) => TOKEN_WRITE_CHECKS.test(readRaw(f)))
      .map(rel)
      .filter((f) => !allowed.has(f))
    expect(offenders).toEqual([])
  })

  it('proxy.ts는 같은 판정 함수를 쓰고 경로 문자열을 따로 적지 않는다', () => {
    const code = readRaw(join(SRC, 'proxy.ts'))
    expect(code).toMatch(/\bisOpsInboxTokenRequest\s*\(/)
    expect(code).not.toContain('/ops-inbox')
  })

  describe('규칙 읽기·바꾸기(ops-rules): 읽기는 토큰이 되고 바꾸기는 관리자 세션만 된다', () => {
    const READ_ROUTE = join(SRC, 'app/api/admin/ops-rules/route.ts')
    const WRITE_ROUTE = join(SRC, 'app/api/admin/ops-rules/[ruleKey]/route.ts')
    const SIGNAL_SAVE_ROUTE = join(SRC, 'app/api/admin/ops-rules/signals/[signalKey]/route.ts')
    const SIGNAL_REVERT_ROUTE = join(SRC, 'app/api/admin/ops-rules/signals/[signalKey]/[thresholdKey]/route.ts')
    const exportedMethods = (code: string) =>
      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].filter((method) =>
        new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\s*\\(|export\\s+(const|let|var)\\s+${method}\\b|export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`).test(code)
      )

    it('규칙 라우트 파일 네 개가 어드민 라우트 목록에 있다', () => {
      expect(adminRouteFiles.map(rel)).toContain('app/api/admin/ops-rules/route.ts')
      expect(adminRouteFiles.map(rel)).toContain('app/api/admin/ops-rules/[ruleKey]/route.ts')
      expect(adminRouteFiles.map(rel)).toContain('app/api/admin/ops-rules/signals/[signalKey]/route.ts')
      expect(adminRouteFiles.map(rel)).toContain('app/api/admin/ops-rules/signals/[signalKey]/[thresholdKey]/route.ts')
    })

    it('읽기 라우트는 GET만 export하고 requireAdminRead(req)로 인증한다', () => {
      const code = readCode(READ_ROUTE)
      expect(exportedMethods(code)).toEqual(['GET'])
      expect(code).toMatch(/await\s+requireAdminRead\s*\(\s*req\s*\)/)
    })

    it('바꾸기 라우트는 PATCH만 export하고 getAdminUser()로 관리자 세션만 통과시킨다(읽기 토큰 판정을 쓰지 않는다)', () => {
      const code = readCode(WRITE_ROUTE)
      expect(exportedMethods(code)).toEqual(['PATCH'])
      expect(code).toMatch(/await\s+getAdminUser\s*\(\s*\)/)
      expect(code).not.toMatch(/\brequireAdminRead\b/)
      expect(code).not.toMatch(TOKEN_WRITE_CHECKS)
    })

    it('신호 기준값 저장 라우트는 PATCH만, 되돌리기 라우트는 DELETE만 export하고 둘 다 getAdminUser()로 관리자 세션만 통과시킨다', () => {
      for (const [file, method] of [
        [SIGNAL_SAVE_ROUTE, 'PATCH'],
        [SIGNAL_REVERT_ROUTE, 'DELETE'],
      ] as const) {
        const code = readCode(file)
        expect(exportedMethods(code), file).toEqual([method])
        expect(code, file).toMatch(/await\s+getAdminUser\s*\(\s*\)/)
        expect(code, file).not.toMatch(/\brequireAdminRead\b/)
        expect(code, file).not.toMatch(TOKEN_WRITE_CHECKS)
      }
    })
  })

  it('제출 경로 상수가 /api/admin/ops-inbox이고 라우트 파일이 그 위치에 있다', () => {
    expect(OPS_INBOX_PATH).toBe('/api/admin/ops-inbox')
    expect(SUBMIT_ROUTE).toBe('app/api/admin/ops-inbox/route.ts')
  })

  it('루틴 시작 기록 경로 상수가 /api/admin/ops-inbox/routine-start이고 라우트 파일이 그 위치에 있다', () => {
    expect(OPS_ROUTINE_START_PATH).toBe('/api/admin/ops-inbox/routine-start')
    expect(ROUTINE_START_ROUTE).toBe('app/api/admin/ops-inbox/routine-start/route.ts')
  })

  it('토큰 쓰기가 열린 경로 목록은 이 두 상수뿐이다', () => {
    expect([...OPS_INBOX_TOKEN_WRITE_PATHS]).toEqual([OPS_INBOX_PATH, OPS_ROUTINE_START_PATH])
  })
})
