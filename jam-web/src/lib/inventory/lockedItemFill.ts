/**
 * 잠긴 아이템 배지 — 채우기·열기·조회 (티켓 20261018_0053, 운영 로직 7.2·7.3절)
 *
 * 채우기는 DB 함수 `locked_item_fill`(잼 원장 한 줄, 개체의 채운 양, 이력이 한 트랜잭션), 열기는 `locked_item_open`(같은 개체를 열린 상태로 바꾸고
 * 포인트를 한 번만 주고 이력을 남긴다)이 한다. 규칙은 캡슐 채우기와 같고, 열기에는 인벤토리 빈칸이 필요 없다. 앱은 정지 확인과 RPC 호출,
 * 응답 모양 만들기만 한다. DB 안에서 포인트를 주므로 `awardPoints`의 알림(`notifyPointChange`)은 이 경로에서 나가지 않는다 — 그래서 열기 성공 뒤
 * 이 파일이 같은 포인트 소식(활동 결산의 «포인트» 꼬리)을 직접 낸다(티켓 20261026_1031).
 * 활동 피드도 이 파일이 올린다. 잠긴 채 받은 개체는 받을 때 포인트도 피드도 건너뛰므로(`recordIssuedRewards`, 7.3절 가림 원칙) 열 때가 `item_dropped`를 처음 올리는 때다.
 * 칸은 열린 채 받은 개체의 피드와 같고(`recordItemDroppedFeed`) 시각은 연 때다(티켓 20261026_1031, 사용자 결정 2026-10-26).
 * 단 동기화로 받은 잠긴 개체만 올린다. 캡슐을 열어 나온 개체는 잠긴 채여도 열 때 올리지 않는다 — 남의 뽑기 결과를 보여 주면 뽑기를 부추기므로 캡슐 개봉 결과는 피드에
 * 올리지 않는다는 기존 결정(15.3절, 2026-10-10)을 지킨다(사용자 결정 2026-10-26). 출처는 발급 기록 `item_issue_log.route`로 가른다(`CAPSULE_ISSUE_ROUTE`).
 *
 * 열기 전에는 이름·그림·설명·컬렉션·트라이브·일련번호를 어떤 응답에도 싣지 않는다. 열기 성공 응답에만 `loadOpenedInfo`가 읽은 정보를 싣는다.
 *
 * 열기가 확정되면 서비스 활동 잼(`locked_unlock`)을 지급한 다음 퀘스트 완료 처리를 부른다(티켓 20261021_1248, 운영 로직 2.2절). 실제 단계 ③ «잠긴 아이템 배지 열기»가 여기서 끝날 수 있고
 * (동기화로 받은 잠긴 개체를 열어도 된다), 실제 3단계가 다 끝났으면 챕터 1이 시작된다. 던지지 않고, 어떤 실패도 열기와 응답을 바꾸지 않는다(응답에 완료 배지를 싣지 않는다).
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 * 클라이언트가 쓸 타입·상수는 `lockedItemFill-contract.ts`에 있다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { CAPSULE_ISSUE_ROUTE } from '@/lib/capsule/open'
import { awardServiceJam } from '@/lib/jam/serviceActivity'
import { recordItemDroppedFeed } from '@/lib/drop-engine/issueFollowUp'
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
 * 이 개체를 처음 발급한 경로(`item_issue_log.route`). 발급 기록 행이 없으면 null이다(운영자가 지정한 개체 등 동기화·캡슐이 아닌 경로).
 * 발급 기록은 개체마다 한 줄이 원칙(동기화·캡슐 지급 때 한 번씩 적는다)이고 개체 id에 유일 제약은 없으므로, 여러 줄이어도 가장 앞선 줄(`created_at`, 같으면 `id`) 하나로 정한다.
 * 이 표는 service_role만 읽는다. 읽지 못하면 던진다(호출부가 «피드를 올리지 않음»으로 받아 낸다).
 */
async function loadIssueRoute(supabase: SupabaseClient, itemId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('item_issue_log')
    .select('route')
    .eq('inventory_item_id', itemId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`item_issue_log 조회 실패: ${error.message}`)
  const route = (data as { route?: string | null } | null)?.route
  return typeof route === 'string' ? route : null
}

/**
 * 연 개체를 활동 피드에 올려도 되는가. 캡슐에서 나온 개체(`route = 'capsule'`)만 아니다 — 캡슐 개봉 결과는 피드에 올리지 않는다(운영 로직 15.3절, 2026-10-10 사용자 결정).
 * 동기화로 받은 개체와 발급 기록이 없는 개체는 올린다. 경로를 읽지 못하면 올리지 않고 기록만 남긴다 — 캡슐 제외 결정을 어기느니 피드를 빼는 쪽이 안전하다. 던지지 않는다.
 */
async function canPostOpenedFeed(supabase: SupabaseClient, userId: string, itemId: string): Promise<boolean> {
  try {
    return (await loadIssueRoute(supabase, itemId)) !== CAPSULE_ISSUE_ROUTE
  } catch (e) {
    console.error(`[locked-item] 발급 경로 조회 실패 — 캡슐 출처인지 알 수 없어 피드를 올리지 않는다 (userId: ${userId}, itemId: ${itemId}):`, e)
    return false
  }
}

/**
 * 가득 찬 잠긴 개체를 연다. 인벤토리 빈칸은 필요 없고 새로 뽑지 않는다. 이용 정지 중이면 RPC를 부르기 전에 `UserSuspendedError`를 던진다.
 * DB 함수의 거절은 `LockedItemError`다. 열기가 확정된 뒤 개체 정보를 읽지 못하면 열기를 되돌리지 않고 `item: null`로 돌려준다.
 * 열기가 확정되면 포인트 소식(`pointsAwarded`가 0보다 클 때)과 활동 피드 `item_dropped`(개체 정보를 읽었고 캡슐 출처가 아닐 때)를 한 번씩 낸다. 둘 다 서로와 열기 응답에 영향을 주지 않는다.
 * 캡슐에서 나온 잠긴 개체는 열어도 피드를 올리지 않는다(포인트 소식은 그대로 나간다). 동기화로 받은 개체와 발급 기록이 없는 개체만 올리고, 경로를 읽지 못해도 올리지 않는다.
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
  // 서비스 활동 잼 «잠긴 아이템 배지 열기» (티켓 20261028_1735 3회, 옛 챕터 점수 자리). 원천 id는 개체 id다 — 개체는 한 번만 열리고(두 번째는 `not_locked`)
  // 같은 개체를 다시 보내도 한 번만 지급한다. 던지지 않는다(실패는 기록만 남는다).
  await awardServiceJam(supabase, { userId, kind: 'locked_unlock', sourceId: itemId })
  // 퀘스트 실제 단계 ③ «잠긴 아이템 배지 열기»(티켓 20261021_1248). 잼 지급 다음이다. 완료 처리는 던지지 않지만, 어떤 실패도 열기와 응답을 바꾸지 않도록 한 번 더 감싼다.
  try {
    await recordOnboardingQuestCompletion(supabase, userId)
  } catch (e) {
    console.error(`[locked-item] 퀘스트 완료 처리 실패 — 열기는 유지한다 (userId: ${userId}, itemId: ${itemId}):`, e)
  }
  // 포인트 소식(티켓 20261026_1031). 열린 채 받을 때와 같은 활동 결산의 «포인트» 꼬리다(피드는 아래에서 따로 올린다). 포인트는 RPC 안에서 이미 지급됐으므로
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
  // 활동 피드 `item_dropped`(티켓 20261026_1031, 사용자 결정 2026-10-26). 잠긴 채 받은 개체는 받을 때 피드가 없으므로(7.3절 가림 원칙) 열 때 처음 올린다.
  // 칸은 열린 채 받은 개체와 같고 시각은 연 때(생략 = DB 기본값 지금)이며 활동에는 묶지 않는다. 포인트가 없어도 올린다 — 포인트를 준 경우에만 `point_reward`를 싣는다.
  // 단 캡슐에서 나온 개체는 올리지 않는다(15.3절 «캡슐을 열어 나온 아이템 배지는 피드에 올리지 않는다», 사용자 결정 2026-10-26) — 발급 기록의 경로가 `capsule`이면 건너뛰고,
  // 동기화(`sync`)이거나 발급 기록이 없으면 올리며, 경로를 읽지 못하면 올리지 않는다(`canPostOpenedFeed`). 포인트 소식은 이 판정과 무관하게 위에서 이미 나갔다.
  // 개체 정보를 읽지 못했으면 이름·그림 없이 올릴 수 없으니 올리지 않는다. 실패해도 열기와 응답을 막지 않는다. 두 번째 열기는 RPC가 `not_locked`로 거절해 여기까지 오지 않으므로 한 번만 올라간다.
  if (info) {
    if (await canPostOpenedFeed(supabase, userId, itemId)) {
      try {
        await recordItemDroppedFeed({
          userId,
          inventoryItemId: itemId,
          badge: { id: result.badgeId, name: info.name, image_url: info.imageUrl },
          rarity: info.rarity,
          tribeName: info.tribe?.name ?? '',
          pointReward: result.pointsAwarded,
        })
      } catch (e) {
        console.error(`[locked-item] 피드 기록 실패 — 열기는 유지한다 (userId: ${userId}, itemId: ${itemId}):`, e)
      }
    }
  } else {
    console.error(`[locked-item] 개체 정보가 없어 피드를 올리지 않는다 (userId: ${userId}, itemId: ${itemId})`)
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
