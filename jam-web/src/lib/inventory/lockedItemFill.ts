/**
 * 잠긴 아이템 배지 — 채우기·열기·조회 (티켓 20261018_0053, 운영 로직 7.2·7.3절)
 *
 * 채우기는 DB 함수 `locked_item_fill`(잼 원장 한 줄, 개체의 채운 양, 이력이 한 트랜잭션), 열기는 `locked_item_open`(같은 개체를 열린 상태로 바꾸고
 * 포인트를 한 번만 주고 이력을 남긴다)이 한다. 규칙은 캡슐 채우기와 같고, 열기에는 인벤토리 빈칸이 필요 없다. 앱은 정지 확인과 RPC 호출,
 * 응답 모양 만들기만 한다. DB 안에서 포인트를 주므로 `awardPoints`의 알림(`notifyPointChange`)은 이 경로에서 나가지 않는다 — 그래서 열기 성공 뒤
 * 이 파일이 같은 포인트 소식(활동 결산의 «포인트» 꼬리)을 직접 낸다(티켓 20261026_1031). 피드는 만들지 않는다 — 받을 때 `item_dropped`가 이미 나갔다.
 *
 * 열기 전에는 이름·그림·설명·컬렉션·트라이브·일련번호를 어떤 응답에도 싣지 않는다. 열기 성공 응답에만 `loadOpenedInfo`가 읽은 정보를 싣는다.
 *
 * 열기가 확정되면 챕터 점수를 센 다음 퀘스트 완료 처리를 부른다(티켓 20261021_1248, 운영 로직 2.2절). 실제 단계 ③ «잠긴 아이템 배지 열기»가 여기서 끝날 수 있고
 * (동기화로 받은 잠긴 개체를 열어도 된다), 실제 3단계가 다 끝났으면 챕터 1이 시작된다. 던지지 않고, 어떤 실패도 열기와 응답을 바꾸지 않는다(응답에 완료 배지를 싣지 않는다).
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 * 클라이언트가 쓸 타입·상수는 `lockedItemFill-contract.ts`에 있다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { awardChapterScore } from '@/lib/chapter/score'
import { recordActivityRecap } from '@/lib/notifications/recap'
import { recordOnboardingQuestCompletion } from '@/lib/onboarding-quest/completion'
import { assertNotSuspended } from '@/lib/suspension/suspension'
import {
  LOCKED_ITEM_FILL_ERROR_CODES,
  LOCKED_ITEM_OPEN_ERROR_CODES,
  type LockedItemErrorCode,
  type LockedItemFillPayload,
  type LockedItemOpenedInfo,
  type LockedItemOpenPayload,
  type LockedItemRarity,
  type LockedItemStatus,
} from './lockedItemFill-contract'

/** DB 함수가 채우기·열기를 거절했을 때(또는 조회 대상 개체가 없을 때) 던진다. API 라우트가 상태 코드와 문구로 바꾼다. */
export class LockedItemError extends Error {
  readonly code: LockedItemErrorCode
  /** `exceeds_remaining`일 때 채울 수 있는 남은 양 */
  readonly remaining?: number
  /** `not_full`일 때 필요한 양 */
  readonly required?: number
  /** `not_full`일 때 채운 양 */
  readonly filled?: number

  constructor(code: LockedItemErrorCode, detail?: { remaining?: number; required?: number; filled?: number }) {
    super(`잠긴 개체 거절: ${code}`)
    this.name = 'LockedItemError'
    this.code = code
    this.remaining = detail?.remaining
    this.required = detail?.required
    this.filled = detail?.filled
  }
}

interface RpcResult {
  ok?: boolean
  error?: string
  remaining?: number
  required?: number
  filled?: number
}

/** DB 함수의 거절 응답을 `LockedItemError`로 바꿔 던진다. `allowed`에 없는 코드는 일반 오류다. */
function throwRejection(fn: string, result: RpcResult, allowed: readonly string[]): never {
  const code = result.error ?? ''
  if (!allowed.includes(code)) throw new Error(`${fn}이 알 수 없는 거절 코드를 돌려줬다: ${String(result.error)}`)
  throw new LockedItemError(code as LockedItemErrorCode, {
    remaining: code === 'exceeds_remaining' ? result.remaining : undefined,
    required: code === 'not_full' ? result.required : undefined,
    filled: code === 'not_full' ? result.filled : undefined,
  })
}

/**
 * 잠긴 개체를 채운다. `amount`를 생략하면 남은 양이고, 가진 잼이 모자라면 가진 만큼 채운다.
 * 이용 정지 중이면 RPC를 부르기 전에 `UserSuspendedError`를 던진다. DB 함수의 거절은 `LockedItemError`로 바꿔 던진다.
 * RPC 오류나 해석할 수 없는 응답은 일반 `Error`다.
 */
export async function fillLockedItem(supabase: SupabaseClient, userId: string, itemId: string, amount?: number): Promise<LockedItemFillPayload> {
  await assertNotSuspended(supabase, userId)

  const { data, error } = await supabase.rpc('locked_item_fill', { p_user_id: userId, p_item_id: itemId, p_amount: amount ?? null })
  if (error) throw new Error(`locked_item_fill RPC 오류: ${error.message}`)

  const result = data as (RpcResult & { applied?: number; balance?: number }) | null
  if (result?.ok === false) throwRejection('locked_item_fill', result, LOCKED_ITEM_FILL_ERROR_CODES)
  if (
    result?.ok !== true ||
    typeof result.applied !== 'number' ||
    typeof result.required !== 'number' ||
    typeof result.filled !== 'number' ||
    typeof result.remaining !== 'number' ||
    typeof result.balance !== 'number'
  ) {
    throw new Error('locked_item_fill이 해석할 수 없는 응답을 돌려줬다')
  }
  return {
    itemId,
    applied: result.applied,
    required: result.required,
    filled: result.filled,
    remaining: result.remaining,
    balance: result.balance,
    openable: result.filled >= result.required,
  }
}

/**
 * 열린 뒤 보여 줄 개체 정보. 읽지 못하면 던진다(호출부가 «열기는 확정됨»으로 받아 낸다).
 * 이미 내가 가진 개체의 정보라 `deleted_at` 필터를 걸지 않는다 — 배지가 소프트 삭제돼도 연 개체의 이름·그림은 그대로 보여 준다.
 */
async function loadOpenedInfo(supabase: SupabaseClient, badgeId: string): Promise<LockedItemOpenedInfo | null> {
  const { data: badgeRow, error: badgeError } = await supabase
    .from('badges')
    .select('name, image_url, description, rarity, item_book_id, tribe_id')
    .eq('id', badgeId)
    .maybeSingle()
  if (badgeError) throw new Error(`badges 조회 실패: ${badgeError.message}`)
  const badge = badgeRow as {
    name: string
    image_url: string | null
    description: string | null
    rarity: LockedItemRarity | null
    item_book_id: string | null
    tribe_id: string | null
  } | null
  if (!badge) return null

  let collection: LockedItemOpenedInfo['collection'] = null
  let tribeId = badge.tribe_id
  if (badge.item_book_id) {
    const { data: bookRow, error: bookError } = await supabase.from('item_books').select('id, name, tribe_id').eq('id', badge.item_book_id).maybeSingle()
    if (bookError) throw new Error(`item_books 조회 실패: ${bookError.message}`)
    const book = bookRow as { id: string; name: string; tribe_id: string | null } | null
    if (book) {
      collection = { id: book.id, name: book.name }
      tribeId = tribeId ?? book.tribe_id
    }
  }

  let tribe: LockedItemOpenedInfo['tribe'] = null
  if (tribeId) {
    const { data: tribeRow, error: tribeError } = await supabase.from('tribes').select('id, name').eq('id', tribeId).maybeSingle()
    if (tribeError) throw new Error(`tribes 조회 실패: ${tribeError.message}`)
    const found = tribeRow as { id: string; name: string } | null
    if (found) tribe = { id: found.id, name: found.name }
  }

  return {
    name: badge.name,
    imageUrl: badge.image_url,
    description: badge.description ?? '',
    rarity: badge.rarity,
    collection,
    tribe,
  }
}

/**
 * 열린 개체의 일련번호 접두사(앞 4자). 열기 응답이 `ItemSerialCode`로 번호를 그릴 수 있게 싣는다 — 열린 뒤에만 읽는다.
 * 읽지 못하면 던진다(호출부가 null로 받아 낸다).
 */
async function loadSerialPrefix(supabase: SupabaseClient, itemId: string): Promise<string | null> {
  const { data, error } = await supabase.from('inventory_items').select('serial_prefix').eq('id', itemId).maybeSingle()
  if (error) throw new Error(`inventory_items 조회 실패: ${error.message}`)
  const prefix = (data as { serial_prefix?: string | null } | null)?.serial_prefix
  return typeof prefix === 'string' && prefix !== '' ? prefix : null
}

/**
 * 가득 찬 잠긴 개체를 연다. 인벤토리 빈칸은 필요 없고 새로 뽑지 않는다. 이용 정지 중이면 RPC를 부르기 전에 `UserSuspendedError`를 던진다.
 * DB 함수의 거절은 `LockedItemError`다. 열기가 확정된 뒤 개체 정보를 읽지 못하면 열기를 되돌리지 않고 `item: null`로 돌려준다.
 */
export async function openLockedItem(supabase: SupabaseClient, userId: string, itemId: string): Promise<LockedItemOpenPayload> {
  await assertNotSuspended(supabase, userId)

  const { data, error } = await supabase.rpc('locked_item_open', { p_user_id: userId, p_item_id: itemId })
  if (error) throw new Error(`locked_item_open RPC 오류: ${error.message}`)

  const result = data as (RpcResult & { badgeId?: string; serialNumber?: number | null; pointsAwarded?: number }) | null
  if (result?.ok === false) throwRejection('locked_item_open', result, LOCKED_ITEM_OPEN_ERROR_CODES)
  if (result?.ok !== true || typeof result.badgeId !== 'string' || typeof result.pointsAwarded !== 'number') {
    throw new Error('locked_item_open이 해석할 수 없는 응답을 돌려줬다')
  }

  // 여기부터는 열기가 확정됐다. 정보를 읽지 못해도 열기를 실패로 돌려주지 않는다.
  // 챕터 점수 «잠긴 아이템 배지 열기» (티켓 20261019_1315, 운영 로직 12.2절). 원천 id는 개체 id다 — 개체는 한 번만 열리고(두 번째는 `not_locked`)
  // 같은 개체를 다시 보내도 한 번만 센다. 던지지 않는다(실패는 기록만 남는다).
  await awardChapterScore(supabase, { userId, kind: 'locked_item_badge_open', sourceId: itemId })
  // 퀘스트 실제 단계 ③ «잠긴 아이템 배지 열기»(티켓 20261021_1248). 점수 다음이다. 완료 처리는 던지지 않지만, 어떤 실패도 열기와 응답을 바꾸지 않도록 한 번 더 감싼다.
  try {
    await recordOnboardingQuestCompletion(supabase, userId)
  } catch (e) {
    console.error(`[locked-item] 퀘스트 완료 처리 실패 — 열기는 유지한다 (userId: ${userId}, itemId: ${itemId}):`, e)
  }
  // 포인트 소식(티켓 20261026_1031). 열린 채 받을 때와 같은 활동 결산의 «포인트» 꼬리이고 피드는 만들지 않는다. 포인트는 RPC 안에서 이미 지급됐으므로
  // 소식이 실패해도 열기와 응답을 막지 않는다. RPC는 `point_awarded_at`이 비었을 때만 0보다 큰 값을 돌려주고 두 번째 열기는 `not_locked`로 거절하므로 한 번만 나간다.
  if (result.pointsAwarded > 0) {
    try {
      await recordActivityRecap(userId, { points: result.pointsAwarded }, { client: supabase })
    } catch (e) {
      console.error(`[locked-item] 포인트 소식 기록 실패 — 열기는 유지한다 (userId: ${userId}, itemId: ${itemId}):`, e)
    }
  }

  let info: LockedItemOpenedInfo | null = null
  try {
    info = await loadOpenedInfo(supabase, result.badgeId)
  } catch (e) {
    console.error(`[locked-item] 열기 뒤 개체 정보 조회 실패 — 정보 없이 돌려준다 (userId: ${userId}, itemId: ${itemId}):`, e)
  }
  let serialPrefix: string | null = null
  try {
    serialPrefix = await loadSerialPrefix(supabase, itemId)
  } catch (e) {
    console.error(`[locked-item] 열기 뒤 일련번호 접두사 조회 실패 — 접두사 없이 돌려준다 (userId: ${userId}, itemId: ${itemId}):`, e)
  }
  return {
    itemId,
    badgeId: result.badgeId,
    serialNumber: typeof result.serialNumber === 'number' ? result.serialNumber : null,
    serialPrefix,
    pointsAwarded: result.pointsAwarded,
    item: info,
  }
}

/**
 * 내 잠긴 개체의 채운 양·필요량·가진 잼·열 수 있는지. 내 것이 아니거나 버려지거나 드랍된 개체는 `LockedItemError('item_not_found')`다.
 * 이름·그림·설명·컬렉션·트라이브·일련번호는 읽지도 싣지도 않는다. 내 상태 보기라 이용 정지 중에도 막지 않는다. 읽지 못하면 던진다.
 */
export async function getLockedItemStatus(supabase: SupabaseClient, userId: string, itemId: string): Promise<LockedItemStatus> {
  const { data: itemRow, error: itemError } = await supabase
    .from('inventory_items')
    .select('id, inventory_id, locked, unlock_required, unlock_filled, destroyed_at, dropped_at')
    .eq('id', itemId)
    .maybeSingle()
  if (itemError) throw new Error(`inventory_items 조회 실패: ${itemError.message}`)
  const item = itemRow as {
    inventory_id: string | null
    locked: boolean
    unlock_required: number | null
    unlock_filled: number
    destroyed_at: string | null
    dropped_at: string | null
  } | null
  if (!item || !item.inventory_id || item.destroyed_at || item.dropped_at) throw new LockedItemError('item_not_found')

  const { data: inventoryRow, error: inventoryError } = await supabase.from('inventory').select('user_id').eq('id', item.inventory_id).maybeSingle()
  if (inventoryError) throw new Error(`inventory 조회 실패: ${inventoryError.message}`)
  if ((inventoryRow as { user_id?: string } | null)?.user_id !== userId) throw new LockedItemError('item_not_found')

  const { data: wallet, error: walletError } = await supabase.from('jam_wallets').select('balance').eq('user_id', userId).maybeSingle()
  if (walletError) throw new Error(`jam_wallets 조회 실패: ${walletError.message}`)
  const balance = (wallet as { balance?: number } | null)?.balance ?? 0

  const required = item.unlock_required
  const filled = item.unlock_filled
  return {
    itemId,
    locked: item.locked,
    required,
    filled,
    remaining: required === null ? 0 : Math.max(0, required - filled),
    balance,
    openable: item.locked && required !== null && filled >= required,
  }
}
