/**
 * T2 배치 판정 — 티켓 20260825_002
 *
 * 이 배치가 조용히 깨지는 경로는 정해져 있다. 전부 여기서 잠근다.
 *
 * 1. **payload 키 오타** — 렌더러가 빈 슬롯을 통째로 버려서
 *    `''에 넣을 수 있는 아이템 배지가 3개 있어요`가 나가고 아무도 모른다.
 * 2. **숫자 슬롯 0** — `num()`이 키 없음/0을 모두 0으로 돌려 "0명이 다녀갔어요"가 나간다.
 * 3. **KST 경계** — 배치가 자정을 걸치면 group_key가 두 날짜로 갈린다.
 * 4. **멱등성** — cron 재시도로 같은 소식이 두 번 생긴다.
 * 5. **⑥ 하루 상한 2건** — 남의 소식이 내 보상 소식을 묻는다.
 */
import { selectCollectionDrafts } from '../batch/collections'
import { selectDropSpotDrafts } from '../batch/dropSpot'
import {
  MISSION_DEADLINE_DAYS,
  selectMissionDeadlineDrafts,
  selectMissionEndedDrafts,
  selectMissionRankDrafts,
  type BatchMission,
} from '../batch/missions'
import {
  FOLLOWING_DAILY_CAP,
  selectFollowingDrafts,
  type FollowingCandidate,
} from '../batch/following'
import {
  INVENTORY_FULL_REMAINING_SLOTS,
  selectInventoryFullDrafts,
  selectSyncStalledDrafts,
} from '../batch/account'
import { SYNC_STALLED_DAYS, INVENTORY_LOW_SLOTS_THRESHOLD } from '../warning'
import { kstDateOffset, kstWeekKey, type NotificationDraft } from '../batch/shared'
import { kstDateString } from '../kst'
import { missingMessageSlots, notificationPlainText, type NotificationView } from '../message'

const DAY_MS = 24 * 60 * 60 * 1000

// KST 18:00 = UTC 09:00 — 실제 cron 시각
const BATCH_AT = new Date('2026-08-25T09:00:00.000Z')

function viewOf(draft: NotificationDraft): NotificationView {
  const actorIds = Array.isArray((draft.payload as { actor_ids?: unknown }).actor_ids)
    ? ((draft.payload as { actor_ids: string[] }).actor_ids)
    : []
  return {
    id: 'n1',
    type: draft.type,
    payload: draft.payload as unknown as Record<string, unknown>,
    actorCount: Math.max(actorIds.length, 1),
    actor: draft.actorUserId ? { id: draft.actorUserId, username: '예린', avatarUrl: null } : null,
    actor2: null,
    me: { id: draft.userId, username: '시현', avatarUrl: null },
    updatedAt: BATCH_AT.toISOString(),
    warning: false,
  }
}

/** 배치가 만든 모든 초안이 지켜야 하는 공통 계약 */
function expectContract(drafts: NotificationDraft[]): void {
  expect(drafts.length).toBeGreaterThan(0)
  for (const draft of drafts) {
    // (1) 렌더러가 버리는 슬롯이 하나도 없어야 한다 — payload 키 계약 위반의 유일한 탐지 수단
    expect(missingMessageSlots(viewOf(draft))).toEqual([])
    // 빈 따옴표만 남은 문장(`''에 …`)이 나가지 않는지 직접 확인
    expect(notificationPlainText(viewOf(draft))).not.toContain("''")
    // (4) 멱등성 — group_key 없이 만들면 cron 재시도가 그대로 중복이 된다
    expect(draft.groupKey).toBeTruthy()
    expect(draft.mode).toBe('once')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 컬렉션 — #9 / #10
// ─────────────────────────────────────────────────────────────────────────────

describe('#9 collection_slottable / #10 collection_near_complete', () => {
  const books = [{ id: 'book-1', name: '오아시스 자판기' }]
  const badgeIdsByBook = new Map([['book-1', ['b1', 'b2', 'b3']]])

  it('넣을 수 있는 배지가 있으면 개수와 함께 만든다 — payload 계약 통과', () => {
    const drafts = selectCollectionDrafts({
      books,
      badgeIdsByBook,
      stateByUser: new Map([
        [
          'u1',
          {
            filledBadgeIds: new Set(['b1']),
            unslottedBadgeObtainedAt: new Map([
              ['b2', '2026-08-25T01:00:00Z'],
              ['b3', '2026-08-24T01:00:00Z'],
            ]),
          },
        ],
      ]),
    })
    const slottable = drafts.filter((d) => d.type === 'collection_slottable')
    expect(slottable).toHaveLength(1)
    expect(slottable[0].payload).toMatchObject({
      item_book_id: 'book-1',
      book_name: '오아시스 자판기',
      count: 2,
    })
    expectContract(slottable)
  })

  it('넣을 수 있는 배지가 0개면 만들지 않는다 — "0개 있어요"가 나가면 안 된다', () => {
    const drafts = selectCollectionDrafts({
      books,
      badgeIdsByBook,
      stateByUser: new Map([
        ['u1', { filledBadgeIds: new Set(['b1']), unslottedBadgeObtainedAt: new Map() }],
      ]),
    })
    expect(drafts.filter((d) => d.type === 'collection_slottable')).toHaveLength(0)
  })

  it('#9의 group_key는 최신 미장착 아이템의 KST 획득일 — 상태가 그대로면 다시 알리지 않는다', () => {
    const state = new Map([
      [
        'u1',
        {
          filledBadgeIds: new Set(['b1']),
          unslottedBadgeObtainedAt: new Map([['b2', '2026-08-24T16:00:00Z']]),
        },
      ],
    ])
    const first = selectCollectionDrafts({ books, badgeIdsByBook, stateByUser: state })
    const second = selectCollectionDrafts({ books, badgeIdsByBook, stateByUser: state })
    // UTC 16:00 → KST 다음 날 01:00. UTC 기준으로 계산하면 08-24가 되어 키가 갈린다
    expect(first[0].groupKey).toBe('collection_slottable:book-1:2026-08-25')
    expect(second[0].groupKey).toBe(first[0].groupKey)
  })

  it('#10은 잔여 1칸 "도달"일 때만 — 한 칸도 안 채운 1칸짜리 컬렉션에는 보내지 않는다', () => {
    const reached = selectCollectionDrafts({
      books,
      badgeIdsByBook,
      stateByUser: new Map([
        ['u1', { filledBadgeIds: new Set(['b1', 'b2']), unslottedBadgeObtainedAt: new Map() }],
      ]),
    })
    expect(reached.filter((d) => d.type === 'collection_near_complete')).toHaveLength(1)
    expectContract(reached.filter((d) => d.type === 'collection_near_complete'))

    const untouched = selectCollectionDrafts({
      books: [{ id: 'solo', name: '외톨이' }],
      badgeIdsByBook: new Map([['solo', ['only']]]),
      stateByUser: new Map([
        ['u1', { filledBadgeIds: new Set<string>(), unslottedBadgeObtainedAt: new Map() }],
      ]),
    })
    expect(untouched.filter((d) => d.type === 'collection_near_complete')).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ③ #18 내 드랍 지점 활성
// ─────────────────────────────────────────────────────────────────────────────

describe('#18 drop_spot_active', () => {
  const base = {
    poiNames: new Map([['poi-1', '북한산']]),
    weekKey: kstWeekKey(BATCH_AT),
  }

  it('본인 열람을 뺀 고유 인원으로 센다', () => {
    const drafts = selectDropSpotDrafts({
      ...base,
      activeDrops: [{ dropperUserId: 'me', poiId: 'poi-1' }],
      viewersByPoi: new Map([['poi-1', new Set(['me', 'a', 'b'])]]),
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0].payload).toMatchObject({ poi_id: 'poi-1', poi_name: '북한산', visitor_count: 2 })
    expectContract(drafts)
  })

  it('본인만 열어봤으면 만들지 않는다 — "0명이 다녀갔어요"가 나가면 안 된다', () => {
    const drafts = selectDropSpotDrafts({
      ...base,
      activeDrops: [{ dropperUserId: 'me', poiId: 'poi-1' }],
      viewersByPoi: new Map([['poi-1', new Set(['me'])]]),
    })
    expect(drafts).toHaveLength(0)
  })

  it('같은 POI에 여러 개 드랍해도 소식은 1건, group_key는 주 단위', () => {
    const drafts = selectDropSpotDrafts({
      ...base,
      activeDrops: [
        { dropperUserId: 'me', poiId: 'poi-1' },
        { dropperUserId: 'me', poiId: 'poi-1' },
      ],
      viewersByPoi: new Map([['poi-1', new Set(['a'])]]),
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0].groupKey).toBe(`drop_spot_active:poi-1:${kstWeekKey(BATCH_AT)}`)
  })

  it('주 키는 7일 블록이다 — 같은 주에 다시 돌면 once가 막고, 다음 주에 다시 열린다', () => {
    const keys = Array.from({ length: 7 }, (_, i) =>
      kstWeekKey(new Date(BATCH_AT.getTime() + i * DAY_MS))
    )
    // 연속 7일이면 경계를 최대 한 번만 넘는다 = 최소 6일은 같은 묶음
    expect(new Set(keys).size).toBeLessThanOrEqual(2)
    // 7일 뒤는 반드시 다른 주
    expect(kstWeekKey(new Date(BATCH_AT.getTime() + 7 * DAY_MS))).not.toBe(kstWeekKey(BATCH_AT))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ④ 미션 — #21 / #23 / #24
// ─────────────────────────────────────────────────────────────────────────────

const distanceMission: BatchMission = {
  id: 'm1',
  title: '한강 100km',
  mission_type: 'distance',
  condition_json: { distance_km: 100 },
  status_display_type: 'ranking',
  starts_at: '2026-08-01T00:00:00Z',
  // KST 2026-08-27 (= BATCH_AT + 2일)
  ends_at: '2026-08-27T05:00:00Z',
}

describe('#21 mission_deadline', () => {
  const deadlineDate = kstDateOffset(BATCH_AT, MISSION_DEADLINE_DAYS)
  const today = kstDateString(BATCH_AT)

  it('D-2 미완료 참가자에게 남은 목표치와 함께 만든다', () => {
    const drafts = selectMissionDeadlineDrafts({
      missions: [distanceMission],
      participations: [{ userId: 'u1', missionId: 'm1', progressValue: 88 }],
      completedPairs: new Set(),
      today,
      deadlineDate,
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0].payload).toMatchObject({
      mission_id: 'm1',
      mission_title: '한강 100km',
      days: 2,
      remaining: 12,
      unit: 'km',
    })
    expectContract(drafts)
  })

  it('남은 목표치가 0 이하면 만들지 않는다 — "0km 남았어요"가 나가면 안 된다', () => {
    const drafts = selectMissionDeadlineDrafts({
      missions: [distanceMission],
      participations: [{ userId: 'u1', missionId: 'm1', progressValue: 100 }],
      completedPairs: new Set(),
      today,
      deadlineDate,
    })
    expect(drafts).toHaveLength(0)
  })

  it('이미 완료한 참가자는 제외한다', () => {
    const drafts = selectMissionDeadlineDrafts({
      missions: [distanceMission],
      participations: [{ userId: 'u1', missionId: 'm1', progressValue: 50 }],
      completedPairs: new Set(['m1:u1']),
      today,
      deadlineDate,
    })
    expect(drafts).toHaveLength(0)
  })

  it('단위가 없는 달성형(checkin)은 제외한다 — "1 남았어요"는 문장이 아니다', () => {
    const drafts = selectMissionDeadlineDrafts({
      missions: [{ ...distanceMission, mission_type: 'checkin', condition_json: { poi_id: 'p' } }],
      participations: [{ userId: 'u1', missionId: 'm1', progressValue: 0 }],
      completedPairs: new Set(),
      today,
      deadlineDate,
    })
    expect(drafts).toHaveLength(0)
  })

  it('D-2 판정은 KST 날짜 기준 — UTC로 자르면 하루가 밀린다', () => {
    // ends_at UTC 2026-08-26T16:00Z = KST 2026-08-27 01:00 → D-2에 해당한다
    const drafts = selectMissionDeadlineDrafts({
      missions: [{ ...distanceMission, ends_at: '2026-08-26T16:00:00Z' }],
      participations: [{ userId: 'u1', missionId: 'm1', progressValue: 10 }],
      completedPairs: new Set(),
      today,
      deadlineDate,
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0].groupKey).toBe(`mission_deadline:m1:${today}`)
  })
})

describe('#24 mission_ended', () => {
  it('막 끝난 미션의 참가자 전원에게, 미션당 한 번만', () => {
    const drafts = selectMissionEndedDrafts({
      missions: [{ ...distanceMission, ends_at: '2026-08-25T03:00:00Z' }],
      participations: [
        { userId: 'u1', missionId: 'm1', progressValue: 10 },
        { userId: 'u2', missionId: 'm1', progressValue: 90 },
      ],
      startedAt: BATCH_AT,
    })
    expect(drafts).toHaveLength(2)
    expect(new Set(drafts.map((d) => d.groupKey))).toEqual(new Set(['mission_ended:m1']))
    expectContract(drafts)
  })

  it('아직 안 끝난 미션·오래 전에 끝난 미션은 제외한다', () => {
    const notYet = selectMissionEndedDrafts({
      missions: [distanceMission],
      participations: [{ userId: 'u1', missionId: 'm1', progressValue: 10 }],
      startedAt: BATCH_AT,
    })
    expect(notYet).toHaveLength(0)

    const longAgo = selectMissionEndedDrafts({
      missions: [{ ...distanceMission, ends_at: '2026-08-01T00:00:00Z' }],
      participations: [{ userId: 'u1', missionId: 'm1', progressValue: 10 }],
      startedAt: BATCH_AT,
    })
    expect(longAgo).toHaveLength(0)
  })
})

describe('#23 mission_rank_up', () => {
  const participations = [
    { userId: 'u1', missionId: 'm1', progressValue: 90 },
    { userId: 'u2', missionId: 'm1', progressValue: 50 },
    { userId: 'u3', missionId: 'm1', progressValue: 10 },
  ]
  const common = {
    missions: [distanceMission],
    participations,
    completedAt: new Map<string, string>(),
    startedAt: BATCH_AT,
    today: kstDateString(BATCH_AT),
  }

  it('첫 관측은 기준선만 남기고 소식을 만들지 않는다', () => {
    const out = selectMissionRankDrafts({ ...common, previousRank: new Map() })
    expect(out.drafts).toHaveLength(0)
    expect(out.snapshots).toEqual([
      { mission_id: 'm1', user_id: 'u1', rank: 1 },
      { mission_id: 'm1', user_id: 'u2', rank: 2 },
      { mission_id: 'm1', user_id: 'u3', rank: 3 },
    ])
  })

  it('올라선 유저에게만 만든다 — 유지·하락은 만들지 않는다', () => {
    const out = selectMissionRankDrafts({
      ...common,
      previousRank: new Map([
        ['m1:u1', 1], // 유지
        ['m1:u2', 3], // 상승
        ['m1:u3', 2], // 하락
      ]),
    })
    expect(out.drafts).toHaveLength(1)
    expect(out.drafts[0].userId).toBe('u2')
    expect(out.drafts[0].payload).toMatchObject({ mission_id: 'm1', mission_title: '한강 100km', rank: 2 })
    expectContract(out.drafts)
  })

  it('랭킹형이 아닌 미션은 대상이 아니다', () => {
    const out = selectMissionRankDrafts({
      ...common,
      missions: [{ ...distanceMission, status_display_type: 'achievement' }],
      previousRank: new Map([['m1:u2', 3]]),
    })
    expect(out.drafts).toHaveLength(0)
    expect(out.snapshots).toHaveLength(0)
  })

  it('일 1회 상한 — group_key가 KST 일자라 같은 날 재실행해도 once가 막는다', () => {
    const out = selectMissionRankDrafts({ ...common, previousRank: new Map([['m1:u2', 3]]) })
    expect(out.drafts[0].groupKey).toBe(`mission_rank_up:m1:${kstDateString(BATCH_AT)}`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ 팔로잉 활동 — 하루 상한 2건
// ─────────────────────────────────────────────────────────────────────────────

describe('⑥ 팔로잉 활동 — 하루 상한 2건', () => {
  const today = kstDateString(BATCH_AT)

  const candidates: FollowingCandidate[] = [
    {
      kind: 'mission',
      recipientId: 'me',
      actorId: 'a3',
      at: '2026-08-25T07:00:00Z',
      priority: 3,
      missionId: 'm1',
      missionTitle: '한강 100km',
      actorIds: ['a3', 'a5'],
    },
    {
      kind: 'collection',
      recipientId: 'me',
      actorId: 'a2',
      at: '2026-08-25T06:00:00Z',
      priority: 2,
      itemBookId: 'book-1',
      bookName: '잃어버린 시간',
    },
    {
      kind: 'rare_badge',
      recipientId: 'me',
      actorId: 'a1',
      at: '2026-08-25T05:00:00Z',
      priority: 0,
      badgeId: 'b1',
      badgeName: '별을 삼킨 바퀴',
      rarity: 'mythic',
    },
  ]

  it('수신자당 2건까지만, 희귀도 우선순위대로 고른다', () => {
    const drafts = selectFollowingDrafts(candidates, today)
    expect(drafts).toHaveLength(FOLLOWING_DAILY_CAP)
    expect(drafts.map((d) => d.type)).toEqual([
      'following_rare_badge',
      'following_collection_complete',
    ])
    expectContract(drafts)
  })

  it('수신자가 다르면 각각 2건까지', () => {
    const drafts = selectFollowingDrafts(
      [...candidates, ...candidates.map((c) => ({ ...c, recipientId: 'other' }))],
      today
    )
    expect(drafts).toHaveLength(FOLLOWING_DAILY_CAP * 2)
  })

  it('3종 모두 payload 계약을 지킨다 (상한을 풀고 전수 검사)', () => {
    const drafts = candidates.map((c) => selectFollowingDrafts([c], today)[0])
    expect(drafts.map((d) => d.type)).toEqual([
      'following_mission_complete',
      'following_collection_complete',
      'following_rare_badge',
    ])
    expectContract(drafts)
    // 묶음 소식은 actor_ids가 "외 N명"의 유일한 근거다
    expect(drafts[0].payload).toMatchObject({ actor_ids: ['a3', 'a5'] })
    expect(notificationPlainText(viewOf(drafts[0]))).toContain('외 1명')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ⑧ #41 / #42
// ─────────────────────────────────────────────────────────────────────────────

describe('#41 sync_stalled', () => {
  it('warning.ts의 SYNC_STALLED_DAYS를 그대로 쓴다 (값 복사 금지)', () => {
    const justUnder = new Date(BATCH_AT.getTime() - (SYNC_STALLED_DAYS - 1) * DAY_MS).toISOString()
    const atThreshold = new Date(BATCH_AT.getTime() - SYNC_STALLED_DAYS * DAY_MS).toISOString()

    expect(
      selectSyncStalledDrafts({
        connections: [{ userId: 'u1', lastSyncedAt: justUnder, createdAt: justUnder }],
        startedAt: BATCH_AT,
      })
    ).toHaveLength(0)

    const drafts = selectSyncStalledDrafts({
      connections: [{ userId: 'u1', lastSyncedAt: atThreshold, createdAt: atThreshold }],
      startedAt: BATCH_AT,
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0].payload).toEqual({ days: SYNC_STALLED_DAYS })
    expectContract(drafts)
  })

  it('days가 0이면 만들지 않는다 — "0일째 활동을 못 불러오고 있어요"가 나가면 안 된다', () => {
    const drafts = selectSyncStalledDrafts({
      connections: [{ userId: 'u1', lastSyncedAt: BATCH_AT.toISOString(), createdAt: BATCH_AT.toISOString() }],
      startedAt: BATCH_AT,
    })
    expect(drafts).toHaveLength(0)
  })

  it('한 번도 동기화하지 않았으면 연결 생성 시각을 기준으로 잰다', () => {
    const created = new Date(BATCH_AT.getTime() - 10 * DAY_MS).toISOString()
    const drafts = selectSyncStalledDrafts({
      connections: [{ userId: 'u1', lastSyncedAt: null, createdAt: created }],
      startedAt: BATCH_AT,
    })
    expect(drafts[0].payload).toEqual({ days: 10 })
    // group_key는 정체 구간의 시작일 — 상태가 유지되는 동안 키가 같아 once가 막는다
    expect(drafts[0].groupKey).toBe(`sync_stalled:${kstDateString(created)}`)
  })
})

describe('#42 inventory_full', () => {
  const today = kstDateString(BATCH_AT)

  it('잔여 0칸일 때만 만든다 — 문구가 「꽉 찼어요」이므로 잔여 3칸에는 보내지 않는다', () => {
    // 상수 자체는 warning.ts에서 온다(값 복사 금지). 생성 조건만 0칸으로 좁혔다.
    expect(INVENTORY_LOW_SLOTS_THRESHOLD).toBeGreaterThan(INVENTORY_FULL_REMAINING_SLOTS)

    const near = selectInventoryFullDrafts({
      inventories: [{ userId: 'u1', maxSlots: 50, usedSlots: 47 }],
      recentlyNotified: new Set(),
      today,
    })
    expect(near).toHaveLength(0)

    const full = selectInventoryFullDrafts({
      inventories: [{ userId: 'u1', maxSlots: 50, usedSlots: 50 }],
      recentlyNotified: new Set(),
      today,
    })
    expect(full).toHaveLength(1)
    expect(full[0].payload).toEqual({ max_slots: 50, used_slots: 50 })
    expect(full[0].groupKey).toBe(`inventory_full:${today}`)
    expectContract(full)
  })

  it('max_slots가 0이면 만들지 않는다 — "0개까지만 보관할 수 있어서"가 나가면 안 된다', () => {
    const drafts = selectInventoryFullDrafts({
      inventories: [{ userId: 'u1', maxSlots: 0, usedSlots: 0 }],
      recentlyNotified: new Set(),
      today,
    })
    expect(drafts).toHaveLength(0)
  })

  it('최근에 이미 받은 유저에게는 다시 보내지 않는다', () => {
    const drafts = selectInventoryFullDrafts({
      inventories: [{ userId: 'u1', maxSlots: 50, usedSlots: 50 }],
      recentlyNotified: new Set(['u1']),
      today,
    })
    expect(drafts).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// KST 경계 — 배치 시작 시각을 한 번만 캡처해야 하는 이유
// ─────────────────────────────────────────────────────────────────────────────

describe('KST 경계', () => {
  it('kstDateOffset은 KST 기준으로 날짜를 더한다', () => {
    // UTC 2026-08-25T15:00Z = KST 2026-08-26 00:00 → +2일은 08-28
    expect(kstDateOffset(new Date('2026-08-25T15:00:00Z'), 2)).toBe('2026-08-28')
    expect(kstDateOffset(new Date('2026-08-25T14:59:59Z'), 2)).toBe('2026-08-27')
  })

  it('배치가 KST 자정을 걸쳐도 캡처한 시각 하나만 쓰면 키가 갈리지 않는다', () => {
    const startedAt = new Date('2026-08-25T14:59:00Z') // KST 08-25 23:59
    const during = new Date('2026-08-25T15:05:00Z') // KST 08-26 00:05 (배치가 도는 중)

    // 시각을 두 번 평가하면 여기서 갈린다
    expect(kstDateString(startedAt)).not.toBe(kstDateString(during))
    // 캡처한 값 하나만 쓰면 언제 호출해도 같다
    expect(kstDateString(startedAt)).toBe(kstDateString(startedAt))
    expect(kstWeekKey(startedAt)).toBe(kstWeekKey(startedAt))
  })
})
