/**
 * GitHub 읽기 (티켓 20261026_2028 2회차)
 *
 * 가짜 fetch로 지키는 것:
 * - 토큰이 있으면 Authorization을 붙이고 없으면 붙이지 않는다
 * - 404 → missing, 403/429 + 남은 한도 0 → rate_limited, 그 밖 실패·던짐 → error
 * - 60초 기억과 동시 요청 합치기(일시 오류는 기억하지 않음), 환경 이름 URL 인코딩(엔대시)
 * - 응답 본문과 토큰이 반환값에 실리지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/devBoard/__tests__/github.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { PROD_DEPLOY_ENVIRONMENT } from '../constants'
import { createGithubReader } from '../github'

type Call = { url: string; headers: Record<string, string> }

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(text, { status, headers })
}

function fakeFetch(handler: (url: string) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    return handler(url)
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

describe('토큰', () => {
  it('토큰이 있으면 Bearer를 붙이고 없으면 붙이지 않는다', async () => {
    const withToken = fakeFetch(() => reply(200, 'x'))
    await createGithubReader({ fetch: withToken.fetch, token: 'secret-token' }).readFile('a.md', 'staging')
    expect(withToken.calls[0].headers.Authorization).toBe('Bearer secret-token')

    const without = fakeFetch(() => reply(200, 'x'))
    await createGithubReader({ fetch: without.fetch, token: null }).readFile('a.md', 'staging')
    expect(without.calls[0].headers).not.toHaveProperty('Authorization')
  })

  it('파일은 raw 형식으로 부르고 경로를 칸마다 인코딩하며 ref를 붙인다', async () => {
    const { fetch, calls } = fakeFetch(() => reply(200, '{"a":1}'))
    const result = await createGithubReader({ fetch }).readFile('docs/tickets/_index.json', 'staging')
    expect(result).toEqual({ state: 'ok', value: '{"a":1}' })
    expect(calls[0].url).toBe('https://api.github.com/repos/standardmanual/jam/contents/docs/tickets/_index.json?ref=staging')
    expect(calls[0].headers.Accept).toBe('application/vnd.github.raw+json')
  })
})

describe('실패 상태', () => {
  it('404는 missing이다', async () => {
    const { fetch } = fakeFetch(() => reply(404, { message: 'Not Found' }))
    expect(await createGithubReader({ fetch }).readFile('x', 'main')).toEqual({ state: 'missing' })
  })

  it('403·429에서 남은 한도가 0이면 rate_limited, 아니면 error다', async () => {
    for (const status of [403, 429]) {
      const limited = fakeFetch(() => reply(status, 'rate limit', { 'x-ratelimit-remaining': '0' }))
      expect(await createGithubReader({ fetch: limited.fetch }).readFile('x', 'main')).toEqual({ state: 'rate_limited' })
      const other = fakeFetch(() => reply(status, 'forbidden', { 'x-ratelimit-remaining': '12' }))
      expect(await createGithubReader({ fetch: other.fetch }).readFile('x', 'main')).toEqual({ state: 'error' })
    }
  })

  it('500과 네트워크 던짐은 error다', async () => {
    const server = fakeFetch(() => reply(500, 'boom'))
    expect(await createGithubReader({ fetch: server.fetch }).readFile('x', 'main')).toEqual({ state: 'error' })
    const thrown = fakeFetch(() => {
      throw new Error('network down')
    })
    expect(await createGithubReader({ fetch: thrown.fetch }).readFile('x', 'main')).toEqual({ state: 'error' })
  })

  it('반환값에 응답 본문과 토큰이 실리지 않는다', async () => {
    const failed = fakeFetch(() => reply(500, 'SECRET-BODY secret-token'))
    const result = await createGithubReader({ fetch: failed.fetch, token: 'secret-token' }).readFile('x', 'main')
    expect(JSON.stringify(result)).not.toContain('SECRET-BODY')
    expect(JSON.stringify(result)).not.toContain('secret-token')
    const limited = fakeFetch(() => reply(403, 'SECRET-BODY', { 'x-ratelimit-remaining': '0' }))
    const limitedResult = await createGithubReader({ fetch: limited.fetch, token: 'secret-token' }).readFile('x', 'main')
    expect(JSON.stringify(limitedResult)).not.toContain('SECRET-BODY')
  })
})

describe('기억과 합치기', () => {
  it('같은 요청은 60초 안에 한 번만 부르고 지나면 다시 부른다', async () => {
    let time = 1_000
    const { fetch, calls } = fakeFetch(() => reply(200, 'x'))
    const reader = createGithubReader({ fetch, now: () => time })
    await reader.readFile('a.md', 'staging')
    await reader.readFile('a.md', 'staging')
    expect(calls).toHaveLength(1)
    await reader.readFile('a.md', 'main')
    expect(calls).toHaveLength(2)
    time += 60_001
    await reader.readFile('a.md', 'staging')
    expect(calls).toHaveLength(3)
  })

  it('동시에 오는 같은 요청은 하나로 합친다', async () => {
    const { fetch, calls } = fakeFetch(() => reply(200, 'x'))
    const reader = createGithubReader({ fetch })
    const results = await Promise.all([reader.readFile('a.md', 'staging'), reader.readFile('a.md', 'staging')])
    expect(calls).toHaveLength(1)
    expect(results[0]).toEqual(results[1])
  })

  it('missing은 기억하지만 일시 오류(error)는 기억하지 않는다', async () => {
    const missing = fakeFetch(() => reply(404, ''))
    const missingReader = createGithubReader({ fetch: missing.fetch })
    await missingReader.readFile('a.md', 'main')
    await missingReader.readFile('a.md', 'main')
    expect(missing.calls).toHaveLength(1)

    let fail = true
    const flaky = fakeFetch(() => (fail ? reply(500, '') : reply(200, 'ok')))
    const flakyReader = createGithubReader({ fetch: flaky.fetch })
    expect(await flakyReader.readFile('a.md', 'main')).toEqual({ state: 'error' })
    fail = false
    expect(await flakyReader.readFile('a.md', 'main')).toEqual({ state: 'ok', value: 'ok' })
  })
})

describe('compareAhead', () => {
  it('ahead_by만 꺼낸다', async () => {
    const { fetch, calls } = fakeFetch(() => reply(200, { ahead_by: 1273, commits: new Array(250).fill({}) }))
    expect(await createGithubReader({ fetch }).compareAhead('main', 'staging')).toEqual({ state: 'ok', value: 1273 })
    expect(calls[0].url).toContain('/compare/main...staging')
  })

  it('ahead_by가 숫자가 아니면 error다', async () => {
    const { fetch } = fakeFetch(() => reply(200, { ahead_by: '1' }))
    expect(await createGithubReader({ fetch }).compareAhead('main', 'staging')).toEqual({ state: 'error' })
  })
})

describe('latestDeployment', () => {
  it('환경 이름을 URL 인코딩하고(엔대시 포함) 배포와 첫 상태를 돌려준다', async () => {
    const { fetch, calls } = fakeFetch((url) =>
      url.includes('/statuses')
        ? reply(200, [{ state: 'success' }, { state: 'pending' }])
        : reply(200, [{ id: 77, created_at: '2026-10-14T07:31:59Z', sha: '1e2d55e2' }])
    )
    const result = await createGithubReader({ fetch }).latestDeployment(PROD_DEPLOY_ENVIRONMENT)
    expect(result).toEqual({ state: 'ok', value: { createdAt: '2026-10-14T07:31:59Z', sha: '1e2d55e2', state: 'success' } })
    expect(calls[0].url).toContain('environment=Production%20%E2%80%93%20jam')
    expect(calls[0].url).toContain('per_page=1')
    expect(calls[1].url).toContain('/deployments/77/statuses')
  })

  it('배포가 하나도 없으면 missing이다', async () => {
    const { fetch } = fakeFetch(() => reply(200, []))
    expect(await createGithubReader({ fetch }).latestDeployment('Production')).toEqual({ state: 'missing' })
  })

  it('상태만 못 읽으면 배포 시각은 살리고 상태를 null로 둔다', async () => {
    const { fetch } = fakeFetch((url) =>
      url.includes('/statuses') ? reply(500, '') : reply(200, [{ id: 1, created_at: '2026-10-14T07:31:59Z', sha: 'abc' }])
    )
    const result = await createGithubReader({ fetch }).latestDeployment('Production – jam')
    expect(result).toEqual({ state: 'ok', value: { createdAt: '2026-10-14T07:31:59Z', sha: 'abc', state: null } })
  })
})

describe('latestCommit', () => {
  it('마지막 커밋의 시각과 sha를 돌려준다', async () => {
    const { fetch } = fakeFetch(() => reply(200, [{ sha: 'abc', commit: { committer: { date: '2026-10-14T07:00:00Z' } } }]))
    expect(await createGithubReader({ fetch }).latestCommit('main')).toEqual({
      state: 'ok',
      value: { date: '2026-10-14T07:00:00Z', sha: 'abc' },
    })
  })
})
