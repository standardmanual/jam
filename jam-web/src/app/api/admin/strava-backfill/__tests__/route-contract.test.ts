/**
 * 어드민 백필 라우트 — 계약 회귀 테스트 (티켓 20260905_1242)
 *
 * 이 라우트의 유일한 존재 이유는 **이미 검증된 `backfillExtendedFields`를 서버에서 호출하는
 * 것**이다. 로직이 라우트 안으로 복사되는 순간
 * `src/lib/strava/__tests__/backfill-extended-fields.test.ts`가 걸어 둔 방어
 * (배지 엔진 미import · `last_synced_at` 미변경 · 쓰기 컬럼 `normalized` 단일)가
 * 전부 무력해진다. 소스를 스캔해 그 복사를 막는다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/strava-backfill/__tests__/route-contract.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROUTE_PATH = 'src/app/api/admin/strava-backfill/route.ts'
const raw = readFileSync(join(process.cwd(), ROUTE_PATH), 'utf8')

/** 주석에 적힌 단어가 검사를 통과시키지 않도록 코드만 남긴다 */
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n')

describe('백필 라우트 — 로직을 복사하지 않고 재사용한다', () => {
  it('backfillExtendedFields를 @/lib/strava/backfill에서 import한다', () => {
    expect(code).toMatch(/import\s*\{[^}]*\bbackfillExtendedFields\b[^}]*\}\s*from\s*'@\/lib\/strava\/backfill'/)
  })

  it('실제로 그 함수를 호출한다', () => {
    expect(code).toMatch(/await\s+backfillExtendedFields\s*\(/)
  })

  it('백필 내부 구현을 라우트에서 다시 쓰지 않는다 (복사 금지)', () => {
    // 이 심볼들이 라우트에 등장하면 백필 로직이 여기로 복사됐다는 뜻이다
    for (const forbidden of [
      'mergeExtendedFields',
      'extractExtendedActivityFields',
      'refreshStravaToken',
      'getActivities',
      'decrypt',
      'encrypt',
    ]) {
      expect(code).not.toContain(forbidden)
    }
  })

  it('배지·드랍·미션·소식·피드 엔진을 import하지 않는다 — 배지 홍수 경로가 없어야 한다', () => {
    for (const forbidden of [
      'badge-engine',
      'drop-engine',
      'ambient-drop',
      '@/lib/missions',
      '@/lib/notifications',
      'evaluateBadges',
      'recordActivityEvent',
    ]) {
      expect(code).not.toContain(forbidden)
    }
  })

  it('last_synced_at·processed_via를 건드리지 않는다', () => {
    expect(code).not.toContain('last_synced_at')
    expect(code).not.toContain('processed_via')
  })

  it('strava_activities에 직접 쓰지 않는다 — 쓰기는 백필 모듈만 한다', () => {
    expect(code).not.toMatch(/from\('strava_activities'\)/)
  })
})

describe('백필 라우트 — 서버리스 60초 제약에 맞춰져 있다', () => {
  it('maxDuration이 60이다 (저장소의 무거운 라우트 관례)', () => {
    expect(code).toMatch(/export\s+const\s+maxDuration\s*=\s*60/)
  })

  it('요청 예산이 CLI 기본값(90)보다 훨씬 작다 — 유저 1명 기준이다', () => {
    const match = code.match(/REQUEST_BUDGET_PER_CALL\s*=\s*([\d_]+)/)
    expect(match).not.toBeNull()
    const budget = Number(match![1].replace(/_/g, ''))
    expect(budget).toBeGreaterThan(0)
    expect(budget).toBeLessThanOrEqual(10)
  })

  it('요청 간격 × 예산이 60초 안에 든다', () => {
    const budget = Number(code.match(/REQUEST_BUDGET_PER_CALL\s*=\s*([\d_]+)/)![1].replace(/_/g, ''))
    const delay = Number(code.match(/REQUEST_DELAY_MS\s*=\s*([\d_]+)/)![1].replace(/_/g, ''))
    expect((budget * delay) / 1000).toBeLessThan(30)
  })
})

describe('백필 라우트 — 어드민만 실행할 수 있다', () => {
  it('getAdminUser()로 인증하고 없으면 403을 준다', () => {
    expect(code).toMatch(/import\s*\{[^}]*\bgetAdminUser\b[^}]*\}\s*from\s*'@\/lib\/admin\/auth'/)
    expect(code).toMatch(/await\s+getAdminUser\s*\(\)/)
    expect(code).toMatch(/status:\s*403/)
  })

  it('apply는 명시적으로 true일 때만 켜진다 — 기본값은 미리보기다', () => {
    expect(code).toMatch(/apply\s*=\s*body\?\.apply\s*===\s*true/)
  })
})
