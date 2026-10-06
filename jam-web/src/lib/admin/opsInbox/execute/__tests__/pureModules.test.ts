/**
 * 순수 모듈 경계 — 값 import를 끝까지 따라가도 서버 전용 모듈에 닿지 않는다 (티켓 20261004_1756 ⑨-a 가정 4).
 *
 * `precheck.test.ts`의 「모듈 계약」은 핸들러 파일 자신의 값 import만 본다. JAM! 배지 핸들러는 어드민 배지 검증·참조 확인·등록 전 검사를
 * 가져오는데, 이 가운데 한 파일이 서버 모듈(`@/lib/supabase/server`)을 거쳐 끌어오면 요약창이 사전 점검으로 그 파일을 끌어올 때 클라이언트 번들이 깨진다.
 * 그래서 가져오는 파일의 가져오는 파일까지 따라가 본다. 타입만 가져오는 import(`import type`)는 번들에 들어가지 않으므로 따라가지 않는다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const SRC = path.resolve(__dirname, '../../../../..')

/** 값으로 가져오면 서버에서만 돌 수 있는 모듈. */
const SERVER_ONLY = [/^@\/lib\/supabase\//, /^next\/headers$/, /^server-only$/, /^node:/, /^@supabase\//]

function resolveSpecifier(specifier: string, from: string): string | null {
  const base = specifier.startsWith('@/') ? path.join(SRC, specifier.slice(2)) : specifier.startsWith('.') ? path.resolve(path.dirname(from), specifier) : null
  if (base === null) return null
  return [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((candidate) => fs.existsSync(candidate)) ?? null
}

/** 파일이 값으로 가져오거나 다시 내보내는 모듈 이름들. `import type`·`export type`과 이름이 전부 `type`인 가져오기는 뺀다. */
function valueSpecifiers(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8')
  const found: string[] = []
  for (const match of source.matchAll(/^(?:import|export)\s+(?!type\b)([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
    const clause = match[1].trim()
    const onlyTypes = /^\{[^}]*\}$/.test(clause) && clause.replace(/[{}]/g, '').split(',').every((name) => name.trim() === '' || name.trim().startsWith('type '))
    if (!onlyTypes) found.push(match[2])
  }
  for (const match of source.matchAll(/^import\s+['"]([^'"]+)['"]/gm)) found.push(match[1])
  return found
}

/** `entry`에서 값 import를 끝까지 따라가 닿은 서버 전용 모듈과 그 길을 돌려준다. */
function serverReaches(entry: string): string[] {
  const parents = new Map<string, string | null>([[entry, null]])
  const queue = [entry]
  const hits: string[] = []
  while (queue.length > 0) {
    const file = queue.shift() as string
    for (const specifier of valueSpecifiers(file)) {
      if (SERVER_ONLY.some((pattern) => pattern.test(specifier))) {
        const chain: string[] = []
        for (let cur: string | null = file; cur; cur = parents.get(cur) ?? null) chain.unshift(path.relative(SRC, cur))
        hits.push(`${specifier} ← ${chain.join(' → ')}`)
        continue
      }
      const resolved = resolveSpecifier(specifier, file)
      if (resolved && !parents.has(resolved)) {
        parents.set(resolved, file)
        queue.push(resolved)
      }
    }
  }
  return hits
}

/**
 * 순수 파일로 옮긴 것들과, 그것을 가져오는 JAM! 배지 핸들러·컬렉션 핸들러(티켓 20261004_2039, ⑩-a)·변환·레지스트리·사전 점검(티켓 20261004_1756).
 * `endColumn.ts`(티켓 20261006_0950, ⑪-a)는 다섯 핸들러가 가져오는 「지금 종료」 쓰기라 같은 계약이다(서비스 클라이언트는 인자로 받는다).
 * 서버에서만 부르는 `end.ts`·`endImpact.ts`는 핸들러가 가져오지 않아 이 목록에 없다.
 */
const PURE_ENTRIES = [
  'lib/badge-engine/jamActionKeys.ts',
  'lib/admin/familyKey.ts',
  'lib/admin/badge-validation.ts',
  'lib/admin/badge-insert-payload.ts',
  'lib/admin/badge-condition-guards.ts',
  'lib/admin/registerChecks/badge.ts',
  'lib/admin/registerChecks/collection.ts',
  'lib/admin/registerChecks/references.ts',
  'lib/admin/opsInbox/registerInput.ts',
  'lib/admin/opsInbox/execute/endColumn.ts',
  'lib/admin/opsInbox/execute/jamBadge.ts',
  'lib/admin/opsInbox/execute/collectionLaunch.ts',
  'lib/admin/opsInbox/execute/registry.ts',
  'lib/admin/opsInbox/execute/precheck.ts',
]

describe('순수 모듈 경계 — 값 import를 끝까지 따라가도 서버 전용 모듈에 닿지 않는다', () => {
  it.each(PURE_ENTRIES)('%s', (entry) => {
    expect(fs.existsSync(path.join(SRC, entry)), `${entry} 파일이 있어야 해요`).toBe(true)
    expect(serverReaches(path.join(SRC, entry))).toEqual([])
  })

  it('검사 도구가 서버 전용 모듈을 실제로 찾는다(서버 클라이언트를 값으로 가져오는 파일)', () => {
    // 이 파일들은 `@/lib/supabase/server`를 값으로 가져오고 순수화하지 않았다. 도구가 못 찾으면 위 통과가 아무것도 말하지 못한다.
    expect(serverReaches(path.join(SRC, 'lib/badge-engine/jamActionBadges.ts')).length).toBeGreaterThan(0)
    expect(serverReaches(path.join(SRC, 'lib/drop-engine/index.ts')).length).toBeGreaterThan(0)
  })
})
