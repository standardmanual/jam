/**
 * 밸런스 서브 대시보드의 목표·최소 표본·이동 칸 (티켓 20261022_1136 1회 a)
 *
 * 지키는 것:
 * 1. 지표 6개가 운영 로직 19.2절 표의 순서로 있고, 칸 id가 지표 안에서 겹치지 않는다
 * 2. 최소 표본: 비율형(지표 2·5·6)은 20명, 나머지는 5명이고 등급 체감은 기대 건수 5건에서 나온 노출량이다
 * 3. 이동 칸의 구역 키와 칸 키가 밸런스 설정 구역 연결의 칸 정의에 실제로 있다 (이름이 어긋나면 «바로 조정» 링크가 빈 곳으로 간다)
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

import type { BalanceSectionBinding } from '@/lib/admin/balance/types'
import { CAPSULE_BINDING } from '@/lib/admin/balance/capsule'
import { CHAPTER_BINDING } from '@/lib/admin/balance/chapter'
import { COLLECTION_BINDING } from '@/lib/admin/balance/collection'
import { INVENTORY_BINDING } from '@/lib/admin/balance/inventory'
import { SYNC_BINDING } from '@/lib/admin/balance/sync'
import {
  MIN_EXPECTED_COUNT,
  MIN_RATIO_SAMPLE_USERS,
  MIN_SAMPLE_USERS,
  METRIC_SPECS,
  partSpec,
  RARITY_KEYS,
  RARITY_MIN_EXPOSURE,
  targetRate,
} from '../targets'
import { BALANCE_METRIC_KEYS } from '../types'

const BINDINGS: readonly BalanceSectionBinding[] = [
  CAPSULE_BINDING,
  CHAPTER_BINDING,
  COLLECTION_BINDING,
  INVENTORY_BINDING,
  SYNC_BINDING,
]

describe('지표 정의', () => {
  it('지표 6개가 운영 로직 19.2절의 순서로 있다', () => {
    expect(BALANCE_METRIC_KEYS.map((key) => METRIC_SPECS[key].title)).toEqual([
      '캡슐을 여는 속도',
      '챕터 도달 속도',
      '한 달에 받는 아이템 배지',
      '등급 체감',
      '컬렉션 완성 속도',
      '인벤토리가 거의 가득 찬 유저의 비율',
    ])
    for (const key of BALANCE_METRIC_KEYS) expect(METRIC_SPECS[key].key).toBe(key)
  })

  it('칸 id는 지표 안에서 겹치지 않고, 목표는 낮은 값이 높은 값을 넘지 않는다', () => {
    for (const key of BALANCE_METRIC_KEYS) {
      const ids = METRIC_SPECS[key].parts.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const spec of METRIC_SPECS[key].parts) {
        if (spec.target) expect(spec.target.low).toBeLessThanOrEqual(spec.target.high)
      }
    }
  })

  it('목표 문장은 챕터 1과 10의 열기 속도에만 있고 챕터 2~9에는 없다', () => {
    const targets = METRIC_SPECS.capsule_open.parts.map((p) => p.target?.text ?? null)
    expect(targets[0]).toBe('주 2~3번')
    expect(targets[9]).toBe('주 1번')
    expect(targets.slice(1, 9).every((text) => text === null)).toBe(true)
  })

  it('없는 칸을 찾으면 던진다', () => {
    expect(() => partSpec('capsule_open', 'chapter:11')).toThrow()
  })
})

describe('최소 표본', () => {
  it('비율을 내는 지표 2·5·6은 20명, 사람 수로 세는 지표 1·3은 5명이다', () => {
    for (const key of ['chapter_reach', 'collection_complete', 'inventory_full'] as const) {
      for (const spec of METRIC_SPECS[key].parts) {
        expect(spec.minSample).toBe(MIN_RATIO_SAMPLE_USERS)
        expect(spec.sampleUnit).toBe('user')
      }
    }
    for (const key of ['capsule_open', 'monthly_items'] as const) {
      for (const spec of METRIC_SPECS[key].parts) expect(spec.minSample).toBe(MIN_SAMPLE_USERS)
    }
    expect(MIN_RATIO_SAMPLE_USERS).toBe(20)
    expect(MIN_SAMPLE_USERS).toBe(5)
  })

  it('등급 체감은 기대 건수 5건에 이르는 노출량이다: Rare 5유저-주, Epic 5유저-월, Mystic 18유저-월', () => {
    expect(RARITY_MIN_EXPOSURE).toEqual({ rare: 5, epic: 5, mystic: 18 })
    for (const rarity of RARITY_KEYS) {
      const exposure = RARITY_MIN_EXPOSURE[rarity]
      expect(partSpec('rarity_feel', rarity).minSample).toBe(exposure)
      // 최소 노출량이면 기대 건수가 5건 이상이고, 한 단위 적으면 5건에 모자란다
      expect(targetRate(rarity) * exposure).toBeGreaterThanOrEqual(MIN_EXPECTED_COUNT)
      expect(targetRate(rarity) * (exposure - 1)).toBeLessThan(MIN_EXPECTED_COUNT)
    }
    expect(partSpec('rarity_feel', 'rare').sampleUnit).toBe('user_week')
    expect(partSpec('rarity_feel', 'epic').sampleUnit).toBe('user_month')
    expect(partSpec('rarity_feel', 'mystic').sampleUnit).toBe('user_month')
  })
})

describe('이동 칸', () => {
  it('구역 키와 칸 키가 밸런스 설정 구역 연결의 칸 정의에 모두 있다', () => {
    for (const key of BALANCE_METRIC_KEYS) {
      const { sectionId, fieldKeys } = METRIC_SPECS[key].adjust
      const binding = BINDINGS.find((b) => b.id === sectionId)
      expect(binding, `${key}의 구역 ${sectionId}`).toBeDefined()
      const defined = new Set(binding?.fields.map((field) => field.key))
      expect(fieldKeys.length).toBeGreaterThan(0)
      for (const fieldKey of fieldKeys) expect(defined.has(fieldKey), `${key}의 칸 ${fieldKey}`).toBe(true)
    }
  })

  it('티켓 표의 이동 구역과 같다', () => {
    const sections = Object.fromEntries(BALANCE_METRIC_KEYS.map((key) => [key, METRIC_SPECS[key].adjust.sectionId]))
    expect(sections).toEqual({
      capsule_open: 'capsule',
      chapter_reach: 'chapter',
      monthly_items: 'sync',
      rarity_feel: 'sync',
      collection_complete: 'collection',
      inventory_full: 'inventory',
    })
    expect(METRIC_SPECS.monthly_items.adjust.fieldKeys).toEqual(['sync_item_guaranteed'])
    expect(METRIC_SPECS.collection_complete.adjust.fieldKeys).toEqual(['tier_up_probability'])
    expect(METRIC_SPECS.inventory_full.adjust.fieldKeys).toEqual(['max_slots'])
  })
})
