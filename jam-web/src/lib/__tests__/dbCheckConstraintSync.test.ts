import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'

/**
 * TS 상수 ↔ SQL CHECK 제약 대조 (티켓 20261001_1417)
 *
 * 상수에 값을 더하고 CHECK를 안 고치면 저장이 조용히 실패한다 — 믹스 실패 이력의
 * `recipe_not_found`가 그랬다(티켓 20261001_0636). 두 쪽을 파일 텍스트로 읽어 어긋나면 깨뜨린다.
 * 최신 CHECK는 «그 제약을 ADD하는 마이그레이션 중 번호가 가장 큰 것»을 자동으로 찾는다
 * (condition-registry.test.ts의 방식과 같다) — 제약을 다시 쓰는 마이그레이션을 추가해도 경로를 올릴 필요가 없다.
 */

const root = process.cwd()
const migrationsDir = join(root, 'supabase/migrations')

/** SQL 주석(-- ...)을 걷어낸다. 되돌림 SQL이 주석으로 같은 문장을 품고 있어 먼저 걷지 않으면 옛 값을 읽는다 */
function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

/** `ADD CONSTRAINT <name> CHECK (<column> IN (...))`의 허용 값을, 가장 마지막에 다시 쓴 마이그레이션에서 읽는다 */
function latestCheckValues(constraint: string): { file: string; values: string[] } {
  const candidates = readdirSync(migrationsDir)
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .map((name) => ({ name, sql: stripSqlComments(readFileSync(join(migrationsDir, name), 'utf-8')) }))
    .filter(({ sql }) => sql.includes(`ADD CONSTRAINT ${constraint}`))
    .sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10))
  const latest = candidates.at(-1)
  if (!latest) throw new Error(`CHECK 제약(${constraint})을 만드는 마이그레이션을 찾지 못했다`)
  const from = latest.sql.indexOf(`ADD CONSTRAINT ${constraint}`)
  const match = /IN\s*\(([^)]*)\)/.exec(latest.sql.slice(from))
  if (!match) throw new Error(`${latest.name}: ${constraint}의 IN (...) 목록을 읽지 못했다`)
  return { file: latest.name, values: quoted(match[1]) }
}

/** 작은따옴표 리터럴만 뽑는다 */
function quoted(text: string): string[] {
  return [...text.matchAll(/'([^']*)'/g)].map((m) => m[1])
}

const sorted = (values: string[]) => [...values].sort()

describe('TS 상수 ↔ SQL CHECK 동기화', () => {
  it('프리셋 화면 비율: VALID_STAGE_RATIOS ↔ asset_presets_stage_ratio_check (마이그레이션 205)', () => {
    const route = readFileSync(join(root, 'src/app/api/admin/asset-generator/presets/route.ts'), 'utf-8')
    const match = /VALID_STAGE_RATIOS\s*:\s*StageRatio\[\]\s*=\s*\[([^\]]*)\]/.exec(route)
    expect(match, 'route.ts에서 VALID_STAGE_RATIOS를 찾지 못했다').not.toBeNull()
    const tsValues = quoted(match![1])
    const { file, values } = latestCheckValues('asset_presets_stage_ratio_check')
    expect(sorted(tsValues), `최신 CHECK: ${file}`).toEqual(sorted(values))
  })

  it('믹스 실패 사유: CombineFailReason ↔ user_combine_fail_logs_reason_check (마이그레이션 200)', () => {
    // 재료를 소각하기 전에 거절하는 사유는 실패 기록을 남기지 않으므로 CHECK에 없는 게 맞다.
    // 새 사유를 더할 때는 «기록을 남기는가»를 정해, 남기면 CHECK를 고치고 안 남기면 여기에 올린다.
    const NOT_LOGGED = ['locked_item_not_allowed', 'pending_results_exist']

    const types = readFileSync(join(root, 'src/types/database.ts'), 'utf-8')
    const start = types.indexOf('export type CombineFailReason =')
    expect(start, 'database.ts에서 CombineFailReason을 찾지 못했다').toBeGreaterThan(-1)
    // 타입 정의는 다음 빈 줄에서 끝난다. 줄 사이 /** ... */ 설명은 걷어낸다.
    const block = types.slice(start).split(/\n\s*\n/)[0].replace(/\/\*[\s\S]*?\*\//g, '')
    const tsValues = quoted(block)
    expect(tsValues.length).toBeGreaterThan(0)

    const { file, values } = latestCheckValues('user_combine_fail_logs_reason_check')
    const logged = tsValues.filter((reason) => !NOT_LOGGED.includes(reason))
    expect(sorted(logged), `최신 CHECK: ${file}`).toEqual(sorted(values))
    // 기록 제외 목록이 낡아 타입에 없는 값을 가리키면 대조가 헐거워진다
    for (const reason of NOT_LOGGED) expect(tsValues).toContain(reason)
  })
})
