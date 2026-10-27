/**
 * 운영 상황판 계산의 입력 타입 (티켓 20261026_2023 1회차).
 *
 * `weekFlow.ts`·`myTurn.ts`는 서버·클라이언트가 같이 불러오므로 서버 전용 모듈(`query.ts`)을 가져올 수 없다. 그래서 JSON 칸
 * (`routine_run`, 항목 `original`·`edited`)은 `load.ts`가 서버에서 `readOpsRoutineStages`·`readOpsItemRationales`로 미리 풀어
 * 이 타입에 담아 넘긴다. 이 파일의 `import type`은 번들에 들어가지 않는다.
 */
import type { OpsItemRationale, OpsRoutineStageRecord } from '@/lib/admin/opsInbox/query'

export interface BoardItemInput {
  id: string
  bundleId: string
  /** 항목 상태. 10개 밖 값이 올 수 있어 string이다. */
  status: string
  kind: string | null
  /** 기획 이유(수정본이 있으면 수정본에서 읽는다). */
  rationales: OpsItemRationale[]
}

export interface BoardBundleInput {
  /** 묶음 행 ID(`ops_bundles.id`). 경로에 쓴다. */
  id: string
  week: string | null
  isSample: boolean
  receivedAt: string
  title: string | null
  /** 에이전트 단계 기록(`routine_run.stages`). 없으면 빈 배열이다. */
  stages: OpsRoutineStageRecord[]
  items: BoardItemInput[]
}

export interface BoardRoutineStartInput {
  id: string
  runKey: string
  week: string | null
  author: string
  agents: string[]
  startedAt: string
  /** 제출 묶음과 이어졌으면 그 묶음 행 ID, 아니면 null. */
  bundleId: string | null
}
