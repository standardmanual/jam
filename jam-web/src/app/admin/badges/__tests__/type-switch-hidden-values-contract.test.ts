/**
 * 어드민 배지 폼 — 타입 전환 시 숨겨진 값 정리 계약 (티켓 20260911_0901 D)
 *
 * 리뉴얼 폼은 타입마다 입력을 숨기지만, 저장은 폼 상태를 그대로 보낸다. 그래서 타입을 바꾸는
 * 순간 숨겨진 값이 딸려 가는 경로가 생긴다. 셋 다 «없어도 조용히 통과»하는 종류라 소스를
 * 스캔해 고정한다(`api/admin/badges/__tests__/route-contract.test.ts`와 같은 방식).
 *
 * 1. 아이템으로 바꾸면 `missionReward`를 비운다 — 아이템의 `{mission_reward: true}`는 드랍
 *    엔진에서 영구히 드랍되지 않는데, 서버 검증도 막지 않는다.
 * 2. 아이템에서 막는 누적 조건 목록은 드랍 엔진·서버 검증과 같은 배열이다 — 예전에는 폼만
 *    5개를 복제해 두어 엔진의 11개와 어긋났다.
 * 3. JAM!을 켜면 트라이브·컬렉션을 비운다 — JAM!에서는 연결 정보 섹션이 숨겨진다.
 *
 * 실행: `npx vitest run src/app/admin/badges/__tests__/type-switch-hidden-values-contract.test.ts`
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CUMULATIVE_CONDITION_FIELDS as FROM_MODULE } from '@/lib/drop-engine/cumulativeConditionFields'
import { CUMULATIVE_CONDITION_FIELDS as FROM_ENGINE } from '@/lib/drop-engine/index'

const FORM = readFileSync(join(__dirname, '..', 'BadgeForm.tsx'), 'utf-8')
const VALIDATION = readFileSync(join(__dirname, '../../../../lib/admin/badge-validation.ts'), 'utf-8')

/** 함수 본문만 떼어낸다 — 다른 함수의 같은 줄로 통과하지 않게 한다 */
function bodyOf(source: string, header: string): string {
  const start = source.indexOf(header)
  expect(start, `${header}를 찾지 못했다`).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('\n  }\n', start)
  return source.slice(start, end)
}

describe('타입 전환 시 숨겨진 값 정리', () => {
  it('아이템으로 바꾸면 missionReward를 비운다', () => {
    const body = bodyOf(FORM, 'const changeType = (next: BadgeType) => {')
    expect(body).toMatch(/if \(next === 'item'\) setCondField\('missionReward', false\)/)
  })

  it('activity 밖으로 바꾸면 JAM!(admin_category)을 비운다', () => {
    const body = bodyOf(FORM, 'const changeType = (next: BadgeType) => {')
    expect(body).toMatch(/if \(next !== 'activity'\) setAdminCategory\(''\)/)
  })

  it('JAM!을 켤 때 트라이브·컬렉션을 비운다', () => {
    const body = bodyOf(FORM, 'const toggleAdminCategoryJam = () => {')
    expect(body).toMatch(/if \(turningOn\) \{\s*setTribeId\(''\)\s*setItemBookId\(''\)/)
  })
})

describe('아이템에서 막는 누적 조건 목록은 한 곳에서 온다', () => {
  it('드랍 엔진은 새 모듈의 배열을 그대로 재수출한다', () => {
    expect(FROM_ENGINE).toBe(FROM_MODULE)
    expect(FROM_MODULE).toHaveLength(11)
  })

  it('폼은 목록을 복제하지 않고 새 모듈에서 가져온다', () => {
    expect(FORM).toMatch(/import \{ CUMULATIVE_CONDITION_FIELDS \} from '@\/lib\/drop-engine\/cumulativeConditionFields'/)
    expect(FORM).not.toMatch(/'monthly_km',\s*'season_count'/)
  })

  it('서버 저장 검증도 같은 배열을 쓴다', () => {
    expect(VALIDATION).toMatch(/import \{ CUMULATIVE_CONDITION_FIELDS \} from '@\/lib\/drop-engine\/index'/)
  })
})
