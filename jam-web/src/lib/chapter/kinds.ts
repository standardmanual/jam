/**
 * 챕터 점수 «세지 못함» 기록이 쓰는 종류 (티켓 20261019_1315, 운영 로직 12.2절)
 *
 * 챕터 점수 장부(활동 12종, `chapter_score_rules`)는 쓰기를 멈췄고 걷었다(티켓 20261028_1742 2회). 남은 것은 컬렉션 완성 등급 → 종류 변환과,
 * 믹스·컬렉션이 서비스 활동 잼을 지급하지 못했을 때 `failure.ts`가 남기는 기록의 종류뿐이다.
 *
 * 공용 모듈이라 서버 전용 코드를 가져오지 않는다.
 */
import type { BadgeRarity } from '@/types/database'

/** 컬렉션 완성이 등급별로 갈리는 등급. 등급형이 아닌 컬렉션은 `common`으로 센다 */
export const CHAPTER_COLLECTION_TIERS = ['common', 'rare', 'epic', 'mystic'] as const satisfies readonly BadgeRarity[]

export type ChapterCollectionTier = (typeof CHAPTER_COLLECTION_TIERS)[number]

export type ChapterCollectionKind = `collection_complete_${ChapterCollectionTier}`

/** 컬렉션 완성의 등급 → 종류 */
export function collectionCompleteKind(tier: ChapterCollectionTier): ChapterCollectionKind {
  return `collection_complete_${tier}`
}
