/**
 * 클라이언트·서버 경계 — 캡슐 모듈의 import 사슬 (티켓 20261018_0052 1회)
 *
 * `capsule-contract.ts`는 클라이언트(캡슐 화면 3-4)도 가져올 수 있어야 하므로 아무것도 가져오지 않는다. 서버 전용 코드는 `capsule.ts`·`policy.ts`에 있다.
 * 클라이언트 컴포넌트가 서버 모듈을 정적으로도 동적으로도 끌어오면 타입 검사·CI가 통과해도 빌드가 깨진다(티켓 2-2에서 실제로 겪음).
 * 그래서 (1) 계약 파일에 import가 하나도 없고, (2) 계약 파일에서 출발한 사슬에 서버 전용 모듈이 없고, (3) `'use client'` 파일이 서버 모듈을
 * 가져오지 않는지 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/capsule-boundary.test.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const srcRoot = fileURLToPath(new URL('../../../', import.meta.url))
const dsRoot = join(srcRoot, '../design-system')

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']

function resolveLocal(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(srcRoot, spec.slice(2))
  else if (spec.startsWith('@ds/')) base = join(dsRoot, spec.slice(4))
  else if (spec.startsWith('.')) base = join(dirname(from), spec)
  else return null
  for (const ext of EXTENSIONS) {
    const candidate = base + ext
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/** 정적 import·export from·동적 import()·require() 지정자 */
function specifiersOf(source: string): string[] {
  const out: string[] = []
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) out.push(match[1])
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
    for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
      const resolved = resolveLocal(file, spec)
      if (resolved) queue.push(resolved)
      else if (!spec.startsWith('.') && !spec.startsWith('@/') && !spec.startsWith('@ds/')) packages.add(spec)
    }
  }
  return { files, packages }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

const rel = (file: string) => file.replace(srcRoot, 'src/').replace(dsRoot, 'design-system')

const CONTRACT = join(srcRoot, 'lib/capsule/capsule-contract.ts')
const FORBIDDEN_FILES = ['lib/supabase/server.ts', 'lib/capsule/capsule.ts', 'lib/capsule/policy.ts', 'lib/suspension/suspension.ts']
const FORBIDDEN_PACKAGES = ['next/headers', 'server-only', '@supabase/supabase-js']

describe('capsule-contract.ts는 클라이언트가 가져와도 안전하다', () => {
  it('아무것도 가져오지 않는다(import·export from·동적 import·require가 없다)', () => {
    expect(specifiersOf(readFileSync(CONTRACT, 'utf8'))).toEqual([])
  })

  it('계약 파일에서 출발한 사슬에 서버 전용 모듈이 없다', () => {
    const { files, packages } = crawl(CONTRACT)
    const reached = [...files].map(rel)

    expect(reached).toEqual(['src/lib/capsule/capsule-contract.ts'])
    for (const forbidden of FORBIDDEN_FILES) {
      expect(reached.filter((f) => f.endsWith(forbidden)), `계약 파일이 ${forbidden}을 끌어온다`).toEqual([])
    }
    for (const forbidden of FORBIDDEN_PACKAGES) {
      expect([...packages].filter((p) => p === forbidden), `계약 파일이 ${forbidden}을 끌어온다`).toEqual([])
    }
  })
})

describe('서버 전용 모듈은 클라이언트 컴포넌트에서 가져오지 않는다', () => {
  it("'use client' 파일의 사슬에 capsule.ts·policy.ts가 없다", () => {
    const clientFiles = walk(srcRoot).filter((file) => /^\s*['"]use client['"]/m.test(readFileSync(file, 'utf8')))
    expect(clientFiles.length, '크롤러가 클라이언트 파일을 찾지 못했다').toBeGreaterThan(0)

    for (const entry of clientFiles) {
      const { files } = crawl(entry)
      for (const file of files) {
        expect(rel(file), `${rel(entry)}가 서버 전용 캡슐 모듈을 끌어온다`).not.toMatch(/lib\/capsule\/(capsule|policy)\.ts$/)
      }
    }
  })
})
