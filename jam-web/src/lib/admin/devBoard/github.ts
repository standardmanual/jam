/**
 * GitHub 읽기 (티켓 20261026_2028 2회차, 어드민 상황판 PRD §8). 서버에서만 쓴다.
 *
 * 저장소 `standardmanual/jam`(공개)을 읽기만 한다. 토큰 환경변수 `GITHUB_READ_TOKEN`은 있으면 `Authorization: Bearer`로 붙이고
 * 없으면 붙이지 않는다(비인증 한도 시간당 60번, 토큰이 있으면 5,000번).
 *
 * - 돌려주는 값은 항상 `ReadResult`다. 던지지 않는다. 404는 `missing`, 403·429에서 남은 한도 헤더가 0이면 `rate_limited`, 그 밖 실패는 `error`.
 * - 응답 본문과 토큰은 로그와 반환값에 싣지 않는다(성공했을 때 필요한 값만 꺼낸다).
 * - 같은 요청(주소)은 `READ_MEMORY_MS` 동안 기억하고, 동시에 오는 같은 요청은 하나로 합친다.
 *   일시 오류(`error`)는 기억하지 않아 다음 요청이 다시 시도한다.
 *   Next 데이터 캐시는 항목 2MB 상한 때문에 쓰지 않는다(색인이 750KB를 넘어 늘어난다). 그래서 `cache: 'no-store'`로 부른다.
 */
import {
  GITHUB_REPO,
  GITHUB_TIMEOUT_MS,
  READ_MEMORY_MS,
} from './constants'
import type { SourceState } from './types'

export type ReadResult<T> = { state: 'ok'; value: T } | { state: Exclude<SourceState, 'ok'> }

export interface DeploymentInfo {
  /** 배포가 만들어진 ISO 시각 */
  createdAt: string
  sha: string | null
  /** 그 배포의 가장 최근 상태(`success` 등). 상태를 못 읽었으면 null */
  state: string | null
}

export interface CommitInfo {
  /** 커밋 시각(ISO) */
  date: string
  sha: string | null
}

export interface GithubReader {
  /** 저장소 파일 원문. `ref`는 브랜치 이름 */
  readFile(path: string, ref: string): Promise<ReadResult<string>>
  /** `base...head`에서 head가 앞선 커밋 수(`ahead_by`) */
  compareAhead(base: string, head: string): Promise<ReadResult<number>>
  /** 해당 환경의 가장 최근 배포. 배포가 하나도 없으면 `missing` */
  latestDeployment(environment: string): Promise<ReadResult<DeploymentInfo>>
  /** 브랜치 마지막 커밋의 시각 */
  latestCommit(branch: string): Promise<ReadResult<CommitInfo>>
}

export interface GithubReaderOptions {
  fetch: typeof fetch
  token?: string | null
  /** 시험용 시계. 기본은 `Date.now` */
  now?: () => number
  memoryMs?: number
}

const API_ROOT = 'https://api.github.com'

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function createGithubReader({
  fetch: fetchImpl,
  token,
  now = Date.now,
  memoryMs = READ_MEMORY_MS,
}: GithubReaderOptions): GithubReader {
  const memory = new Map<string, { expiresAt: number; promise: Promise<ReadResult<unknown>> }>()

  function headers(accept: string): Record<string, string> {
    const result: Record<string, string> = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' }
    if (token) result.Authorization = `Bearer ${token}`
    return result
  }

  /** 주소 하나를 부르고 `parse`가 성공 응답에서 값을 꺼낸다. 던지지 않는다. */
  async function request<T>(
    url: string,
    accept: string,
    parse: (response: Response) => Promise<T | null>
  ): Promise<ReadResult<T>> {
    try {
      const response = await fetchImpl(url, {
        headers: headers(accept),
        cache: 'no-store',
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      })
      if (response.status === 404) return { state: 'missing' }
      if (response.status === 403 || response.status === 429) {
        return { state: response.headers.get('x-ratelimit-remaining') === '0' ? 'rate_limited' : 'error' }
      }
      if (!response.ok) return { state: 'error' }
      const value = await parse(response)
      return value === null ? { state: 'error' } : { state: 'ok', value }
    } catch {
      return { state: 'error' }
    }
  }

  function remembered<T>(url: string, run: () => Promise<ReadResult<T>>): Promise<ReadResult<T>> {
    const found = memory.get(url)
    if (found && found.expiresAt > now()) return found.promise as Promise<ReadResult<T>>
    const promise = run()
    memory.set(url, { expiresAt: now() + memoryMs, promise })
    void promise.then((result) => {
      // 일시 오류는 기억하지 않는다. 그 사이 다른 요청이 새로 기억을 만들었으면 건드리지 않는다.
      if (result.state === 'error' && memory.get(url)?.promise === promise) memory.delete(url)
    })
    return promise
  }

  const repo = `${API_ROOT}/repos/${GITHUB_REPO}`
  const json = 'application/vnd.github+json'

  return {
    readFile(path, ref) {
      const url = `${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`
      return remembered(url, () => request(url, 'application/vnd.github.raw+json', (response) => response.text()))
    },

    compareAhead(base, head) {
      const url = `${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?per_page=1`
      return remembered(url, () =>
        request(url, json, async (response) => {
          const body: unknown = await response.json()
          return isRecord(body) && typeof body.ahead_by === 'number' ? body.ahead_by : null
        })
      )
    },

    latestDeployment(environment) {
      const url = `${repo}/deployments?environment=${encodeURIComponent(environment)}&per_page=1`
      return remembered(url, async () => {
        const found = await request<{ id: number; createdAt: string; sha: string | null } | 'none'>(url, json, async (response) => {
          const body: unknown = await response.json()
          if (!Array.isArray(body)) return null
          if (body.length === 0) return 'none'
          const first: unknown = body[0]
          if (!isRecord(first) || typeof first.id !== 'number' || typeof first.created_at !== 'string') return null
          return { id: first.id, createdAt: first.created_at, sha: typeof first.sha === 'string' ? first.sha : null }
        })
        if (found.state !== 'ok') return found
        if (found.value === 'none') return { state: 'missing' }
        const deployment = found.value
        const statuses = await request<string | null>(
          `${repo}/deployments/${deployment.id}/statuses?per_page=1`,
          json,
          async (response) => {
            const body: unknown = await response.json()
            if (!Array.isArray(body)) return null
            const first: unknown = body[0]
            return isRecord(first) && typeof first.state === 'string' ? first.state : ''
          }
        )
        // 상태만 못 읽었으면 배포 시각은 살리고 상태를 null로 둔다.
        const state = statuses.state === 'ok' && statuses.value !== '' ? statuses.value : null
        return { state: 'ok', value: { createdAt: deployment.createdAt, sha: deployment.sha, state } }
      })
    },

    latestCommit(branch) {
      const url = `${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`
      return remembered(url, () =>
        request(url, json, async (response) => {
          const body: unknown = await response.json()
          if (!Array.isArray(body) || !isRecord(body[0])) return null
          const commit = body[0].commit
          const committer = isRecord(commit) ? commit.committer : null
          const date = isRecord(committer) ? committer.date : null
          if (typeof date !== 'string') return null
          return { date, sha: typeof body[0].sha === 'string' ? body[0].sha : null }
        })
      )
    },
  }
}

let defaultReader: GithubReader | null = null

/** 서버 환경변수 `GITHUB_READ_TOKEN`으로 만든 읽기 객체. 기억이 요청 사이에 이어지도록 인스턴스 하나를 쓴다. */
export function getDefaultGithubReader(): GithubReader {
  if (!defaultReader) {
    const token = process.env.GITHUB_READ_TOKEN
    defaultReader = createGithubReader({ fetch, token: token && token.trim() !== '' ? token.trim() : null })
  }
  return defaultReader
}
