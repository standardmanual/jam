/**
 * 이용 정지 — 클라이언트·서버 경계와 섀도우밴 비읽기 (티켓 20261017_1426)
 *
 * ① `suspension-contract.ts`는 import가 없는 순수 파일이다. 클라이언트가 이 파일을 가져와도 서버 모듈이 번들에 끌려오지 않는다.
 *    클라이언트 진입점(동기화 버튼·보류 고르기)의 import 사슬에도 서버 전용 `suspension.ts`가 없다. 타입 검사·CI가 통과해도
 *    실제 번들에서만 경계 위반이 드러난 적이 있어(`project_nextjs_client_server_boundary_build_only`) 정적·동적 import를 끝까지 따라간다.
 * ② 새 동기화·드랍·배지 코드는 옛 섀도우밴(`user_shadow_bans`, `getUserBanLevel`, `shouldAllowDrop`, `applyShadowBanCap`)을 읽지 않는다.
 *    티켓 20261021_1250(6-4 2회)에서 밴 모듈·관리 API·`applyShadowBanCap`을 지워 `drop-engine/index.ts`·`preview.ts`도 검사 대상이 되었다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/suspension/__tests__/suspension-boundary.test.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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

const CONTRACT = 'lib/suspension/suspension-contract.ts'

describe('suspension-contract.ts는 import가 없는 순수 파일이다', () => {
  it('어떤 import·require·동적 import도 없다', () => {
    const source = readFileSync(join(srcRoot, CONTRACT), 'utf8')
    expect(specifiersOf(source)).toEqual([])
  })

  it("'use client'·'server-only' 지시어나 서버 API 이름이 없다", () => {
    // 주석에는 서버 모듈 이름이 설명으로 나올 수 있어 코드 부분만 본다
    const code = readFileSync(join(srcRoot, CONTRACT), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/['"]use client['"]/)
    expect(code).not.toMatch(/server-only|next\/headers|createServiceClient|supabase/)
  })

  it('사슬이 자기 자신 하나뿐이고 외부 패키지가 없다', () => {
    const { files, packages } = crawl(join(srcRoot, CONTRACT))
    expect([...files].map(rel)).toEqual([`src/${CONTRACT}`])
    expect([...packages]).toEqual([])
  })
})

describe('서버 전용 suspension.ts는 서버 쪽에서만 가져온다', () => {
  // 클라이언트 컴포넌트가 가져오는 진입점들 — 보류 고르기 화면과 동기화 버튼의 사슬
  const CLIENT_ENTRIES = [
    'components/strava/PendingItemsPickerProvider.tsx',
    'components/strava/PendingItemsPickOverlay.tsx',
    'components/SyncButton.tsx',
    'lib/strava/pending-pick.ts',
    'lib/strava/sync-flow.ts',
    'app/(main)/SuspensionBanner.tsx', // 홈 상단 정지 배너(2회)
    'lib/suspension/suspended-block.ts', // 동기화 흐름과 캡슐 클라이언트가 같이 쓰는 정지 403 판별(티켓 20261018_0054)
    'lib/capsule/capsule-client.ts',
    'components/capsule/CapsuleWidget.tsx',
    CONTRACT,
  ]

  it.each(CLIENT_ENTRIES)('%s의 import 사슬에 서버 전용 모듈이 없다', (entry) => {
    const { files, packages } = crawl(join(srcRoot, entry))
    const reached = [...files].map(rel)

    expect(reached.filter((f) => f.endsWith('lib/suspension/suspension.ts')), `${entry}가 suspension.ts를 끌어온다`).toEqual([])
    expect(reached.filter((f) => f.endsWith('lib/suspension/suspension-write.ts')), `${entry}가 suspension-write.ts를 끌어온다`).toEqual([])
    expect(reached.filter((f) => f.endsWith('lib/suspension/notify.ts')), `${entry}가 notify.ts를 끌어온다`).toEqual([])
    expect(reached.filter((f) => f.endsWith('lib/suspension/home-banner.ts')), `${entry}가 home-banner.ts를 끌어온다`).toEqual([])
    expect(reached.filter((f) => f.endsWith('lib/supabase/server.ts')), `${entry}가 lib/supabase/server.ts를 끌어온다`).toEqual([])
    expect([...packages].filter((p) => p === 'next/headers' || p === 'server-only'), `${entry}가 서버 전용 패키지를 끌어온다`).toEqual([])
  })

  it('suspension.ts는 계약 파일의 타입만 가져온다(런타임 의존이 없다)', () => {
    const source = readFileSync(join(srcRoot, 'lib/suspension/suspension.ts'), 'utf8')
    expect(specifiersOf(source).sort()).toEqual(['./suspension-contract', '@supabase/supabase-js'])
    expect(source).toMatch(/import type \{ SupabaseClient \} from '@supabase\/supabase-js'/)
    expect(source).toMatch(/import type \{ SuspensionPeriod \} from '\.\/suspension-contract'/)
  })
})

describe('서버 전용 suspension-write.ts·home-banner.ts는 서버 쪽에서만 가져온다 (2회)', () => {
  // 정지·풀림 소식(티켓 20261021_1249 6-3 5회)을 보내려고 `./notify` 하나만 더 가져온다. 나머지는 supabase-js 타입뿐이다
  it('suspension-write.ts는 supabase-js 타입과 소식 모듈(./notify)만 가져온다', () => {
    const source = readFileSync(join(srcRoot, 'lib/suspension/suspension-write.ts'), 'utf8')
    expect(specifiersOf(source).sort()).toEqual(['./notify', '@supabase/supabase-js'])
    expect(source).toMatch(/import type \{ SupabaseClient \} from '@supabase\/supabase-js'/)
  })

  it('notify.ts는 소식 라이브러리와 묶음 키 빌더만 가져온다', () => {
    const source = readFileSync(join(srcRoot, 'lib/suspension/notify.ts'), 'utf8')
    expect(specifiersOf(source).sort()).toEqual(['@/lib/notifications', '@/lib/notifications/groupKey'])
  })

  // 어드민 클라이언트 컴포넌트는 정지 서버 모듈을 직접 가져오지 않는다(API 라우트로만 부른다)
  it.each(['app/admin/abusing/AbusingClient.tsx', 'app/admin/abusing/SuspensionTable.tsx'])('%s는 정지 서버 모듈을 직접 가져오지 않는다', (file) => {
    const specs = specifiersOf(readFileSync(join(srcRoot, file), 'utf8'))
    expect(specs.filter((spec) => /lib\/suspension\/(suspension|suspension-write|home-banner)$/.test(spec))).toEqual([])
    expect(specs.filter((spec) => spec === 'next/headers' || spec === 'server-only')).toEqual([])
  })

  it('홈 page.tsx만 home-banner.ts를 가져온다(서버 컴포넌트)', () => {
    const page = readFileSync(join(srcRoot, 'app/(main)/page.tsx'), 'utf8')
    expect(specifiersOf(page)).toContain('@/lib/suspension/home-banner')
    const banner = readFileSync(join(srcRoot, 'app/(main)/SuspensionBanner.tsx'), 'utf8')
    expect(specifiersOf(banner).filter((spec) => spec.includes('lib/suspension'))).toEqual([])
  })
})

/** 하위 폴더까지 포함해 시험·스토리·목업 파일을 뺀 소스 파일 목록 */
function sourceFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === '__mocks__') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFilesUnder(full))
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec|stories)\./.test(name)) out.push(full)
  }
  return out
}

// 옛 섀도우밴을 읽는 식별자들 — 새 동기화·드랍·배지 코드에 있으면 안 된다
const SHADOW_BAN_READS = /user_shadow_bans|getUserBanLevel|shouldAllowDrop|applyShadowBanCap|abusing\/shadow-ban/

describe('새 동기화·드랍·배지 코드는 user_shadow_bans를 읽지 않는다', () => {
  const DIRS = ['lib/strava', 'lib/badge-engine', 'lib/jam', 'lib/drop-engine'] as const

  const targets = DIRS.flatMap((dir) => sourceFilesUnder(join(srcRoot, dir))).map((file) => file.replace(srcRoot, ''))

  it('검사 대상에 핵심 파일이 들어 있다(찾지 못해 통과하는 일을 막는다)', () => {
    for (const must of [
      'lib/strava/sync.ts',
      'lib/badge-engine/index.ts',
      'lib/badge-engine/usageBadges.ts',
      'lib/drop-engine/syncIssueRun.ts',
      'lib/drop-engine/index.ts',
      'lib/drop-engine/preview.ts',
    ]) {
      expect(targets, `${must}가 검사 대상에 없다`).toContain(must)
    }
  })

  it.each(targets)('%s', (file) => {
    const source = readFileSync(join(srcRoot, file), 'utf8')
    expect(source).not.toMatch(SHADOW_BAN_READS)
  })
})

describe('옛 섀도우밴 코드가 사라졌다 (티켓 20261021_1250, 6-4 2회)', () => {
  it.each(['lib/abusing/shadow-ban.ts', 'lib/abusing/rate-keys.ts', 'app/api/admin/abusing/bans'])('%s가 없다', (path) => {
    expect(existsSync(join(srcRoot, path)), `${path}가 다시 생겼다`).toBe(false)
  })

  it('앱 코드(생성 타입 제외) 어디서도 user_shadow_bans 표를 열지 않는다', () => {
    const files = sourceFilesUnder(srcRoot).filter((file) => !file.replace(srcRoot, '').startsWith('types/'))
    expect(files.length, '검사 대상이 비어 있다').toBeGreaterThan(500)
    const offenders = files
      .filter((file) => /\.from\(\s*['"]user_shadow_bans['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(srcRoot, 'src/'))
    expect(offenders).toEqual([])
  })
})
