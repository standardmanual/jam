/**
 * 앰비언트 드랍 예약 입력 검증·상태 파생·행 변환 (티켓 20261001_2051)
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/schedule-spec.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  AMBIENT_SCHEDULE_LATE_WINDOW_MS,
  AMBIENT_SCHEDULE_MAX_TOTAL,
  AMBIENT_SCHEDULE_STALLED_AFTER_MS,
  ambientDropScheduleState,
  parseAmbientDropScheduleInput,
  parseScheduledAt,
  rowFromSpec,
  specFromRow,
  type AmbientDropScheduleSpec,
} from '../scheduleSpec'
import { uuid } from './schedule-test-db'

/** 2026-10-01 12:00 KST */
const NOW = new Date('2026-10-01T03:00:00.000Z')
/** 2026-10-05 09:00 KST — 미래의 KST 정시 */
const AT = '2026-10-05T09:00:00+09:00'
const AT_ISO = '2026-10-05T00:00:00.000Z'

const POI_A = uuid(1)
const POI_B = uuid(2)
const BADGE_A = uuid(11)
const BADGE_B = uuid(12)
const BOOK_A = uuid(21)

function ok(body: unknown, opts?: { allowNow?: boolean }) {
  const parsed = parseAmbientDropScheduleInput(body, NOW, opts)
  if (!parsed.ok) throw new Error(`통과해야 하는 입력이 거절됨: ${parsed.error}`)
  return parsed
}

function errorOf(body: unknown, opts?: { allowNow?: boolean }): string {
  const parsed = parseAmbientDropScheduleInput(body, NOW, opts)
  if (parsed.ok) throw new Error('거절돼야 하는 입력이 통과함')
  return parsed.error
}

const LIST_ITEMS = { scheduled_at: AT, poi_ids: [POI_A, POI_B], per_poi_count: 2, badge_ids: [BADGE_A] }

describe('parseAmbientDropScheduleInput — 지점 2모드 × 아이템 2모드', () => {
  it('지점 직접 × 아이템 직접', () => {
    const parsed = ok(LIST_ITEMS)
    expect(parsed.scheduledAt).toBe(AT_ISO)
    expect(parsed.spec).toEqual({
      poiMode: 'list',
      poiIds: [POI_A, POI_B],
      perPoiCount: 2,
      itemMode: 'items',
      badgeIds: [BADGE_A],
    })
  })

  it('지점 직접 × 컬렉션', () => {
    const parsed = ok({ scheduled_at: AT, poi_ids: [POI_A], per_poi_count: 1, collection_ids: [BOOK_A] })
    expect(parsed.spec).toEqual({
      poiMode: 'list',
      poiIds: [POI_A],
      perPoiCount: 1,
      itemMode: 'collections',
      collectionIds: [BOOK_A],
    })
  })

  it('지점 종류+개수 × 아이템 직접', () => {
    const parsed = ok({ scheduled_at: AT, poi_category: 'cafe', total_count: 10, badge_ids: [BADGE_A, BADGE_B] })
    expect(parsed.spec).toEqual({
      poiMode: 'category',
      poiCategory: 'cafe',
      totalCount: 10,
      itemMode: 'items',
      badgeIds: [BADGE_A, BADGE_B],
    })
  })

  it('지점 종류+개수 × 컬렉션 — 종류가 없으면(null·빈 문자열·키 없음) 「전체 종류」다', () => {
    for (const category of [null, '', undefined]) {
      const parsed = ok({ scheduled_at: AT, poi_category: category, total_count: 5, collection_ids: [BOOK_A] })
      expect(parsed.spec).toMatchObject({ poiMode: 'category', poiCategory: null, totalCount: 5, itemMode: 'collections' })
    }
    expect(ok({ scheduled_at: AT, total_count: 5, collection_ids: [BOOK_A] }).spec).toMatchObject({ poiCategory: null })
  })

  it('중복 ID는 처음 것만 남기고 대소문자를 구분하지 않는다', () => {
    const parsed = ok({
      scheduled_at: AT,
      poi_ids: [POI_A, POI_A.toUpperCase(), POI_B],
      per_poi_count: 3,
      badge_ids: [BADGE_A, BADGE_A],
    })
    expect(parsed.spec).toMatchObject({ poiIds: [POI_A, POI_B], badgeIds: [BADGE_A] })
  })

  it('모르는 키(rarity_* 등)는 무시한다 — 예약에는 등급 비율이 없다', () => {
    const parsed = ok({ ...LIST_ITEMS, rarity_common: 0.5, rarity_mode: 'explicit', whatever: 1 })
    expect(JSON.stringify(parsed.spec)).not.toMatch(/rarity|whatever/)
  })

  it('시간대가 다른 표기라도 KST 정시면 통과하고 UTC ISO로 정규화한다', () => {
    // 06:30+05:30 = 01:00Z = 10:00 KST
    expect(ok({ ...LIST_ITEMS, scheduled_at: '2026-10-05T06:30:00+05:30' }).scheduledAt).toBe('2026-10-05T01:00:00.000Z')
    expect(ok({ ...LIST_ITEMS, scheduled_at: '2026-10-05T00:00:00Z' }).scheduledAt).toBe(AT_ISO)
  })
})

describe('parseAmbientDropScheduleInput — 400', () => {
  it('본문이 객체가 아니면 거절한다', () => {
    for (const body of [null, undefined, 'x', 3, [LIST_ITEMS]]) {
      expect(errorOf(body)).toContain('예약 내용을 읽지 못했어요')
    }
  })

  it('지점 모드가 섞이면 거절한다 — 지점 직접인데 총 개수·지점 종류가 있음', () => {
    expect(errorOf({ ...LIST_ITEMS, total_count: 5 })).toContain('섞여 있어요')
    expect(errorOf({ ...LIST_ITEMS, poi_category: 'cafe' })).toContain('섞여 있어요')
  })

  it('지점 모드가 섞이면 거절한다 — 지점이 없는데 지점당 개수가 있음', () => {
    expect(errorOf({ scheduled_at: AT, per_poi_count: 2, total_count: 3, badge_ids: [BADGE_A] })).toContain('섞여 있어요')
    expect(errorOf({ scheduled_at: AT, per_poi_count: 2, badge_ids: [BADGE_A] })).toContain('섞여 있어요')
  })

  it('아이템 모드가 섞이거나 비어 있으면 거절한다', () => {
    expect(errorOf({ ...LIST_ITEMS, collection_ids: [BOOK_A] })).toContain('섞여 있어요')
    expect(errorOf({ ...LIST_ITEMS, badge_ids: [] })).toContain('놓을 것이 없어요')
    expect(errorOf({ ...LIST_ITEMS, badge_ids: undefined })).toContain('놓을 것이 없어요')
  })

  it('필수 개수가 없으면 거절한다', () => {
    expect(errorOf({ ...LIST_ITEMS, per_poi_count: undefined })).toContain('지점당 개수가 없어요')
    expect(errorOf({ scheduled_at: AT, badge_ids: [BADGE_A] })).toContain('총 개수가 없어요')
  })

  it('개수는 1 이상의 정수여야 한다 — 0·소수·음수·문자열', () => {
    for (const bad of [0, 1.5, -1, '3', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(errorOf({ ...LIST_ITEMS, per_poi_count: bad })).toContain('지점당 개수가 올바르지 않아요')
      expect(errorOf({ scheduled_at: AT, total_count: bad, badge_ids: [BADGE_A] })).toContain('총 개수가 올바르지 않아요')
    }
  })

  it('합계 상한은 100개다 — 100개는 통과, 101개는 거절', () => {
    expect(AMBIENT_SCHEDULE_MAX_TOTAL).toBe(100)
    const poiIds = Array.from({ length: 10 }, (_, i) => uuid(100 + i))
    expect(ok({ scheduled_at: AT, poi_ids: poiIds, per_poi_count: 10, badge_ids: [BADGE_A] }).spec).toMatchObject({ perPoiCount: 10 })
    expect(errorOf({ scheduled_at: AT, poi_ids: [...poiIds, uuid(110)], per_poi_count: 10, badge_ids: [BADGE_A] })).toContain('100개까지예요')
    expect(ok({ scheduled_at: AT, total_count: 100, badge_ids: [BADGE_A] }).spec).toMatchObject({ totalCount: 100 })
    expect(errorOf({ scheduled_at: AT, total_count: 101, badge_ids: [BADGE_A] })).toContain('100개까지예요')
  })

  it('UUID 형식이 아닌 ID를 거절한다', () => {
    expect(errorOf({ ...LIST_ITEMS, poi_ids: ['not-a-uuid'] })).toContain('지점 목록에 올바르지 않은 ID')
    expect(errorOf({ ...LIST_ITEMS, badge_ids: [123] })).toContain('아이템 목록에 올바르지 않은 ID')
    expect(errorOf({ scheduled_at: AT, poi_ids: [POI_A], per_poi_count: 1, collection_ids: ['x'] })).toContain('컬렉션 목록에 올바르지 않은 ID')
    expect(errorOf({ ...LIST_ITEMS, poi_ids: 'abc' })).toContain('지점 목록 형식이 올바르지 않아요')
  })

  it('정시가 아니면 거절한다 — 10:30 KST', () => {
    expect(errorOf({ ...LIST_ITEMS, scheduled_at: '2026-10-05T10:30:00+09:00' })).toContain('정시가 아니에요')
    expect(errorOf({ ...LIST_ITEMS, scheduled_at: '2026-10-05T10:00:30+09:00' })).toContain('정시가 아니에요')
    // 07:00+05:30 = 01:30Z = 10:30 KST — 표기가 정시여도 KST로는 정시가 아니다
    expect(errorOf({ ...LIST_ITEMS, scheduled_at: '2026-10-05T07:00:00+05:30' })).toContain('정시가 아니에요')
  })

  it('과거·지금과 같은 시각을 거절한다', () => {
    expect(errorOf({ ...LIST_ITEMS, scheduled_at: '2026-09-30T09:00:00+09:00' })).toContain('이미 지났어요')
    expect(errorOf({ ...LIST_ITEMS, scheduled_at: '2026-10-01T12:00:00+09:00' })).toContain('이미 지났어요')
    expect(ok({ ...LIST_ITEMS, scheduled_at: '2026-10-01T13:00:00+09:00' }).scheduledAt).toBe('2026-10-01T04:00:00.000Z')
  })

  it('시간대가 없는 ISO·형식이 아닌 값·달력에 없는 날짜를 거절한다', () => {
    expect(errorOf({ ...LIST_ITEMS, scheduled_at: '2026-10-05T09:00:00' })).toContain('형식이 올바르지 않아요')
    expect(errorOf({ ...LIST_ITEMS, scheduled_at: '2026-10-05' })).toContain('형식이 올바르지 않아요')
    expect(errorOf({ ...LIST_ITEMS, scheduled_at: 20261005 })).toContain('형식이 올바르지 않아요')
    expect(errorOf({ ...LIST_ITEMS, scheduled_at: '2026-02-31T09:00:00+09:00' })).toContain('존재하지 않는 날짜')
  })

  it('시각이 없으면 거절한다(allowNow가 아닐 때)', () => {
    for (const at of [undefined, null, '', 'now']) {
      expect(errorOf({ ...LIST_ITEMS, scheduled_at: at })).toContain('놓을 시각이 없어요')
    }
  })

  it('ends_at이 들어오면 거절한다 — 드랍 일정은 종료 시각이 없다', () => {
    expect(errorOf({ ...LIST_ITEMS, ends_at: '2026-10-06T09:00:00+09:00' })).toContain('종료 시각은 정할 수 없어요')
    expect(errorOf({ ...LIST_ITEMS, ends_at: '' })).toContain('종료 시각은 정할 수 없어요')
    // 값이 없는 ends_at은 들어온 것으로 보지 않는다
    expect(ok({ ...LIST_ITEMS, ends_at: null }).spec.poiMode).toBe('list')
  })

  it('오류 문장은 해요체이고 현상 → 원인 → 해결책 세 문장이다', () => {
    const samples = [
      errorOf({ ...LIST_ITEMS, total_count: 5 }),
      errorOf({ ...LIST_ITEMS, scheduled_at: '2026-10-05T10:30:00+09:00' }),
      errorOf({ ...LIST_ITEMS, ends_at: AT }),
    ]
    for (const message of samples) {
      expect(message.split('. ').length).toBeGreaterThanOrEqual(3)
      expect(message).toMatch(/요\.$/)
    }
  })
})

describe('parseAmbientDropScheduleInput — 이름', () => {
  it('앞뒤 공백을 지우고, 빈 값은 null이며, 100자까지 허용한다', () => {
    expect(ok({ ...LIST_ITEMS, title: '  가을 아침  ' }).title).toBe('가을 아침')
    expect(ok({ ...LIST_ITEMS, title: '   ' }).title).toBeNull()
    expect(ok({ ...LIST_ITEMS }).title).toBeNull()
    expect(ok({ ...LIST_ITEMS, title: 'a'.repeat(100) }).title).toHaveLength(100)
  })

  it('101자와 글자가 아닌 값을 거절한다', () => {
    expect(errorOf({ ...LIST_ITEMS, title: 'a'.repeat(101) })).toContain('이름이 너무 길어요')
    expect(errorOf({ ...LIST_ITEMS, title: 5 })).toContain('이름 형식이 올바르지 않아요')
  })
})

describe('parseAmbientDropScheduleInput — allowNow (「지금」 1회 배포)', () => {
  it('시각이 없거나 "now"이면 scheduledAt: null로 통과한다', () => {
    for (const at of [undefined, null, '', 'now']) {
      const parsed = ok({ ...LIST_ITEMS, scheduled_at: at }, { allowNow: true })
      expect(parsed.scheduledAt).toBeNull()
      expect(parsed.spec.poiMode).toBe('list')
    }
  })

  it('시각이 있으면 allowNow여도 같은 규칙(KST 정시·미래)을 받는다', () => {
    expect(ok(LIST_ITEMS, { allowNow: true }).scheduledAt).toBe(AT_ISO)
    expect(errorOf({ ...LIST_ITEMS, scheduled_at: '2026-10-05T10:30:00+09:00' }, { allowNow: true })).toContain('정시가 아니에요')
    expect(errorOf({ ...LIST_ITEMS, scheduled_at: '2026-09-30T09:00:00+09:00' }, { allowNow: true })).toContain('이미 지났어요')
  })

  it('allowNow여도 지점·아이템 규칙은 그대로다', () => {
    expect(errorOf({ scheduled_at: 'now', badge_ids: [BADGE_A] }, { allowNow: true })).toContain('총 개수가 없어요')
  })
})

describe('parseScheduledAt', () => {
  it('통과하면 UTC ISO 문자열을 돌려준다', () => {
    expect(parseScheduledAt(AT, NOW)).toEqual({ ok: true, value: AT_ISO })
  })

  it('앞뒤 공백은 지우고 읽는다', () => {
    expect(parseScheduledAt(`  ${AT} `, NOW)).toEqual({ ok: true, value: AT_ISO })
  })
})

describe('ambientDropScheduleState — missed·stalled 파생', () => {
  const scheduledAt = '2026-10-05T00:00:00.000Z'
  const at = (offsetMs: number) => new Date(new Date(scheduledAt).getTime() + offsetMs)

  it('scheduled — 예정 시각 전과 정확히 3시간째까지는 scheduled', () => {
    const row = { status: 'scheduled' as const, scheduled_at: scheduledAt, claimed_at: null }
    expect(ambientDropScheduleState(row, at(-1))).toBe('scheduled')
    expect(ambientDropScheduleState(row, at(0))).toBe('scheduled')
    expect(ambientDropScheduleState(row, at(AMBIENT_SCHEDULE_LATE_WINDOW_MS))).toBe('scheduled')
  })

  it('scheduled — 3시간을 1ms라도 넘기면 missed', () => {
    const row = { status: 'scheduled' as const, scheduled_at: scheduledAt, claimed_at: null }
    expect(ambientDropScheduleState(row, at(AMBIENT_SCHEDULE_LATE_WINDOW_MS + 1))).toBe('missed')
  })

  it('running — 선점 뒤 정확히 30분까지는 running, 1ms 넘기면 stalled', () => {
    const claimedAt = '2026-10-05T00:05:00.000Z'
    const row = { status: 'running' as const, scheduled_at: scheduledAt, claimed_at: claimedAt }
    const claimedMs = new Date(claimedAt).getTime()
    expect(ambientDropScheduleState(row, new Date(claimedMs + AMBIENT_SCHEDULE_STALLED_AFTER_MS))).toBe('running')
    expect(ambientDropScheduleState(row, new Date(claimedMs + AMBIENT_SCHEDULE_STALLED_AFTER_MS + 1))).toBe('stalled')
  })

  it('끝난 상태는 시간이 지나도 그대로다', () => {
    for (const status of ['done', 'skipped', 'failed', 'missed', 'canceled'] as const) {
      const row = { status, scheduled_at: scheduledAt, claimed_at: scheduledAt }
      expect(ambientDropScheduleState(row, at(AMBIENT_SCHEDULE_LATE_WINDOW_MS * 10))).toBe(status)
    }
  })
})

describe('rowFromSpec · specFromRow', () => {
  const specs: AmbientDropScheduleSpec[] = [
    { poiMode: 'list', poiIds: [POI_A, POI_B], perPoiCount: 2, itemMode: 'items', badgeIds: [BADGE_A] },
    { poiMode: 'list', poiIds: [POI_A], perPoiCount: 1, itemMode: 'collections', collectionIds: [BOOK_A] },
    { poiMode: 'category', poiCategory: 'cafe', totalCount: 7, itemMode: 'items', badgeIds: [BADGE_A, BADGE_B] },
    { poiMode: 'category', poiCategory: null, totalCount: 3, itemMode: 'collections', collectionIds: [BOOK_A] },
  ]

  it.each(specs.map((spec) => [`${spec.poiMode} × ${spec.itemMode}`, spec] as const))('%s — 행으로 바꿨다가 되돌려도 같다', (_name, spec) => {
    const row = rowFromSpec(spec, AT_ISO, 'admin@example.com', '가을')
    expect(specFromRow(row)).toEqual(spec)
    expect(row).toMatchObject({ created_by: 'admin@example.com', title: '가을', scheduled_at: AT_ISO })
  })

  it('id를 주면 행에 그 id가 있고, 안 주면 id 칸 자체가 없다(DB가 정한다, 티켓 20261002_2306)', () => {
    const chosen = '00000000-0000-4000-8000-000000000777'
    expect(rowFromSpec(specs[0], AT_ISO, null, null, chosen)).toMatchObject({ id: chosen })
    expect('id' in rowFromSpec(specs[0], AT_ISO, null)).toBe(false)
    expect('id' in rowFromSpec(specs[0], AT_ISO, null, '가을')).toBe(false)
  })

  it('쓰지 않는 모드의 칸은 비워 DB CHECK와 맞춘다', () => {
    const listItems = rowFromSpec(specs[0], AT_ISO, null)
    expect(listItems).toMatchObject({ poi_category: null, total_count: null, collection_ids: [] })
    const categoryCollections = rowFromSpec(specs[3], AT_ISO, null)
    expect(categoryCollections).toMatchObject({ poi_ids: [], per_poi_count: null, badge_ids: [] })
  })

  it('DB CHECK가 막는 모순된 행은 던진다', () => {
    const base = rowFromSpec(specs[0], AT_ISO, null)
    expect(() => specFromRow({ ...base, per_poi_count: null })).toThrow('per_poi_count')
    expect(() => specFromRow({ ...rowFromSpec(specs[2], AT_ISO, null), total_count: null })).toThrow('total_count')
  })
})
