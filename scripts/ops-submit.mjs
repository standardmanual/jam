#!/usr/bin/env node
// 운영 묶음 제출·루틴 시작 기록 — 예약 루틴이 받은 기획함에 쓰는 유일한 도구 (티켓 20260930_1504 1회차)
//
// 루틴은 쉘 명령으로 서버를 부르고, 윤진은 curl과 직접 명령이 금지라 이 스크립트 한 개로만 보낸다.
// 서비스 롤 키는 쓰지 않는다. 읽기 토큰(ADMIN_API_READ_TOKEN)만 쓴다. 토큰의 쓰기가 열린 경로는 정확히
// 두 개이고, 서버 쪽 원천은 jam-web/src/lib/admin/opsInbox/constants.ts다. 이 파일의 상수는 그 값의
// 사본이라, 같은 값인지 scripts/ops-submit.test.mjs가 파일 텍스트로 대조한다.
//
// 사용법:
//   ADMIN_API_BASE_URL=https://stage.j-a-m.app ADMIN_API_READ_TOKEN=xxxxx \
//     node scripts/ops-submit.mjs bundle <묶음.json>   # POST /api/admin/ops-inbox (1MB까지)
//     node scripts/ops-submit.mjs start  <시작.json>   # POST /api/admin/ops-inbox/routine-start (16KB까지)
//
// 출력은 요약뿐이다(상태, id, bundle_id, item_count, format_errors, warnings). 토큰과 본문 전체는 찍지 않는다.
// 종료 코드: 201 받음 0 · 200 이미 받음 0 · 그 밖은 1.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 허용하는 쓰기 경로. 이 표에 없는 이름은 실패한다. (서버 상수와의 일치는 시험이 대조한다) */
export const SUBMIT_TARGETS = {
  bundle: { path: '/api/admin/ops-inbox', maxBytes: 1_048_576, label: '묶음' },
  start: { path: '/api/admin/ops-inbox/routine-start', maxBytes: 16 * 1024, label: '시작 기록' },
}

const REQUEST_TIMEOUT_MS = 30_000

/**
 * 환경변수에서 서버 주소와 읽기 토큰을 꺼낸다. 토큰을 평문으로 보내지 않도록 https이거나 localhost의 http만 받는다.
 * 실패하면 { error }(토큰은 문장에 넣지 않는다), 성공하면 { origin, token }.
 */
export function resolveConnection(env) {
  const token = env.ADMIN_API_READ_TOKEN
  if (!token) return { error: 'ADMIN_API_READ_TOKEN이 없어서 실행하지 않았어요.' }
  const base = env.ADMIN_API_BASE_URL
  if (!base) return { error: 'ADMIN_API_BASE_URL이 없어서 실행하지 않았어요.' }
  let url
  try {
    url = new URL(base)
  } catch {
    return { error: 'ADMIN_API_BASE_URL을 주소로 읽을 수 없어요.' }
  }
  if (url.username || url.password) return { error: 'ADMIN_API_BASE_URL에 계정 정보를 넣을 수 없어요.' }
  const secure = url.protocol === 'https:'
  const localHttp = url.protocol === 'http:' && url.hostname === 'localhost'
  if (!secure && !localHttp) {
    return { error: 'ADMIN_API_BASE_URL은 https:// 이거나 http://localhost여야 해요. 토큰을 평문으로 보내지 않아요.' }
  }
  return { origin: url.origin, token }
}

/** 출력 문장에서 토큰 값을 지운다(서버가 돌려준 문장에도 적용). */
export function scrub(text, token) {
  const s = String(text)
  return token ? s.split(token).join('[토큰]') : s
}

function statusMessage(status, kindLabel) {
  if (status === 201) return `${kindLabel}을(를) 받았어요.`
  if (status === 200) return `이미 같은 ${kindLabel}을(를) 받았어요. 다시 보내도 안전해요.`
  if (status === 409) return '같은 bundle_id에 이미 다른 내용이 있어요. 새 bundle_id로 바꿔서 다시 보내세요.'
  if (status === 400) return '형식 오류예요. details를 보고 고쳐서 다시 보내세요.'
  if (status === 401 || status === 403) return '토큰 문제예요. ADMIN_API_READ_TOKEN 값과 서버 설정을 확인하세요.'
  return '보내지 못했어요.'
}

/**
 * @param {{ argv: string[], env: Record<string,string|undefined>, fetchImpl?: typeof fetch, out: (line: string) => void, err: (line: string) => void }} io
 * @returns {Promise<number>} 종료 코드
 */
export async function run({ argv, env, fetchImpl = fetch, out, err }) {
  const [name, file, ...rest] = argv
  const target = Object.prototype.hasOwnProperty.call(SUBMIT_TARGETS, name ?? '') ? SUBMIT_TARGETS[name] : null
  if (!target) {
    err(`허용하지 않는 경로 이름이에요: ${name ?? '(없음)'}. bundle 또는 start만 쓸 수 있어요.`)
    return 1
  }
  if (!file || rest.length > 0) {
    err(`사용법: node scripts/ops-submit.mjs ${name} <파일.json>`)
    return 1
  }

  const conn = resolveConnection(env)
  if (conn.error) {
    err(conn.error)
    return 1
  }
  const { origin, token } = conn

  let body
  try {
    body = readFileSync(file)
  } catch {
    err(`파일을 읽을 수 없어요: ${file}`)
    return 1
  }
  if (body.byteLength > target.maxBytes) {
    err(`${target.label} 파일이 너무 커요(${body.byteLength}바이트, 상한 ${target.maxBytes}바이트). 보내지 않았어요. 항목을 줄이세요.`)
    return 1
  }

  let res
  try {
    res = await fetchImpl(`${origin}${target.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-read-token': token },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (e) {
    const code = e?.cause?.code ?? e?.name ?? '알 수 없음'
    err(scrub(`서버에 연결하지 못했어요(${code}). 같은 파일을 다시 보내도 안전해요.`, token))
    return 1
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  const ok = res.status === 201 || res.status === 200
  const print = ok ? out : err
  const line = (text) => print(scrub(text, token))

  line(`${target.label}: ${res.status} ${statusMessage(res.status, target.label)}`)
  if (data && typeof data === 'object') {
    for (const key of ['id', 'bundle_id', 'run_key', 'item_count']) {
      if (data[key] !== undefined && data[key] !== null) line(`${key}: ${data[key]}`)
    }
    for (const key of ['format_errors', 'warnings', 'details']) {
      const list = data[key]
      if (Array.isArray(list)) {
        line(`${key}: ${list.length}건`)
        for (const item of list) line(`  - ${typeof item === 'string' ? item : JSON.stringify(item)}`)
      }
    }
    // 서버 안내 문장은 400·409처럼 서버가 의도해서 돌려준 경우에만 그대로 보인다.
    if ((res.status === 400 || res.status === 409) && typeof data.error === 'string') line(`서버 안내: ${data.error}`)
  }
  return ok ? 0 : 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run({
    argv: process.argv.slice(2),
    env: process.env,
    out: (l) => console.log(l),
    err: (l) => console.error(l),
  }).then((code) => process.exit(code))
}
