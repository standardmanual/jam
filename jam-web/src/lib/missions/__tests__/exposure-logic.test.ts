/**
 * visibility.ts isMissionExposed — 관리자 수동 노출 제어 유닛 테스트 (티켓 20260912_0139)
 *
 * 검증 범위:
 *   - hidden은 항상 노출되지 않는다
 *   - start_date는 starts_at 도달 전/후로 노출이 갈린다
 *   - scheduled는 exposure_at 도달 전/후로 노출이 갈리고, exposure_at이 비면 fail-closed
 *   - exposure_mode가 undefined(마이그레이션 미반영)면 start_date로 취급한다
 *
 * 실행: `npx tsx src/lib/missions/__tests__/exposure-logic.test.ts`
 */
import assert from 'node:assert'
import { isMissionExposed } from '../visibility'

const NOW = new Date('2026-09-12T00:00:00Z')

// ── hidden ───────────────────────────────────────────────────────────────
assert.strictEqual(
  isMissionExposed({ exposure_mode: 'hidden', exposure_at: null, starts_at: '2020-01-01T00:00:00Z' }, NOW),
  false,
  'hidden은 starts_at이 과거여도 노출되지 않는다'
)
assert.strictEqual(
  isMissionExposed({ exposure_mode: 'hidden', exposure_at: '2020-01-01T00:00:00Z', starts_at: '2020-01-01T00:00:00Z' }, NOW),
  false,
  'hidden은 exposure_at이 과거여도 노출되지 않는다'
)

// ── start_date ───────────────────────────────────────────────────────────
assert.strictEqual(
  isMissionExposed({ exposure_mode: 'start_date', exposure_at: null, starts_at: '2020-01-01T00:00:00Z' }, NOW),
  true,
  'start_date는 starts_at을 지났으면 노출된다'
)
assert.strictEqual(
  isMissionExposed({ exposure_mode: 'start_date', exposure_at: null, starts_at: '2099-01-01T00:00:00Z' }, NOW),
  false,
  'start_date는 starts_at 전이면 노출되지 않는다'
)

// ── scheduled ────────────────────────────────────────────────────────────
assert.strictEqual(
  isMissionExposed({ exposure_mode: 'scheduled', exposure_at: '2020-01-01T00:00:00Z', starts_at: '2099-01-01T00:00:00Z' }, NOW),
  true,
  'scheduled는 exposure_at을 지났으면 starts_at과 무관하게 노출된다'
)
assert.strictEqual(
  isMissionExposed({ exposure_mode: 'scheduled', exposure_at: '2099-01-01T00:00:00Z', starts_at: '2020-01-01T00:00:00Z' }, NOW),
  false,
  'scheduled는 exposure_at 전이면 starts_at과 무관하게 노출되지 않는다'
)
assert.strictEqual(
  isMissionExposed({ exposure_mode: 'scheduled', exposure_at: null, starts_at: '2020-01-01T00:00:00Z' }, NOW),
  false,
  'scheduled인데 exposure_at이 비어 있으면 fail-closed로 숨긴다'
)

// ── 마이그레이션 미반영 환경(undefined) ──────────────────────────────────
assert.strictEqual(
  isMissionExposed({ exposure_mode: undefined, exposure_at: undefined, starts_at: '2020-01-01T00:00:00Z' }, NOW),
  true,
  'exposure_mode가 undefined면 start_date로 취급한다'
)

console.log('✅ exposure-logic.test.ts 통과')
