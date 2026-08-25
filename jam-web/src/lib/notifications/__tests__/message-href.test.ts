/**
 * 알림(소식) 문구 렌더러 + 착지점 계산 + 시간 구간 + ⑧ 경고 재평가
 * 티켓 20260824_021
 *
 * PRD §3의 26종 표가 이 코드의 명세라, 표의 **예시 문구를 그대로 단언**한다.
 * 문구가 바뀌면 테스트가 먼저 깨져야 한다.
 */
import type { NotificationType } from '@/types/database'
import {
  buildNotificationMessage,
  hasBatchim,
  notificationPlainText,
  tokenizeMessage,
  type NotificationView,
} from '../message'
import { missingMessageSlots } from '../message'
import { ADMIN_REASONS } from '@/lib/points/reasons'
import { notificationTarget } from '../href'
import { notificationSection } from '../section'
import { isWarningNotification } from '../warning'

const ME = { id: 'me', username: '시현', avatarUrl: null }
const ACTOR = { id: 'a1', username: '예린', avatarUrl: null }
const ACTOR2 = { id: 'a2', username: '민수', avatarUrl: null }

function view(
  type: NotificationType,
  payload: Record<string, unknown>,
  extra: Partial<NotificationView> = {}
): NotificationView {
  return {
    id: 'n1',
    type,
    payload,
    actorCount: 1,
    actor: null,
    actor2: null,
    me: ME,
    updatedAt: '2026-08-24T09:00:00.000Z',
    warning: false,
    ...extra,
  }
}

function text(v: NotificationView): string {
  return notificationPlainText(v)
}

describe('tokenizeMessage — payload 슬롯만 볼드 (PRD §5)', () => {
  it('슬롯은 볼드, 고정 텍스트는 일반', () => {
    const tokens = tokenizeMessage('오늘 활동으로 {badgeCount}를 획득했어요', {
      badgeCount: '배지 3개',
    })
    expect(tokens).toEqual([
      { text: '오늘 활동으로 ', bold: false },
      { text: '배지 3개', bold: true },
      { text: '를 획득했어요', bold: false },
    ])
  })

  it('조사는 볼드가 아니다 — 변수가 아니라 문법이다', () => {
    const tokens = tokenizeMessage("'{bookName}'{을/를} 다 모았어요", { bookName: '잃어버린 시간' })
    expect(tokens.find((t) => t.text === '을')?.bold).toBe(false)
  })

  it('값이 비면 슬롯을 통째로 버린다 — 유저에게 `{badgeName}`을 보이지 않는다', () => {
    expect(tokenizeMessage('{a}입니다', {}).map((t) => t.text).join('')).toBe('입니다')
  })
})

describe('조사 — 따옴표를 건너뛰고 실제 글자의 받침을 읽는다', () => {
  it('받침이 있으면 을/이, 없으면 를/가', () => {
    expect(hasBatchim('잃어버린 시간')).toBe(true)
    expect(hasBatchim('별을 삼킨 바퀴')).toBe(false)
  })

  it("따옴표로 감싼 값도 안쪽 글자로 판정한다 — `'잃어버린 시간'을`", () => {
    expect(hasBatchim("'잃어버린 시간'")).toBe(true)
  })

  it('숫자는 음독의 받침을 따른다 (1 일 → 받침 있음, 2 이 → 없음)', () => {
    expect(hasBatchim('1')).toBe(true)
    expect(hasBatchim('2')).toBe(false)
  })

  it('영문은 받침 없음으로 본다 — PRD의 `\'한강 100km\'가`와 일치', () => {
    expect(hasBatchim("'한강 100km'")).toBe(false)
  })
})

describe('① 보상 획득', () => {
  it('#1 활동배지 — 개수는 payload.count가 아니라 badge_ids 길이로 센다', () => {
    // 병합 후 count는 "이번 이벤트분"만 남는다(얕은 병합). 그대로 쓰면 3개를 1개로 말한다.
    const v = view('badge_earned', { badge_ids: ['b1', 'b2', 'b3'], count: 1 })
    expect(text(v)).toBe('오늘 활동으로 배지 3개를 획득했어요')
  })

  it('#2 희귀 배지', () => {
    const v = view('rare_badge_earned', {
      badge_id: 'b1',
      badge_name: '별을 삼킨 바퀴',
      rarity: 'mythic',
    })
    expect(text(v)).toBe("Mythic 배지 '별을 삼킨 바퀴'를 획득했어요")
  })

  it('#2 희귀 배지 — 등급 라벨도 payload 슬롯이므로 볼드다', () => {
    // rarity는 payload에서 오는 값이다. 템플릿에 합쳐 고정 텍스트로 두면
    // 26종 중 이 2종만 §5 "슬롯=볼드" 규칙의 예외가 된다(20260825 정정).
    const v = view('rare_badge_earned', {
      badge_id: 'b1',
      badge_name: '별을 삼킨 바퀴',
      rarity: 'mythic',
    })
    const { template, vars } = buildNotificationMessage(v)
    const tokens = tokenizeMessage(template, vars)
    expect(tokens.find((t) => t.text === 'Mythic')?.bold).toBe(true)
    expect(tokens.find((t) => t.text === '별을 삼킨 바퀴')?.bold).toBe(true)
  })

  it('#3 아이템 배지 — 개수는 inventory_item_ids 길이', () => {
    const v = view('item_badge_earned', { inventory_item_ids: ['i1', 'i2'], count: 1 })
    expect(text(v)).toBe('활동 중에 아이템 배지 2개가 떨어졌어요')
  })

  it('#4 체크인 배지 — 단건은 지점명, 묶음은 "외 N곳"', () => {
    expect(text(view('checkin_badge_earned', { poi_name: '북한산', badge_ids: ['b1'] }))).toBe(
      '북한산에서 체크인 배지를 획득했어요'
    )
    expect(
      text(
        view('checkin_badge_earned', {
          badge_ids: ['b1', 'b2', 'b3'],
          poi_names: ['북한산', '관악산', '도봉산'],
        })
      )
    ).toBe('북한산 외 2곳에서 체크인 배지를 획득했어요')
  })

  it('#4 체크인 배지 반복 획득 — is_first_earn=false + visit_count>1이면 "N번째 체크인 했어요"', () => {
    expect(
      text(
        view('checkin_badge_earned', {
          poi_name: '서초역',
          badge_ids: ['b1'],
          is_first_earn: false,
          visit_count: 3,
        })
      )
    ).toBe('서초역에서 3번째 체크인 했어요')
  })

  it('#4 체크인 배지 반복 획득 — payload에 is_first_earn이 없는 과거 소식은 기존 "획득" 문구 유지(하위호환)', () => {
    expect(text(view('checkin_badge_earned', { poi_name: '북한산', badge_ids: ['b1'] }))).toBe(
      '북한산에서 체크인 배지를 획득했어요'
    )
  })

  it('#4 체크인 배지 — 한 활동에서 최초 획득과 반복 획득이 섞이면 최초 획득 쪽을 대표로 "획득" 문구 + 외 N곳', () => {
    expect(
      text(
        view('checkin_badge_earned', {
          poi_name: '관악산', // sync.ts가 최초 획득 항목을 대표로 골라 넣은 값
          is_first_earn: true,
          badge_ids: ['b1', 'b2'],
          poi_names: ['서초역', '관악산'],
        })
      )
    ).toBe('관악산 외 1곳에서 체크인 배지를 획득했어요')
  })

  it('#5 포인트 — 1,200 JAM 포인트 표기 (1200P는 가이드 위반)', () => {
    expect(text(view('points_earned', { amount: 1200 }))).toBe(
      '오늘 획득한 배지로 1,200 JAM 포인트를 획득했어요'
    )
  })

  it('#7 첫 배지', () => {
    expect(text(view('first_badge', { badge_id: 'b1' }))).toBe('첫 배지가 도착했어요')
  })
})

describe('② 컬렉션', () => {
  it('#9 장착 가능 / #10 완성 임박 / #11 완성 가능', () => {
    expect(
      text(view('collection_slottable', { item_book_id: 'k1', book_name: '오아시스 자판기', count: 3 }))
    ).toBe("'오아시스 자판기'에 넣을 수 있는 아이템 배지가 3개 있어요")
    expect(
      text(view('collection_near_complete', { item_book_id: 'k1', book_name: '잃어버린 시간' }))
    ).toBe("'잃어버린 시간', 한 칸만 남았어요")
    expect(
      text(view('collection_completable', { item_book_id: 'k1', book_name: '잃어버린 시간' }))
    ).toBe("'잃어버린 시간'을 다 모았어요. 컬렉션에 추가해보세요")
  })
})

describe('③ 내가 드랍한 아이템 배지', () => {
  it('#13 단건은 픽업한 사람 이름, 묶음은 개수(= badge_ids 길이)', () => {
    const one = view(
      'drop_picked_up',
      { actor_ids: ['a1'], badge_ids: ['b1'], badge_name: '멈춘 초시계', poi_id: 'p1' },
      { actor: ACTOR }
    )
    expect(text(one)).toBe("예린님이 '멈춘 초시계'를 픽업했어요")

    const many = view(
      'drop_picked_up',
      { actor_ids: ['a1', 'a2'], badge_ids: ['b1', 'b2', 'b3'], badge_name: '멈춘 초시계' },
      { actor: ACTOR, actorCount: 2 }
    )
    expect(text(many)).toBe('시현님의 드랍 아이템 배지 3개가 픽업됐어요')
  })

  it('#18 내 드랍 지점 활성', () => {
    expect(text(view('drop_spot_active', { poi_id: 'p1', visitor_count: 12 }))).toBe(
      '시현님이 드랍한 자리에 12명이 다녀갔어요'
    )
  })
})

describe('④ 미션', () => {
  const mission = { mission_id: 'm1', mission_title: '한강 100km' }

  it('#20 마일스톤 50 / 80', () => {
    expect(
      text(view('mission_milestone', { ...mission, current: 52, target: 100, unit: 'km', milestone: 50 }))
    ).toBe("'한강 100km', 절반을 넘었어요")
    expect(
      text(view('mission_milestone', { ...mission, current: 82, target: 100, unit: 'km', milestone: 80 }))
    ).toBe("'한강 100km', 80%를 넘었어요")
  })

  it('#20 milestone 키가 없으면 current/target 비율에서 파생한다', () => {
    // 없다고 50% 문구로 떨어뜨리면 80% 소식이 "절반을 넘었어요"로 나가는 실패 모드가 된다
    expect(
      text(view('mission_milestone', { ...mission, current: 82, target: 100, unit: 'km' }))
    ).toBe("'한강 100km', 80%를 넘었어요")
    expect(
      text(view('mission_milestone', { ...mission, current: 52, target: 100, unit: 'km' }))
    ).toBe("'한강 100km', 절반을 넘었어요")
  })

  it('#21 마감 임박 — 2일은 "이틀"', () => {
    expect(text(view('mission_deadline', { ...mission, days: 2, remaining: 12, unit: 'km' }))).toBe(
      "'한강 100km'가 이틀 뒤 끝나요. 12km 남았어요"
    )
  })

  it('#22 완료 + 보상 — 보상 구성에 따라 문장이 줄어든다', () => {
    expect(
      text(view('mission_completed', { ...mission, reward_badge_count: 1, reward_points: 500 }))
    ).toBe("'한강 100km'를 완료했어요. 배지 1개와 500 JAM 포인트를 획득했어요")
    expect(
      text(view('mission_completed', { ...mission, reward_badge_count: 0, reward_points: 500 }))
    ).toBe("'한강 100km'를 완료했어요. 500 JAM 포인트를 획득했어요")
    expect(
      text(view('mission_completed', { ...mission, reward_badge_count: 0, reward_points: 0 }))
    ).toBe("'한강 100km'를 완료했어요")
  })

  it('#23 순위 상승 / #24 종료 결과', () => {
    expect(text(view('mission_rank_up', { ...mission, rank: 5 }))).toBe(
      "'한강 100km'에서 5위로 올라섰어요"
    )
    expect(text(view('mission_ended', mission))).toBe("'한강 100km'가 끝났어요. 결과를 확인해보세요")
  })
})

describe('⑤⑥ 소셜', () => {
  it('#26 팔로우 — 1명 / 2명 나열 / 3명+ 축약', () => {
    expect(text(view('followed', { actor_ids: ['a1'] }, { actor: ACTOR }))).toBe(
      '예린님이 시현님을 팔로우해요'
    )
    expect(
      text(
        view('followed', { actor_ids: ['a1', 'a2'] }, { actor: ACTOR, actor2: ACTOR2, actorCount: 2 })
      )
    ).toBe('예린님과 민수님이 시현님을 팔로우해요')
    expect(
      text(view('followed', { actor_ids: ['a1', 'a2', 'a3', 'a4'] }, { actor: ACTOR, actorCount: 4 }))
    ).toBe('예린님 외 3명이 시현님을 팔로우해요')
  })

  it('#27 맞팔 / #29 팔로잉 희귀 배지 / #30 컬렉션 완성', () => {
    expect(text(view('mutual_follow', {}, { actor: ACTOR }))).toBe(
      '예린님과 서로 팔로우하게 됐어요'
    )
    expect(
      text(
        view(
          'following_rare_badge',
          { badge_id: 'b1', badge_name: '별을 삼킨 바퀴', rarity: 'mythic' },
          { actor: ACTOR }
        )
      )
    ).toBe("예린님이 Mythic 배지 '별을 삼킨 바퀴'를 획득했어요")
    expect(
      text(
        view(
          'following_collection_complete',
          { item_book_id: 'k1', book_name: '잃어버린 시간' },
          { actor: ACTOR }
        )
      )
    ).toBe("예린님이 '잃어버린 시간'을 다 모았어요")
  })

  it('#31 팔로잉 미션 완료', () => {
    expect(
      text(
        view(
          'following_mission_complete',
          { mission_id: 'm1', mission_title: '한강 100km', actor_ids: ['a1', 'a2', 'a3'] },
          { actor: ACTOR, actorCount: 3 }
        )
      )
    ).toBe("예린님 외 2명이 '한강 100km'를 완료했어요")
  })
})

describe('⑧ 계정·시스템', () => {
  it('#40·#41·#42 — 가이드 고정 용어 "Strava 동기화"를 쓴다', () => {
    expect(text(view('strava_disconnected', {}))).toBe(
      'Strava 동기화가 끊겼어요. 다시 동기화해야 배지를 획득할 수 있어요'
    )
    expect(text(view('sync_stalled', { days: 3 }))).toBe(
      '3일째 활동을 못 불러오고 있어요. Strava 동기화가 끊겼을 수 있어요'
    )
    expect(text(view('inventory_full', { max_slots: 50, used_slots: 50 }))).toBe(
      '인벤토리가 꽉 찼어요. 50개까지만 보관할 수 있어서 픽업이 안 될 수 있어요'
    )
  })

  it('#44 — reason은 코드다. 유저 노출용 라벨을 경유한다(어드민 원장 라벨과 분리)', () => {
    const grant = view('admin_points_changed', {
      amount: 500,
      direction: 'grant',
      reason: 'cs_compensation',
    })
    expect(text(grant)).toBe('500 JAM 포인트가 들어왔어요 (불편 보상)')
    // 코드가 그대로 새어 나오면 가이드 위반
    expect(text(grant)).not.toContain('cs_compensation')

    // 사유가 없으면 '—'를 노출하지 않고 괄호째 뺀다
    expect(text(view('admin_points_changed', { amount: 300, direction: 'grant', reason: null }))).toBe(
      '300 JAM 포인트가 들어왔어요'
    )
  })

  it('#44 — 괄호 안 사유에도 「지급」·「회수」·「차감」이 새어 나오지 않는다', () => {
    // ADMIN_REASONS의 라벨은 어드민 원장 전용이라 「어뷰징 적발 회수」·「이벤트·프로모션
    // 지급」이 그대로 들어 있다. 본문을 "들어왔어요/빠져나갔어요"로 고친 취지가
    // 괄호에서 무너지면 안 된다(UX 가이드 §1-3 / PRD §3 ⑧).
    const banned = ['지급', '회수', '차감']
    for (const reason of ADMIN_REASONS.map((r) => r.value)) {
      for (const direction of ['grant', 'deduct']) {
        const line = text(view('admin_points_changed', { amount: 200, direction, reason }))
        for (const word of banned) expect(line).not.toContain(word)
        expect(line).not.toContain(reason)
      }
    }
    expect(text(view('admin_points_changed', { amount: 200, direction: 'deduct', reason: 'abuse_reclaim' })))
      .toBe('200 JAM 포인트가 빠져나갔어요 (이용 정책 위반)')
  })

  it("#44 — 'other'와 모르는 코드는 괄호째 뺀다(유저에게 알려줄 사유가 없다)", () => {
    expect(text(view('admin_points_changed', { amount: 100, direction: 'grant', reason: 'other' }))).toBe(
      '100 JAM 포인트가 들어왔어요'
    )
    expect(
      text(view('admin_points_changed', { amount: 100, direction: 'grant', reason: 'legacy_unknown' }))
    ).toBe('100 JAM 포인트가 들어왔어요')
  })

  it('#45 공지 — 어드민이 쓴 완성 문장이라 슬롯이 아니다(줄 전체 볼드 방지)', () => {
    const v = view('announcement', { today_card_id: 'c1', title: '8월 27일 새벽 점검이 있어요' })
    const tokens = buildNotificationMessage(v)
    expect(tokens.template).toBe('8월 27일 새벽 점검이 있어요')
    expect(tokens.vars).toEqual({})
  })
})

describe('착지점 — type + payload로 런타임 계산 (PRD §3)', () => {
  it('#1 단건은 배지 상세, 묶음은 탭 이동만(하이라이트 없음, 20260826_006)', () => {
    expect(notificationTarget(view('badge_earned', { badge_ids: ['b1'] })).href).toBe('/badges/b1')
    expect(notificationTarget(view('badge_earned', { badge_ids: ['b1', 'b2'] })).href).toBe(
      '/badges?tab=activity'
    )
  })

  it('#3은 배지 도감이 아니라 인벤토리 인스턴스로 보낸다', () => {
    expect(notificationTarget(view('item_badge_earned', { inventory_item_ids: ['i1'] })).href).toBe(
      '/inventory/i1'
    )
    expect(
      notificationTarget(view('item_badge_earned', { inventory_item_ids: ['i1', 'i2'] })).href
    ).toBe('/inventory')
  })

  it('#4 묶음은 체크인 탭 이동만(하이라이트 없음, 20260826_006)', () => {
    expect(
      notificationTarget(view('checkin_badge_earned', { badge_ids: ['b1', 'b2'] })).href
    ).toBe('/badges?tab=checkin')
  })

  it('#11은 컬렉션 장착 모드로 보낸다', () => {
    expect(notificationTarget(view('collection_completable', { item_book_id: 'k1' })).href).toBe(
      '/collections/k1?slot=1'
    )
  })

  it('#18은 지도 카메라 이동(`/drops?poi=`)', () => {
    expect(notificationTarget(view('drop_spot_active', { poi_id: 'p1' })).href).toBe('/drops?poi=p1')
  })

  it('2단 타겟 — 아바타는 사람, 본문은 대상', () => {
    // #13 단건: 아바타 → 픽업한 사람 / 본문 → 배지 상세(인벤토리는 이미 소프트 삭제 상태)
    const picked = notificationTarget(
      view('drop_picked_up', { actor_ids: ['a1'], badge_ids: ['b1'] }, { actor: ACTOR })
    )
    expect(picked.avatarHref).toBe('/예린')
    expect(picked.href).toBe('/badges/b1')

    // #30: 아바타 → 프로필 / 본문 → 그 사람의 컬렉션
    const coll = notificationTarget(
      view('following_collection_complete', { item_book_id: 'k1' }, { actor: ACTOR })
    )
    expect(coll.avatarHref).toBe('/예린')
    expect(coll.href).toBe('/예린/collections')

    // #26 묶음은 2단 타겟이 아니라 내 팔로워 목록 한 곳으로 간다
    const many = notificationTarget(
      view('followed', { actor_ids: ['a1', 'a2', 'a3'] }, { actor: ACTOR, actorCount: 3 })
    )
    expect(many.avatarHref).toBeNull()
    expect(many.href).toBe('/시현/followers')
  })

  it('#45는 투데이 카드 CMS를 재사용한다', () => {
    expect(notificationTarget(view('announcement', { today_card_id: 'c1' })).href).toBe('/today/c1')
  })
})

describe('시간 구간 헤더 — KST 기준', () => {
  // 기준: 2026-08-24(월) KST 12:00 = 2026-08-24T03:00:00Z
  const now = '2026-08-24T03:00:00.000Z'

  it('KST 09:00 경계에서 "오늘"이 갈리지 않는다', () => {
    // UTC 00:00 = KST 같은 날 09:00 → 여전히 오늘 (UTC 기준으로 계산하면 여기서 갈린다)
    expect(notificationSection('2026-08-24T00:00:00Z', now)).toBe('today')
    // UTC 전날 15:00 = KST 오늘 00:00 → 오늘의 시작
    expect(notificationSection('2026-08-23T15:00:00Z', now)).toBe('today')
    // 1초 앞은 KST 전날 23:59:59 → 오늘이 아니다
    expect(notificationSection('2026-08-23T14:59:59Z', now)).not.toBe('today')
  })

  it('이번 주는 월요일 시작', () => {
    // 기준일이 월요일이므로 어제(일)는 지난주 → 이번 달
    expect(notificationSection('2026-08-23T05:00:00Z', now)).toBe('month')
    expect(notificationSection('2026-08-01T05:00:00Z', now)).toBe('month')
    expect(notificationSection('2026-07-31T05:00:00Z', now)).toBe('earlier')
  })
})

describe('⑧ 경고 스타일 — 저장하지 않고 렌더 시점에 재평가 (PRD §6-2)', () => {
  const now = new Date('2026-08-24T00:00:00Z')

  it('#40 다시 동기화하면 경고가 강등된다', () => {
    expect(isWarningNotification('strava_disconnected', {}, { stravaConnected: false }, now)).toBe(true)
    expect(isWarningNotification('strava_disconnected', {}, { stravaConnected: true }, now)).toBe(false)
  })

  it('#41 마지막 sync가 3일+ 경과일 때만 유지', () => {
    const stale = { stravaConnected: true, lastSyncedAt: '2026-08-20T00:00:00Z' }
    const fresh = { stravaConnected: true, lastSyncedAt: '2026-08-23T12:00:00Z' }
    expect(isWarningNotification('sync_stalled', { days: 4 }, stale, now)).toBe(true)
    expect(isWarningNotification('sync_stalled', { days: 4 }, fresh, now)).toBe(false)
  })

  it('#42 인벤토리를 비우면 강등된다 — "비웠는데 경고가 남아 있는" 상태 방지', () => {
    expect(isWarningNotification('inventory_full', {}, { inventoryRemainingSlots: 0 }, now)).toBe(true)
    expect(isWarningNotification('inventory_full', {}, { inventoryRemainingSlots: 20 }, now)).toBe(false)
  })

  it('#44 빠져나간 포인트는 되돌릴 수 없어 항상 유지, 들어온 포인트는 경고가 아니다', () => {
    expect(isWarningNotification('admin_points_changed', { direction: 'deduct' }, {}, now)).toBe(true)
    expect(isWarningNotification('admin_points_changed', { direction: 'grant' }, {}, now)).toBe(false)
  })

  it('보상 획득 같은 일반 소식은 경고가 될 수 없다', () => {
    expect(isWarningNotification('badge_earned', {}, {}, now)).toBe(false)
  })
})

describe('빈 슬롯 감지 — 삼키되 로그는 남긴다 (2차 보강)', () => {
  it('값이 채워진 슬롯은 보고하지 않는다', () => {
    expect(
      missingMessageSlots(view('collection_slottable', { book_name: '한강 시리즈', count: 3 }))
    ).toEqual([])
  })

  it('생성 측이 다른 키를 채우면 버려진 슬롯 키를 알려준다', () => {
    // 025 배치가 book_name 대신 다른 이름을 쓰면 "''에 넣을 수 있는 …"이 나간다.
    // 화면은 그대로 두되(빈 슬롯은 버린다) 호출부가 로그를 남길 수 있어야 한다.
    const v = view('collection_slottable', { itembook_name: '한강 시리즈', count: 3 })
    expect(missingMessageSlots(v)).toEqual(['bookName'])
    expect(text(v)).not.toContain('{bookName}')
  })

  it('조사 마커는 슬롯이 아니라 문법이라 보고 대상이 아니다', () => {
    expect(missingMessageSlots(view('collection_completable', { book_name: '한강 시리즈' }))).toEqual([])
  })
})
