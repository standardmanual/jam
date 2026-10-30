/**
 * lib/chapter/kinds — 컬렉션 완성 등급 → 종류 (티켓 20261019_1315, 활동 12종 목록은 티켓 20261028_1742 2회에서 걷었다)
 *
 * 고정하는 것:
 * - 컬렉션 등급마다 종류가 하나씩 있다(`failure.ts`의 «세지 못함» 기록이 쓴다).
 *
 * 실행: cd jam-web && npx vitest run src/lib/chapter/__tests__/kinds.test.ts
 */
import { describe, it, expect } from 'vitest'
import { CHAPTER_COLLECTION_TIERS, collectionCompleteKind } from '../kinds'

describe('컬렉션 완성 종류', () => {
  it('컬렉션 등급마다 종류가 하나씩 있다', () => {
    expect(CHAPTER_COLLECTION_TIERS.map(collectionCompleteKind)).toEqual([
      'collection_complete_common',
      'collection_complete_rare',
      'collection_complete_epic',
      'collection_complete_mystic',
    ])
  })
})
