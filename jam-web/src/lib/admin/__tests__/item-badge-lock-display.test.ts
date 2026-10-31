/**
 * 어드민 아이템 배지 개체 목록의 잠김 읽기 표시 (티켓 20261018_0051 2회, 20261031_0458 2회)
 *
 * 고정하는 것: 잠긴 개체는 필요한 포인트를 적는다(개체에 고정된 값이 먼저, 비어 있으면 배지 등급의 정책값).
 * 옛 «잼»·채운 양 표기는 없다. 열린 개체·연 개체·잠금 칸을 못 읽은 옛 행은 잠기지 않은 표시다.
 */
import { describe, it, expect } from 'vitest'
import { describeItemLock } from '../item-badge-status'

const POLICY_POINTS = 100

describe('describeItemLock', () => {
  it('잠긴 개체는 개체에 고정된 필요 포인트를 «잠김 · 필요 포인트 N»으로 적는다', () => {
    expect(describeItemLock({ locked: true, unlockPointsRequired: 400, unlockedAt: null }, POLICY_POINTS)).toEqual({
      state: 'locked',
      label: '잠김 · 필요 포인트 400',
    })
  })

  it('고정 전 개체(값이 비어 있음)는 배지 등급의 정책 포인트를 쓴다', () => {
    expect(describeItemLock({ locked: true, unlockPointsRequired: null, unlockedAt: null }, POLICY_POINTS).label).toBe(
      '잠김 · 필요 포인트 100'
    )
  })

  it('필요 포인트 0(퀘스트 전 첫 개체)도 그대로 적는다', () => {
    expect(describeItemLock({ locked: true, unlockPointsRequired: 0, unlockedAt: null }, POLICY_POINTS).label).toBe(
      '잠김 · 필요 포인트 0'
    )
  })

  it('천 단위는 쉼표로 적고 옛 «잼» 표기가 없다', () => {
    const { label } = describeItemLock({ locked: true, unlockPointsRequired: 1200, unlockedAt: null }, POLICY_POINTS)
    expect(label).toBe('잠김 · 필요 포인트 1,200')
    expect(label).not.toContain('잼')
    expect(label).not.toContain('/')
  })

  it('잠겼다가 연 개체는 «연 개체»다', () => {
    expect(
      describeItemLock({ locked: false, unlockPointsRequired: 100, unlockedAt: '2026-10-18T00:00:00Z' }, POLICY_POINTS)
    ).toEqual({ state: 'unlocked', label: '연 개체' })
  })

  it('처음부터 열린 개체와 잠금 칸을 못 읽은 옛 행은 «열림»이다', () => {
    const empty = { unlockPointsRequired: null, unlockedAt: null }
    expect(describeItemLock({ locked: false, ...empty }, POLICY_POINTS)).toEqual({ state: 'open', label: '열림' })
    expect(describeItemLock({ locked: null, ...empty }, POLICY_POINTS)).toEqual({ state: 'open', label: '열림' })
  })
})
