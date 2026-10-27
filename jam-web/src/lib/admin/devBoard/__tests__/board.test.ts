/**
 * 보드 칸 계산 (티켓 20261026_2028 2회차)
 *
 * 지키는 것:
 * - 칸 판정: 대기·진행, 정확한 규칙(main 색인과 견줌), 추정 규칙(마지막 배포 날짜, 같은 날/다음 날 경계)
 * - 「배포됨」 14일 창의 안팎, 정렬(우선순위 → 최근 id), 30장 상한과 전체 개수
 * - 개발 요청이 「대기」 맨 앞에 합쳐지고 티켓이 된 요청은 빠짐, 같은 id의 옛 티켓이 섞이지 않음
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/devBoard/__tests__/board.test.ts
 */
import { describe, it, expect } from 'vitest'
import { buildColumns, classifyTicket } from '../board'
import { BOARD_COLUMN_LIMIT } from '../constants'
import { entry } from './fixtures'

// KST 2026-10-27 12:00. 14일 창은 2026-10-13부터다.
const NOW = new Date('2026-10-27T03:00:00Z')

describe('classifyTicket', () => {
  it('OPEN·WAITING은 대기, IN_PROGRESS는 진행, 그 밖 상태는 넣지 않는다', () => {
    expect(classifyTicket(entry({ id: 'a', status: 'OPEN' }), undefined, null)).toBe('waiting')
    expect(classifyTicket(entry({ id: 'a', status: 'WAITING' }), undefined, null)).toBe('waiting')
    expect(classifyTicket(entry({ id: 'a', status: 'IN_PROGRESS' }), undefined, null)).toBe('progress')
    expect(classifyTicket(entry({ id: 'a', status: 'DROPPED' }), undefined, null)).toBeNull()
  })

  it('정확한 규칙: main에서도 CLOSED이면 배포됨, 아니거나 없으면 staging 반영', () => {
    const staged = entry({ id: 'a', status: 'CLOSED', closed: '2026-10-20' })
    expect(classifyTicket(staged, entry({ id: 'a', status: 'CLOSED' }), null)).toBe('deployed')
    expect(classifyTicket(staged, entry({ id: 'a', status: 'IN_PROGRESS' }), null)).toBe('staged')
    expect(classifyTicket(staged, undefined, null)).toBe('staged')
  })

  it('추정 규칙: closed가 배포 날짜와 같은 날이면 배포됨, 다음 날이면 staging 반영', () => {
    const estimate = { lastDeployKstDate: '2026-10-14' }
    const on = entry({ id: 'a', status: 'CLOSED', closed: '2026-10-14' })
    const next = entry({ id: 'b', status: 'CLOSED', closed: '2026-10-15' })
    const before = entry({ id: 'c', status: 'CLOSED', closed: '2026-10-01' })
    expect(classifyTicket(on, undefined, estimate)).toBe('deployed')
    expect(classifyTicket(next, undefined, estimate)).toBe('staged')
    expect(classifyTicket(before, undefined, estimate)).toBe('deployed')
  })

  it('추정 규칙에서 closed가 비어 있으면 어느 칸에도 넣지 않는다', () => {
    expect(classifyTicket(entry({ id: 'a', status: 'CLOSED', closed: '' }), undefined, { lastDeployKstDate: '2026-10-14' })).toBeNull()
  })

  it('정확한 규칙에서는 closed가 비어 있어도 staging 반영이다', () => {
    expect(classifyTicket(entry({ id: 'a', status: 'CLOSED', closed: '' }), undefined, null)).toBe('staged')
  })
})

describe('buildColumns', () => {
  const base = { now: NOW, lastDeployKstDate: '2026-10-14', requests: [] as never[] }

  it('main 색인이 있으면 정확한 규칙, 없으면(null) 추정 규칙을 쓴다', () => {
    const staging = [
      entry({ id: 'a', status: 'CLOSED', closed: '2026-10-20' }),
      entry({ id: 'b', status: 'CLOSED', closed: '2026-10-14' }),
    ]
    const { columns: exact } = buildColumns(staging, [entry({ id: 'a', status: 'CLOSED' })], base)
    expect(exact.deployed.cards.map((c) => c.id)).toEqual(['a'])
    expect(exact.staged.cards.map((c) => c.id)).toEqual(['b'])

    const { columns: estimated } = buildColumns(staging, null, base)
    expect(estimated.deployed.cards.map((c) => c.id)).toEqual(['b'])
    expect(estimated.staged.cards.map((c) => c.id)).toEqual(['a'])
  })

  it('추정 규칙에서 closed가 빈 완료 티켓은 칸에 넣지 않고 undatedClosed로 센다', () => {
    const staging = [
      entry({ id: 'a', status: 'CLOSED', closed: '' }),
      entry({ id: 'b', status: 'CLOSED', closed: '' }),
      entry({ id: 'c', status: 'CLOSED', closed: '2026-10-20' }),
      entry({ id: 'd', status: 'OPEN', closed: '' }),
    ]
    const estimated = buildColumns(staging, null, base)
    expect(estimated.undatedClosed).toBe(2)
    expect(estimated.columns.staged.cards.map((c) => c.id)).toEqual(['c'])
    expect(estimated.columns.deployed.total).toBe(0)
    expect(estimated.columns.waiting.cards.map((c) => c.id)).toEqual(['d'])
    // 정확한 규칙(main 색인 있음)에서는 센 것이 없고 staging 반영에 그대로 들어간다
    const exact = buildColumns(staging, [], base)
    expect(exact.undatedClosed).toBe(0)
    expect(exact.columns.staged.total).toBe(3)
  })

  it('마지막 배포 날짜도 모르면 추정으로 배포됨을 정하지 않는다', () => {
    const { columns: columns } = buildColumns([entry({ id: 'a', status: 'CLOSED', closed: '2026-10-14' })], null, { ...base, lastDeployKstDate: null })
    expect(columns.deployed.total).toBe(0)
    expect(columns.staged.total).toBe(1)
  })

  it('배포됨은 최근 14일(10-13 포함)만 센다, staging 반영은 기간 제한이 없다', () => {
    const staging = [
      entry({ id: 'in', status: 'CLOSED', closed: '2026-10-13' }),
      entry({ id: 'out', status: 'CLOSED', closed: '2026-10-12' }),
      entry({ id: 'late', status: 'CLOSED', closed: '2026-10-26' }),
      entry({ id: 'old-staged', status: 'CLOSED', closed: '2026-01-01' }),
    ]
    const { columns: exact } = buildColumns(staging, [
      entry({ id: 'in', status: 'CLOSED' }),
      entry({ id: 'out', status: 'CLOSED' }),
      entry({ id: 'late', status: 'CLOSED' }),
    ], base)
    expect(exact.deployed.cards.map((c) => c.id).sort()).toEqual(['in', 'late'])
    expect(exact.deployed.total).toBe(2)
    expect(exact.staged.cards.map((c) => c.id)).toEqual(['old-staged'])
  })

  it('우선순위(P0→P3, 모르면 맨 뒤), 같으면 id 큰 것 먼저 정렬한다', () => {
    const { columns: columns } = buildColumns(
      [
        entry({ id: '20261001_0001', priority: 'P2' }),
        entry({ id: '20261002_0001', priority: 'P2' }),
        entry({ id: '20261001_0002', priority: 'P0' }),
        entry({ id: '20261001_0003', priority: '' }),
        entry({ id: '20261001_0004', priority: 'P3' }),
        entry({ id: '20261001_0005', priority: 'P1' }),
      ],
      [],
      base
    )
    expect(columns.waiting.cards.map((c) => c.id)).toEqual([
      '20261001_0002',
      '20261001_0005',
      '20261002_0001',
      '20261001_0001',
      '20261001_0004',
      '20261001_0003',
    ])
  })

  it('칸마다 30장까지만 담고 전체 개수는 따로 준다', () => {
    const staging = Array.from({ length: 45 }, (_, i) => entry({ id: `20261001_${String(i).padStart(4, '0')}` }))
    const { columns: columns } = buildColumns(staging, [], base)
    expect(columns.waiting.cards).toHaveLength(BOARD_COLUMN_LIMIT)
    expect(columns.waiting.total).toBe(45)
  })

  it('개발 요청은 대기 맨 앞에 요청 카드로 합치고 상한에 함께 센다', () => {
    const { columns: columns } = buildColumns([entry({ id: 'p0', priority: 'P0' })], [], {
      ...base,
      requests: [
        { no: 3, title: '요청 3', origin: 'eco' },
        { no: 5, title: '요청 5', origin: 'ops' },
        { no: 4, title: '티켓이 된 요청', origin: 'ops', status: 'ticketed' },
      ],
    })
    expect(columns.waiting.cards.map((c) => c.id)).toEqual(['request-5', 'request-3', 'p0'])
    expect(columns.waiting.total).toBe(3)
    expect(columns.waiting.cards[0]).toMatchObject({ kind: 'request', requestNo: 5, origin: 'ops', path: null })

    const { columns: many } = buildColumns(
      Array.from({ length: 40 }, (_, i) => entry({ id: `t${i}` })),
      [],
      { ...base, requests: Array.from({ length: 5 }, (_, i) => ({ no: i + 1, title: 'r', origin: 'other' as const })) }
    )
    expect(many.waiting.cards).toHaveLength(BOARD_COLUMN_LIMIT)
    expect(many.waiting.total).toBe(45)
    expect(many.waiting.cards.slice(0, 5).every((c) => c.kind === 'request')).toBe(true)
  })

  it('카드 출처는 티켓 origin이 있을 때만 쓴다', () => {
    const { columns: columns } = buildColumns([entry({ id: 'a', origin: 'eco' }), entry({ id: 'b', origin: '' })], [], base)
    const byId = Object.fromEntries(columns.waiting.cards.map((c) => [c.id, c.origin]))
    expect(byId).toEqual({ a: 'eco', b: null })
  })

  it('같은 id의 옛 티켓이 둘이면 경로가 같은 쪽과 견준다', () => {
    const staging = [
      entry({ id: 'dup', status: 'CLOSED', closed: '2026-10-20', path: 'docs/a.md' }),
      entry({ id: 'dup', status: 'CLOSED', closed: '2026-10-20', path: 'docs/b.md' }),
    ]
    const main = [
      entry({ id: 'dup', status: 'CLOSED', path: 'docs/a.md' }),
      entry({ id: 'dup', status: 'OPEN', path: 'docs/b.md' }),
    ]
    const { columns: columns } = buildColumns(staging, main, base)
    expect(columns.deployed.cards.map((c) => c.path)).toEqual(['docs/a.md'])
    expect(columns.staged.cards.map((c) => c.path)).toEqual(['docs/b.md'])
  })

  it('폴더가 옮겨져 경로가 달라도 그 id가 main에 하나뿐이면 같은 티켓으로 본다', () => {
    const { columns: columns } = buildColumns(
      [entry({ id: 'moved', status: 'CLOSED', closed: '2026-10-20', path: 'docs/new.md' })],
      [entry({ id: 'moved', status: 'CLOSED', path: 'docs/old.md' })],
      base
    )
    expect(columns.deployed.total).toBe(1)
  })
})
