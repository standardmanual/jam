/**
 * 클라이언트·서버 경계 — 잠김 순수 모듈의 import 사슬 (티켓 20261018_0051)
 *
 * `lockAssignment.ts`(잠김 배정)와 `lockedItem.ts`(거부 코드·판정)는 클라이언트 번들에서도 안전한 순수 파일이어야 한다.
 * 서버 전용 모듈(`@/lib/supabase/server`·`next/headers`·`server-only`·동기화 발급·후속 처리)을 정적으로도 동적으로도 끌어오면
 * 타입 검사·CI가 통과해도 빌드가 깨진다. 진입점에서 출발해 값 가져오기를 끝까지 따라가며 금지 모듈이 없는지 확인한다.
 * `import type` / `export type`은 컴파일 때 지워져 번들에 들어가지 않으므로 따라가지 않는다(정책 타입만 가져오는 경우).
 *
 * 실행: cd jam-web && npx vitest run src/lib/drop-engine/__tests__/lockAssignment-boundary.test.ts
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const srcRoot = fileURLToPath(new URL('../../../', import.meta.url))

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']

function resolveLocal(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(srcRoot, spec.slice(2))
  else if (spec.startsWith('.')) base = join(dirname(from), spec)
  else return null
  for (const ext of EXTENSIONS) {
    const candidate = base + ext
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/** 값 가져오기 지정자 — 정적 import·export from·동적 import()·require(). `import type`·`export type ... from`은 뺀다 */
function valueSpecifiersOf(source: string): string[] {
  const withoutTypeOnly = source
    .replace(/^\s*import\s+type\s[^;]*?from\s*['"][^'"]+['"]/gm, '')
    .replace(/^\s*export\s+type\s[^;]*?from\s*['"][^'"]+['"]/gm, '')
  const out: string[] = []
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g
  for (const match of withoutTypeOnly.matchAll(pattern)) out.push(match[1])
  return out
}

function crawl(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>()
  const packages = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (files.has(file)) continue
    files.add(file)
    for (const spec of valueSpecifiersOf(readFileSync(file, 'utf8'))) {
      const resolved = resolveLocal(file, spec)
      if (resolved) queue.push(resolved)
      else if (!spec.startsWith('.') && !spec.startsWith('@/')) packages.add(spec)
    }
  }
  return { files, packages }
}

const rel = (file: string) => file.replace(srcRoot, 'src/')

const FORBIDDEN_FILES = [
  'lib/supabase/server.ts',
  'lib/drop-engine/syncIssueRun.ts',
  'lib/drop-engine/issueFollowUp.ts',
  'lib/strava/pending-items.ts',
  'lib/strava/pending-followups.ts',
]
const FORBIDDEN_PACKAGES = ['next/headers', 'server-only']

const ENTRIES = ['lib/drop-engine/lockAssignment.ts', 'lib/inventory/lockedItem.ts']

describe('잠김 순수 모듈의 import 사슬에 서버 전용 모듈이 없다', () => {
  it.each(ENTRIES)('%s', (entry) => {
    const { files, packages } = crawl(join(srcRoot, entry))
    const reached = [...files].map(rel)

    for (const forbidden of FORBIDDEN_FILES) {
      expect(reached.filter((f) => f.endsWith(forbidden)), `${entry}가 ${forbidden}을 끌어온다`).toEqual([])
    }
    for (const forbidden of FORBIDDEN_PACKAGES) {
      expect([...packages].filter((p) => p === forbidden), `${entry}가 ${forbidden}을 끌어온다`).toEqual([])
    }
  })

  it('크롤러가 실제로 가져오기를 따라간다 (값 가져오기를 단 가짜 사슬로 확인)', () => {
    const fake = valueSpecifiersOf(
      [
        "import type { A } from '@/lib/jam/policy'",
        "import { b } from './b'",
        "export { c } from '../c'",
        "const m = await import('@/lib/supabase/server')",
      ].join('\n')
    )
    expect(fake).toEqual(['./b', '../c', '@/lib/supabase/server'])
  })

  it('보류 고르기 계약 파일(클라이언트가 가져오는 모듈)은 아무것도 가져오지 않는다', () => {
    const source = readFileSync(join(srcRoot, 'lib/strava/pending-items-contract.ts'), 'utf8')
    expect(valueSpecifiersOf(source)).toEqual([])
    expect(source).not.toMatch(/^\s*import\s/m)
  })
})
