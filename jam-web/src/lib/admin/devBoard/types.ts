/**
 * 개발·배포 상황판의 타입 (티켓 20261026_2028 2회차, 어드민 상황판 PRD §8)
 *
 * 타입만 있다(칸 키 목록 상수 하나만 값이다). 계산(`ticketIndex.ts`·`deploy.ts`·`board.ts`), 읽기(`github.ts`·`load.ts`),
 * 3회차 화면이 같은 모양을 쓴다. 화면에 보이는 글자는 화면이 만든다(상태 글자 `label`만 PRD §8이 정한 고정 문구다).
 */
import type { DevRequestOrigin } from '@/lib/admin/devRequests/constants'

/** 티켓 색인(`docs/tickets/_index.json`) 한 줄. 선택 필드가 없으면 빈 문자열이다. */
export interface TicketIndexEntry {
  id: string
  title: string
  status: string
  category: string
  priority: string
  parent: string
  origin: string
  created: string
  closed: string
  path: string
}

export type BoardColumnKey = 'waiting' | 'progress' | 'staged' | 'deployed'

export const BOARD_COLUMN_KEYS: readonly BoardColumnKey[] = ['waiting', 'progress', 'staged', 'deployed']

export interface BoardCard {
  kind: 'ticket' | 'request'
  /** 티켓이면 티켓 ID, 요청이면 `request-{번호}` */
  id: string
  /** 요청 번호. 티켓 카드는 null */
  requestNo: number | null
  title: string
  /** 요청 카드는 빈 문자열 */
  category: string
  /** `P0`~`P3`. 요청 카드는 빈 문자열 */
  priority: string
  /** 티켓 `origin`이 있을 때만 값이 있다. 요청은 요청 행의 값 */
  origin: DevRequestOrigin | null
  /** 저장소 안 경로. 요청 카드는 null */
  path: string | null
}

export interface BoardColumn {
  /** 정렬을 마친 카드, 최대 `BOARD_COLUMN_LIMIT`장 */
  cards: BoardCard[]
  /** 상한과 상관없는 전체 개수 */
  total: number
}

export type BoardColumns = Record<BoardColumnKey, BoardColumn>

/** 보드 「대기」 칸 맨 앞에 합치는 개발 요청. `DevRequest`가 이 모양을 채운다. */
export interface BoardRequestInput {
  no: number
  title: string
  origin: DevRequestOrigin
  status?: string
}

export interface BundleProgress {
  number: number
  name: string
  ticketId: string
  /** 끝남(`CLOSED`) */
  done: number
  /** 진행(`IN_PROGRESS`) */
  active: number
  /** 남음(`OPEN`·`WAITING`과 그 밖 상태) */
  remaining: number
  /** 묶음 티켓 자신을 뺀 자손 전체 */
  total: number
}

/** 읽기 하나의 결과 상태. `missing`은 404, `rate_limited`는 한도 초과다. */
export type SourceState = 'ok' | 'missing' | 'error' | 'rate_limited'

export type SourceKey = 'stagingIndex' | 'mainIndex' | 'deployState' | 'compare' | 'deployment' | 'requests'

export type DeployLabel = '동결' | '배포 가능' | '배포할 것 없음' | '확인 안 됨'

export interface LastDeploy {
  /** ISO 시각 */
  at: string
  /** KST 날짜 `YYYY-MM-DD` */
  kstDate: string
  sha: string | null
  /** 배포 상태(`success` 등). 상태를 못 읽었거나 main 커밋으로 대신했으면 null */
  state: string | null
  /** 배포 기록이 없어 main 마지막 커밋 시각으로 대신했으면 true */
  estimated: boolean
}

export interface DeployStatus {
  /** 배포 상태 파일을 못 읽었으면 null */
  frozen: boolean | null
  reason: string
  nextDeploy: string
  /** staging이 main보다 앞선 커밋 수. 못 읽었으면 null */
  ahead: number | null
  label: DeployLabel
  lastDeploy: LastDeploy | null
}

export interface DevBoardSnapshot {
  generatedAt: string
  deploy: DeployStatus
  /** staging 색인을 못 읽으면 빈 배열 */
  bundles: BundleProgress[]
  columns: BoardColumns
  sources: Record<SourceKey, SourceState>
  /** main에 색인이 없어(또는 못 읽어) 「배포됨」을 마지막 배포 날짜로 추정했으면 true */
  estimatedDeployed: boolean
}
