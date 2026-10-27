/**
 * 개발·배포 상황판의 읽기 (티켓 20261026_2028 2회차, 어드민 상황판 PRD §8)
 *
 * GitHub에서 읽은 색인·배포 상태·앞선 커밋 수·마지막 배포와, 저장된 개발 요청을 모아 스냅샷 하나를 만든다.
 * 읽기 객체와 요청 목록 함수를 인자로 받는다(테스트는 가짜를 넘긴다).
 *
 * - 읽기를 병렬로 하고, 하나가 실패해도 그 부분만 `sources`에 `error`·`rate_limited`·`missing`으로 남긴다. 던지지 않고 항상 스냅샷을 돌려준다.
 * - staging 색인을 못 읽으면 보드는 개발 요청만 담고 묶음은 빈 배열이다(`sources.stagingIndex`로 알린다).
 * - main 색인이 없거나(404) 못 읽으면 「배포됨」을 마지막 배포 날짜로 추정하고 `estimatedDeployed`를 true로 둔다.
 * - 마지막 배포는 `Production – jam` 환경의 가장 최근 배포다. 없으면 main 마지막 커밋 시각으로 대신하고 `estimated`로 표시한다.
 * - 오류 원인(응답 본문 포함)은 이 모듈이 받지도 싣지도 않는다. 요청 목록 오류만 서버 로그에 남긴다.
 */
import { bundleProgress, buildColumns } from './board'
import {
  DEPLOY_STATE_PATH,
  JAM2_BUNDLES,
  MAIN_BRANCH,
  PROD_DEPLOY_ENVIRONMENT,
  STAGING_BRANCH,
  TICKET_INDEX_PATH,
} from './constants'
import { deployStateLabel, kstDateOf, parseDeployState, type DeployState } from './deploy'
import type { GithubReader, ReadResult } from './github'
import { parseTicketIndex } from './ticketIndex'
import type {
  BoardRequestInput,
  DevBoardSnapshot,
  LastDeploy,
  SourceKey,
  SourceState,
  TicketIndexEntry,
} from './types'

export interface LoadDevBoardDeps {
  reader: GithubReader
  /** 아직 티켓이 되지 않은(`requested`) 개발 요청 */
  listRequests: () => Promise<BoardRequestInput[]>
}

/** 읽기 객체가 약속을 어기고 던져도 그 부분만 `error`로 둔다 */
async function guarded<T>(task: () => Promise<ReadResult<T>>): Promise<ReadResult<T>> {
  try {
    return await task()
  } catch {
    return { state: 'error' }
  }
}

function indexOf(result: ReadResult<string>): { entries: TicketIndexEntry[] | null; state: SourceState } {
  if (result.state !== 'ok') return { entries: null, state: result.state }
  const parsed = parseTicketIndex(result.value)
  return parsed ? { entries: parsed.entries, state: 'ok' } : { entries: null, state: 'error' }
}

export async function loadDevBoard({ reader, listRequests }: LoadDevBoardDeps, now: Date): Promise<DevBoardSnapshot> {
  const [stagingRaw, mainRaw, stateRaw, compare, deployment, requestsResult] = await Promise.all([
    guarded(() => reader.readFile(TICKET_INDEX_PATH, STAGING_BRANCH)),
    guarded(() => reader.readFile(TICKET_INDEX_PATH, MAIN_BRANCH)),
    guarded(() => reader.readFile(DEPLOY_STATE_PATH, STAGING_BRANCH)),
    guarded(() => reader.compareAhead(MAIN_BRANCH, STAGING_BRANCH)),
    guarded(() => reader.latestDeployment(PROD_DEPLOY_ENVIRONMENT)),
    Promise.resolve().then(listRequests).then(
      (requests): ReadResult<BoardRequestInput[]> => ({ state: 'ok', value: requests }),
      (error: unknown): ReadResult<BoardRequestInput[]> => {
        console.error('[devBoard] 개발 요청 읽기 실패', error)
        return { state: 'error' }
      }
    ),
  ])

  const staging = indexOf(stagingRaw)
  const main = indexOf(mainRaw)

  let deployState: DeployState | null = null
  let deployStateSource: SourceState = stateRaw.state
  if (stateRaw.state === 'ok') {
    deployState = parseDeployState(stateRaw.value)
    if (deployState === null) deployStateSource = 'error'
  }

  // 마지막 배포: 배포 기록 → 없으면 main 마지막 커밋 시각(추정)
  let lastDeploy: LastDeploy | null = null
  let deploymentSource: SourceState = deployment.state
  if (deployment.state === 'ok') {
    const kstDate = kstDateOf(deployment.value.createdAt)
    if (kstDate) {
      lastDeploy = {
        at: deployment.value.createdAt,
        kstDate,
        sha: deployment.value.sha,
        state: deployment.value.state,
        estimated: false,
      }
    } else {
      deploymentSource = 'error'
    }
  }
  if (lastDeploy === null) {
    const commit = await guarded(() => reader.latestCommit(MAIN_BRANCH))
    const kstDate = commit.state === 'ok' ? kstDateOf(commit.value.date) : null
    if (commit.state === 'ok' && kstDate) {
      lastDeploy = { at: commit.value.date, kstDate, sha: commit.value.sha, state: null, estimated: true }
    } else if (deploymentSource === 'missing') {
      // 배포 기록이 없는 데다 대신할 커밋도 못 읽었다
      deploymentSource = commit.state === 'rate_limited' ? 'rate_limited' : 'error'
    }
  }

  const ahead = compare.state === 'ok' ? compare.value : null
  const requests = requestsResult.state === 'ok' ? requestsResult.value : []
  const estimatedDeployed = main.entries === null

  const stagingEntries = staging.entries ?? []
  const columns = buildColumns(stagingEntries, main.entries, {
    now,
    lastDeployKstDate: lastDeploy?.kstDate ?? null,
    requests,
  })

  const sources: Record<SourceKey, SourceState> = {
    stagingIndex: staging.state,
    mainIndex: main.state,
    deployState: deployStateSource,
    compare: compare.state,
    deployment: deploymentSource,
    requests: requestsResult.state,
  }

  return {
    generatedAt: now.toISOString(),
    deploy: {
      frozen: deployState?.frozen ?? null,
      reason: deployState?.reason ?? '',
      nextDeploy: deployState?.nextDeploy ?? '',
      ahead,
      label: deployStateLabel({ frozen: deployState?.frozen ?? null, ahead }),
      lastDeploy,
    },
    bundles: staging.entries ? bundleProgress(staging.entries, JAM2_BUNDLES) : [],
    columns,
    sources,
    estimatedDeployed,
  }
}
