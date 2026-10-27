#!/usr/bin/env node
// 운영 재료 읽기 — 예약 루틴이 기획 재료를 읽는 허용 목록 GET 도구 (티켓 20260930_1504 1회차)
//
// 허용 목록에 있는 이름 하나를 읽고 응답 JSON을 줄이지 않고 그대로 출력한다(재료 판단은 에이전트 몫).
// 읽기 토큰(ADMIN_API_READ_TOKEN)만 쓰고 GET만 보낸다. 인증·주소 규칙은 ops-submit.mjs와 같다.
// 새 경로를 더할 때 고치는 곳은 아래 READ_TARGETS 한 곳이다.
//
// 사용법:
//   ADMIN_API_BASE_URL=https://stage.j-a-m.app ADMIN_API_READ_TOKEN=xxxxx \
//     node scripts/ops-read.mjs <이름> [--query key=value ...]
//   예) node scripts/ops-read.mjs patterns-draw --query limit=5
//       node scripts/ops-read.mjs kpi-weekly --query days=28

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConnection, scrub } from './ops-submit.mjs'

/** 이름 → GET 경로. 경로·쿼리는 jam-web/src/app/api/admin/ 아래 각 route.ts의 GET이 정본이다. */
export const READ_TARGETS = {
  'trend-sources': '/api/admin/ops-trend-sources', // 켜진 출처만(토큰 요청은 includeDisabled를 무시한다)
  'patterns-draw': '/api/admin/ops-patterns/draw', // 조합 뽑기, GET, 쿼리 limit(1~50)
  rules: '/api/admin/ops-rules', // 쿼리 group(기본 balance)
  decisions: '/api/admin/ops-decisions',
  patterns: '/api/admin/ops-patterns', // 쿼리 includeArchived
  'item-paths': '/api/admin/item-paths', // 쿼리 limit·offset·onlyBlocked
  'kpi-weekly': '/api/admin/kpi/weekly', // 쿼리 days
  'today-metrics': '/api/admin/today/metrics', // 쿼리 from·to
}

const REQUEST_TIMEOUT_MS = 30_000

/** `--query key=value` 반복을 쿼리 문자열로 만든다. 잘못된 모양이면 { error }. */
export function parseArgs(argv) {
  const [name, ...rest] = argv
  const params = new URLSearchParams()
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i] !== '--query' || !rest[i + 1]) return { error: '쓸 수 있는 옵션은 --query key=value뿐이에요.' }
    const pair = rest[i + 1]
    const eq = pair.indexOf('=')
    if (eq < 1) return { error: `--query 값은 key=value 모양이어야 해요: ${pair}` }
    params.append(pair.slice(0, eq), pair.slice(eq + 1))
  }
  return { name, query: params.toString() }
}

/**
 * @param {{ argv: string[], env: Record<string,string|undefined>, fetchImpl?: typeof fetch, out: (text: string) => void, err: (line: string) => void }} io
 * @returns {Promise<number>} 종료 코드
 */
export async function run({ argv, env, fetchImpl = fetch, out, err }) {
  const parsed = parseArgs(argv)
  if (parsed.error) {
    err(parsed.error)
    return 1
  }
  const { name, query } = parsed
  if (!name || !Object.prototype.hasOwnProperty.call(READ_TARGETS, name)) {
    err(`허용하지 않는 이름이에요: ${name ?? '(없음)'}. 쓸 수 있는 이름: ${Object.keys(READ_TARGETS).join(', ')}`)
    return 1
  }

  const conn = resolveConnection(env)
  if (conn.error) {
    err(conn.error)
    return 1
  }
  const { origin, token } = conn

  let res
  try {
    res = await fetchImpl(`${origin}${READ_TARGETS[name]}${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: { 'x-admin-read-token': token },
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (e) {
    const code = e?.cause?.code ?? e?.name ?? '알 수 없음'
    err(scrub(`서버에 연결하지 못했어요(${code}).`, token))
    return 1
  }

  const text = await res.text()
  if (res.status !== 200) {
    let detail = ''
    try {
      const data = JSON.parse(text)
      if (typeof data?.error === 'string') detail = ` ${data.error}`
    } catch {
      // 본문이 JSON이 아니면 상태 코드만 알린다
    }
    err(scrub(`${name}: ${res.status} 읽지 못했어요.${detail}`, token))
    return 1
  }
  out(scrub(text, token))
  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run({
    argv: process.argv.slice(2),
    env: process.env,
    out: (t) => process.stdout.write(t.endsWith('\n') ? t : `${t}\n`),
    err: (l) => console.error(l),
  }).then((code) => process.exit(code))
}
