/**
 * 컬렉션 완성 판정 공용 함수 (티켓 20260921_1110, 상위 20260914_1130, 통일 20261016_2340 2회)
 *
 * 통일 기준은 실제로 완성 기록을 남기는 DB 함수(마이그레이션 179 `slot_item_into_book`,
 * 222 `slot_item_into_book_tiered`)다. 같은 사례표(`__tests__/fixtures/completion-parity-cases.json`)로
 * 코드와 SQL(`supabase/tests/222_completion_parity.test.sql`)을 함께 고정한다.
 *
 * 규칙
 * - 소프트 삭제 배지(`deleted_at`)는 분모에서 뺀다. 입구에서 걸러 분자에도 들지 않는다.
 * - 분모 배지 종류는 `COMPLETION_BADGE_TYPES`(item + checkin)다. `types`로 좁힐 수 있다.
 * - 분모는 컬렉션 소속 배지에서 `drop_excluded = true`를 뺀 id 집합이다(티켓 20260911_2236).
 *   예외(티켓 20260921_1142): 제외를 뺀 분모가 비고 등록 배지가 1개 이상이면 등록 배지 전체가 분모다.
 * - 분자는 채운 배지 id 집합과 분모의 교집합 크기다. 컬렉션별 집합(`filledByBook`)을 주면 그 컬렉션의
 *   슬롯만 센다(티켓 20260924_0937).
 * - `tier_mode` 컬렉션(`tierModeBookIds`)은 등급(`rarity`)마다 따로 센다: 분모는 그 등급의 «이름 수»,
 *   분자는 그 등급에서 채운 «이름 수»다(222와 같게, 그 등급이 전부 드랍 제외이면 제외 없이 센다).
 *   컬렉션 등급(`tier`)은 저장하지 않고 채운 배지의 등급에서 읽는다. 최상위 필드
 *   (`denomIds`·`filledIds`·`total`·`filled`·`complete`)는 그 등급 기준이다.
 *
 * 순수 함수다. DB 조회는 호출부(checker·completable·화면·API)가 한다.
 */
import { buildBadgeIdsOfBook } from '@/lib/drop-engine'

/** 완성 분모에 들어가는 배지 종류 기본값 */
export const COMPLETION_BADGE_TYPES = ['item', 'checkin'] as const

/** 등급 순서(`badge_rarity`). 컬렉션 등급 판별과 최상위 필드의 기본 등급 선택에 쓴다 */
export const COMPLETION_TIER_ORDER = ['common', 'rare', 'epic', 'mystic'] as const

export interface CompletionBadgeInput {
  id: string
  item_book_id: string | null
  type: string
  drop_excluded: boolean | null
  /** `tier_mode` 컬렉션에서만 쓴다. 비면 배지 id를 이름으로 본다 */
  name?: string | null
  /** `tier_mode` 컬렉션에서만 쓴다. 등급이 비면 어느 등급 칸에도 들지 않는다 */
  rarity?: string | null
  /** 값이 있으면 소프트 삭제된 배지라 판정에서 뺀다 */
  deleted_at?: string | null
}

export interface TierCompletion {
  /** 그 등급의 분모 배지 id (드랍 제외 적용, 전부 제외이면 등록 배지 전체) */
  denomIds: string[]
  /** 분모 배지 중 채운 id */
  filledIds: string[]
  /** 분모 «이름 수» */
  total: number
  /** 채운 «이름 수» */
  filled: number
  complete: boolean
}

export interface BookCompletion {
  denomIds: string[]
  filledIds: string[]
  total: number
  filled: number
  complete: boolean
  /** `tier_mode` 컬렉션에서 채운 배지의 등급. 아무것도 안 꽂았거나 옛 컬렉션이면 null */
  tier: string | null
  /** `tier_mode` 컬렉션의 등급별 판정. 옛 컬렉션은 빈 객체 */
  tiers: Record<string, TierCompletion>
}

const EMPTY_SET: ReadonlySet<string> = new Set()

function computeTierCompletion(
  registered: readonly CompletionBadgeInput[],
  filledSet: ReadonlySet<string>
): TierCompletion {
  const withoutExcluded = registered.filter((b) => !b.drop_excluded)
  // 222와 같은 예외: 그 등급이 전부 드랍 제외이면 제외 없이 센다
  const denom = withoutExcluded.length > 0 ? withoutExcluded : registered
  const denomIds = denom.map((b) => b.id)
  const filledBadges = denom.filter((b) => filledSet.has(b.id))
  const nameOf = (b: CompletionBadgeInput) => b.name ?? b.id
  const total = new Set(denom.map(nameOf)).size
  const filled = new Set(filledBadges.map(nameOf)).size
  return {
    denomIds,
    filledIds: filledBadges.map((b) => b.id),
    total,
    filled,
    complete: total > 0 && filled >= total,
  }
}

export function computeBookCompletion(
  badges: CompletionBadgeInput[],
  filledBadgeIds: ReadonlySet<string>,
  options?: {
    /** 분모 배지 종류. 기본 `COMPLETION_BADGE_TYPES`(item + checkin) */
    types?: readonly string[]
    /**
     * 북별 채운 배지 집합(티켓 20260924_0937). 있으면 각 북의 분자를 그 북의 집합으로만 센다
     * (집합에 없는 북은 빈 집합). 없으면 `filledBadgeIds` 하나를 모든 북에 공통으로 쓴다.
     * 장착 RPC(mig/179)처럼 "그 컬렉션에 장착된 슬롯만" 세야 하는 호출부(checker)가 쓴다.
     */
    filledByBook?: ReadonlyMap<string, ReadonlySet<string>>
    /** `item_books.tier_mode`가 켜진 컬렉션 id. 이 컬렉션은 등급별 이름 수로 센다 */
    tierModeBookIds?: ReadonlySet<string>
  }
): Map<string, BookCompletion> {
  const types = options?.types ?? COMPLETION_BADGE_TYPES
  const filledByBook = options?.filledByBook
  const tierModeBookIds = options?.tierModeBookIds
  // 소프트 삭제 행은 입구에서 뺀다(179·222 SQL과 같음)
  const target = badges.filter((b) => !b.deleted_at && types.includes(b.type))
  const denomByBook = buildBadgeIdsOfBook(
    target.map((b) => ({
      id: b.id,
      item_book_id: b.item_book_id ?? '',
      drop_excluded: b.drop_excluded ?? false,
    })) as Parameters<typeof buildBadgeIdsOfBook>[0]
  )

  const registeredByBook = new Map<string, CompletionBadgeInput[]>()
  for (const b of target) {
    if (!b.item_book_id) continue
    const key = b.item_book_id
    const list = registeredByBook.get(key)
    if (list) list.push(b)
    else registeredByBook.set(key, [b])
  }

  const result = new Map<string, BookCompletion>()
  for (const [bookId, registeredBadges] of registeredByBook) {
    const filledSet = filledByBook ? (filledByBook.get(bookId) ?? EMPTY_SET) : filledBadgeIds

    if (tierModeBookIds?.has(bookId)) {
      const tiers: Record<string, TierCompletion> = {}
      let tier: string | null = null
      let firstTier: string | null = null
      for (const rarity of COMPLETION_TIER_ORDER) {
        const inTier = registeredBadges.filter((b) => b.rarity === rarity)
        if (inTier.length === 0) continue
        tiers[rarity] = computeTierCompletion(inTier, filledSet)
        firstTier ??= rarity
        // 컬렉션 등급 = 채운 배지의 등급(드랍 제외 배지도 등급을 정한다). 섞여 있으면 순서가 앞선 등급
        if (tier === null && inTier.some((b) => filledSet.has(b.id))) tier = rarity
      }
      const shown = tier ?? firstTier
      const base = shown ? tiers[shown] : null
      result.set(bookId, {
        denomIds: base?.denomIds ?? [],
        filledIds: base?.filledIds ?? [],
        total: base?.total ?? 0,
        filled: base?.filled ?? 0,
        complete: base?.complete ?? false,
        tier,
        tiers,
      })
      continue
    }

    const registered = registeredBadges.map((b) => b.id)
    const excludedApplied = denomByBook.get(bookId) ?? []
    const denomIds =
      excludedApplied.length === 0 && registered.length > 0 ? registered : excludedApplied
    const filledIds = denomIds.filter((id) => filledSet.has(id))
    result.set(bookId, {
      denomIds,
      filledIds,
      total: denomIds.length,
      filled: filledIds.length,
      complete: denomIds.length > 0 && filledIds.length >= denomIds.length,
      tier: null,
      tiers: {},
    })
  }
  return result
}

/**
 * 화면·API가 쓰는 완성 표시 판정: 옛 완성 기록이 있거나 계산상 완성이면 완성이다.
 * 옛 기록은 장착을 풀어도 남으므로 기록이 있으면 계산이 미완성이어도 완성으로 본다.
 */
export function isBookCompleted(
  recordedBookIds: ReadonlySet<string>,
  bookId: string,
  completion: BookCompletion | undefined
): boolean {
  return recordedBookIds.has(bookId) || (completion?.complete ?? false)
}
