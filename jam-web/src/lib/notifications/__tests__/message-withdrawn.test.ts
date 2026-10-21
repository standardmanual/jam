/**
 * 소식 문구의 탈퇴한 행위자 표기 (티켓 20261021_1249 2회, 운영 로직 17.2절)
 *
 * 행위자를 쓰는 5종(drop_picked_up · followed · following_rare_badge · following_collection_complete · following_mission_complete)에서
 * 행위자 프로필이 없으면 이름 자리에 고정 텍스트 `₩*&%#@`를 쓴다. 프로필은 있는데 표시 이름이 비어 있으면 지금처럼 «익명»,
 * 행위자를 쓰지 않는 종류는 영향이 없다. 두 번째 행위자가 탈퇴면 지금처럼 «A님 외 1명»이 된다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/notifications/__tests__/message-withdrawn.test.ts
 */
import type { NotificationType } from '@/types/database'
import { d } from '@/lib/i18n'
import { notificationPlainText, type NotificationView } from '../message'

const ME = { id: 'me', username: '시현', avatarUrl: null }
const ACTOR = { id: 'a1', username: '예린', avatarUrl: null }
const NAMELESS_ACTOR = { id: 'a3', username: null, avatarUrl: null }

const WITHDRAWN = '₩*&%#@'

function view(type: NotificationType, payload: Record<string, unknown>, extra: Partial<NotificationView> = {}): NotificationView {
  return {
    id: 'n1',
    type,
    payload,
    actorCount: 1,
    actor: null,
    actor2: null,
    me: ME,
    updatedAt: '2026-10-21T09:00:00.000Z',
    warning: false,
    ...extra,
  }
}

describe('탈퇴 문구는 사전 한 곳에 있다', () => {
  it('이름 자리 텍스트와 안내 문구가 사용자가 정한 고정 텍스트다', () => {
    expect(d.withdrawnUser.name).toBe(WITHDRAWN)
    expect(d.withdrawnUser.notice).toBe('₩*&%#@님은 탈퇴한 사용자입니다')
  })
})

describe('행위자를 쓰는 5종 — 행위자가 없으면 이름 자리에 고정 텍스트', () => {
  it('drop_picked_up: 한 개 줍힘', () => {
    const v = view('drop_picked_up', { badge_ids: ['b1'], badge_name: '한강 쉼터 배지' })
    expect(notificationPlainText(v)).toBe(`${WITHDRAWN}님이 한강 쉼터 배지를 픽업했어요`)
  })

  it('drop_picked_up: 잠긴 개체 한 개', () => {
    const v = view('drop_picked_up', { locked_item_ids: ['i1'], badge_ids: [] })
    expect(notificationPlainText(v)).toContain(`${WITHDRAWN}님`)
  })

  it('followed: 한 명', () => {
    expect(notificationPlainText(view('followed', { actor_ids: ['a1'] }))).toBe(`${WITHDRAWN}님이 팔로우해요`)
  })

  it('followed: 두 번째 행위자가 탈퇴면 «A님 외 1명»이 된다', () => {
    const v = view('followed', { actor_ids: ['a1', 'a2'] }, { actor: ACTOR, actorCount: 2, actor2: null })
    expect(notificationPlainText(v)).toBe('예린님 외 1명이 팔로우해요')
  })

  it('following_rare_badge', () => {
    const v = view('following_rare_badge', { rarity: 'rare', badge_name: '아침 러너' })
    expect(notificationPlainText(v)).toContain(WITHDRAWN)
    expect(notificationPlainText(v)).not.toContain(d.profile.anonymous)
  })

  it('following_collection_complete', () => {
    const v = view('following_collection_complete', { book_name: '한강 아이템북' })
    expect(notificationPlainText(v)).toBe(`${WITHDRAWN}님이 한강 아이템북을 다 모았어요`)
  })

  it('following_mission_complete', () => {
    const v = view('following_mission_complete', { mission_title: '주 3회 달리기', actor_ids: ['a1'] })
    expect(notificationPlainText(v)).toContain(`${WITHDRAWN}님`)
  })
})

describe('행위자가 있으면 지금처럼 이름이 나온다', () => {
  it('살아 있는 행위자는 이름으로 보인다', () => {
    expect(notificationPlainText(view('followed', { actor_ids: ['a1'] }, { actor: ACTOR }))).toBe('예린님이 팔로우해요')
  })

  it('프로필은 있는데 표시 이름이 비어 있으면 «익명»이다(탈퇴 표시가 아니다)', () => {
    const text = notificationPlainText(view('followed', { actor_ids: ['a3'] }, { actor: NAMELESS_ACTOR }))
    expect(text).toBe(`${d.profile.anonymous}님이 팔로우해요`)
    expect(text).not.toContain(WITHDRAWN)
  })
})

describe('행위자를 쓰지 않는 종류는 탈퇴 표기가 끼어들지 않는다', () => {
  it('actor가 null이어도 tribe_changed 문구에는 고정 텍스트가 없다', () => {
    const text = notificationPlainText(view('tribe_changed', { tribe_name: '바람 트라이브' }))
    expect(text).not.toContain(WITHDRAWN)
  })
})
