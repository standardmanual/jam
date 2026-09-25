/**
 * 스크립트 공용 `.env.local` 로더 (티켓 20260925_0541)
 *
 * `jam-web/.env.local`을 수동으로 파싱해 `{ KEY: 값 }` 객체로 돌려준다. 파일이 없으면 빈 객체다.
 * 줄 형식은 `KEY=값` 또는 `KEY="값"`(대문자·숫자·밑줄 키만, 따옴표는 양끝 한 쌍만 벗긴다).
 * `process.env`에는 넣지 않는다 — 호출부가 필요한 키만 꺼내 쓴다.
 *
 * 위치는 이 파일 기준이라 `jam-web/scripts/lib/`에서 두 단계 위(`jam-web/`)의 `.env.local`을 읽는다.
 * 실행 위치(cwd)와 무관하다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const libDir = path.dirname(fileURLToPath(import.meta.url))

export function loadEnv() {
  const envPath = path.join(libDir, '..', '..', '.env.local')
  const env = {}
  if (!fs.existsSync(envPath)) return env
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=\"?([^\"]*)\"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}
