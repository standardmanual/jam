/**
 * 주간 흐름 행의 결정 패널 링크 (티켓 20261026_2023 2회차)
 *
 * 지키는 것: 결정할 항목이 있는 묶음 우선, 없으면 가장 늦게 받은 묶음, 묶음이 없는 주는 목록에 없음, 시험 묶음 제외·포함.
 */
import { describe, expect, it } from 'vitest'
import { flowRowHrefs } from '@/lib/admin/opsBoard/rowLinks'
import { makeBundle } from './fixtures'

describe('flowRowHrefs', () => {
  it('주 월요일마다 그 주 묶음의 상세 경로다', () => {
    const hrefs = flowRowHrefs({ bundles: [makeBundle({ id: 'b1', week: '2026-W44', statuses: ['arrived'] })] })
    expect(hrefs).toEqual({ '2026-10-26': '/admin/ops-inbox/b1' })
  })

  it('한 주에 묶음이 여럿이면 결정할 항목이 있는 묶음을 먼저 고른다', () => {
    const hrefs = flowRowHrefs({
      bundles: [
        makeBundle({ id: 'late-done', receivedAt: '2026-10-27T10:00:00+09:00', statuses: ['live'] }),
        makeBundle({ id: 'early-wait', receivedAt: '2026-10-26T10:00:00+09:00', statuses: ['reviewing'] }),
      ],
    })
    expect(hrefs['2026-10-26']).toBe('/admin/ops-inbox/early-wait')
  })

  it('실패 항목이 있는 묶음도 결정할 묶음이다', () => {
    const hrefs = flowRowHrefs({
      bundles: [
        makeBundle({ id: 'late', receivedAt: '2026-10-27T10:00:00+09:00', statuses: ['live'] }),
        makeBundle({ id: 'failed', receivedAt: '2026-10-26T10:00:00+09:00', statuses: ['failed'] }),
      ],
    })
    expect(hrefs['2026-10-26']).toBe('/admin/ops-inbox/failed')
  })

  it('결정할 항목이 없으면 가장 늦게 받은 묶음이다', () => {
    const hrefs = flowRowHrefs({
      bundles: [
        makeBundle({ id: 'old', receivedAt: '2026-10-26T10:00:00+09:00', statuses: ['live'] }),
        makeBundle({ id: 'new', receivedAt: '2026-10-27T10:00:00+09:00', statuses: ['ended'] }),
      ],
    })
    expect(hrefs['2026-10-26']).toBe('/admin/ops-inbox/new')
  })

  it('묶음이 없는 주는 목록에 없다', () => {
    expect(flowRowHrefs({ bundles: [] })).toEqual({})
  })

  it('시험 묶음은 포함할 때만 쓴다', () => {
    const bundles = [makeBundle({ id: 'sample', isSample: true, statuses: ['arrived'] })]
    expect(flowRowHrefs({ bundles })).toEqual({})
    expect(flowRowHrefs({ bundles, includeSample: true })['2026-10-26']).toBe('/admin/ops-inbox/sample')
  })

  it('`week` 칸이 맞지 않으면 받은 시각의 주로 본다', () => {
    const hrefs = flowRowHrefs({ bundles: [makeBundle({ id: 'odd', week: null, receivedAt: '2026-10-20T10:00:00+09:00', statuses: ['arrived'] })] })
    expect(hrefs['2026-10-19']).toBe('/admin/ops-inbox/odd')
  })
})
