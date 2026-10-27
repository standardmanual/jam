/**
 * 보드 칸·묶음 진행 계산 (티켓 20261026_2028 2회차, 어드민 상황판 PRD §8). 순수 함수만 둔다.
 *
 * ## 칸을 가르는 규칙
 *
 * - `OPEN`·`WAITING` = 대기, `IN_PROGRESS` = 진행. 그 밖 상태는 보드에 넣지 않는다.
 * - `CLOSED`는 「staging 반영」과 「배포됨」으로 가른다.
 *   - 정확한 규칙(main 색인이 있을 때): main 색인에서도 `CLOSED`이면 「배포됨」, 아니거나 main에 없으면 「staging 반영」.
 *   - 추정 규칙(main 색인이 없을 때): `closed` 날짜(KST)가 프로덕션 마지막 배포의 KST 날짜 이하이면 「배포됨」, 그 뒤면 「staging 반영」.
 *     마지막 배포 날짜도 모르면 「배포됨」을 정할 수 없어 모두 「staging 반영」이다.
 * - 「배포됨」은 `closed`가 최근 `DEPLOYED_WINDOW_DAYS`일(오늘 KST 날짜에서 14일 전 날짜 포함) 안인 것만 센다.
 * - 카드는 우선순위(P0→P3, 모르면 맨 뒤), 같으면 id 큰 것(최근), 같으면 경로순이다. 칸마다 `BOARD_COLUMN_LIMIT`장까지 담고 전체 개수를 따로 준다.
 * - 개발 요청은 「대기」 칸 맨 앞에 요청 카드로 합친다(번호 큰 것 먼저, 상한은 요청 카드를 포함해 센다).
 *
 * main 색인의 항목은 같은 경로를 먼저 찾고, 경로가 달라졌으면 그 id의 항목이 하나뿐일 때만 같은 티켓으로 본다
 * (같은 id를 가진 옛 티켓이 있어서 id만으로는 정할 수 없다).
 */
import { BOARD_COLUMN_LIMIT, DEPLOYED_WINDOW_DAYS, type Jam2Bundle } from './constants'
import { kstDateOf } from './deploy'
import { descendantsOf } from './ticketIndex'
import type {
  BoardCard,
  BoardColumnKey,
  BoardColumns,
  BoardRequestInput,
  BundleProgress,
  TicketIndexEntry,
} from './types'

/** 추정 규칙에 쓰는 프로덕션 마지막 배포의 KST 날짜 */
export interface DeployEstimate {
  lastDeployKstDate: string
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }

/**
 * 한 티켓이 들어갈 칸. 보드에 넣지 않는 상태면 null.
 * `estimate`가 있으면 추정 규칙(`mainEntry`는 무시), 없으면 정확한 규칙이다.
 */
export function classifyTicket(
  stagingEntry: TicketIndexEntry,
  mainEntry: TicketIndexEntry | undefined,
  estimate: DeployEstimate | null
): BoardColumnKey | null {
  switch (stagingEntry.status) {
    case 'OPEN':
    case 'WAITING':
      return 'waiting'
    case 'IN_PROGRESS':
      return 'progress'
    case 'CLOSED':
      break
    default:
      return null
  }
  if (estimate) {
    return stagingEntry.closed !== '' && stagingEntry.closed <= estimate.lastDeployKstDate ? 'deployed' : 'staged'
  }
  return mainEntry?.status === 'CLOSED' ? 'deployed' : 'staged'
}

function priorityRank(priority: string): number {
  return PRIORITY_RANK[priority] ?? 4
}

function compareCards(a: BoardCard, b: BoardCard): number {
  const byPriority = priorityRank(a.priority) - priorityRank(b.priority)
  if (byPriority !== 0) return byPriority
  if (a.id !== b.id) return a.id < b.id ? 1 : -1
  const pathA = a.path ?? ''
  const pathB = b.path ?? ''
  return pathA < pathB ? -1 : pathA > pathB ? 1 : 0
}

function originOf(value: string): BoardCard['origin'] {
  return value === 'ops' || value === 'eco' || value === 'other' ? value : null
}

function ticketCard(entry: TicketIndexEntry): BoardCard {
  return {
    kind: 'ticket',
    id: entry.id,
    requestNo: null,
    title: entry.title,
    category: entry.category,
    priority: entry.priority,
    origin: originOf(entry.origin),
    path: entry.path === '' ? null : entry.path,
  }
}

function requestCard(request: BoardRequestInput): BoardCard {
  return {
    kind: 'request',
    id: `request-${request.no}`,
    requestNo: request.no,
    title: request.title,
    category: '',
    priority: '',
    origin: request.origin,
    path: null,
  }
}

/** `YYYY-MM-DD`에서 일수를 뺀 날짜. 형식이 틀리면 null. */
function shiftDate(date: string, days: number): string | null {
  const time = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(time)) return null
  return new Date(time - days * 86_400_000).toISOString().slice(0, 10)
}

function indexMainEntries(main: readonly TicketIndexEntry[]) {
  const byPath = new Map<string, TicketIndexEntry>()
  const byId = new Map<string, TicketIndexEntry[]>()
  for (const entry of main) {
    if (entry.path !== '') byPath.set(entry.path, entry)
    const list = byId.get(entry.id)
    if (list) list.push(entry)
    else byId.set(entry.id, [entry])
  }
  return (entry: TicketIndexEntry): TicketIndexEntry | undefined => {
    const samePath = byPath.get(entry.path)
    if (samePath) return samePath
    const sameId = byId.get(entry.id)
    return sameId && sameId.length === 1 ? sameId[0] : undefined
  }
}

export interface BuildColumnsOptions {
  now: Date
  /** 프로덕션 마지막 배포의 KST 날짜. 모르면 null */
  lastDeployKstDate: string | null
  requests: readonly BoardRequestInput[]
}

/**
 * 보드 네 칸을 만든다. `main`이 null이면(main 색인이 없거나 못 읽음) 추정 규칙을 쓴다.
 * 개발 요청은 `status`가 있으면 `requested`인 것만 합친다.
 */
export function buildColumns(
  staging: readonly TicketIndexEntry[],
  main: readonly TicketIndexEntry[] | null,
  { now, lastDeployKstDate, requests }: BuildColumnsOptions
): BoardColumns {
  const estimate: DeployEstimate | null = main === null && lastDeployKstDate ? { lastDeployKstDate } : null
  const findMain = main ? indexMainEntries(main) : () => undefined

  const today = kstDateOf(now.toISOString())
  const windowStart = today ? shiftDate(today, DEPLOYED_WINDOW_DAYS) : null

  const buckets: Record<BoardColumnKey, BoardCard[]> = { waiting: [], progress: [], staged: [], deployed: [] }
  for (const entry of staging) {
    const column = classifyTicket(entry, findMain(entry), estimate)
    if (column === null) continue
    if (column === 'deployed' && windowStart !== null && (entry.closed === '' || entry.closed < windowStart)) continue
    buckets[column].push(ticketCard(entry))
  }
  for (const key of Object.keys(buckets) as BoardColumnKey[]) buckets[key].sort(compareCards)

  const requestCards = requests
    .filter((request) => request.status === undefined || request.status === 'requested')
    .slice()
    .sort((a, b) => b.no - a.no)
    .map(requestCard)
  buckets.waiting = [...requestCards, ...buckets.waiting]

  const column = (key: BoardColumnKey) => ({
    cards: buckets[key].slice(0, BOARD_COLUMN_LIMIT),
    total: buckets[key].length,
  })
  return { waiting: column('waiting'), progress: column('progress'), staged: column('staged'), deployed: column('deployed') }
}

/** 묶음마다 자손 전체(묶음 티켓 자신 제외)에서 끝남·진행·남음을 센다. */
export function bundleProgress(
  entries: readonly TicketIndexEntry[],
  bundles: readonly Jam2Bundle[]
): BundleProgress[] {
  return bundles.map((bundle) => {
    const descendants = descendantsOf(entries, bundle.ticketId)
    let done = 0
    let active = 0
    let remaining = 0
    for (const entry of descendants) {
      if (entry.status === 'CLOSED') done += 1
      else if (entry.status === 'IN_PROGRESS') active += 1
      else remaining += 1
    }
    return {
      number: bundle.number,
      name: bundle.name,
      ticketId: bundle.ticketId,
      done,
      active,
      remaining,
      total: descendants.length,
    }
  })
}
