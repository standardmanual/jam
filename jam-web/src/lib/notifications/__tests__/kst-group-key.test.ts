/**
 * 알림(소식) — KST 시간창 계산 + group_key 빌더 + bumps_badge 파생
 * 티켓 20260824_019
 *
 * KST 계산이 이 기능에서 가장 미끄러지기 쉬운 지점이다. UTC로 계산하면 일 단위 키가
 * **KST 09:00에 날짜가 바뀌어** 아침에 받은 포인트와 저녁에 받은 포인트가 다른 묶음이
 * 된다. 티켓 20260824_006에서 event_at을 로컬 벽시계로 오해석한 전례가 있다.
 */
import { vi } from 'vitest'
import { kstDateString, kstHour, kstSixHourBlock } from '../kst'
import { scopedGroupKey, syncGroupKey, dailyGroupKey, sixHourGroupKey } from '../groupKey'
import { bumpsBadgeFor, NON_BUMPING_NOTIFICATION_TYPES } from '../types'
import type { NotificationType } from '@/types/database'

describe('kstDateString — KST 기준 날짜', () => {
  it('UTC 15:00은 KST로 다음 날 00:00이라 날짜가 넘어간다', () => {
    expect(kstDateString('2026-08-24T14:59:59.999Z')).toBe('2026-08-24')
    expect(kstDateString('2026-08-24T15:00:00.000Z')).toBe('2026-08-25')
  })

  it('KST 09:00(UTC 00:00)에는 날짜가 바뀌지 않는다 — UTC 기준 계산이면 여기서 갈라진다', () => {
    // UTC 23:00 → KST 다음 날 08:00, UTC 00:00 → KST 같은 날 09:00.
    // 두 시각은 KST로는 연속된 같은 하루(8/25)에 속한다.
    expect(kstDateString('2026-08-24T23:00:00Z')).toBe('2026-08-25')
    expect(kstDateString('2026-08-25T00:00:00Z')).toBe('2026-08-25')
  })

  it('월·연 경계도 KST 기준으로 넘어간다', () => {
    expect(kstDateString('2026-08-31T14:59:59Z')).toBe('2026-08-31')
    expect(kstDateString('2026-08-31T15:00:00Z')).toBe('2026-09-01')
    expect(kstDateString('2026-12-31T15:00:00Z')).toBe('2027-01-01')
  })

  it('Invalid Date는 NaN-NaN-NaN 대신 현재 시각으로 대체하고 로그를 남긴다', () => {
    // 가드가 없으면 'NaN-NaN-NaN'이 poi_views.viewed_on(DATE)에 실려 DB 파싱 에러가 되고,
    // group_key에 섞이면 영영 합쳐지지 않는 묶음이 만들어진다.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const today = kstDateString(new Date())
      expect(kstDateString('이건 날짜가 아니다')).toBe(today)
      expect(kstDateString(new Date('nope'))).toBe(today)
      expect(kstDateString(Number.NaN)).toBe(today)
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('Date·문자열·epoch 어느 입력이든 같은 결과', () => {
    const iso = '2026-08-24T15:00:00.000Z'
    expect(kstDateString(new Date(iso))).toBe('2026-08-25')
    expect(kstDateString(iso)).toBe('2026-08-25')
    expect(kstDateString(Date.parse(iso))).toBe('2026-08-25')
  })
})

describe('kstHour / kstSixHourBlock — 6시간 묶음 창 (#13 픽업됨)', () => {
  it('KST 시각을 반환한다', () => {
    expect(kstHour('2026-08-24T00:00:00Z')).toBe(9)
    expect(kstHour('2026-08-24T15:00:00Z')).toBe(0)
  })

  it('0~5시=H0, 6~11시=H1, 12~17시=H2, 18~23시=H3', () => {
    expect(kstSixHourBlock('2026-08-24T15:00:00Z')).toBe('2026-08-25-H0') // KST 00:00
    expect(kstSixHourBlock('2026-08-24T21:00:00Z')).toBe('2026-08-25-H1') // KST 06:00
    expect(kstSixHourBlock('2026-08-24T03:00:00Z')).toBe('2026-08-24-H2') // KST 12:00
    expect(kstSixHourBlock('2026-08-24T09:00:00Z')).toBe('2026-08-24-H3') // KST 18:00
  })

  it('같은 6시간 창 안이면 같은 키 — 병합 대상이 된다', () => {
    expect(kstSixHourBlock('2026-08-24T03:00:00Z')).toBe(kstSixHourBlock('2026-08-24T08:59:59Z'))
    expect(kstSixHourBlock('2026-08-24T03:00:00Z')).not.toBe(kstSixHourBlock('2026-08-24T09:00:00Z'))
  })
})

describe('group_key 빌더 — type 접두가 종류 간 충돌을 막는다', () => {
  it('UNIQUE 인덱스가 (user_id, group_key)뿐이라 같은 활동의 서로 다른 소식이 충돌하면 안 된다', () => {
    const activityId = 1234567890
    const keys = [
      syncGroupKey('badge_earned', activityId),
      syncGroupKey('item_badge_earned', activityId),
      syncGroupKey('poi_badge_earned', activityId),
    ]
    expect(new Set(keys).size).toBe(3)
  })

  it('syncGroupKey는 {type}:sync:{activityId}', () => {
    expect(syncGroupKey('badge_earned', 42)).toBe('badge_earned:sync:42')
  })

  it('dailyGroupKey는 KST 날짜를 쓴다', () => {
    expect(dailyGroupKey('points_earned', '2026-08-24T15:00:00Z')).toBe('points_earned:2026-08-25')
    // UTC 기준이면 아래 두 시각이 다른 키가 되어 아침·저녁 포인트가 갈라진다
    expect(dailyGroupKey('points_earned', '2026-08-24T23:00:00Z')).toBe(
      dailyGroupKey('points_earned', '2026-08-25T05:00:00Z')
    )
  })

  it('sixHourGroupKey는 {type}:{KST 6시간 블록}', () => {
    expect(sixHourGroupKey('drop_picked_up', '2026-08-24T09:00:00Z')).toBe('drop_picked_up:2026-08-24-H3')
  })

  it('scopedGroupKey로 미션 마일스톤 키를 만든다 (티켓 명세 형식)', () => {
    expect(scopedGroupKey('mission_milestone', 'm-1', 50)).toBe('mission_milestone:m-1:50')
    expect(scopedGroupKey('mission_milestone', 'm-1', 80)).toBe('mission_milestone:m-1:80')
  })
})

describe('bumps_badge 파생 — ① 보상 획득 6종만 false', () => {
  const REWARD_TYPES: NotificationType[] = [
    'badge_earned',
    'rare_badge_earned',
    'item_badge_earned',
    'poi_badge_earned',
    'points_earned',
    'first_badge',
  ]

  const OTHER_TYPES: NotificationType[] = [
    'collection_slottable', 'collection_near_complete', 'collection_completable',
    'drop_picked_up', 'drop_spot_active',
    'mission_milestone', 'mission_deadline', 'mission_completed', 'mission_rank_up', 'mission_ended',
    'followed', 'mutual_follow',
    'following_rare_badge', 'following_collection_complete',
    'following_mission_complete',
    'strava_disconnected', 'sync_stalled', 'inventory_full',
    'admin_points_changed', 'announcement',
  ]

  it('보상 획득 6종은 dot을 켜지 않는다 (동기화 화면에서 이미 봤다)', () => {
    for (const type of REWARD_TYPES) expect(bumpsBadgeFor(type)).toBe(false)
    expect(NON_BUMPING_NOTIFICATION_TYPES.size).toBe(6)
  })

  it('나머지 20종은 dot을 켠다', () => {
    for (const type of OTHER_TYPES) expect(bumpsBadgeFor(type)).toBe(true)
  })

  it('26종 전부를 빠짐없이 분류한다', () => {
    expect(REWARD_TYPES.length + OTHER_TYPES.length).toBe(26)
    expect(new Set([...REWARD_TYPES, ...OTHER_TYPES]).size).toBe(26)
  })
})
