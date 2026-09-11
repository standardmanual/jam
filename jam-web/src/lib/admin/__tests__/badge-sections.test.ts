/**
 * badge-sections.ts — 어드민 배지 생성·수정·조회 화면 섹션 구성 (티켓 20260911_0901)
 */
import { describe, it, expect } from 'vitest'
import {
  computeBadgeSectionStatuses,
  isActivityTypeRequiredMissing,
  previewConditionText,
  visibleBadgeSections,
  badgeSectionTitle,
  type BadgeSectionSnapshot,
} from '../badge-sections'

const base: BadgeSectionSnapshot = {
  type: 'activity',
  isJam: false,
  activityTypeCount: 1,
  name: '새벽의 러너',
  description: '설명',
  conditionCount: 0,
  missionReward: false,
  tribeId: null,
  itemBookId: null,
  poiCount: 0,
  pointReward: 0,
  patchAvailable: false,
  hasPeriod: false,
  imageUrl: 'https://example.com/a.png',
  hasAnimation: false,
  hasBackgroundColor: true,
}

describe('visibleBadgeSections — 타입 때문에 숨긴 섹션은 목차에서도 숨긴다', () => {
  it('액티비티는 6개 섹션을 모두 보인다', () => {
    expect(visibleBadgeSections({ type: 'activity', isJam: false })).toEqual(['class', 'basic', 'cond', 'link', 'reward', 'design'])
  })
  it('JAM! 배지는 연결 정보를 숨긴다', () => {
    expect(visibleBadgeSections({ type: 'activity', isJam: true })).not.toContain('link')
  })
  it('체크인은 획득 조건을 숨긴다', () => {
    expect(visibleBadgeSections({ type: 'checkin', isJam: false })).not.toContain('cond')
  })
  it('JAM! 표시는 액티비티에서만 의미가 있다 — 아이템이면 연결 정보가 보인다', () => {
    expect(visibleBadgeSections({ type: 'item', isJam: true })).toContain('link')
  })
  it('아이템의 조건 섹션 제목은 「드랍 조건」이다', () => {
    expect(badgeSectionTitle('cond', { type: 'item', isJam: false })).toBe('드랍 조건')
    expect(badgeSectionTitle('cond', { type: 'activity', isJam: false })).toBe('획득 조건')
  })
})

describe('isActivityTypeRequiredMissing — 분류 필수 검증 (티켓 20260910_2314 해소)', () => {
  it('액티비티이고 JAM!이 아니면 종목이 1개 이상 필요하다', () => {
    expect(isActivityTypeRequiredMissing({ type: 'activity', isJam: false, activityTypeCount: 0 })).toBe(true)
    expect(isActivityTypeRequiredMissing({ type: 'activity', isJam: false, activityTypeCount: 1 })).toBe(false)
  })
  it('JAM! 배지는 종목이 비어 있어도 된다', () => {
    expect(isActivityTypeRequiredMissing({ type: 'activity', isJam: true, activityTypeCount: 0 })).toBe(false)
  })
  it('체크인·아이템은 검사하지 않는다', () => {
    expect(isActivityTypeRequiredMissing({ type: 'checkin', isJam: false, activityTypeCount: 0 })).toBe(false)
    expect(isActivityTypeRequiredMissing({ type: 'item', isJam: false, activityTypeCount: 0 })).toBe(false)
  })
})

describe('computeBadgeSectionStatuses', () => {
  it('필수가 다 채워지면 완료다', () => {
    const s = computeBadgeSectionStatuses(base)
    expect(s.class).toEqual({ tone: 'ok', text: '완료' })
    expect(s.basic).toEqual({ tone: 'ok', text: '완료' })
    expect(s.design).toEqual({ tone: 'ok', text: '완료 · 배경색' })
  })
  it('빠진 필수 수와 이미지 누락을 알린다', () => {
    const s = computeBadgeSectionStatuses({ ...base, name: ' ', description: '', imageUrl: null, activityTypeCount: 0 })
    expect(s.class).toEqual({ tone: 'bad', text: '분류 필요' })
    expect(s.basic).toEqual({ tone: 'bad', text: '필수 2개 남음' })
    expect(s.design).toEqual({ tone: 'bad', text: '이미지 필요' })
  })
  it('조건 수·미션 보상·아이템 빈 조건을 구분한다', () => {
    expect(computeBadgeSectionStatuses({ ...base, conditionCount: 3 }).cond).toEqual({ tone: 'set', text: '3개 설정' })
    expect(computeBadgeSectionStatuses({ ...base, conditionCount: 3, missionReward: true }).cond.text).toBe('미션 보상')
    expect(computeBadgeSectionStatuses({ ...base, type: 'item' }).cond.text).toBe('없음 · 모두에게 드랍')
  })
  it('연결 정보 — 체크인은 지점 수, 그 외는 트라이브·컬렉션 수', () => {
    expect(computeBadgeSectionStatuses({ ...base, type: 'checkin', poiCount: 2 }).link.text).toBe('지점 2곳')
    expect(computeBadgeSectionStatuses({ ...base, tribeId: 't', itemBookId: 'b' }).link.text).toBe('2개 연결')
    expect(computeBadgeSectionStatuses(base).link).toEqual({ tone: 'idle', text: '선택' })
  })
  it('보상·유효기간은 설정한 항목 수를 센다', () => {
    expect(computeBadgeSectionStatuses({ ...base, pointReward: 300, patchAvailable: true }).reward.text).toBe('2개 설정')
  })
})

describe('previewConditionText — 레일 미리보기의 조건 줄', () => {
  it('요약 칩 앞 3개를 잇는다', () => {
    expect(
      previewConditionText({
        type: 'activity',
        isJam: false,
        condition: { distance_km: 30, total_count: 10, streak_days: 7, active_days_count: 100 },
        poiNames: [],
      })
    ).toBe('누적 30km · 10회 · 7일 연속')
  })
  it('미션 보상 배지는 미션 문구로 대신한다', () => {
    expect(
      previewConditionText({ type: 'activity', isJam: false, condition: { mission_reward: true, distance_km: 5 }, poiNames: [] })
    ).toBe('미션 완료 시 지급')
  })
  it('체크인은 연결된 지점 이름으로 말한다', () => {
    expect(previewConditionText({ type: 'checkin', isJam: false, condition: null, poiNames: ['북한산 백운대'] })).toBe(
      '북한산 백운대 통과 시 획득'
    )
    expect(previewConditionText({ type: 'checkin', isJam: false, condition: null, poiNames: ['가', '나', '다', '라'] })).toBe(
      '가, 나 외 2곳 통과 시 획득'
    )
    expect(previewConditionText({ type: 'checkin', isJam: false, condition: null, poiNames: [] })).toBe('연결된 지점 통과 시 획득')
  })
  it('조건이 없으면 안내 문구를 보인다', () => {
    expect(previewConditionText({ type: 'item', isJam: false, condition: null, poiNames: [] })).toBe('조건을 넣으면 여기에 표시돼요')
  })
})
