/**
 * policyLinks.ts와 정책 카탈로그의 마디 연결 (티켓 20261026_2027 2회차)
 *
 * 지키는 것: `POLICIES_DATA` 전부의 `nodes` 값이 허용 키이고, 3~9·11장 항목이 마디를 하나 이상 가지며,
 * 19장 밸런스 목표 5개가 `GOAL_POLICY_LINKS`와 일치한다.
 */
import { describe, it, expect } from 'vitest'
import type { BalanceDashboardData, MetricResult } from '@/lib/admin/balanceDashboard/types'
import { BALANCE_METRIC_KEYS } from '@/lib/admin/balanceDashboard/types'
import { METRIC_SPECS } from '@/lib/admin/balanceDashboard/targets'
import { POLICIES_DATA } from '@/lib/admin/policyDashboard/policiesData'
import type { PolicyItem } from '@/lib/admin/policyDashboard/types'
import { BALANCE_NODE_METRICS, ECOSYSTEM_EDGES, ECOSYSTEM_NODES, GOAL_POLICY_LINKS } from '../nodes'
import { goalRowsOf, policiesOfNode, policiesOutsideLoop } from '../policyLinks'
import { ECOSYSTEM_NODE_IDS } from '../types'

const ALLOWED = new Set<string>(ECOSYSTEM_NODE_IDS)

function policy(over: Partial<PolicyItem> & Pick<PolicyItem, 'id' | 'type'>): PolicyItem {
  return {
    chapter: 1,
    chapterTitle: '장',
    title: over.id,
    currentSpec: '',
    userExperience: '',
    basisDoc: '',
    ...over,
  }
}

describe('마디 정의', () => {
  it('마디는 10개이고 키가 중복되지 않으며 이음선은 모두 마디를 가리킨다', () => {
    expect(ECOSYSTEM_NODES.map((node) => node.id)).toEqual([...ECOSYSTEM_NODE_IDS])
    expect(new Set(ECOSYSTEM_NODES.map((node) => node.id)).size).toBe(10)
    for (const edge of ECOSYSTEM_EDGES) {
      expect(ALLOWED.has(edge.from)).toBe(true)
      expect(ALLOWED.has(edge.to)).toBe(true)
    }
  })

  it('밸런스 지표를 쓰는 마디의 지표 키는 모두 있는 키다', () => {
    for (const keys of Object.values(BALANCE_NODE_METRICS)) {
      for (const key of keys ?? []) expect(BALANCE_METRIC_KEYS).toContain(key)
    }
  })
})

describe('POLICIES_DATA의 nodes', () => {
  it('값은 모두 허용된 마디 키이고 한 항목 안에서 중복되지 않는다', () => {
    for (const item of POLICIES_DATA) {
      const nodes = item.nodes ?? []
      for (const node of nodes) expect(ALLOWED.has(node), `${item.id}의 마디 ${node}`).toBe(true)
      expect(new Set(nodes).size, `${item.id}의 마디 중복`).toBe(nodes.length)
    }
  })

  it('3~9장과 11장 항목은 마디를 하나 이상 가진다', () => {
    for (const item of POLICIES_DATA) {
      if ((item.chapter >= 3 && item.chapter <= 9) || item.chapter === 11) {
        expect(item.nodes?.length ?? 0, `${item.id}에 마디가 있어야 해요`).toBeGreaterThan(0)
      }
    }
  })

  it('마디가 없는 장(1·2·10·12~18)과 19장의 나머지 항목은 마디를 비워 둔다', () => {
    const goalIds = new Set(GOAL_POLICY_LINKS.map((link) => link.policyId))
    for (const item of POLICIES_DATA) {
      if (item.chapter === 19 && goalIds.has(item.id)) continue
      if ([1, 2, 10, 12, 13, 14, 15, 16, 17, 18, 19].includes(item.chapter)) {
        expect(item.nodes, `${item.id}는 마디가 없어야 해요`).toBeUndefined()
      }
    }
  })

  it('19장 밸런스 목표 5개는 GOAL_POLICY_LINKS와 일치한다', () => {
    const goalItems = POLICIES_DATA.filter((item) => item.id.startsWith('ch19-kpi-'))
    expect(goalItems.map((item) => item.id).sort()).toEqual(GOAL_POLICY_LINKS.map((link) => link.policyId).sort())

    for (const link of GOAL_POLICY_LINKS) {
      const item = POLICIES_DATA.find((p) => p.id === link.policyId)
      expect(item, `${link.policyId}가 카탈로그에 있어야 해요`).toBeDefined()
      // 정책이 걸린 마디 = 그 정책의 지표를 대표 지표로 쓰는 마디
      const expected = Object.entries(BALANCE_NODE_METRICS)
        .filter(([, keys]) => (keys ?? []).some((key) => link.metricKeys.includes(key)))
        .map(([nodeId]) => nodeId)
        .sort()
      expect([...(item?.nodes ?? [])].sort(), `${link.policyId}의 마디`).toEqual(expected)
    }
    // 챕터 도달 속도는 마디가 없다
    expect(POLICIES_DATA.find((p) => p.id === 'ch19-kpi-chapter-reach')?.nodes).toBeUndefined()
  })

  it('모든 밸런스 지표 6개가 목표 정책 연결에 한 번씩 들어 있다', () => {
    const keys = GOAL_POLICY_LINKS.flatMap((link) => link.metricKeys).sort()
    expect(keys).toEqual([...BALANCE_METRIC_KEYS].sort())
  })

  it('마디 10개 모두에 정책이 하나 이상 걸려 있다 (정책이 없는 마디는 화면에 빈 목록이 보인다)', () => {
    const covered = new Set(POLICIES_DATA.flatMap((item) => item.nodes ?? []))
    const empty = ECOSYSTEM_NODE_IDS.filter((id) => !covered.has(id))
    expect(empty).toEqual([])
  })
})

describe('policiesOfNode', () => {
  const items = [
    policy({ id: 'a', type: 'code_constant', nodes: ['inventory'] }),
    policy({ id: 'b', type: 'admin_link', nodes: ['inventory', 'collection'] }),
    policy({ id: 'c', type: 'ticket_decision', nodes: ['inventory'] }),
    policy({ id: 'd', type: 'admin_link', nodes: ['jam'] }),
    policy({ id: 'e', type: 'admin_link' }),
  ]

  it('값 바꾸기(admin_link)·개발 요청(code_constant)·그 밖으로 묶고 순서는 원래 순서다', () => {
    const groups = policiesOfNode(items, 'inventory')
    expect(groups.changeable.map((p) => p.id)).toEqual(['b'])
    expect(groups.codeFixed.map((p) => p.id)).toEqual(['a'])
    expect(groups.other.map((p) => p.id)).toEqual(['c'])
  })

  it('마디가 걸리지 않은 정책은 들어오지 않는다', () => {
    const groups = policiesOfNode(items, 'pickup')
    expect([...groups.changeable, ...groups.codeFixed, ...groups.other]).toEqual([])
  })

  it('마디가 하나도 없는 항목만 순환 밖이다', () => {
    expect(policiesOutsideLoop(items).map((p) => p.id)).toEqual(['e'])
  })
})

describe('goalRowsOf', () => {
  function balanceWith(overrides: Partial<Record<(typeof BALANCE_METRIC_KEYS)[number], MetricResult>>): BalanceDashboardData {
    const metrics = BALANCE_METRIC_KEYS.map((key): MetricResult => {
      const given = overrides[key]
      if (given) return given
      return {
        key,
        status: 'ok',
        parts: METRIC_SPECS[key].parts.map((spec) => ({
          id: spec.id,
          measurement: {
            status: 'insufficient' as const,
            reason: 'sample' as const,
            sample: 0,
            minSample: spec.minSample,
            sampleUnit: spec.sampleUnit,
          },
        })),
      }
    })
    return { generatedAt: '2026-10-28T03:00:00.000Z', metrics }
  }

  it('정책 5개의 행을 GOAL_POLICY_LINKS 순서로 만들고 제목은 정책 제목이다', () => {
    const rows = goalRowsOf(balanceWith({}), POLICIES_DATA)
    expect(rows.map((row) => row.policyId)).toEqual(GOAL_POLICY_LINKS.map((link) => link.policyId))
    expect(rows[0].title).toBe(POLICIES_DATA.find((p) => p.id === rows[0].policyId)?.title)
  })

  it('표본이 모자라면 값 없이 부족이고 표시선이 없다', () => {
    const [capsule] = goalRowsOf(balanceWith({}), POLICIES_DATA)
    expect(capsule.status).toBe('insufficient')
    for (const part of capsule.parts) {
      expect(part.value).toBeNull()
      expect(part.marker).toBeNull()
      // 화면이 «표본 N/M명»을 만들 사유가 칸에 실린다 (티켓 20261026_2027 3-1)
      expect(part.shortfall).toMatchObject({ reason: 'sample', sample: 0 })
      expect(part.sample).toBeUndefined()
    }
  })

  it('값이 목표 밖이면 칸 상태와 표시선이 붙고 행 상태는 가장 나쁜 칸이다', () => {
    const inventory: MetricResult = {
      key: 'inventory_full',
      status: 'ok',
      parts: [{ id: 'full', measurement: { status: 'ready', value: 0.5, sample: 30, sampleUnit: 'user' } }],
    }
    const row = goalRowsOf(balanceWith({ inventory_full: inventory }), POLICIES_DATA).find(
      (r) => r.policyId === 'ch19-kpi-inventory-full'
    )
    expect(row?.status).toBe('stop')
    expect(row?.parts[0]).toMatchObject({ value: 0.5, status: 'stop', targetText: expect.any(String) })
    expect(row?.parts[0].marker).toMatchObject({ scaleMax: 0.55 })
  })

  it('읽지 못한 지표는 행 상태가 읽지 못함이고 칸은 없다', () => {
    const failed: MetricResult = { key: 'chapter_reach', status: 'error', message: '고정 문장' }
    const row = goalRowsOf(balanceWith({ chapter_reach: failed }), POLICIES_DATA).find(
      (r) => r.policyId === 'ch19-kpi-chapter-reach'
    )
    expect(row?.status).toBe('error')
    expect(row?.parts).toEqual([])
  })

  it('목표가 없는 칸은 목표 없음이고 표시선이 없다 (캡슐 챕터 2~9)', () => {
    const capsule: MetricResult = {
      key: 'capsule_open',
      status: 'ok',
      parts: METRIC_SPECS.capsule_open.parts.map((spec) => ({
        id: spec.id,
        measurement: { status: 'ready' as const, value: 1, sample: 10, sampleUnit: 'user' as const },
      })),
    }
    const row = goalRowsOf(balanceWith({ capsule_open: capsule }), POLICIES_DATA)[0]
    const chapter5 = row.parts.find((part) => part.partId === 'capsule_open:chapter:5')
    expect(chapter5).toMatchObject({ status: 'no_target', targetText: null, marker: null, value: 1 })
  })
})
