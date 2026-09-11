/**
 * ranking-modes.ts — 어드민 랭킹모드 생성·수정 화면 순수 함수 유닛테스트 (티켓 20260911_1440)
 */
import { describe, it, expect } from 'vitest'
import {
  collectRankingModeMissing,
  buildRankingModeSavePayload,
  rankingMetricFieldGroups,
  type RankingModeFormValues,
} from '../ranking-modes'

const baseValues: RankingModeFormValues = {
  title: '이주의 러닝 챔피언',
  targetType: 'mission_participants',
  targetMissionId: 'm1',
  targetUserIds: [],
  metricType: 'condition_field',
  metricFieldKey: '',
  metricBadgeType: '',
  startsAt: '2026-09-11T00:00',
  endsAt: '2026-09-18T00:00',
  visibleRankCount: '',
}

describe('collectRankingModeMissing', () => {
  it('필수가 다 채워지면 누락이 없다(미션 참가자 대상)', () => {
    expect(collectRankingModeMissing(baseValues)).toEqual([])
  })
  it('제목이 비면 title 누락이다', () => {
    expect(collectRankingModeMissing({ ...baseValues, title: '  ' })).toContain('title')
  })
  it('대상이 미션 참가자인데 미션을 안 고르면 targetMissionId 누락이다', () => {
    expect(collectRankingModeMissing({ ...baseValues, targetMissionId: '' })).toContain('targetMissionId')
  })
  it('대상이 유저 직접 지정인데 유저가 없으면 targetUserIds 누락이다', () => {
    const v: RankingModeFormValues = { ...baseValues, targetType: 'manual_users', targetUserIds: [] }
    expect(collectRankingModeMissing(v)).toContain('targetUserIds')
  })
  it('유저 직접 지정 + condition_field인데 필드를 안 고르면 metricFieldKey 누락이다', () => {
    const v: RankingModeFormValues = { ...baseValues, targetType: 'manual_users', targetUserIds: ['u1'], metricFieldKey: '' }
    expect(collectRankingModeMissing(v)).toContain('metricFieldKey')
  })
  it('1차 미지원 필드를 고르면 metricFieldKey 누락으로 막는다(예: 한 번의 활동 기록류)', () => {
    const v: RankingModeFormValues = {
      ...baseValues,
      targetType: 'manual_users',
      targetUserIds: ['u1'],
      metricFieldKey: 'max_speed_kmh',
    }
    expect(collectRankingModeMissing(v)).toContain('metricFieldKey')
  })
  it('유저 직접 지정 + badge_count인데 배지 타입을 안 고르면 metricBadgeType 누락이다', () => {
    const v: RankingModeFormValues = {
      ...baseValues,
      targetType: 'manual_users',
      targetUserIds: ['u1'],
      metricType: 'badge_count',
      metricBadgeType: '',
    }
    expect(collectRankingModeMissing(v)).toContain('metricBadgeType')
  })
  it('시작·종료 일시가 비면 각각 누락이다', () => {
    expect(collectRankingModeMissing({ ...baseValues, startsAt: '', endsAt: '' })).toEqual(
      expect.arrayContaining(['startsAt', 'endsAt'])
    )
  })
})

describe('buildRankingModeSavePayload', () => {
  it('미션 참가자 대상 — target_mission_id를 쓰고 metric_type은 mission_progress로 고정한다', () => {
    const p = buildRankingModeSavePayload({ ...baseValues, metricFieldKey: '무시됨', targetUserIds: ['무시됨'] })
    expect(p.target_type).toBe('mission_participants')
    expect(p.target_mission_id).toBe('m1')
    // 대상 방식이 아닌 쪽 값은 비운다
    expect(p.target_user_ids).toEqual([])
    expect(p.metric_type).toBe('mission_progress')
    expect(p.metric_field_key).toBeNull()
    expect(p.metric_badge_type).toBeNull()
  })
  it('유저 직접 지정 + condition_field — target_user_ids와 metric_field_key를 쓴다', () => {
    const p = buildRankingModeSavePayload({
      ...baseValues,
      targetType: 'manual_users',
      targetMissionId: '무시됨',
      targetUserIds: ['u1', 'u2'],
      metricType: 'condition_field',
      metricFieldKey: 'distance_km',
    })
    expect(p.target_mission_id).toBeNull()
    expect(p.target_user_ids).toEqual(['u1', 'u2'])
    expect(p.metric_type).toBe('condition_field')
    expect(p.metric_field_key).toBe('distance_km')
    expect(p.metric_badge_type).toBeNull()
  })
  it('유저 직접 지정 + badge_count — metric_badge_type을 쓴다', () => {
    const p = buildRankingModeSavePayload({
      ...baseValues,
      targetType: 'manual_users',
      targetUserIds: ['u1'],
      metricType: 'badge_count',
      metricBadgeType: 'activity',
    })
    expect(p.metric_type).toBe('badge_count')
    expect(p.metric_badge_type).toBe('activity')
    expect(p.metric_field_key).toBeNull()
  })
  it('시작·종료 일시는 ISO 문자열로 변환한다', () => {
    const p = buildRankingModeSavePayload(baseValues)
    expect(p.starts_at).toBe(new Date(baseValues.startsAt).toISOString())
    expect(p.ends_at).toBe(new Date(baseValues.endsAt).toISOString())
  })
  it('공개 인원 제한을 비우면 null(무제한)로, 채우면 숫자로 저장한다', () => {
    expect(buildRankingModeSavePayload(baseValues).visible_rank_count).toBeNull()
    expect(buildRankingModeSavePayload({ ...baseValues, visibleRankCount: '10' }).visible_rank_count).toBe(10)
  })
  it('제목은 trim해서 저장한다', () => {
    expect(buildRankingModeSavePayload({ ...baseValues, title: '  챔피언  ' }).title).toBe('챔피언')
  })
})

describe('rankingMetricFieldGroups', () => {
  const groups = rankingMetricFieldGroups()

  it('measurable·meta 역할 필드만 그룹으로 묶는다(필터·관계 필드는 제외)', () => {
    const allKeys = groups.flatMap((g) => g.fields.map((f) => f.key))
    // day_of_week·activity_type 등 필터 성격 필드는 정렬 지표가 될 수 없어 목록에 없어야 한다
    expect(allKeys).not.toContain('day_of_week')
    expect(allKeys).not.toContain('activity_type')
    expect(allKeys).not.toContain('prerequisite_badge_names')
  })
  it('1차 지원 필드는 supported: true, 나머지는 supported: false다', () => {
    const distanceKm = groups.flatMap((g) => g.fields).find((f) => f.key === 'distance_km')
    const maxSpeed = groups.flatMap((g) => g.fields).find((f) => f.key === 'max_speed_kmh')
    expect(distanceKm?.supported).toBe(true)
    expect(maxSpeed?.supported).toBe(false)
  })
  it('빈 그룹(측정 가능한 필드가 하나도 없는 섹션)은 목록에 없다', () => {
    for (const g of groups) expect(g.fields.length).toBeGreaterThan(0)
  })
})
