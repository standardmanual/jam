/**
 * 완성 판정 단일 원천 고정 — 티켓 20261016_2340 2회-나
 *
 * 컬렉션 완성의 분모·분자는 `completion-basis.ts`(`computeBookCompletion`) 한 곳이 정한다.
 * 소비처가 그 밖에서 분모를 만들거나 분자를 직접 비교하면 위치마다 완성 여부가 갈라진다(비교표 3.8절).
 * 이 시험은 소스를 검색해 그 회귀를 막는다. 판정 결과 자체는 `completion-parity.test.ts`가 고정한다.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '../../..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(full, out)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|generated)\./.test(name)) {
      out.push(full)
    }
  }
  return out
}

const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/')

/** 완성 분모·분자를 쓰는 소비처 (2회-가·2회-나에서 모두 모듈 결과를 쓰도록 바꾼 파일) */
const CONSUMERS = [
  'lib/itembook/checker.ts',
  'lib/itembook/completable.ts',
  'app/(main)/badges/page.tsx',
  'app/(main)/collections/[id]/page.tsx',
  'app/(main)/[username]/collections/page.tsx',
  'app/api/itembooks/route.ts',
  'app/api/users/[username]/itembooks/route.ts',
  'lib/today/status.ts',
  'lib/today/exposure.ts',
  'lib/today/cards.ts',
  'lib/notifications/batch/collections.ts',
]

/** 분자를 컬렉션별로 만들어 넘겨야 하는 소비처. cards.ts는 분모(아이템 수)만 쓰므로 뺀다 */
const NUMERATOR_CONSUMERS = CONSUMERS.filter((f) => f !== 'lib/today/cards.ts')

/** 소비처 안에서 나오면 안 되는 직접 판정 모양 */
const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: "분모 종류를 ['item']으로 좁히는 옵션", pattern: /types:\s*\[\s*'item'\s*\]/ },
  { name: '모든 컬렉션을 한 집합으로 묶은 채운 배지 변수', pattern: /\bfilledBadgeIds\b/ },
  { name: '옛 완성 기록과 계산을 직접 섞는 표시 판정', pattern: /completedSet\.has\([^)]*\)\s*\|\|/ },
  { name: '분자와 분모를 직접 비교', pattern: /\b(filled|slotted)\w*\s*(>=|===)\s*(total|denom)\w*/ },
]

describe('완성 판정 단일 원천', () => {
  it('buildBadgeIdsOfBook은 completion-basis 밖에서 부르지 않는다(옛 드랍 엔진에서 옮겼다, 티켓 20261022_0938)', () => {
    const users = walk(SRC)
      .map(rel)
      .filter((f) => f !== 'lib/itembook/completion-basis.ts')
      .filter((f) => readFileSync(path.join(SRC, f), 'utf8').includes('buildBadgeIdsOfBook'))
    expect(users).toEqual([])
  }, 30_000)

  it('소비처 목록의 파일이 모두 존재한다(파일을 옮기면 목록을 함께 고친다)', () => {
    const missing = CONSUMERS.filter((f) => !existsSync(path.join(SRC, f)))
    expect(missing).toEqual([])
  })

  it.each(CONSUMERS)('%s는 완성 판정 모듈을 부른다', (file) => {
    const text = readFileSync(path.join(SRC, file), 'utf8')
    // itembook 폴더 안의 파일은 상대 경로로 부른다
    expect(text).toMatch(/from '(@\/lib\/itembook|\.)\/completion-basis'/)
    expect(text).toContain('computeBookCompletion(')
  })

  it.each(CONSUMERS)('%s는 모듈 밖에서 분모·분자를 직접 비교하지 않는다', (file) => {
    const text = readFileSync(path.join(SRC, file), 'utf8')
    const hits = FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map((f) => f.name)
    expect(hits).toEqual([])
  })

  it.each(NUMERATOR_CONSUMERS)('%s는 컬렉션별 분자(filledByBook)를 모듈에 넘긴다', (file) => {
    const text = readFileSync(path.join(SRC, file), 'utf8')
    expect(text).toContain('filledByBook')
  })
})
