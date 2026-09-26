// scripts/check-client-server-imports.mjs 단위 테스트 (티켓 20260924_1639).
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

console.log('check-client-server-imports.test.mjs 통과')
