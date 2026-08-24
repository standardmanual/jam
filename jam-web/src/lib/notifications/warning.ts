/**
 * ⑧ 계정·시스템 소식의 경고 스타일 — **동적 재평가** (티켓 20260824_021)
 * 스펙: Specs/PRD/Notification/PRD.md §6-2 / DATA_MODEL.md §2-3(T3)
 *
 * ## 왜 저장하지 않는가
 *
 * 알림함 진입은 곧 "확인했다"는 신호지만, **조치가 필요한 상태는 확인만으로 해결되지 않는다.**
 * 경고 여부를 행에 박제하면 "인벤토리를 비웠는데 아직 경고가 떠 있는" 상태가 남는다.
 * 그래서 경고 스타일은 렌더 시점에 **현재 상태를 조회해** 결정하고, 해소되면 일반 텍스트로
 * 강등한다. 히스토리(그때 이런 일이 있었다)는 그대로 보존된다.
 *
 * | 소식 | 경고 유지 조건 | 해소되면 |
 * |---|---|---|
 * | 40 Strava 끊김 | Strava 동기화 연결이 여전히 없음 | 강등 |
 * | 41 동기화 지연 | 마지막 sync가 여전히 3일+ 경과 | 강등 |
 * | 42 인벤토리 포화 | 잔여 슬롯이 여전히 부족 | 강등 |
 * | 44 포인트가 빠져나감 | 항상 유지 (되돌릴 수 없는 사건) | — |
 */
import type { NotificationType } from '@/types/database'

/** 경고 스타일 후보 4종. 실제 적용 여부는 아래 판정 함수가 현재 상태로 결정한다 */
export const WARNING_CANDIDATE_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'strava_disconnected',
  'sync_stalled',
  'inventory_full',
  'admin_points_changed',
])

/** #41 판정 기준 — 마지막 동기화 이후 이 일수 이상 지나면 "지연" (022 배치의 생성 기준과 동일) */
export const SYNC_STALLED_DAYS = 3

/** #42 판정 기준 — 잔여 슬롯이 이 값 이하면 "포화 근접" (022 배치의 생성 기준과 동일) */
export const INVENTORY_LOW_SLOTS_THRESHOLD = 3

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 경고 판정에 필요한 **현재** 상태. 필요한 소식이 페이지에 있을 때만 조회한다.
 * 값이 `undefined`면 "조회하지 않음"이라 판정을 보수적으로(경고 유지) 둔다.
 */
export interface NotificationWarningState {
  /** Strava 동기화 연결이 살아 있는가 */
  stravaConnected?: boolean
  /** 마지막 동기화 시각 (ISO). 연결이 없거나 한 번도 안 했으면 null */
  lastSyncedAt?: string | null
  /** 인벤토리 잔여 슬롯 */
  inventoryRemainingSlots?: number
}

/**
 * 이 소식을 지금도 경고로 보여줄 것인가.
 *
 * @param now 판정 기준 시각 — 목록 전체가 같은 시점으로 판정되도록 호출부가 한 번 캡처해 넘긴다
 */
export function isWarningNotification(
  type: NotificationType,
  payload: Record<string, unknown>,
  state: NotificationWarningState,
  now: Date = new Date()
): boolean {
  switch (type) {
    case 'strava_disconnected':
      // 토큰 유효성은 실제 갱신을 시도해야 알 수 있으므로 "연결 자체가 있는가"로 판정한다.
      // 다시 동기화하면 연결이 생기고 경고가 강등된다 — 이 소식의 목적(재동기화 유도)과 일치.
      return state.stravaConnected === false
    case 'sync_stalled': {
      if (state.stravaConnected === false) return true
      if (state.lastSyncedAt === undefined) return true
      if (!state.lastSyncedAt) return true
      const last = new Date(state.lastSyncedAt).getTime()
      if (Number.isNaN(last)) return true
      return now.getTime() - last >= SYNC_STALLED_DAYS * DAY_MS
    }
    case 'inventory_full':
      if (state.inventoryRemainingSlots === undefined) return true
      return state.inventoryRemainingSlots <= INVENTORY_LOW_SLOTS_THRESHOLD
    case 'admin_points_changed':
      // 되돌릴 수 없는 사건이라 항상 유지한다. 들어온 포인트는 경고가 아니다.
      return payload.direction === 'deduct'
    default:
      return false
  }
}
