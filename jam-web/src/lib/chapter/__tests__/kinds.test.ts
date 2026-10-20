/**
 * lib/chapter/kinds — 챕터 점수 활동 종류 (티켓 20261019_1315)
 *
 * 고정하는 것:
 * - 앱의 활동 종류 12종이 마이그레이션 221의 `chapter_score_rules` 초기값과 정확히 같다(한쪽만 고치면 DB가 «알 수 없는 활동 종류»로 거절한다).
 * - 컬렉션 완성의 등급 → 활동 종류 변환.
 * - 점수 값은 코드에 두지 않는다(종류 파일은 숫자를 갖지 않는다).
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/kinds.test.ts
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { CHAPTER_COLLECTION_TIERS, CHAPTER_SCORE_KINDS, collectionCompleteKind } from '../kinds'

const here = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(resolve(here, '../../../../supabase/migrations/221_chapters.sql'), 'utf8')

function seededKinds(): string[] {
  const start = migration.indexOf('INSERT INTO public.chapter_score_rules')
  expect(start, '221에서 점수 규칙 초기값을 찾지 못했다').toBeGreaterThanOrEqual(0)
  const end = migration.indexOf('ON CONFLICT', start)
  const block = migration.slice(start, end)
  return [...block.matchAll(/\(\s*'([a-z_]+)'\s*,/g)].map((m) => m[1])
}

describe('활동 종류', () => {
  it('마이그레이션 221의 점수 규칙 초기값과 같은 12종이다', () => {
    const seeded = seededKinds()
    expect(seeded).toHaveLength(12)
    expect([...CHAPTER_SCORE_KINDS].sort()).toEqual([...seeded].sort())
  })

  it('컬렉션 등급마다 활동 종류가 하나씩 있다', () => {
    expect(CHAPTER_COLLECTION_TIERS.map(collectionCompleteKind)).toEqual([
      'collection_complete_common',
      'collection_complete_rare',
      'collection_complete_epic',
      'collection_complete_mystic',
    ])
    for (const tier of CHAPTER_COLLECTION_TIERS) {
      expect(CHAPTER_SCORE_KINDS).toContain(collectionCompleteKind(tier))
    }
  })
})
