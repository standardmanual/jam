/**
 * points/reasons — 어드민 사유 목록 유닛 테스트
 *
 * 테스트 범위:
 *   - isValidAdminReason: API 레벨 방어 로직 (허용 목록 검증)
 *   - adminReasonLabel: 사유 코드 → 라벨 매핑
 *   - HIGH_VALUE_THRESHOLD: 고액 기준액이 실제 목록/그랜트 로직과 어긋나지 않는지
 *
 * 실행: jest 또는 vitest (프레임워크 무관 — describe/it/expect 호환)
 */

import { ADMIN_REASONS, HIGH_VALUE_THRESHOLD, adminReasonLabel, isValidAdminReason } from '../reasons'

describe('isValidAdminReason', () => {
  it('목록에 있는 값은 true', () => {
    expect(isValidAdminReason('cs_compensation')).toBe(true)
    expect(isValidAdminReason('other')).toBe(true)
  })

  it('목록에 없는 값은 false', () => {
    expect(isValidAdminReason('made_up_reason')).toBe(false)
  })

  it('문자열이 아닌 값은 false (타입 방어)', () => {
    expect(isValidAdminReason(undefined)).toBe(false)
    expect(isValidAdminReason(null)).toBe(false)
    expect(isValidAdminReason(123)).toBe(false)
    expect(isValidAdminReason({})).toBe(false)
  })

  it('빈 문자열은 false', () => {
    expect(isValidAdminReason('')).toBe(false)
  })
})

describe('adminReasonLabel', () => {
  it('알려진 값은 사람이 읽는 라벨을 반환', () => {
    expect(adminReasonLabel('cs_compensation')).toBe('CS 보상')
    expect(adminReasonLabel('abuse_reclaim')).toBe('어뷰징 적발 회수')
  })

  it('null/undefined는 em dash 표시', () => {
    expect(adminReasonLabel(null)).toBe('—')
    expect(adminReasonLabel(undefined)).toBe('—')
  })

  it('알려지지 않은 값은 원본 문자열 그대로 반환 (라벨 매핑 실패해도 정보 손실 없음)', () => {
    expect(adminReasonLabel('legacy_unknown_code')).toBe('legacy_unknown_code')
  })
})

describe('ADMIN_REASONS 목록 정합성', () => {
  it('"기타"(other)가 목록에 정확히 하나만 존재 — 자유 입력 트리거 조건과 어긋나면 UI가 깨짐', () => {
    const others = ADMIN_REASONS.filter((r) => r.value === 'other')
    expect(others.length).toBe(1)
  })

  it('value 중복 없음', () => {
    const values = ADMIN_REASONS.map((r) => r.value)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('HIGH_VALUE_THRESHOLD', () => {
  it('양수 정수 — 0이나 음수면 모든 지급이 고액으로 취급되는 버그', () => {
    expect(Number.isInteger(HIGH_VALUE_THRESHOLD)).toBe(true)
    expect(HIGH_VALUE_THRESHOLD).toBeGreaterThan(0)
  })
})
