/**
 * 트라이브 게이트 — 클라이언트·서버 경계 (티켓 20261021_1247 1회)
 *
 * `gate-contract.ts`는 import가 없는 순수 파일이다. 동기화 버튼(클라이언트 컴포넌트)이 이 파일을 가져와도
 * 서버 전용 `gate.ts`와 `lib/supabase/server.ts`가 번들에 끌려오지 않는다. 타입 검사·CI가 통과해도 실제 번들에서만
 * 경계 위반이 드러난 적이 있어(`suspension-boundary.test.ts`와 같은 이유) 정적·동적 import를 끝까지 따라간다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/tribe/__tests__/gate-boundary.test.ts
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
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

const rel = (file: string) => file.replace(srcRoot, 'src/').replace(dsRoot, 'design-system')

const CONTRACT = 'lib/tribe/gate-contract.ts'

describe('gate-contract.ts는 import가 없는 순수 파일이다', () => {
  it('어떤 import·require·동적 import도 없다', () => {
    const source = readFileSync(join(srcRoot, CONTRACT), 'utf8')
    expect(specifiersOf(source)).toEqual([])
  })

  it('사슬이 자기 자신 하나뿐이고 외부 패키지가 없다', () => {
    const { files, packages } = crawl(join(srcRoot, CONTRACT))
    expect([...files].map(rel)).toEqual([`src/${CONTRACT}`])
    expect([...packages]).toEqual([])
  })
})

describe('서버 전용 gate.ts는 서버 쪽에서만 가져온다', () => {
  // 클라이언트 컴포넌트가 가져오는 진입점들 — 동기화 버튼과 동기화 흐름, 트라이브 고르기 화면
  const CLIENT_ENTRIES = [
    'components/SyncButton.tsx',
    'lib/strava/sync-flow.ts',
    'app/(onboarding)/onboarding/page.tsx',
    'app/(onboarding)/onboarding/TribeStep.tsx',
    'app/(onboarding)/onboarding/onboarding-entry.ts',
    CONTRACT,
  ]

  it.each(CLIENT_ENTRIES)('%s의 import 사슬에 서버 전용 모듈이 없다', (entry) => {
    const { files, packages } = crawl(join(srcRoot, entry))
    const reached = [...files].map(rel)

    expect(reached.filter((f) => f.endsWith('lib/tribe/gate.ts')), `${entry}가 gate.ts를 끌어온다`).toEqual([])
    expect(reached.filter((f) => f.endsWith('lib/supabase/server.ts')), `${entry}가 lib/supabase/server.ts를 끌어온다`).toEqual([])
    expect([...packages].filter((p) => p === 'next/headers' || p === 'server-only'), `${entry}가 서버 전용 패키지를 끌어온다`).toEqual([])
  })

  it('gate.ts는 supabase-js 타입과 계약 파일의 판정만 가져온다', () => {
    const source = readFileSync(join(srcRoot, 'lib/tribe/gate.ts'), 'utf8')
    expect(specifiersOf(source).sort()).toEqual(['./gate-contract', '@supabase/supabase-js'])
    expect(source).toMatch(/import type \{ SupabaseClient \} from '@supabase\/supabase-js'/)
  })
})
