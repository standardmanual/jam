/**
 * 알림(소식) 문구 렌더러 + 착지점 계산 + 시간 구간 + ⑧ 경고 재평가
 * 티켓 20260824_021
 *
 * PRD §3의 20종 표가 이 코드의 명세라, 표의 **예시 문구를 그대로 단언**한다.
 * 문구가 바뀌면 테스트가 먼저 깨져야 한다.
 */
import type { NotificationType } from '@/types/database'
import {
  buildNotificationMessage,
  hasBatchim,
  notificationPlainText,
  notificationTokens,
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

// ─────────────────────────────────────────────────────────────────────────────
// ① 활동 결산 — RECAP_CASEBOOK A~F 표가 이 구획의 명세다 (20260827_014)
// ─────────────────────────────────────────────────────────────────────────────

describe('① 활동 결산 — 사다리 A·B / C·D / E / F2', () => {
  const badge = (id: string, name: string, rarity = 'common') => ({ id, name, rarity })
  const item = (id: string, name: string, rarity = 'common') => ({
    inventory_item_id: id,
    badge_id: `bd-${id}`,
    name,
    rarity,
  })
  const checkin = (id: string, poi: string, first = true, visit = 1) => ({
    badge_id: id,
    poi_name: poi,
    first,
    visit,
  })
  const recap = (payload: Record<string, unknown>) => view('activity_recap', payload)

  it('A1·A2 — 1종 1개는 개체를 이름으로. 포인트는 문장 꼬리로만 붙는다', () => {
    const one = recap({ activity_ids: [1], activity_badges: [badge('b1', '한강 러너')] })
    expect(text(one)).toBe('한강 러너 배지를 획득했어요')
    expect(notificationTarget(one).href).toBe('/badges/b1')

    const withPoints = recap({
      activity_ids: [1],
      activity_badges: [badge('b1', '한강 러너')],
      points: 50,
    })
    expect(text(withPoints)).toBe('한강 러너 배지와 50 포인트를 획득했어요')
    // A칸은 보여줄 개체가 하나로 확정돼 있어 포인트가 섞여도 개체 상세를 유지한다
    expect(notificationTarget(withPoints).href).toBe('/badges/b1')
  })

  it('A3 — 희귀 배지는 등급이 첫 단어로 온다 (R2 — 작은따옴표 없음)', () => {
    const v = recap({ activity_ids: [1], activity_badges: [badge('b1', '별을 삼킨 바퀴', 'mystic')] })
    expect(text(v)).toBe('Mystic 배지 별을 삼킨 바퀴를 획득했어요')
    expect(notificationTarget(v).href).toBe('/badges/b1')
  })

  it('A4·A5 — 체크인은 최초 획득과 반복 획득의 서술어가 다르다 (「에서」/「에」)', () => {
    expect(text(recap({ activity_ids: [1], checkin_badges: [checkin('c1', '북한산')] }))).toBe(
      '북한산에서 체크인 배지를 획득했어요'
    )
    expect(
      text(recap({ activity_ids: [1], checkin_badges: [checkin('c1', '북한산', false, 3)] }))
    ).toBe('북한산에 3번째 체크인 했어요')
  })

  it('A6 — 아이템 배지는 종류를 밝히지 않고 이름만. 착지는 도감이 아니라 내가 받은 개체', () => {
    const v = recap({ activity_ids: [1], item_badges: [item('i1', '멈춘 초시계')] })
    expect(text(v)).toBe('멈춘 초시계를 획득했어요')
    expect(notificationTarget(v).href).toBe('/inventory/i1')
  })

  it('잠긴 채 받은 아이템 배지는 이름·등급 없이 말한다 (티켓 20261018_0051, 7.3절)', () => {
    const lockedItem = (id: string) => ({ inventory_item_id: id, badge_id: '', name: '', rarity: null, locked: true })

    const one = recap({ activity_ids: [1], item_badges: [lockedItem('l1')] })
    expect(text(one)).toBe('잠긴 아이템 배지를 받았어요')
    expect(notificationTarget(one).href).toBe('/inventory')

    const many = recap({ activity_ids: [1], item_badges: [lockedItem('l1'), lockedItem('l2'), lockedItem('l3')] })
    expect(text(many)).toBe('잠긴 아이템 배지 3개를 받았어요')

    // 같은 개체가 두 번 담겨도 한 개로 센다(결산은 계속 자라는 행이라 중복 제거가 흡수한다)
    expect(text(recap({ activity_ids: [1], item_badges: [lockedItem('l1'), lockedItem('l1')] }))).toBe(
      '잠긴 아이템 배지를 받았어요'
    )
  })

  it('잠긴 개체와 열린 개체가 섞이면 이름을 나열하지 않고 총량으로 말한다', () => {
    const v = recap({
      activity_ids: [1],
      item_badges: [
        item('i1', '멈춘 초시계'),
        { inventory_item_id: 'l1', badge_id: '', name: '', rarity: null, locked: true },
      ],
    })
    expect(text(v)).toBe('배지 2개를 획득했어요')
    expect(text(v)).not.toContain('멈춘 초시계')
  })

  it('잠긴 개체만 있어도 포인트가 섞이면 총량 문형으로 간다', () => {
    const v = recap({
      activity_ids: [1],
      points: 50,
      item_badges: [{ inventory_item_id: 'l1', badge_id: '', name: '', rarity: null, locked: true }],
    })
    expect(text(v)).toBe('배지 1개와 50 포인트를 획득했어요')
  })

  it('A8·E3 — 첫 배지는 무엇과 섞이든 헤드라인을 가져간다', () => {
    const alone = recap({ first_badge_id: 'fb' })
    expect(text(alone)).toBe('첫 배지가 도착했어요')
    expect(notificationTarget(alone).href).toBe('/badges/fb')

    const withMore = recap({
      activity_ids: [1, 2],
      first_badge_id: 'fb',
      activity_badges: Array.from({ length: 12 }, (_, i) => badge(`b${i}`, `배지 ${i}`)),
    })
    expect(text(withMore)).toBe('첫 배지가 도착했어요. 프로필을 확인해보세요')
    expect(notificationTarget(withMore).href).toBe('/시현')
  })

  it('B — 1종 N개는 대표 + 외 N. 대표는 희귀도 최상위다 (R8)', () => {
    const activity = recap({
      activity_ids: [1],
      activity_badges: [
        badge('b0', '새벽 개근'),
        badge('b1', '한강 러너', 'rare'),
        badge('b2', '남산 정복'),
        badge('b3', '야간 주행'),
      ],
    })
    expect(text(activity)).toBe('한강 러너 외 배지 3개를 획득했어요')
    expect(notificationTarget(activity).href).toBe('/badges?tab=activity')

    const checkins = recap({
      activity_ids: [1],
      checkin_badges: [
        checkin('c1', '북한산'),
        checkin('c2', '관악산'),
        checkin('c3', '도봉산'),
        checkin('c4', '남산'),
      ],
    })
    expect(text(checkins)).toBe('북한산 외 3곳에서 체크인 배지를 획득했어요')
    expect(notificationTarget(checkins).href).toBe('/badges?tab=checkin')

    const items = recap({
      activity_ids: [1],
      item_badges: [item('i1', '멈춘 초시계'), item('i2', '녹슨 열쇠'), item('i3', '빈 병')],
    })
    expect(text(items)).toBe('멈춘 초시계 외 아이템 배지 2개를 획득했어요')
    expect(notificationTarget(items).href).toBe('/inventory')
  })

  it('C·D — 2종 이상은 나열하지 않고 총량으로 말한다 (R5)', () => {
    // C1 — 배지만 있고 개수가 많으면 숫자만으로는 뭘 받았는지 몰라 보러 가게 한다
    const c1 = recap({
      activity_ids: [1],
      activity_badges: Array.from({ length: 4 }, (_, i) => badge(`b${i}`, `배지 ${i}`)),
      item_badges: [item('i1', '멈춘 초시계'), item('i2', '녹슨 열쇠')],
    })
    expect(text(c1)).toBe('획득한 배지 6개를 확인해보세요')
    expect(notificationTarget(c1).href).toBe('/badges')

    // C2 — 개수가 적으면 서술형
    const c2 = recap({
      activity_ids: [1],
      checkin_badges: [checkin('c1', '북한산')],
      item_badges: [item('i1', '멈춘 초시계')],
    })
    expect(text(c2)).toBe('배지 2개를 획득했어요')
    expect(notificationTarget(c2).href).toBe('/badges')

    // C3 — 포인트가 섞이면 배지 목록으로 보낼 수 없어 프로필로 올라간다
    const c3 = recap({
      activity_ids: [1],
      activity_badges: [badge('b1', 'A'), badge('b2', 'B'), badge('b3', 'C')],
      checkin_badges: [checkin('c1', '북한산'), checkin('c2', '남산')],
      points: 250,
    })
    expect(text(c3)).toBe('배지 5개와 250 포인트를 획득했어요')
    expect(notificationTarget(c3).href).toBe('/시현')

    // D1 — 4행이 한 행으로
    const d1 = recap({
      activity_ids: [1],
      activity_badges: Array.from({ length: 4 }, (_, i) => badge(`b${i}`, `배지 ${i}`)),
      checkin_badges: [checkin('c1', '북한산'), checkin('c2', '남산'), checkin('c3', '관악산')],
      item_badges: [item('i1', '멈춘 초시계'), item('i2', '녹슨 열쇠')],
      points: 420,
    })
    expect(text(d1)).toBe('배지 9개와 420 포인트를 획득했어요')
    expect(notificationTarget(d1).href).toBe('/시현')
  })

  it('E1 — 강한 신호가 섞이면 헤드라인으로 승격하고 나머지는 개수로 접는다', () => {
    const v = recap({
      activity_ids: [1],
      activity_badges: [
        badge('b1', '별을 삼킨 바퀴', 'mystic'),
        ...Array.from({ length: 5 }, (_, i) => badge(`n${i}`, `배지 ${i}`)),
      ],
      item_badges: [item('i1', '멈춘 초시계'), item('i2', '녹슨 열쇠')],
    })
    expect(text(v)).toBe('Mystic 배지 별을 삼킨 바퀴 외 배지 7개를 획득했어요')
    // Mystic 상세로 직행하면 나머지 7개를 못 본다
    expect(notificationTarget(v).href).toBe('/badges')
  })

  it('F2 — 활동 2건 이상이면 종류·개수와 무관하게 한 단계 올라간다 (R11)', () => {
    const v = recap({
      activity_ids: [1, 2, 3, 4, 5],
      activity_badges: Array.from({ length: 8 }, (_, i) => badge(`b${i}`, `배지 ${i}`)),
      checkin_badges: [checkin('c1', '남산')],
      item_badges: [item('i1', '멈춘 초시계'), item('i2', '녹슨 열쇠')],
    })
    expect(text(v)).toBe('활동 5건에서 배지 11개를 획득했어요')
    expect(notificationTarget(v).href).toBe('/시현')
  })

  it('F5 — 같은 활동 재처리로 같은 배지가 두 번 들어와도 개수는 한 번만 센다', () => {
    const v = recap({
      activity_ids: [1],
      activity_badges: [badge('b1', '한강 러너'), badge('b1', '한강 러너')],
    })
    expect(text(v)).toBe('한강 러너 배지를 획득했어요')
  })

  it('활동 밖 적립(믹스 위로 포인트 등)만 남으면 포인트만 말한다', () => {
    expect(text(recap({ points: 30 }))).toBe('30 포인트를 획득했어요')
  })
})

describe('② 컬렉션', () => {
  it('#9 장착 가능 / #10 완성 임박(R12) / #11 완성 가능(R13) — R2: 작은따옴표 없음', () => {
    expect(
      text(view('collection_slottable', { item_book_id: 'k1', book_name: '오아시스 자판기', count: 3 }))
    ).toBe('오아시스 자판기에 넣을 수 있는 아이템 배지가 3개 있어요')
    // R12 — "한 칸 남았어요"가 아니라 무엇이 남았는지 말한다
    expect(
      text(
        view('collection_near_complete', {
          item_book_id: 'k1',
          book_name: '잃어버린 시간',
          badge_name: '멈춘 초시계',
        })
      )
    ).toBe('멈춘 초시계를 찾아 잃어버린 시간을 완성해보세요')
    // R13 — 「추가」가 아니라 「완성」
    expect(
      text(view('collection_completable', { item_book_id: 'k1', book_name: '잃어버린 시간' }))
    ).toBe('잃어버린 시간을 다 모았어요. 컬렉션을 완성해보세요')
  })

  it('R11 묶음 — 대상 2건 이상이면 한 행, 착지는 목록', () => {
    const slottable = view('collection_slottable', { count: 7, target_count: 5 })
    expect(text(slottable)).toBe('컬렉션에 넣을 수 있는 아이템 배지 7개가 있어요')
    // 묶음은 배지를 세므로 착지도 배지가 있는 곳이다
    expect(notificationTarget(slottable).href).toBe('/inventory')

    const near = view('collection_near_complete', { target_count: 2 })
    expect(text(near)).toBe('한 칸만 남은 컬렉션이 2개 있어요')
    expect(notificationTarget(near).href).toBe('/collections')

    const completable = view('collection_completable', { target_count: 2 })
    expect(text(completable)).toBe('다 모은 컬렉션 2개를 완성해보세요')
    expect(notificationTarget(completable).href).toBe('/collections')
  })
})

describe('③ 내가 드랍한 아이템 배지', () => {
  it('#13 단건은 픽업한 사람 이름, 묶음은 개수(= badge_ids 길이)', () => {
    const one = view(
      'drop_picked_up',
      { actor_ids: ['a1'], badge_ids: ['b1'], badge_name: '멈춘 초시계', poi_id: 'p1' },
      { actor: ACTOR }
    )
    expect(text(one)).toBe('예린님이 멈춘 초시계를 픽업했어요')

    const many = view(
      'drop_picked_up',
      { actor_ids: ['a1', 'a2'], badge_ids: ['b1', 'b2', 'b3'], badge_name: '멈춘 초시계' },
      { actor: ACTOR, actorCount: 2 }
    )
    // R14 — 본인 닉네임을 부르지 않는다
    expect(text(many)).toBe('드랍한 아이템 배지 3개가 픽업됐어요')
    // 픽업된 아이템은 소프트 삭제 상태라 갈 곳이 없다 — 묶음은 링크가 없다
    expect(notificationTarget(many).href).toBeNull()
    expect(notificationTarget(many).avatarHref).toBeNull()
  })

  it('#18 내 드랍 지점 활성 — R14: 「시현님이 드랍한 자리」가 아니라 「드랍한 곳」', () => {
    expect(text(view('drop_spot_active', { poi_id: 'p1', visitor_count: 12 }))).toBe(
      '드랍한 곳에 12명이 다녀갔어요'
    )
    const grouped = view('drop_spot_active', { visitor_count: 31, target_count: 3 })
    expect(text(grouped)).toBe('드랍한 3곳에 31명이 다녀갔어요')
    expect(notificationTarget(grouped).href).toBe('/drops')
  })
})

describe('④ 미션', () => {
  const mission = { mission_id: 'm1', mission_title: '한강 100km' }

  it('#20 마일스톤 50 / 80', () => {
    expect(
      text(view('mission_milestone', { ...mission, current: 52, target: 100, unit: 'km', milestone: 50 }))
    ).toBe('한강 100km, 절반을 넘었어요')
    expect(
      text(view('mission_milestone', { ...mission, current: 82, target: 100, unit: 'km', milestone: 80 }))
    ).toBe('한강 100km, 80%를 넘었어요')
  })

  it('#20 묶음 — 50%·80% 구간이 섞일 수 있어 구간을 말하지 않는다 (R11)', () => {
    const v = view('mission_milestone', { target_count: 2 })
    expect(text(v)).toBe('미션 2개가 목표에 가까워졌어요')
    expect(notificationTarget(v).href).toBe('/missions')
  })

  it('#20 잔여량을 넣지 않는다 — 20260825_005의 판정을 유지한다', () => {
    const line = text(
      view('mission_milestone', { ...mission, current: 52, target: 100, unit: 'km', milestone: 50 })
    )
    expect(line).not.toContain('48km')
    expect(line).not.toContain('남았어요')
  })

  it('#20 milestone 키가 없으면 current/target 비율에서 파생한다', () => {
    // 없다고 50% 문구로 떨어뜨리면 80% 소식이 "절반을 넘었어요"로 나가는 실패 모드가 된다
    expect(
      text(view('mission_milestone', { ...mission, current: 82, target: 100, unit: 'km' }))
    ).toBe('한강 100km, 80%를 넘었어요')
    expect(
      text(view('mission_milestone', { ...mission, current: 52, target: 100, unit: 'km' }))
    ).toBe('한강 100km, 절반을 넘었어요')
  })

  it('#21 마감 임박 — 2일은 "이틀". 잔여량은 진행 정보라 남긴다(R4의 범위)', () => {
    expect(text(view('mission_deadline', { ...mission, days: 2, remaining: 12, unit: 'km' }))).toBe(
      '한강 100km가 이틀 뒤 끝나요. 12km 남았어요'
    )
    const grouped = view('mission_deadline', { days: 2, target_count: 3 })
    expect(text(grouped)).toBe('미션 3개가 이틀 뒤 끝나요')
    expect(notificationTarget(grouped).href).toBe('/missions')
  })

  it('#22 완료 — R4: 「완료했다」만 말한다. 보상은 착지한 미션 상세에서 본다', () => {
    const one = view('mission_completed', { ...mission, reward_badge_count: 1, reward_points: 500 })
    expect(text(one)).toBe('한강 100km를 완료했어요')
    expect(text(one)).not.toContain('포인트')
    expect(notificationTarget(one).href).toBe('/missions/m1')

    // B4 — 2개 동시 완료는 대표 + 외 N
    const many = view('mission_completed', { ...mission, target_count: 2 })
    expect(text(many)).toBe('한강 100km 외 미션 1개를 완료했어요')
    expect(notificationTarget(many).href).toBe('/missions')
  })

  it('#23 순위 상승 / #24 종료 결과 — 완료자만 축하한다', () => {
    expect(text(view('mission_rank_up', { ...mission, rank: 5 }))).toBe(
      '한강 100km에서 5위로 올라섰어요'
    )
    expect(text(view('mission_rank_up', { target_count: 2 }))).toBe('미션 2개에서 순위가 올랐어요')

    expect(text(view('mission_ended', mission))).toBe('한강 100km가 끝났어요. 결과를 확인해보세요')
    expect(text(view('mission_ended', { ...mission, completed: true }))).toBe(
      '축하해요! 한강 100km를 끝냈어요. 결과를 확인해보세요'
    )
    expect(text(view('mission_ended', { target_count: 3, all_completed: true }))).toBe(
      '축하해요! 미션 3개를 끝냈어요. 결과를 확인해보세요'
    )
    // 하나라도 미완료면 축하를 뺀다
    expect(text(view('mission_ended', { target_count: 3, all_completed: false }))).toBe(
      '미션 3개가 끝났어요. 결과를 확인해보세요'
    )
  })

  describe('트라이브 변경에 따른 참가 취소 (티켓 20261019_1313)', () => {
    const one = { missions: [{ mission_id: 'm1', title: '한강 100km' }] }
    const many = {
      missions: [
        { mission_id: 'm1', title: '한강 100km' },
        { mission_id: 'm2', title: '남산 오르기' },
        { mission_id: 'm3', title: '주말 러닝' },
      ],
    }

    it('한 개면 미션 이름을 「」로 감싸 말한다', () => {
      expect(text(view('mission_participation_cancelled', one))).toBe(
        '트라이브가 바뀌어 「한강 100km」 미션 참가가 취소됐어요'
      )
    })

    it('이름은 payload 슬롯이라 볼드, 고정 문구는 일반이다', () => {
      const bold = notificationTokens(view('mission_participation_cancelled', one))
        .filter((token) => token.bold)
        .map((token) => token.text)
      expect(bold).toEqual(['한강 100km'])
    })

    it('여러 개면 한 행으로 접고 개수를 배열 길이로 센다', () => {
      expect(text(view('mission_participation_cancelled', many))).toBe(
        '트라이브가 바뀌어 미션 3개 참가가 취소됐어요'
      )
      // 병합으로 남은 옛 스칼라(target_count)는 개수에 쓰지 않는다
      expect(text(view('mission_participation_cancelled', { ...many, target_count: 9 }))).toBe(
        '트라이브가 바뀌어 미션 3개 참가가 취소됐어요'
      )
    })

    it('이름이 비었거나 payload가 손상돼도 「」만 남는 문장을 만들지 않는다', () => {
      const blankTitle = { missions: [{ mission_id: 'm1', title: '' }] }
      expect(text(view('mission_participation_cancelled', blankTitle))).toBe(
        '트라이브가 바뀌어 미션 1개 참가가 취소됐어요'
      )
      expect(text(view('mission_participation_cancelled', {}))).toBe(
        '트라이브가 바뀌어 미션 1개 참가가 취소됐어요'
      )
      expect(text(view('mission_participation_cancelled', { missions: 'm1' }))).not.toContain('「」')
    })

    it('채워진 슬롯만 있어 빈 슬롯으로 보고되지 않는다', () => {
      expect(missingMessageSlots(view('mission_participation_cancelled', one))).toEqual([])
      expect(missingMessageSlots(view('mission_participation_cancelled', many))).toEqual([])
    })

    it('착지는 한 개여도 목록이다 — 대상이 아닌 미션의 상세는 404다', () => {
      expect(notificationTarget(view('mission_participation_cancelled', one))).toEqual({
        href: '/missions',
        avatarHref: null,
      })
      expect(notificationTarget(view('mission_participation_cancelled', many)).href).toBe('/missions')
    })

    it('경고 후보가 아니다', () => {
      expect(isWarningNotification('mission_participation_cancelled', one, {})).toBe(false)
    })
  })

  describe('챕터 오름 (티켓 20261019_1316)', () => {
    it('「챕터 N에 올랐어요」를 말한다 — 챕터 이름은 싣지 않는다', () => {
      expect(text(view('chapter_up', { chapter_no: 3 }))).toBe('축하해요! 챕터 3에 올랐어요')
      expect(text(view('chapter_up', { chapter_no: 10 }))).toBe('축하해요! 챕터 10에 올랐어요')
    })

    it('챕터 1은 «오른» 것이 아니라 «시작»이라 「챕터 1을 시작했어요」를 말한다 (티켓 20261021_1248)', () => {
      expect(text(view('chapter_up', { chapter_no: 1 }))).toBe('챕터 1을 시작했어요')
      // 챕터 2 이상은 그대로다
      expect(text(view('chapter_up', { chapter_no: 2 }))).toBe('축하해요! 챕터 2에 올랐어요')
    })

    it('챕터 1 변형도 챕터 번호만 볼드이고 조사 「을」은 볼드가 아니다', () => {
      const tokens = notificationTokens(view('chapter_up', { chapter_no: 1 }))
      expect(tokens.filter((token) => token.bold).map((token) => token.text)).toEqual(['챕터 1'])
      expect(tokens.map((token) => token.text).join('')).toBe('챕터 1을 시작했어요')
    })

    it('챕터 번호는 payload 슬롯이라 볼드, 고정 문구는 일반이다', () => {
      const bold = notificationTokens(view('chapter_up', { chapter_no: 3 }))
        .filter((token) => token.bold)
        .map((token) => token.text)
      expect(bold).toEqual(['챕터 3'])
    })

    it('번호가 비었거나 손상돼도 「챕터 0에」 같은 문장을 만들지 않는다', () => {
      for (const payload of [{}, { chapter_no: 0 }, { chapter_no: -1 }, { chapter_no: 'x' }, { chapter_no: null }]) {
        expect(text(view('chapter_up', payload))).toBe('축하해요! 챕터가 올랐어요')
      }
    })

    it('채워진 슬롯만 있어 빈 슬롯으로 보고되지 않는다', () => {
      expect(missingMessageSlots(view('chapter_up', { chapter_no: 1 }))).toEqual([])
      expect(missingMessageSlots(view('chapter_up', { chapter_no: 2 }))).toEqual([])
      expect(missingMessageSlots(view('chapter_up', {}))).toEqual([])
    })

    it('착지는 내 프로필이다 — 아이디가 없으면 /profile이다', () => {
      expect(notificationTarget(view('chapter_up', { chapter_no: 1 }))).toEqual({ href: '/시현', avatarHref: null })
      expect(notificationTarget(view('chapter_up', { chapter_no: 2 }))).toEqual({ href: '/시현', avatarHref: null })
      const noName = { id: 'me', username: null, avatarUrl: null }
      expect(notificationTarget(view('chapter_up', { chapter_no: 2 }, { me: noName }))).toEqual({
        href: '/profile',
        avatarHref: null,
      })
    })

    it('경고 후보가 아니다', () => {
      expect(isWarningNotification('chapter_up', { chapter_no: 2 }, {})).toBe(false)
    })
  })

  describe('어드민 트라이브 변경 (티켓 20261021_1247)', () => {
    const changed = { new_tribe_name: '아스팔트 레인저' }

    it('바뀐 사실, 새 소속, 이미 번 것은 그대로라는 안내를 한 소식에 말한다 — 사유는 싣지 않는다', () => {
      expect(text(view('tribe_changed', changed))).toBe(
        '트라이브가 바뀌었어요. 이제 아스팔트 레인저 소속이에요. 이미 가진 배지와 잼, 챕터는 그대로예요'
      )
      expect(text(view('tribe_changed', { ...changed, reason_code: 'wrong_pick', memo: '메모' }))).not.toContain('메모')
    })

    it('트라이브 이름은 받침과 상관없이 «{이름} 소속» 꼴이라 조사가 갈리지 않는다', () => {
      expect(text(view('tribe_changed', { new_tribe_name: '숲속의 갱단' }))).toContain('이제 숲속의 갱단 소속이에요')
      expect(text(view('tribe_changed', { new_tribe_name: '낭만 미식가' }))).toContain('이제 낭만 미식가 소속이에요')
    })

    it('트라이브 이름은 payload 슬롯이라 볼드, 고정 문구는 일반이다', () => {
      const tokens = notificationTokens(view('tribe_changed', changed))
      expect(tokens.filter((token) => token.bold).map((token) => token.text)).toEqual(['아스팔트 레인저'])
      expect(tokens.map((token) => token.text).join('')).toBe(text(view('tribe_changed', changed)))
    })

    it('이름이 비었거나 손상돼도 「이제  소속이에요」 같은 문장을 만들지 않는다', () => {
      for (const payload of [{}, { new_tribe_name: '' }, { new_tribe_name: '   ' }, { new_tribe_name: 3 }, { new_tribe_name: null }]) {
        expect(text(view('tribe_changed', payload))).toBe('트라이브가 바뀌었어요. 이미 가진 배지와 잼, 챕터는 그대로예요')
      }
    })

    it('채워진 슬롯만 있어 빈 슬롯으로 보고되지 않는다', () => {
      expect(missingMessageSlots(view('tribe_changed', changed))).toEqual([])
      expect(missingMessageSlots(view('tribe_changed', {}))).toEqual([])
    })

    it('착지는 /profile이다 — 아이디가 있어도 없어도 같다', () => {
      expect(notificationTarget(view('tribe_changed', changed))).toEqual({ href: '/profile', avatarHref: null })
      const noName = { id: 'me', username: null, avatarUrl: null }
      expect(notificationTarget(view('tribe_changed', changed, { me: noName }))).toEqual({
        href: '/profile',
        avatarHref: null,
      })
    })

    it('경고 후보가 아니다', () => {
      expect(isWarningNotification('tribe_changed', changed, {})).toBe(false)
    })
  })

  describe('이용 정지·풀림 (티켓 20261021_1249 6-3 5회)', () => {
    const started = { suspension_id: 's1', suspended_at: '2026-10-22T01:00:00.000Z' }
    const lifted = { suspension_id: 's1', lifted_at: '2026-10-23T01:00:00.000Z' }

    it('정지됨은 사실과 문의로 가는 길만 말한다 — 사유를 싣지 않는다', () => {
      expect(text(view('suspension_started', started))).toBe('이용이 정지됐어요. 정지 사유와 해제 방법은 문의로 알려 드려요')
    })

    it('풀림은 해제됐다는 사실과 다시 할 수 있는 일을 말한다', () => {
      expect(text(view('suspension_lifted', lifted))).toBe('이용 정지가 해제됐어요. 이제 동기화하고 아이템 배지를 획득할 수 있어요')
    })

    it('payload에 사유·어드민 이메일·상담 메모가 섞여 들어와도 문구에 나오지 않는다', () => {
      const leaked = {
        ...started,
        reason: '부정 이용 의심',
        suspended_by: 'admin@j-a-m.app',
        lift_note: '상담 메모',
        memo: '상담 메모',
      }
      for (const type of ['suspension_started', 'suspension_lifted'] as const) {
        const out = text(view(type, leaked))
        expect(out).not.toContain('부정 이용 의심')
        expect(out).not.toContain('admin@')
        expect(out).not.toContain('상담 메모')
      }
    })

    it('두 문구 모두 고정 문장이라 볼드 슬롯이 없다', () => {
      expect(notificationTokens(view('suspension_started', started)).some((token) => token.bold)).toBe(false)
      expect(notificationTokens(view('suspension_lifted', lifted)).some((token) => token.bold)).toBe(false)
    })

    it('빈 슬롯으로 보고되지 않는다 — payload가 비어도 같다', () => {
      expect(missingMessageSlots(view('suspension_started', started))).toEqual([])
      expect(missingMessageSlots(view('suspension_started', {}))).toEqual([])
      expect(missingMessageSlots(view('suspension_lifted', {}))).toEqual([])
    })

    it('착지는 홈이다 — 사유·정지일·문의 버튼이 있는 정지 안내 배너가 홈에 있다', () => {
      expect(notificationTarget(view('suspension_started', started))).toEqual({ href: '/', avatarHref: null })
      expect(notificationTarget(view('suspension_lifted', lifted))).toEqual({ href: '/', avatarHref: null })
      expect(notificationTarget(view('suspension_started', {}))).toEqual({ href: '/', avatarHref: null })
    })

    it('경고 후보가 아니다 — 지난 사건의 기록이라 현재 상태로 강등하지 않는다', () => {
      expect(isWarningNotification('suspension_started', started, {})).toBe(false)
      expect(isWarningNotification('suspension_lifted', lifted, {})).toBe(false)
    })
  })

  describe('받지 않은 보상 (티켓 20261021_1249 6-3 5회)', () => {
    const pending = { mission_id: 'm1', mission_title: '한강 100km' }

    it('미션 제목과 받지 못한 까닭을 말하고, 미션 제목만 굵게 보인다', () => {
      expect(text(view('reward_pending', pending))).toBe('한강 100km에서 받을 보상이 있어요. 인벤토리 빈칸이 모자라 아직 받지 못했어요')
      const tokens = notificationTokens(view('reward_pending', pending))
      expect(tokens.filter((token) => token.bold).map((token) => token.text)).toEqual(['한강 100km'])
    })

    it('«에서»는 받침과 상관없이 같아 조사가 갈리지 않는다', () => {
      expect(text(view('reward_pending', { ...pending, mission_title: '남산 오르기' }))).toContain('남산 오르기에서 받을 보상이 있어요')
      expect(text(view('reward_pending', { ...pending, mission_title: '새벽 러닝' }))).toContain('새벽 러닝에서 받을 보상이 있어요')
    })

    it('제목이 비었거나 손상돼도 「에서 받을 보상이」 같은 문장을 만들지 않는다', () => {
      for (const payload of [{}, { mission_id: 'm1' }, { mission_title: '' }, { mission_title: '   ' }, { mission_title: 3 }, { mission_title: null }]) {
        const out = text(view('reward_pending', payload))
        expect(out).toBe('받을 보상이 있어요. 인벤토리 빈칸이 모자라 아직 받지 못했어요')
        expect(notificationTokens(view('reward_pending', payload)).some((token) => token.bold)).toBe(false)
        expect(missingMessageSlots(view('reward_pending', payload))).toEqual([])
      }
    })

    it('채워진 슬롯만 있어 빈 슬롯으로 보고되지 않는다', () => {
      expect(missingMessageSlots(view('reward_pending', pending))).toEqual([])
    })

    it('착지는 그 미션 상세다 — 미션 id가 비었거나 손상되면 미션 목록이다', () => {
      expect(notificationTarget(view('reward_pending', pending))).toEqual({ href: '/missions/m1', avatarHref: null })
      for (const payload of [{}, { mission_title: '한강 100km' }, { mission_id: '' }, { mission_id: 7 }, { mission_id: null }]) {
        expect(notificationTarget(view('reward_pending', payload))).toEqual({ href: '/missions', avatarHref: null })
      }
    })

    it('경고 후보가 아니다', () => {
      expect(isWarningNotification('reward_pending', pending, {})).toBe(false)
    })
  })
})

describe('캡슐 알림 (티켓 20261028_1734 3회)', () => {
  const REST = '아직 못 받은 보상이 1개 있으니 받기 버튼으로 비워 두면 가득 차도 잼이 계속 들어와요'

  it('capsule_nearly_full: 단계(70·80·90)마다 퍼센트만 달라지고 그 숫자만 굵게 보인다', () => {
    for (const stage of [70, 80, 90]) {
      const v = view('capsule_nearly_full', { stage })
      expect(text(v)).toBe(`캡슐이 ${stage}% 찼어요. ${REST}`)
      expect(notificationTokens(v).filter((token) => token.bold).map((token) => token.text)).toEqual([`${stage}%`])
      expect(missingMessageSlots(v)).toEqual([])
    }
  })

  it('capsule_nearly_full: 단계가 비었거나 손상되면 숫자 없는 문장을 쓴다', () => {
    for (const payload of [{}, { stage: 0 }, { stage: 50 }, { stage: 100 }, { stage: 'x' }, { stage: null }]) {
      const v = view('capsule_nearly_full', payload)
      expect(text(v)).toBe(`캡슐이 거의 찼어요. ${REST}`)
      expect(notificationTokens(v).some((token) => token.bold)).toBe(false)
      expect(missingMessageSlots(v)).toEqual([])
    }
  })

  it('capsule_jam_blocked: 담는 값 없이 고정 문장이다', () => {
    const v = view('capsule_jam_blocked', {})
    expect(text(v)).toBe('캡슐이 가득 찼고 못 받은 보상이 2개라 지금 들어오는 잼은 사라져요. 받기 버튼으로 1개를 비우면 다시 잼을 모을 수 있어요')
    expect(notificationTokens(v).some((token) => token.bold)).toBe(false)
    expect(missingMessageSlots(v)).toEqual([])
  })

  it('capsule_jam_blocked: 잼이 사라진다는 사실을 한 번만 적고, 받을 수 있는 방법을 이어서 적는다(윈터 톤 확인 2026-10-29)', () => {
    const t = text(view('capsule_jam_blocked', {}))
    expect(t.match(/사라져요/g)).toHaveLength(1)
    expect(t).toContain('받기 버튼으로 1개를 비우면')
  })

  it('두 소식 모두 서두르게 하는 말과 소비를 부추기는 말이 없다(운영 로직 18.2절)', () => {
    const all = [view('capsule_nearly_full', { stage: 90 }), view('capsule_jam_blocked', {})].map(text).join(' ')
    for (const banned of ['지금 아니면', '얼른', '서두르', '놓치', '지금 바로', '뽑', '보류']) expect(all).not.toContain(banned)
  })

  it('착지는 캡슐이 있는 홈이다 — 단계나 payload와 상관없다', () => {
    expect(notificationTarget(view('capsule_nearly_full', { stage: 80 }))).toEqual({ href: '/', avatarHref: null })
    expect(notificationTarget(view('capsule_nearly_full', {}))).toEqual({ href: '/', avatarHref: null })
    expect(notificationTarget(view('capsule_jam_blocked', {}))).toEqual({ href: '/', avatarHref: null })
  })

  it('경고 후보가 아니다 — 지난 사건의 기록이다', () => {
    expect(isWarningNotification('capsule_nearly_full', { stage: 70 }, {})).toBe(false)
    expect(isWarningNotification('capsule_jam_blocked', {}, {})).toBe(false)
  })
})

describe('⑤⑥ 소셜', () => {
  it('#26 팔로우 — R14: 본인 닉네임을 부르지 않는다 (1명 / 2명 나열 / 3명+ 축약)', () => {
    expect(text(view('followed', { actor_ids: ['a1'] }, { actor: ACTOR }))).toBe(
      '예린님이 팔로우해요'
    )
    expect(
      text(
        view('followed', { actor_ids: ['a1', 'a2'] }, { actor: ACTOR, actor2: ACTOR2, actorCount: 2 })
      )
    ).toBe('예린님과 민수님이 팔로우해요')
    expect(
      text(view('followed', { actor_ids: ['a1', 'a2', 'a3', 'a4'] }, { actor: ACTOR, actorCount: 4 }))
    ).toBe('예린님 외 3명이 팔로우해요')
  })

  it('#26 단건 followed는 프로필 leaf 링크라 출처 쿼리가 붙는다(20260831_2201)', () => {
    const single = notificationTarget(view('followed', { actor_ids: ['a1'] }, { actor: ACTOR }))
    expect(single.href).toBe('/예린?from=notifications')
    expect(single.avatarHref).toBe('/예린?from=notifications')
  })

  it('#29 팔로잉 희귀 배지 / #30 컬렉션 완성 — R2: 작은따옴표 없음', () => {
    expect(
      text(
        view(
          'following_rare_badge',
          { badge_id: 'b1', badge_name: '별을 삼킨 바퀴', rarity: 'mystic' },
          { actor: ACTOR }
        )
      )
    ).toBe('예린님이 Mystic 배지 별을 삼킨 바퀴를 획득했어요')
    // 프로필 해시(#badge) 링크도 쿼리는 해시 앞에 붙는다(20260831_2201)
    expect(
      notificationTarget(
        view(
          'following_rare_badge',
          { badge_id: 'b1', badge_name: '별을 삼킨 바퀴', rarity: 'mystic' },
          { actor: ACTOR }
        )
      ).href
    ).toBe('/예린?from=notifications#badge')
    expect(
      text(
        view(
          'following_collection_complete',
          { item_book_id: 'k1', book_name: '잃어버린 시간' },
          { actor: ACTOR }
        )
      )
    ).toBe('예린님이 잃어버린 시간을 다 모았어요')
  })

  it('#29 등급 라벨도 payload 슬롯이므로 볼드다 (§5 슬롯=볼드)', () => {
    // rarity는 payload에서 오는 값이다. 템플릿에 합쳐 고정 텍스트로 두면
    // 이 종만 §5 "슬롯=볼드" 규칙의 예외가 된다(20260825 정정).
    // 원래 ① 레거시 #2(rare_badge_earned)에 걸려 있던 단언을 20260827_016에서
    // 같은 템플릿(msgRareBadgeEarned)을 쓰는 #29로 옮겼다.
    const v = view(
      'following_rare_badge',
      { badge_id: 'b1', badge_name: '별을 삼킨 바퀴', rarity: 'mystic' },
      { actor: ACTOR }
    )
    const { template, vars } = buildNotificationMessage(v)
    const tokens = tokenizeMessage(template, vars)
    expect(tokens.find((t) => t.text === 'Mystic')?.bold).toBe(true)
    expect(tokens.find((t) => t.text === '별을 삼킨 바퀴')?.bold).toBe(true)
  })

  it('#29 무한레벨형 — 등급 대신 Lv.N으로 말한다 (티켓 20260905_0038)', () => {
    const v = view(
      'following_rare_badge',
      { badge_id: 'b9', badge_name: '걸어온 거리', level: 6 },
      { actor: ACTOR }
    )
    expect(text(v)).toBe('예린님이 걸어온 거리 Lv.6을 획득했어요')
    // 이름+레벨이 payload 슬롯이므로 볼드다 (§5)
    const { template, vars } = buildNotificationMessage(v)
    expect(tokenizeMessage(template, vars).find((t) => t.text === '걸어온 거리 Lv.6')?.bold).toBe(true)
    // 착지 규칙은 등급형과 같다
    expect(notificationTarget(v).href).toBe('/예린?from=notifications#badge')
  })

  it('#29 아는 등급이 아닌 값은 Common으로 강등하지 않는다', () => {
    // 조용한 강등은 «등급이 없다»와 «가장 낮은 등급이다»를 같은 것으로 만든다(0036과 같은 유형)
    const v = view(
      'following_rare_badge',
      { badge_id: 'b1', badge_name: '별을 삼킨 바퀴', rarity: 'legendary' },
      { actor: ACTOR }
    )
    expect(text(v)).toBe('예린님이 별을 삼킨 바퀴를 획득했어요')
    expect(text(v)).not.toContain('Common')
  })

  it('R15 — 한 사람의 소식이 2건 이상이면 대표 + "소식이 N건 더 있어요", 착지는 그 사람 프로필', () => {
    const v = view(
      'following_rare_badge',
      { badge_id: 'b1', badge_name: '별을 삼킨 바퀴', rarity: 'mystic', more_count: 1 },
      { actor: ACTOR }
    )
    expect(text(v)).toBe('예린님이 Mystic 배지 별을 삼킨 바퀴를 획득했어요. 소식이 1건 더 있어요')
    // 프로필로 연결되는 leaf 링크에는 출처 쿼리가 붙는다(20260831_2201)
    expect(notificationTarget(v).href).toBe('/예린?from=notifications')
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
    ).toBe('예린님 외 2명이 한강 100km를 완료했어요')
  })

  it('#31 팔로잉 미션 완료 — R15 묶음(사람 단위)은 following_rare_badge·following_collection_complete와 동일하게 프로필로 착지하고 출처 쿼리가 붙는다(20260831_2201)', () => {
    const v = view(
      'following_mission_complete',
      { mission_id: 'm1', mission_title: '한강 100km', more_count: 1 },
      { actor: ACTOR }
    )
    expect(notificationTarget(v).href).toBe('/예린?from=notifications')
  })
})

describe('⑧ 계정·시스템', () => {
  it('#40·#41·#42 — 가이드 고정 용어 "Strava 동기화"를 쓴다', () => {
    expect(text(view('strava_disconnected', {}))).toBe(
      'Strava 동기화가 끊겼어요. 다시 동기화해야 배지를 획득할 수 있어요'
    )
    // #41은 원인이 다른 경우 전용이다 — 원인이 다르면 해결책도 달라야 한다(가이드 §4)
    expect(text(view('sync_stalled', { days: 3 }))).toBe(
      '3일째 새 활동이 없어요. Strava에 활동이 기록됐는지 확인해보세요'
    )
    expect(text(view('inventory_full', { max_slots: 50, used_slots: 50 }))).toBe(
      '인벤토리가 꽉 찼어요. 50개까지만 보관할 수 있어서 새 아이템 배지를 바로 받을 수 없어요'
    )
  })

  it('남은 칸 알림 — 3개·1개 단계별 문구는 사건을 말하는 과거형이고 칸 수를 «개»로 쓴다 (20261018_0056)', () => {
    expect(text(view('inventory_slots_low', { remaining_slots: 3, max_slots: 50 }))).toBe(
      '인벤토리 남은 칸이 3개로 줄었어요. 다 차기 전에 장착·믹스·드랍으로 자리를 만들어 보세요'
    )
    expect(text(view('inventory_slots_low', { remaining_slots: 1, max_slots: 50 }))).toBe(
      '인벤토리 남은 칸이 1개로 줄었어요. 다 차면 새 아이템 배지를 바로 받을 수 없어요'
    )
  })

  it('남은 칸 알림 — 2개는 «2개로»를 말하고 «다 차기 전에» 문구를 쓴다 (20261018_1613)', () => {
    expect(text(view('inventory_slots_low', { remaining_slots: 2, max_slots: 50 }))).toBe(
      '인벤토리 남은 칸이 2개로 줄었어요. 다 차기 전에 장착·믹스·드랍으로 자리를 만들어 보세요'
    )
  })

  it('남은 칸 알림 — 단계 값이 비정상이면 3개 단계 문구로 접는다', () => {
    expect(text(view('inventory_slots_low', {}))).toContain('3개로 줄었어요')
    expect(text(view('inventory_slots_low', { remaining_slots: 0 }))).toContain('3개로 줄었어요')
    expect(text(view('inventory_slots_low', { remaining_slots: 9 }))).toContain('3개로 줄었어요')
  })

  it('남은 칸 알림 — 탭하면 인벤토리로 간다', () => {
    const v = view('inventory_slots_low', { remaining_slots: 3, max_slots: 50 })
    expect(notificationTarget(v)).toEqual({ href: '/inventory', avatarHref: null })
  })

  it('#44 — reason은 코드다. 유저 노출용 라벨을 경유한다(어드민 원장 라벨과 분리)', () => {
    const grant = view('admin_points_changed', {
      amount: 500,
      direction: 'grant',
      reason: 'cs_compensation',
    })
    expect(text(grant)).toBe('500 포인트가 들어왔어요 (불편 보상)')
    // 코드가 그대로 새어 나오면 가이드 위반
    expect(text(grant)).not.toContain('cs_compensation')

    // 사유가 없으면 '—'를 노출하지 않고 괄호째 뺀다
    expect(text(view('admin_points_changed', { amount: 300, direction: 'grant', reason: null }))).toBe(
      '300 포인트가 들어왔어요'
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
      .toBe('200 포인트가 빠져나갔어요 (이용 정책 위반)')
  })

  it("#44 — 'other'와 모르는 코드는 괄호째 뺀다(유저에게 알려줄 사유가 없다)", () => {
    expect(text(view('admin_points_changed', { amount: 100, direction: 'grant', reason: 'other' }))).toBe(
      '100 포인트가 들어왔어요'
    )
    expect(
      text(view('admin_points_changed', { amount: 100, direction: 'grant', reason: 'legacy_unknown' }))
    ).toBe('100 포인트가 들어왔어요')
  })

  it('#45 공지 — 어드민이 쓴 완성 문장이라 슬롯이 아니다(줄 전체 볼드 방지)', () => {
    const v = view('announcement', { today_card_id: 'c1', title: '8월 27일 새벽 점검이 있어요' })
    const tokens = buildNotificationMessage(v)
    expect(tokens.template).toBe('8월 27일 새벽 점검이 있어요')
    expect(tokens.vars).toEqual({})
  })
})

describe('착지점 — type + payload로 런타임 계산 (PRD §3)', () => {
  // 20260827_016 — ① 착지 단언의 축이 레거시 6종에서 활동 결산으로 옮겨왔다.
  // 단건은 개체 상세, 여러 개는 카테고리 목록/탭 이동이라는 계약은 그대로다.
  const recapView = (payload: Record<string, unknown>) => view('activity_recap', payload)

  it('① 활동배지 — 단건은 배지 상세, 여러 개는 탭 이동만(하이라이트 없음, 20260826_006)', () => {
    expect(
      notificationTarget(
        recapView({ activity_ids: [1], activity_badges: [{ id: 'b1', name: 'A', rarity: 'common' }] })
      ).href
    ).toBe('/badges/b1')
    expect(
      notificationTarget(
        recapView({
          activity_ids: [1],
          activity_badges: [
            { id: 'b1', name: 'A', rarity: 'common' },
            { id: 'b2', name: 'B', rarity: 'common' },
          ],
        })
      ).href
    ).toBe('/badges?tab=activity')
  })

  it('① 아이템 배지는 배지 도감이 아니라 인벤토리 인스턴스로 보낸다', () => {
    expect(
      notificationTarget(
        recapView({
          activity_ids: [1],
          item_badges: [{ inventory_item_id: 'i1', badge_id: 'bd1', name: 'A', rarity: 'common' }],
        })
      ).href
    ).toBe('/inventory/i1')
    expect(
      notificationTarget(
        recapView({
          activity_ids: [1],
          item_badges: [
            { inventory_item_id: 'i1', badge_id: 'bd1', name: 'A', rarity: 'common' },
            { inventory_item_id: 'i2', badge_id: 'bd2', name: 'B', rarity: 'common' },
          ],
        })
      ).href
    ).toBe('/inventory')
  })

  it('① 체크인 배지 여러 개는 체크인 탭 이동만(하이라이트 없음, 20260826_006)', () => {
    expect(
      notificationTarget(
        recapView({
          activity_ids: [1],
          checkin_badges: [
            { badge_id: 'c1', poi_name: '북한산', first: true, visit: 1 },
            { badge_id: 'c2', poi_name: '남산', first: true, visit: 1 },
          ],
        })
      ).href
    ).toBe('/badges?tab=checkin')
  })

  it('#11은 컬렉션 장착 모드로 보낸다', () => {
    expect(notificationTarget(view('collection_completable', { item_book_id: 'k1' })).href).toBe(
      '/collections/k1?slot=1'
    )
  })

  it('#13 잠긴 채 픽업되면 단건은 이름 없이 말하고 묶음은 열린 개수와 합쳐 세며 어디로도 가지 않는다 (티켓 20261018_1817)', () => {
    const one = view('drop_picked_up', { actor_ids: ['a1'], locked_item_ids: ['d1'], poi_id: 'p1' }, { actor: ACTOR })
    expect(text(one)).toBe('예린님이 잠긴 아이템 배지를 픽업했어요')
    expect(notificationTarget(one).href).toBeNull()
    expect(notificationTarget(one).avatarHref).toBeNull()

    const many = view(
      'drop_picked_up',
      { actor_ids: ['a1', 'a2'], locked_item_ids: ['d1', 'd2'], poi_id: 'p1' },
      { actor: ACTOR, actorCount: 2 }
    )
    expect(text(many)).toBe('드랍한 아이템 배지 2개가 픽업됐어요')
    expect(notificationTarget(many).href).toBeNull()

    // 열린 1개 + 잠긴 1개가 한 묶음이면 개수 2다. 이름 슬롯을 쓰지 않는다
    const mixed = view(
      'drop_picked_up',
      { actor_ids: ['a1'], badge_ids: ['b1'], badge_name: '멈춘 초시계', locked_item_ids: ['d1'] },
      { actor: ACTOR }
    )
    expect(text(mixed)).toBe('드랍한 아이템 배지 2개가 픽업됐어요')
    expect(notificationTarget(mixed).href).toBeNull()
  })

  it('#18은 지도 카메라 이동(`/drops?poi=`)', () => {
    expect(notificationTarget(view('drop_spot_active', { poi_id: 'p1' })).href).toBe('/drops?poi=p1')
  })

  it('2단 타겟 — 아바타는 사람, 본문은 대상', () => {
    // #13 단건: 아바타 → 픽업한 사람 / 본문 → 배지 상세(인벤토리는 이미 소프트 삭제 상태)
    // 아바타 → 프로필 링크에는 출처 쿼리가 붙는다(20260831_2201) — 본문(href)은
    // 프로필이 아니므로 붙지 않는다.
    const picked = notificationTarget(
      view('drop_picked_up', { actor_ids: ['a1'], badge_ids: ['b1'] }, { actor: ACTOR })
    )
    expect(picked.avatarHref).toBe('/예린?from=notifications')
    expect(picked.href).toBe('/badges/b1')

    // #30: 아바타 → 프로필 / 본문 → 그 사람의 컬렉션(하위 경로라 쿼리 없음 — 이미
    // 자체 backHref를 정적으로 가진 라우트)
    const coll = notificationTarget(
      view('following_collection_complete', { item_book_id: 'k1' }, { actor: ACTOR })
    )
    expect(coll.avatarHref).toBe('/예린?from=notifications')
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

  it('남은 칸 알림 — 남은 칸이 3개 이하이면 경고면을 유지하고 4개 이상이면 강등된다 (20261018_0056)', () => {
    const payload = { remaining_slots: 3, max_slots: 50 }
    expect(isWarningNotification('inventory_slots_low', payload, { inventoryRemainingSlots: 3 }, now)).toBe(true)
    expect(isWarningNotification('inventory_slots_low', payload, { inventoryRemainingSlots: 0 }, now)).toBe(true)
    expect(isWarningNotification('inventory_slots_low', payload, { inventoryRemainingSlots: 4 }, now)).toBe(false)
    // 현재 상태를 조회하지 않았으면 보수적으로 경고를 유지한다
    expect(isWarningNotification('inventory_slots_low', payload, {}, now)).toBe(true)
  })

  it('#44 빠져나간 포인트는 되돌릴 수 없어 항상 유지, 들어온 포인트는 경고가 아니다', () => {
    expect(isWarningNotification('admin_points_changed', { direction: 'deduct' }, {}, now)).toBe(true)
    expect(isWarningNotification('admin_points_changed', { direction: 'grant' }, {}, now)).toBe(false)
  })

  it('보상 획득 같은 일반 소식은 경고가 될 수 없다', () => {
    expect(isWarningNotification('activity_recap', {}, {}, now)).toBe(false)
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
