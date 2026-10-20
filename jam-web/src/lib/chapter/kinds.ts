/**
 * 챕터 점수의 활동 종류 (티켓 20261019_1315, 운영 로직 12.2절)
 *
 * 마이그레이션 221의 `chapter_score_rules.activity_kind`와 같은 값이다(같은 값인지는 `__tests__/kinds.test.ts`가 고정한다).
 * **점수 값(1당 몇 점인지)은 DB 설정 행이 갖고 있어 코드에 상수로 두지 않는다.** 이 파일은 «어떤 종류가 있는가»만 안다.
 * 종류를 더하려면 DB 설정 행을 먼저 더한다.
 *
 * 공용 모듈이라 서버 전용 코드를 가져오지 않는다.
 */
import type { BadgeRarity } from '@/types/database'

/** 컬렉션 완성 점수가 등급별로 갈리는 등급. 등급형이 아닌 컬렉션은 `common`으로 센다 */
export const CHAPTER_COLLECTION_TIERS = ['common', 'rare', 'epic', 'mystic'] as const satisfies readonly BadgeRarity[]

export type ChapterCollectionTier = (typeof CHAPTER_COLLECTION_TIERS)[number]

export type ChapterCollectionKind = `collection_complete_${ChapterCollectionTier}`

/** 챕터 점수를 쌓는 활동 종류 12종 */
export const CHAPTER_SCORE_KINDS = [
  'jam_earned',
  'capsule_open',
  'locked_item_badge_open',
  'badge_receive',
  'collection_complete_common',
  'collection_complete_rare',
  'collection_complete_epic',
  'collection_complete_mystic',
  'mix_success',
  'mission_complete',
  'drop',
  'pickup',
] as const

export type ChapterScoreKind = (typeof CHAPTER_SCORE_KINDS)[number]

/** 컬렉션 완성의 등급 → 활동 종류 */
export function collectionCompleteKind(tier: ChapterCollectionTier): ChapterCollectionKind {
  return `collection_complete_${tier}`
}
