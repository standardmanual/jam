/**
 * 클라이언트·서버 경계 — 보류 고르기 화면의 import 사슬 (티켓 20261017_1425 2회)
 *
 * 클라이언트 컴포넌트가 가져오는 모듈이 서버 전용 모듈(`@/lib/supabase/server`·`next/headers`·`lib/strava/pending-items.ts`)을 정적으로도
 * 동적으로도 끌어오면 타입 검사·CI가 통과해도 빌드가 깨진다(티켓 2-2에서 실제로 겪음). 새 클라이언트 진입점에서 출발해 상대·별칭 import를
 * 끝까지 따라가며 금지 모듈이 하나도 없는지 확인한다.
 *
 * 서버 헬퍼 `countPendingItems`는 서버 컴포넌트 `(main)/layout.tsx`에서만 가져온다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/pending-pick-boundary.test.ts
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

const FORBIDDEN_FILES = [
  'lib/supabase/server.ts',
  'lib/strava/pending-items.ts',
  'lib/strava/pending-followups.ts',
  'lib/drop-engine/syncIssueRun.ts',
  'lib/drop-engine/issueFollowUp.ts',
]
const FORBIDDEN_PACKAGES = ['next/headers', 'server-only']

const ENTRIES = [
  'components/strava/PendingItemsPickerProvider.tsx',
  'components/strava/PendingItemsPickOverlay.tsx',
  'components/SyncButton.tsx',
  'lib/strava/pending-pick.ts',
  'lib/strava/sync-flow.ts',
]

describe('고르기 화면의 import 사슬에 서버 전용 모듈이 없다', () => {
  it.each(ENTRIES)('%s', (entry) => {
    const { files, packages } = crawl(join(srcRoot, entry))
    const reachedFiles = [...files].map(rel)

    for (const forbidden of FORBIDDEN_FILES) {
      expect(reachedFiles.filter((f) => f.endsWith(forbidden)), `${entry}가 ${forbidden}을 끌어온다`).toEqual([])
    }
    for (const forbidden of FORBIDDEN_PACKAGES) {
      expect([...packages].filter((p) => p === forbidden), `${entry}가 ${forbidden}을 끌어온다`).toEqual([])
    }
  })

  it('사슬이 계약 파일(타입·상수 전용)과 DS 캐러셀을 지난다(크롤러가 실제로 따라가고 있다)', () => {
    const { files } = crawl(join(srcRoot, 'components/strava/PendingItemsPickerProvider.tsx'))
    const reached = [...files].map(rel)

    expect(reached.some((f) => f.endsWith('lib/strava/pending-items-contract.ts'))).toBe(true)
    expect(reached.some((f) => f.endsWith('patterns/BadgeRevealCarousel.jsx'))).toBe(true)
    expect(reached.some((f) => f.endsWith('lib/uiOverlay.ts'))).toBe(true)
  })

  it('SyncButton은 SYNC_PENDING_ITEMS_CODE를 계약 파일에서만 가져온다', () => {
    const syncFlow = readFileSync(join(srcRoot, 'lib/strava/sync-flow.ts'), 'utf8')
    const syncButton = readFileSync(join(srcRoot, 'components/SyncButton.tsx'), 'utf8')

    expect(syncFlow).toMatch(/from '@\/lib\/strava\/pending-items-contract'/)
    expect(syncButton).not.toMatch(/strava\/pending-items'/)
  })
})

describe('서버 헬퍼 countPendingItems는 서버 컴포넌트에서만 가져온다', () => {
  it("고르기 화면의 클라이언트 사슬 어디에서도 countPendingItems를 가져오지 않는다", () => {
    for (const entry of ENTRIES) {
      const { files } = crawl(join(srcRoot, entry))
      for (const file of files) {
        expect(readFileSync(file, 'utf8'), `${rel(file)}가 countPendingItems를 가져온다`).not.toMatch(/^\s*import\s*\{[^}]*\bcountPendingItems\b[^}]*\}/m)
      }
    }
  })

  it('(main)/layout.tsx(서버 컴포넌트)가 가져와 숫자만 프로바이더에 내린다', () => {
    const layout = readFileSync(join(srcRoot, 'app/(main)/layout.tsx'), 'utf8')

    expect(layout).not.toMatch(/^\s*['"]use client['"]/m)
    expect(layout).toMatch(/import \{ countPendingItems \} from '@\/lib\/strava\/pending-items'/)
    expect(layout).toMatch(/<PendingItemsPickerProvider initialPendingCount=\{pendingItemsCount\}>/)
  })
})
