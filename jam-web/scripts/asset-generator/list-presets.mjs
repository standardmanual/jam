/**
 * JAM! 에셋 제너레이터 CLI — 프리셋 목록 출력 (티켓 20260926_1209)
 *
 * 윤진이 「대상 유형 + 이름」으로 프리셋 id를 찾을 수 있도록 한 줄에 하나씩 `id · 이름 · 비율`을 낸다.
 * 어드민 읽기 API 경로만 쓴다(서비스 롤 키 경로는 두지 않는다). 환경변수는 `.env.local`과
 * `process.env`를 합쳐 읽고 `process.env`가 우선한다.
 *
 * 사용법:
 *   cd jam-web
 *   npx tsx scripts/asset-generator/list-presets.mjs [--target-type badge|mission|collection|home_feed]
 *
 * 인자 검증·환경변수 확인·출력 포맷은 순수 함수로 export해 네트워크 없이 테스트한다.
 * 어떤 오류든 한국어 메시지를 표준 오류로 내고 종료 코드 1로 끝난다.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PRESET_TARGET_TYPES } from '../../src/lib/asset-generator/presetSerialize'
import { loadEnv } from '../lib/loadEnv.mjs'
import { fetchPresetListFromAdminApi, resolveEnv } from './presetSource.mjs'

const REQUIRED_ENV = ['ADMIN_API_BASE_URL', 'ADMIN_API_READ_TOKEN']

/** `--target-type <값>`을 검증해 `{ targetType }`을 돌려준다. 생략하면 `targetType`이 undefined(전체 목록)다. */
export function parseListArgs(argv) {
  let targetType
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token !== '--target-type') {
      if (token.startsWith('--')) throw new Error(`알 수 없는 인자예요: ${token}`)
      continue
    }
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`--target-type 값이 필요해요. 허용값: ${PRESET_TARGET_TYPES.join(', ')}`)
    }
    targetType = value
    i++
  }
  if (targetType !== undefined && !PRESET_TARGET_TYPES.includes(targetType)) {
    throw new Error(`--target-type 값이 올바르지 않아요: ${targetType}. 허용값: ${PRESET_TARGET_TYPES.join(', ')}`)
  }
  return { targetType }
}

/** 읽기 API 환경변수를 확인한다. 없는 변수명을 나열해 던진다. */
export function requireApiEnv(env) {
  const missing = REQUIRED_ENV.filter((key) => !env[key])
  if (missing.length > 0) {
    throw new Error(
      `프리셋 목록을 조회할 환경변수가 없어요: ${missing.join('·')}. .env.local이나 환경변수로 채워 주세요.`
    )
  }
  return { baseUrl: env.ADMIN_API_BASE_URL, token: env.ADMIN_API_READ_TOKEN }
}

/** 프리셋 한 개를 `<id> · <이름> · <비율>` 한 줄로 바꾼다. 이름의 개행은 공백으로 바꾼다. */
export function formatPresetLine(preset) {
  const name = String(preset.name ?? '').replace(/\s*[\r\n]+\s*/g, ' ')
  return `${preset.id} · ${name} · ${preset.stageRatio}`
}

async function main() {
  const { targetType } = parseListArgs(process.argv.slice(2))
  const env = resolveEnv(loadEnv(), process.env)
  const { baseUrl, token } = requireApiEnv(env)
  const presets = await fetchPresetListFromAdminApi({ baseUrl, token, targetType })
  for (const preset of presets) console.log(formatPresetLine(preset))
}

// 테스트에서 import할 때는 실행하지 않는다.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
