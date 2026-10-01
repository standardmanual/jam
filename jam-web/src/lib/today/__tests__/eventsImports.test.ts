/**
 * 계측 모듈의 화면 모듈 의존 (티켓 20261001_2244, 상위 20260930_1453 조각 b7)
 *
 * `events.ts`(이벤트 API가 쓴다)가 화면 모듈 `cardView.ts`를 값으로 가져오면 `@/lib/i18n`의 한국어 사전이 이벤트 API 번들에 함께 실린다.
 * 번들러를 돌리지 않고 소스의 import 그래프(타입만 가져오는 줄은 컴파일 때 사라지므로 뺀다)로 고정한다:
 * ① `events.ts`가 `cardView.ts`를 값으로 가져오지 않는다 ② `events.ts`가 값으로 닿는 파일 어디에도 `cardView.ts`·사전(`lib/i18n`)이 없다
 * ③ 두 쪽이 함께 쓰는 순수 판정 파일 `shape.ts`는 값으로 아무것도 가져오지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/eventsImports.test.ts
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '../../..')

/** 모듈 지정자를 `src` 아래 실제 파일로 푼다. 패키지(`react` 등)와 풀 수 없는 경로는 null이다. */
function resolveModule(spec: string, from: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
  else return null
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx'), base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/** 파일이 값으로 가져오는(또는 다시 내보내는) 모듈 지정자. `import type`과 전부 `type`인 `{ type A, type B }`는 뺀다. */
function valueImportSpecs(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specs: string[] = []
  const pattern = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) {
    const [, , typeOnly, clause, spec] = match
    if (typeOnly) continue
    const named = clause.match(/^\{([\s\S]*)\}$/)
    if (named) {
      const items = named[1].split(',').map((s) => s.trim()).filter(Boolean)
      if (items.length > 0 && items.every((item) => item.startsWith('type '))) continue
    }
    specs.push(spec)
  }
  // 부수 효과 import(`import 'x'`)
  for (const match of source.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) specs.push(match[1])
  return specs
}

/** 시작 파일에서 값 import로 닿는 모든 `src` 파일. */
function valueClosure(start: string): Set<string> {
  const seen = new Set<string>()
  const queue = [start]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const spec of valueImportSpecs(file)) {
      const resolved = resolveModule(spec, file)
      if (resolved) queue.push(resolved)
    }
  }
  return seen
}

const rel = (file: string) => path.relative(SRC, file)
const EVENTS = path.join(SRC, 'lib/today/events.ts')
const SHAPE = path.join(SRC, 'lib/today/shape.ts')
const CARD_VIEW = path.join(SRC, 'lib/today/cardView.ts')

describe('이벤트 API 번들에 화면 모듈·한국어 사전이 실리지 않는다', () => {
  it('import 그래프 읽기 자체가 동작한다(events.ts는 shape.ts를 값으로 가져온다)', () => {
    expect(valueImportSpecs(EVENTS)).toContain('./shape')
    expect([...valueClosure(EVENTS)].map(rel)).toContain('lib/today/shape.ts')
  })

  it('거울 시험: cardView.ts는 사전(lib/i18n)에 값으로 닿는다 — 아래 단언이 의미가 있다', () => {
    expect([...valueClosure(CARD_VIEW)].map(rel).some((f) => f.startsWith('lib/i18n'))).toBe(true)
  })

  it('events.ts가 cardView.ts를 값으로 가져오지 않는다', () => {
    expect(valueImportSpecs(EVENTS)).not.toContain('./cardView')
    expect(valueImportSpecs(EVENTS).filter((spec) => spec.endsWith('/cardView'))).toEqual([])
  })

  it('events.ts가 값으로 닿는 파일에 cardView.ts·한국어 사전(lib/i18n)이 없다', () => {
    const reached = [...valueClosure(EVENTS)].map(rel)
    expect(reached).not.toContain('lib/today/cardView.ts')
    expect(reached.filter((f) => f.startsWith('lib/i18n'))).toEqual([])
  })

  it('shape.ts는 값으로 아무것도 가져오지 않는 순수 파일이다(타입만 가져온다)', () => {
    expect(valueImportSpecs(SHAPE)).toEqual([])
  })
})
