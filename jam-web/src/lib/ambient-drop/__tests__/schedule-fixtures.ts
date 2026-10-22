/**
 * 날짜 예약 테스트 공용 데이터 (티켓 20261001_2051) — 가짜 DB(`schedule-test-db.ts`)에 넣는 기본 세상
 *
 * 컬렉션 4개는 예정 시각(2026-10-05 09:00 KST = 10-05 00:00Z)에 어떻게 보이는지가 다르다.
 *  - BOOK_LIVE: 항상 노출 중
 *  - BOOK_PRELAUNCH: 10-03에 공개 — 2026-10-01(등록일)에는 공개 전이지만 예정 시각에는 노출 중
 *  - BOOK_LATE: 10-10에 공개 — 예정 시각 이후라 아직 공개 전
 *  - BOOK_ENDING: 10-04에 기간 종료 — 예정 시각에는 이미 끝남
 */
import { uuid, type Row } from './schedule-test-db'

export const P1 = uuid(1)
export const P2 = uuid(2)
export const P_INACTIVE = uuid(3)
export const P_MISSING = uuid(4)

export const BOOK_LIVE = uuid(21)
export const BOOK_PRELAUNCH = uuid(22)
export const BOOK_LATE = uuid(23)
export const BOOK_ENDING = uuid(24)

export const B_LIVE = uuid(11)
export const B_PRELAUNCH = uuid(12)
export const B_LATE = uuid(13)
export const B_ENDING = uuid(14)
export const B_DELETED = uuid(15)
export const B_NO_BOOK = uuid(16)

export function badge(id: string, itemBookId: string | null, overrides: Row = {}): Row {
  return {
    id,
    type: 'item',
    rarity: 'common',
    deleted_at: null,
    item_book_id: itemBookId,
    valid_from: null,
    valid_until: null,
    ...overrides,
  }
}

export function world(): Record<string, Row[]> {
  return {
    ambient_drop_config: [
      {
        id: 1,
        auto_enabled: true,
        rarity_mode: 'explicit',
        rarity_common: 1,
        rarity_rare: 0,
        rarity_epic: 0,
        rarity_mystic: 0,
        batch_size: 30,
        max_active_per_poi: 1,
      },
    ],
    poi_categories: [{ slug: 'cafe' }],
    poi: [
      { id: P1, is_active: true, category: 'cafe' },
      { id: P2, is_active: true, category: 'cafe' },
      { id: P_INACTIVE, is_active: false, category: 'cafe' },
    ],
    poi_drops: [{ id: 'drop-existing', poi_id: P1, source: 'system', is_available: true }],
    item_books: [
      { id: BOOK_LIVE, is_active: true, valid_from: null, valid_until: null },
      { id: BOOK_PRELAUNCH, is_active: true, valid_from: '2026-10-03T00:00:00+00:00', valid_until: null },
      { id: BOOK_LATE, is_active: true, valid_from: '2026-10-10T00:00:00+00:00', valid_until: null },
      { id: BOOK_ENDING, is_active: true, valid_from: null, valid_until: '2026-10-04T00:00:00+00:00' },
    ],
    badges: [
      badge(B_LIVE, BOOK_LIVE),
      badge(B_PRELAUNCH, BOOK_PRELAUNCH),
      badge(B_LATE, BOOK_LATE),
      badge(B_ENDING, BOOK_ENDING),
      badge(B_DELETED, BOOK_LIVE, { deleted_at: '2026-09-01T00:00:00+00:00' }),
      badge(B_NO_BOOK, null),
    ],
    ambient_drop_schedules: [],
  }
}
