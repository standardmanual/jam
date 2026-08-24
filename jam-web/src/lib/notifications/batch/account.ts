/**
 * ⑧ 계정·시스템 배치 — #41 동기화 지연 / #42 인벤토리 포화 (티켓 20260825_002)
 * 스펙: PRD §3 ⑧, §6-2(T3 동적 재평가)
 *
 * 판정 상수는 **`warning.ts`에서 import한다.** 값을 복사하면 소식을 만드는 기준과 경고를
 * 유지하는 기준이 갈라져, 보내자마자 일반 텍스트로 강등되는(또는 그 반대) 소식이 생긴다.
 *
 * ## #42 — 문구와 임계값의 어긋남 해소 (티켓 §3-5)
 *
 * `INVENTORY_LOW_SLOTS_THRESHOLD`는 "잔여 3칸 이하"인데 문구는 「인벤토리가 꽉 찼어요」다.
 * 잔여 3칸인 유저에게 사실과 다른 문장이 나간다. **(가) 생성 조건을 잔여 0칸으로 좁힌다**를
 * 택했다 — 이 티켓은 문구를 만들지 않기로 못박혀 있고(§4), 021의 렌더러·PRD §3 표를 고치는
 * 것은 범위 밖이기 때문이다. 상수는 여전히 import해 **후보 스캔**에 쓰고, 생성은
 * `INVENTORY_FULL_REMAINING_SLOTS`(0)로 한 번 더 좁힌다. T3 경고 재평가는 기존대로
 * 잔여 3칸 이하까지 경고를 유지하므로, "칸을 하나 비웠다고 경고가 사라지는" 일도 없다.
 */
import { scopedGroupKey } from '@/lib/notifications/groupKey'
import { kstDateString } from '@/lib/notifications/kst'
import {
  INVENTORY_LOW_SLOTS_THRESHOLD,
  SYNC_STALLED_DAYS,
} from '@/lib/notifications/warning'
import {
  DAY_MS,
  fetchAllRows,
  type BatchContext,
  type NotificationDraft,
} from './shared'

/** #42 생성 조건 — 문구가 「꽉 찼어요」이므로 실제로 꽉 찬 경우에만 만든다 */
export const INVENTORY_FULL_REMAINING_SLOTS = 0

/**
 * #42 재고지 간격. 꽉 찬 상태가 유지되는 동안 매일 보내면 PRD §2-4가 금지한 반복 발송이
 * 된다. 이미 만든 소식은 T3 재평가로 계속 경고 스타일을 유지하므로 매일 알릴 이유가 없다.
 */
export const INVENTORY_FULL_RENOTIFY_DAYS = 7

export interface SyncStalledInput {
  connections: { userId: string; lastSyncedAt: string | null; createdAt: string }[]
  startedAt: Date
}

/**
 * #41 동기화 지연 (순수 함수 — 테스트 대상).
 *
 * **`days`가 0이면 만들지 않는다**(§3-3). `SYNC_STALLED_DAYS` 이상만 통과시키므로
 * 구조적으로 0이 될 수 없지만, 임계값이 0으로 바뀌어도 새지 않도록 한 번 더 막는다.
 *
 * `group_key`는 **정체 구간의 시작일**이다. 상태가 유지되는 동안에는 키가 같아 `once`가
 * 막고, 다시 동기화하면 기준 시각이 바뀌어 다음 정체 때 새 소식이 나간다.
 */
export function selectSyncStalledDrafts(input: SyncStalledInput): NotificationDraft[] {
  const drafts: NotificationDraft[] = []
  for (const conn of input.connections) {
    const baseline = conn.lastSyncedAt ?? conn.createdAt
    const baseMs = new Date(baseline).getTime()
    if (Number.isNaN(baseMs)) continue
    const days = Math.floor((input.startedAt.getTime() - baseMs) / DAY_MS)
    if (days < SYNC_STALLED_DAYS) continue
    if (days <= 0) continue

    drafts.push({
      userId: conn.userId,
      type: 'sync_stalled',
      payload: { days },
      groupKey: scopedGroupKey('sync_stalled', kstDateString(baseline)),
      mode: 'once',
    })
  }
  return drafts
}

export interface InventoryFullInput {
  inventories: { userId: string; maxSlots: number; usedSlots: number }[]
  /** 최근 `INVENTORY_FULL_RENOTIFY_DAYS` 안에 이미 #42를 받은 유저 */
  recentlyNotified: Set<string>
  today: string
}

/**
 * #42 인벤토리 포화 (순수 함수 — 테스트 대상).
 *
 * **`max_slots`가 0 이하면 만들지 않는다**(§3-3). 렌더러가 `{maxSlots}`를 슬롯으로 쓰므로
 * "0개까지만 보관할 수 있어서…"가 그대로 나간다.
 */
export function selectInventoryFullDrafts(input: InventoryFullInput): NotificationDraft[] {
  const drafts: NotificationDraft[] = []
  for (const inv of input.inventories) {
    if (inv.maxSlots <= 0) continue
    const remaining = inv.maxSlots - inv.usedSlots
    // 후보 스캔은 warning.ts의 상수, 실제 생성은 "잔여 0칸"으로 좁힌다 (위 문서 주석 참고)
    if (remaining > INVENTORY_LOW_SLOTS_THRESHOLD) continue
    if (remaining > INVENTORY_FULL_REMAINING_SLOTS) continue
    if (input.recentlyNotified.has(inv.userId)) continue

    drafts.push({
      userId: inv.userId,
      type: 'inventory_full',
      payload: { max_slots: inv.maxSlots, used_slots: inv.usedSlots },
      groupKey: scopedGroupKey('inventory_full', input.today),
      mode: 'once',
    })
  }
  return drafts
}

export async function buildSyncStalledDrafts(ctx: BatchContext): Promise<NotificationDraft[]> {
  const { supabase, startedAt } = ctx
  const rows = await fetchAllRows<{ user_id: string; last_synced_at: string | null; created_at: string }>(
    'strava_connections',
    (from, to) =>
      supabase
        .from('strava_connections')
        .select('user_id, last_synced_at, created_at')
        .range(from, to)
  )
  return selectSyncStalledDrafts({
    connections: rows.map((r) => ({
      userId: r.user_id,
      lastSyncedAt: r.last_synced_at,
      createdAt: r.created_at,
    })),
    startedAt,
  })
}

export async function buildInventoryFullDrafts(ctx: BatchContext): Promise<NotificationDraft[]> {
  const { supabase, startedAt, today } = ctx

  const rows = await fetchAllRows<{ user_id: string; max_slots: number; used_slots: number }>(
    'inventory(slots)',
    (from, to) => supabase.from('inventory').select('user_id, max_slots, used_slots').range(from, to)
  )
  const inventories = rows.map((r) => ({
    userId: r.user_id,
    maxSlots: r.max_slots,
    usedSlots: r.used_slots,
  }))

  const candidates = inventories.filter(
    (inv) => inv.maxSlots > 0 && inv.maxSlots - inv.usedSlots <= INVENTORY_FULL_REMAINING_SLOTS
  )
  if (candidates.length === 0) return []

  const cutoff = new Date(
    startedAt.getTime() - INVENTORY_FULL_RENOTIFY_DAYS * DAY_MS
  ).toISOString()
  const recent = await fetchAllRows<{ user_id: string }>('notifications(inventory_full)', (from, to) =>
    supabase
      .from('notifications')
      .select('user_id')
      .eq('type', 'inventory_full')
      .in('user_id', candidates.map((c) => c.userId))
      .gte('created_at', cutoff)
      .range(from, to)
  )

  return selectInventoryFullDrafts({
    inventories: candidates,
    recentlyNotified: new Set(recent.map((r) => r.user_id)),
    today,
  })
}
