// scripts/check-client-server-imports.mjs 단위 테스트 (티켓 20260924_1639, 동적 import() 추적은 20261017_1638).
// 실행: node scripts/check-client-server-imports.test.mjs

import assert from 'node:assert/strict'
import { findViolations, isClientFile, parseValueImports } from './check-client-server-imports.mjs'

const SERVER = 'jam-web/src/lib/admin/auth.ts'
const LIST = ['jam-web/src/lib/admin/auth.ts']
const src = (m) => new Map(Object.entries(m))

// 1. 이번 사고 재현: UsersFilterBar(클라이언트) → user-list(값 import) → auth(서버 전용)
{
  const files = src({
    'jam-web/src/components/admin/UsersFilterBar.tsx': `'use client'\nimport { USER_SORTS } from '@/lib/admin/user-list'\n`,
    'jam-web/src/lib/admin/user-list.ts': `import { requireAdmin } from './auth'\nexport const USER_SORTS = ['a']\n`,
    [SERVER]: `export function requireAdmin() {}\n`,
  })
  const v = findViolations(files, LIST)
  assert.equal(v.length, 1)
  assert.deepEqual(v[0], [
    'jam-web/src/components/admin/UsersFilterBar.tsx',
    'jam-web/src/lib/admin/user-list.ts',
    SERVER,
  ])
}

// 2. import type / { type X }만 가져오면 통과한다
{
  const files = src({
    'jam-web/src/components/A.tsx': `'use client'\nimport type { Row } from '@/lib/admin/user-list'\nimport { type Sort, type Dir } from '@/lib/admin/user-list'\nexport type { Row } from '@/lib/admin/user-list'\n`,
    'jam-web/src/lib/admin/user-list.ts': `import { requireAdmin } from './auth'\nexport type Row = {}\n`,
    [SERVER]: '',
  })
  assert.deepEqual(findViolations(files, LIST), [])
}

// 3. 기본 import와 { type X }가 섞이면 값 import다 / 여러 줄 import도 읽는다
{
  const mixed = `'use client'\nimport D, { type T } from './b'\n`
  assert.deepEqual(parseValueImports(mixed), ['./b'])
  const multi = `import {\n  type A,\n  B,\n} from './c'\n`
  assert.deepEqual(parseValueImports(multi), ['./c'])
  assert.deepEqual(parseValueImports(`import {\n  type A,\n  type B,\n} from './c'\n`), [])
}

// 4. 서버 컴포넌트('use client' 없음)는 검사 대상이 아니다
{
  const files = src({
    'jam-web/src/app/page.tsx': `import { requireAdmin } from '@/lib/admin/auth'\n`,
    [SERVER]: '',
  })
  assert.deepEqual(findViolations(files, LIST), [])
  assert.equal(isClientFile(`// 주석\n'use client'\nexport {}\n`), true)
  assert.equal(isClientFile(`export const x = "use client"\n`), false)
}

// 5. next/headers·server-only를 직접 import하는 파일은 목록에 없어도 서버 전용이다
{
  const files = src({
    'jam-web/src/components/B.tsx': `'use client'\nimport { helper } from '../lib/helper'\n`,
    'jam-web/src/lib/helper.ts': `import { cookies } from 'next/headers'\n`,
    'jam-web/src/components/C.tsx': `'use client'\nimport '@/lib/only'\n`,
    'jam-web/src/lib/only.ts': `import 'server-only'\n`,
  })
  const v = findViolations(files, [])
  assert.equal(v.length, 2)
  assert.deepEqual(v[0], ['jam-web/src/components/B.tsx', 'jam-web/src/lib/helper.ts'])
  assert.deepEqual(v[1], ['jam-web/src/components/C.tsx', 'jam-web/src/lib/only.ts'])
}

// 6. index 파일·확장자 생략·주석 안의 import는 올바르게 다룬다
{
  const files = src({
    'jam-web/src/components/D.tsx': `'use client'\n// import { x } from '@/lib/admin/auth'\nimport { y } from '@/lib/pkg'\n`,
    'jam-web/src/lib/pkg/index.ts': `export * from './inner'\n`,
    'jam-web/src/lib/pkg/inner.ts': `import { x } from '@/lib/admin/auth'\n`,
    [SERVER]: '',
  })
  const v = findViolations(files, LIST)
  assert.equal(v.length, 1)
  assert.deepEqual(v[0], [
    'jam-web/src/components/D.tsx',
    'jam-web/src/lib/pkg/index.ts',
    'jam-web/src/lib/pkg/inner.ts',
    SERVER,
  ])
}

// 7. 순환 import가 있어도 끝난다
{
  const files = src({
    'jam-web/src/components/E.tsx': `'use client'\nimport './F'\n`,
    'jam-web/src/components/F.tsx': `import './E'\n`,
  })
  assert.deepEqual(findViolations(files, LIST), [])
}

// 8. 동적 import()도 간선이다 (티켓 20261017_1638). 수정 전 사고 모양 고정:
//    클라이언트 컴포넌트 → connection-state.ts(커밋 fcde99d2c 모양) → 동적 import('@/lib/supabase/server').
//    타입 import는 지워지지만 줄 중간의 `(await import(...))`는 Turbopack이 정적 import처럼 따라가
//    브라우저 번들에 next/headers가 들어갔다. 기본 서버 전용 목록(SERVER_ONLY_MODULES)으로 시험한다.
{
  const connectionState = [
    `import type { createServiceClient } from '@/lib/supabase/server'`,
    ``,
    `type ServiceClient = ReturnType<typeof createServiceClient>`,
    ``,
    `export function resolveStravaUiState(row: { disconnected_at?: string | null } | null) {`,
    `  return row ? 'connected' : 'none'`,
    `}`,
    ``,
    `export async function markStravaDisconnected(userId: string, options: { supabase?: ServiceClient } = {}) {`,
    `  const supabase = options.supabase ?? (await import('@/lib/supabase/server')).createServiceClient()`,
    `  await supabase.from('strava_connections').update({ user_id: userId })`,
    `}`,
    ``,
  ].join('\n')
  const files = src({
    'jam-web/src/app/(main)/profile/edit/ProfileEditForm.tsx': `'use client'\nimport { resolveStravaUiState } from '@/lib/strava/connection-state'\n`,
    'jam-web/src/lib/strava/connection-state.ts': connectionState,
    'jam-web/src/lib/supabase/server.ts': `import { cookies } from 'next/headers'\nexport function createServiceClient() {}\n`,
  })
  const v = findViolations(files)
  assert.equal(v.length, 1)
  assert.deepEqual(v[0], [
    'jam-web/src/app/(main)/profile/edit/ProfileEditForm.tsx',
    'jam-web/src/lib/strava/connection-state.ts',
    'jam-web/src/lib/supabase/server.ts',
  ])
  // 수정 후 모양(서버 쪽으로 옮겨 클라이언트가 가져오지 않는다)은 통과한다
  const fixed = src({
    'jam-web/src/app/(main)/profile/edit/ProfileEditForm.tsx': `'use client'\nimport { resolveStravaUiState } from '@/lib/strava/connection-state'\n`,
    'jam-web/src/lib/strava/connection-state.ts': `export function resolveStravaUiState() {}\n`,
    'jam-web/src/lib/supabase/server.ts': `import { cookies } from 'next/headers'\n`,
  })
  assert.deepEqual(findViolations(fixed), [])
}

// 9. 동적 import() 모양을 모두 읽는다: await·.then·dynamic(() => ...)·여러 줄·따옴표 종류·보간 없는 템플릿
{
  const specs = (code) => parseValueImports(code)
  assert.deepEqual(specs(`const m = await import('./a')\n`), ['./a'])
  assert.deepEqual(specs(`const x = (await import("@/lib/b")).run()\n`), ['@/lib/b'])
  assert.deepEqual(specs(`import('./c').then((m) => m.go())\n`), ['./c'])
  assert.deepEqual(specs(`const V = dynamic(() => import('@/components/V'), { ssr: false })\n`), ['@/components/V'])
  assert.deepEqual(specs(`const m = await import(\n  './d'\n)\n`), ['./d'])
  assert.deepEqual(specs('const m = await import(`./e`)\n'), ['./e'])
  assert.deepEqual(specs(`const { a } = await import('./f') // 호출 시점에 불러온다\n`), ['./f'])
  assert.deepEqual(specs(`const j = await import('./u.json', { with: { type: 'json' } })\n`), ['./u.json'])
  // 정적 import와 섞여도 둘 다 나온다
  assert.deepEqual(specs(`import { x } from './s'\nconst m = await import('./t')\n`), ['./s', './t'])
}

// 10. 동적 import()가 아닌 것은 간선이 아니다: 타입 위치 import 타입·typeof·보간 템플릿·변수·메서드 호출·주석
{
  const specs = (code) => parseValueImports(code)
  // 타입 위치 import 타입은 런타임에 지워진다 (InventoryGrid, today/cards.ts에 실제로 있는 모양)
  assert.deepEqual(specs(`const r = b as import('@/types/database').BadgeRarity | null\n`), [])
  assert.deepEqual(specs(`let m: import('@/types/database').MissionExposureMode | undefined\n`), [])
  assert.deepEqual(specs(`type M = typeof import('./g')\n`), [])
  // 지정자를 알 수 없으면 따라갈 수 없다
  assert.deepEqual(specs('const m = await import(`./h/${name}`)\n'), [])
  assert.deepEqual(specs(`const m = await import(path)\n`), [])
  // 다른 객체의 메서드·식별자 일부는 import()가 아니다
  assert.deepEqual(specs(`loader.import('./i')\nreimport('./j')\n`), [])
  // 주석 안의 import()는 읽지 않는다
  assert.deepEqual(specs(`// const m = await import('./k')\n/* import('./l') */\n/** {@link import('./m').x} */\n`), [])
}

// 11. 클라이언트가 동적 import()로 클라이언트 전용 모듈이나 외부 패키지를 불러오는 것은 통과한다
{
  const files = src({
    'jam-web/src/app/drops/DropsClient.tsx': `'use client'\nconst MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })\n`,
    'jam-web/src/components/map/MapView.tsx': `'use client'\nexport default function MapView() { return null }\n`,
    'jam-web/src/lib/crypto.ts': `export async function enc() { const { createCipheriv } = await import('crypto') }\n`,
    'jam-web/src/components/Z.tsx': `'use client'\nimport { enc } from '@/lib/crypto'\n`,
  })
  assert.deepEqual(findViolations(files, LIST), [])
}

// 12. 동적 import()로 next/headers·server-only에 직접 닿는 파일도 서버 전용이다 / 서버 컴포넌트의 동적 import는 검사 대상이 아니다
{
  const files = src({
    'jam-web/src/components/G.tsx': `'use client'\nimport { go } from '../lib/lazy'\n`,
    'jam-web/src/lib/lazy.ts': `export async function go() { const { cookies } = await import('next/headers'); return cookies() }\n`,
    'jam-web/src/components/H.tsx': `'use client'\nexport async function f() { await import('@/lib/only') }\n`,
    'jam-web/src/lib/only.ts': `import 'server-only'\n`,
    'jam-web/src/app/page.tsx': `export default async function Page() { const m = await import('@/lib/admin/auth'); return null }\n`,
    [SERVER]: '',
  })
  const v = findViolations(files, LIST)
  assert.equal(v.length, 2)
  assert.deepEqual(v[0], ['jam-web/src/components/G.tsx', 'jam-web/src/lib/lazy.ts'])
  assert.deepEqual(v[1], ['jam-web/src/components/H.tsx', 'jam-web/src/lib/only.ts'])
}

// 13. 정적·동적 간선이 섞인 사슬에서도 가장 짧은 경로를 남기고, 동적으로만 이어진 순환도 끝난다
{
  const files = src({
    'jam-web/src/components/I.tsx': `'use client'\nimport { a } from '@/lib/a'\n`,
    'jam-web/src/lib/a.ts': `export const a = async () => (await import('./b')).b\n`,
    'jam-web/src/lib/b.ts': `export const b = async () => (await import('./a')).a\nexport const c = () => import('@/lib/admin/auth')\n`,
    [SERVER]: '',
  })
  const v = findViolations(files, LIST)
  assert.equal(v.length, 1)
  assert.deepEqual(v[0], ['jam-web/src/components/I.tsx', 'jam-web/src/lib/a.ts', 'jam-web/src/lib/b.ts', SERVER])
}

console.log('check-client-server-imports.test.mjs 통과')
