import type { TicketIndexEntry } from '../types'

/** 시험용 색인 항목. 필요한 필드만 덮어쓴다. */
export function entry(overrides: Partial<TicketIndexEntry> & { id: string }): TicketIndexEntry {
  return {
    title: `[Admin] 티켓 ${overrides.id}`,
    status: 'OPEN',
    category: 'Admin',
    priority: 'P2',
    parent: '',
    origin: '',
    created: '2026-10-01',
    closed: '',
    path: `docs/tickets/p2-normal/${overrides.id}_Admin_x.md`,
    ...overrides,
  }
}
