/**
 * 챕터 점수 «컬렉션 완성» (티켓 20261019_1315 3회, 운영 로직 12.2절, 사용자 결정 4)
 *
 * 컬렉션을 완성한 순간 `collection_complete_<등급>`을 센다(common 100 ~ mystic 800은 DB 설정 행, 코드에 점수 상수를 두지 않는다).
 *
 * **원천 id**: 완성 기록 표(`user_item_book_completions`, `user_item_book_tier_completions`)에 id가 없어서 (유저, 컬렉션, 등급)으로 만든 결정적 id다
 * (`deterministicSourceId('collection_complete', userId, itemBookId, tier)`). 같은 완성을 다시 보내도 같은 키라 한 번만 센다.
 *
 * **등급형이 아닌 컬렉션(`tier_mode` 꺼짐, 공용 DB의 100개 전부)**은 등급 값이 없어 `common`으로 센다. 나중에 등급형으로 바뀌어 같은 컬렉션의
 * common 등급을 완성해도 (유저, 컬렉션, common)이 같은 키라 같은 완성이 두 번 세어지지 않는다(이중 가산 없음).
 *
 * **«이번에 새로 완성했는가»**:
 *  - 등급형: 장착 RPC(`slot_item_into_book_tiered`)가 돌려주는 `completed_tier`가 이번 장착으로 새로 완성한 등급이다(없으면 null).
 *  - 옛 컬렉션: 장착 RPC가 완성 여부를 돌려주지 않는다. 그래서 장착 **전**에 `user_item_book_completions`에 완성 기록이 있었는지 읽어 두고(`hasLegacyCollectionCompletion`),
 *    장착 **후**에 기록이 생겼으면 이번에 새로 완성한 것으로 센다. 이미 완성한 유저가 다시 장착해도 소급 가산하지 않는다.
 *  - 동기화 보정(`lib/itembook/checker.ts`)의 `completedIds`는 이미 «이번에 새로 완성한 옛 컬렉션»만 담는다(등급형은 건너뛴다). 그대로 `awardCollectionCompleteScore(common)`을 부른다.
 *
 * **피드 «컬렉션 완성»**(티켓 20261021_1249 6-3 5회, 운영 로직 15.3절): 이 함수가 곧 «이번에 새로 완성한 등급»의 합류점이라(위 두 호출부가 새 완성만 넘긴다) 같은 자리에서 `collection_tier_completed` 피드를 한 건 기록한다.
 * 이미 완성한 유저의 재장착은 호출부가 걸러 여기에 오지 않으므로 소급 기록도 없다. 피드에는 중복 방지 키가 없어 한 번만 기록하는 일은 이 호출부 계약이 맡는다(점수는 결정적 원천 id가 한 번만 센다).
 * 챕터 오름 피드(`rise.ts`)가 점수 처리 안에서 따라 나오므로, 완성 피드를 점수보다 **먼저** 기록해 최신순 피드에서 «챕터 오름»이 «컬렉션 완성» 위에 오게 한다(결과가 원인보다 아래에 읽히지 않게).
 * 등급 값이 알려진 값이 아니면 기록하지 않는다. 컬렉션 이름을 읽지 못하면 이름 없는 기록을 남기지 않고 로그만 남긴다. 점수와 서로 막지 않는다.
 *
 * **절대 던지지 않는다.** 점수 쪽이 어떻게 되든 장착·동기화 응답은 그대로다. 완성 여부를 읽지 못하면 «새로 완성한 것»인지 알 수 없어 점수를 세지 않고
 * `chapter_score_failed`로 기록만 남긴다(소급 가산을 피한다. 같은 원천 id로 다시 보낼 수 있다).
 *
 * 서버 전용이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { recordFeedEvent } from '@/lib/activity-feed'
import { recordChapterScoreFailure } from './failure'
import { CHAPTER_COLLECTION_TIERS, collectionCompleteKind, type ChapterCollectionTier } from './kinds'
import { awardChapterScore, type AwardChapterScoreResult } from './score'
import { deterministicSourceId } from './source-id'

/** 등급형이 아닌 컬렉션이 세는 등급 */
export const LEGACY_COLLECTION_TIER: ChapterCollectionTier = 'common'

export function isChapterCollectionTier(value: unknown): value is ChapterCollectionTier {
  return typeof value === 'string' && (CHAPTER_COLLECTION_TIERS as readonly string[]).includes(value)
}

/** (유저, 컬렉션, 등급) 결정적 원천 id. 옛 컬렉션도 `common`으로 같은 키를 쓴다 */
export function collectionCompleteSourceId(userId: string, itemBookId: string, tier: ChapterCollectionTier): string {
  return deterministicSourceId('collection_complete', userId, itemBookId, tier)
}

export interface AwardCollectionCompleteInput {
  userId: string
  itemBookId: string
  /** 완성한 등급. 등급형이 아닌 컬렉션은 `LEGACY_COLLECTION_TIER`(common) */
  tier: string
}

/**
 * 컬렉션 이름을 읽어 «컬렉션 완성» 피드 한 건을 기록한다. 던지지 않는다.
 * 메타는 컬렉션 id·이름·등급(`rarity`)뿐이고 `strava_activity_id`를 넘기지 않는다(넘기면 활동 묶음 카드에 섞인다).
 * 이름을 읽지 못하면(조회 오류·없는 컬렉션) 이름 없는 기록을 남기지 않고 로그만 남긴다.
 */
async function recordCollectionCompleteFeed(supabase: SupabaseClient, userId: string, itemBookId: string, tier: ChapterCollectionTier): Promise<void> {
  if (!itemBookId) return // 컬렉션 id가 비면 읽을 수도 가리킬 수도 없다(점수 쪽이 같은 입력을 실패로 기록한다)
  try {
    const { data, error } = await supabase.from('item_books').select('name').eq('id', itemBookId).maybeSingle()
    if (error) {
      console.error(`[collection-feed] 컬렉션 이름 조회 오류 — 피드를 기록하지 않았다 (userId: ${userId}, itemBookId: ${itemBookId}):`, error)
      return
    }
    const name = typeof data?.name === 'string' ? data.name.trim() : ''
    if (!name) {
      console.error(`[collection-feed] 컬렉션 이름을 찾지 못해 피드를 기록하지 않았다 (userId: ${userId}, itemBookId: ${itemBookId})`)
      return
    }
    await recordFeedEvent(userId, 'collection_tier_completed', { collection_id: itemBookId, collection_name: name, rarity: tier })
  } catch (e) {
    console.error(`[collection-feed] 피드 기록 예외 (userId: ${userId}, itemBookId: ${itemBookId}):`, e)
  }
}

/** 컬렉션 완성 점수를 센다. 던지지 않는다 — 실패하면 기록만 남기고 `{ ok: false }`다. 새로 완성한 등급의 «컬렉션 완성» 피드도 같은 자리에서 기록한다(파일 머리말). */
export async function awardCollectionCompleteScore(supabase: SupabaseClient, input: AwardCollectionCompleteInput): Promise<AwardChapterScoreResult> {
  const { userId, itemBookId, tier } = input
  try {
    // 등급 값이 계약(common·rare·epic·mystic) 밖이면 활동 종류를 정할 수 없다 — 다른 등급으로 대신 세지 않는다
    if (!isChapterCollectionTier(tier)) {
      await recordChapterScoreFailure({
        userId,
        kind: collectionCompleteKind(LEGACY_COLLECTION_TIER),
        sourceId: null,
        error: `컬렉션 완성 등급이 알려진 값이 아니다 (itemBookId: ${itemBookId}, tier: ${String(tier)})`,
      })
      return { ok: false }
    }
    // 피드를 점수보다 먼저 기록한다 — 점수가 챕터를 올리면 «챕터 오름» 피드가 뒤따라 생기므로, 순서가 «컬렉션 완성» → «챕터 오름»으로 남는다
    await recordCollectionCompleteFeed(supabase, userId, itemBookId, tier)
    return await awardChapterScore(supabase, {
      userId,
      kind: collectionCompleteKind(tier),
      sourceId: collectionCompleteSourceId(userId, itemBookId, tier),
    })
  } catch (e) {
    // 원천 id를 만들 수 없는 입력(빈 id 등)이나 예상 밖 예외 — 기록하다 다시 던지지 않는다
    await recordChapterScoreFailure({
      userId,
      kind: isChapterCollectionTier(tier) ? collectionCompleteKind(tier) : collectionCompleteKind(LEGACY_COLLECTION_TIER),
      sourceId: null,
      error: `컬렉션 완성 점수 예외 (itemBookId: ${itemBookId}): ${e instanceof Error ? e.message : String(e)}`,
    })
    return { ok: false }
  }
}

/**
 * 옛 컬렉션(`tier_mode` 꺼짐)의 완성 기록(`user_item_book_completions`)이 있는가. 읽지 못하면 null(«모른다»).
 * 완성 기록은 장착을 풀어도 남는다(마이그레이션 111·157).
 */
export async function hasLegacyCollectionCompletion(supabase: SupabaseClient, userId: string, itemBookId: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from('user_item_book_completions')
      .select('item_book_id')
      .eq('user_id', userId)
      .eq('item_book_id', itemBookId)
      .maybeSingle()
    if (error) {
      console.error(`[chapter-score] 컬렉션 완성 기록 조회 오류 (userId: ${userId}, itemBookId: ${itemBookId}):`, error)
      return null
    }
    return Boolean(data)
  } catch (e) {
    console.error(`[chapter-score] 컬렉션 완성 기록 조회 예외 (userId: ${userId}, itemBookId: ${itemBookId}):`, e)
    return null
  }
}

export interface AwardSlotCollectionScoreInput {
  userId: string
  itemBookId: string
  /** 컬렉션의 `tier_mode` */
  tierMode: boolean
  /** 등급형: 장착 RPC가 돌려준 `completed_tier`(이번 장착으로 새로 완성한 등급, 없으면 null). 옛 컬렉션에서는 쓰지 않는다 */
  completedTier: string | null
  /**
   * 옛 컬렉션: **장착 전에** 읽어 둔 완성 기록 존재 여부(`hasLegacyCollectionCompletion`). 읽지 못했으면 null.
   * 등급형에서는 쓰지 않는다.
   */
  completedBefore: boolean | null
}

/**
 * 컬렉션 장착이 성공한 뒤 «이번 장착으로 새로 완성했는가»를 가려 완성 점수를 센다(장착 라우트의 `after()`에서 부른다). 던지지 않는다.
 * 새로 완성한 것이 아니면 아무것도 하지 않는다(이미 완성한 유저의 재장착은 소급 가산하지 않는다).
 */
export async function awardSlotCollectionScore(supabase: SupabaseClient, input: AwardSlotCollectionScoreInput): Promise<void> {
  const { userId, itemBookId } = input
  try {
    if (input.tierMode) {
      if (input.completedTier) await awardCollectionCompleteScore(supabase, { userId, itemBookId, tier: input.completedTier })
      return
    }

    // 옛 컬렉션 — 장착 전에 이미 완성한 유저는 소급 가산하지 않는다
    if (input.completedBefore === true) return
    const kind = collectionCompleteKind(LEGACY_COLLECTION_TIER)
    if (input.completedBefore === null) {
      await recordChapterScoreFailure({
        userId,
        kind,
        sourceId: collectionCompleteSourceId(userId, itemBookId, LEGACY_COLLECTION_TIER),
        error: `장착 전 컬렉션 완성 기록을 읽지 못해 이번에 새로 완성했는지 알 수 없다 (itemBookId: ${itemBookId}) — 소급 가산을 피하려고 세지 않았다`,
      })
      return
    }

    // 장착 후에 완성 기록이 생겼으면 이번 장착으로 새로 완성한 것이다
    const completedAfter = await hasLegacyCollectionCompletion(supabase, userId, itemBookId)
    if (completedAfter === true) {
      await awardCollectionCompleteScore(supabase, { userId, itemBookId, tier: LEGACY_COLLECTION_TIER })
    } else if (completedAfter === null) {
      await recordChapterScoreFailure({
        userId,
        kind,
        sourceId: collectionCompleteSourceId(userId, itemBookId, LEGACY_COLLECTION_TIER),
        error: `장착 후 컬렉션 완성 기록을 읽지 못해 완성 여부를 알 수 없다 (itemBookId: ${itemBookId})`,
      })
    }
  } catch (e) {
    // 위 호출은 스스로 던지지 않지만 이 함수의 약속이 «절대 던지지 않음»이다
    await recordChapterScoreFailure({
      userId,
      kind: collectionCompleteKind(LEGACY_COLLECTION_TIER),
      sourceId: null,
      error: `컬렉션 장착 점수 예외 (itemBookId: ${itemBookId}): ${e instanceof Error ? e.message : String(e)}`,
    })
  }
}
