/**
 * 에셋 제너레이터 CLI의 프리셋 조회 경로 (티켓 20260926_1204)
 *
 * 프리셋을 어디서 받을지 고르고(`pickPresetSource`), 어드민 읽기 API로 받는 함수와 서비스 롤
 * 경로(DB 행)·API 응답을 같은 내부 형태로 맞추는 함수를 둔다. `fetch`를 인자로 받아
 * 네트워크 없이 테스트할 수 있고, 목록 CLI(티켓 20260926_1209)도 같은 함수를 불러 쓴다.
 *
 * 내부 형태(정규화 결과): `{ id, name, targetType, stageRatio, layers, createdBy, createdAt, updatedAt }`
 * — `presetSerialize.ts`의 `AssetPreset`과 같다. 토큰 값은 오류 메시지에 넣지 않는다.
 */
import { deserializePresetLayers } from '../../src/lib/asset-generator/presetSerialize'

const PRESETS_PATH = '/api/admin/asset-generator/presets'
const TOKEN_HEADER = 'x-admin-read-token'

/**
 * 프리셋 원본을 내부 형태로 바꾼다. `stage_ratio` 키가 있으면 서비스 롤 경로의 DB 행(snake_case,
 * 직렬화 상태의 layers)으로 보고 역직렬화를 한 번 거친다. 없으면 API 응답(camelCase, 이미
 * 역직렬화됨)이라 그대로 쓴다 — 역직렬화를 두 번 거치지 않게 하는 경계다.
 */
export function normalizePreset(raw) {
  if (raw && typeof raw === 'object' && 'stage_ratio' in raw) {
    return {
      id: raw.id,
      name: raw.name,
      targetType: raw.target_type,
      stageRatio: raw.stage_ratio,
      layers: deserializePresetLayers(raw.layers ?? []),
      createdBy: raw.created_by,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    }
  }
  return {
    id: raw.id,
    name: raw.name,
    targetType: raw.targetType,
    stageRatio: raw.stageRatio,
    layers: raw.layers ?? [],
    createdBy: raw.createdBy,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

function trimBaseUrl(baseUrl) {
  return String(baseUrl).replace(/\/+$/, '')
}

/** 읽기 API를 호출해 JSON 본문을 돌려준다. 실패는 상태 코드별 한국어 메시지로 던진다. */
async function callReadApi({ url, token, fetchImpl, notFoundMessage }) {
  let res
  try {
    res = await fetchImpl(url, { headers: { [TOKEN_HEADER]: token } })
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    throw new Error(`어드민 읽기 API에 연결하지 못했어요. 주소와 네트워크를 확인해 주세요. (${reason})`)
  }
  if (res.status === 404) throw new Error(notFoundMessage)
  if (res.status === 401 || res.status === 403) {
    throw new Error('어드민 읽기 API가 접근을 거부했어요. ADMIN_API_READ_TOKEN 값이 맞는지 확인해 주세요.')
  }
  if (!res.ok) throw new Error(`어드민 읽기 API 호출에 실패했어요. (상태 코드 ${res.status})`)
  return res.json()
}

/** `GET {baseUrl}/api/admin/asset-generator/presets/{id}` — 응답 `{ preset }`을 정규화해 돌려준다. */
export async function fetchPresetFromAdminApi({ baseUrl, token, presetId, fetchImpl = fetch }) {
  const url = `${trimBaseUrl(baseUrl)}${PRESETS_PATH}/${encodeURIComponent(presetId)}`
  const body = await callReadApi({
    url,
    token,
    fetchImpl,
    notFoundMessage: `프리셋을 찾을 수 없어요: ${presetId}`,
  })
  if (!body || !body.preset) throw new Error('어드민 읽기 API 응답에 preset이 없어요.')
  return normalizePreset(body.preset)
}

/** `GET {baseUrl}/api/admin/asset-generator/presets?targetType=` — 응답 `{ presets }` 배열을 돌려준다. */
export async function fetchPresetListFromAdminApi({ baseUrl, token, targetType, fetchImpl = fetch }) {
  const query = targetType ? `?targetType=${encodeURIComponent(targetType)}` : ''
  const url = `${trimBaseUrl(baseUrl)}${PRESETS_PATH}${query}`
  const body = await callReadApi({
    url,
    token,
    fetchImpl,
    notFoundMessage: '프리셋 목록 API를 찾을 수 없어요. 어드민 주소가 맞는지 확인해 주세요.',
  })
  if (!body || !Array.isArray(body.presets)) throw new Error('어드민 읽기 API 응답에 presets 목록이 없어요.')
  return body.presets
}

/** `.env.local` 값과 `process.env`를 합친다. `process.env`가 우선이다. */
export function resolveEnv(fileEnv, processEnv) {
  return { ...fileEnv, ...processEnv }
}

/**
 * 프리셋 조회 경로를 고른다. API 변수(`ADMIN_API_BASE_URL`·`ADMIN_API_READ_TOKEN`)가 둘 다 있으면
 * `admin-api`, 아니면 서비스 롤 변수(`NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`)가 둘 다
 * 있을 때 `service-role`. 둘 다 불가하면 없는 변수명을 나열해 던진다.
 */
export function pickPresetSource(env) {
  const apiMissing = ['ADMIN_API_BASE_URL', 'ADMIN_API_READ_TOKEN'].filter((k) => !env[k])
  if (apiMissing.length === 0) {
    return { source: 'admin-api', baseUrl: env.ADMIN_API_BASE_URL, token: env.ADMIN_API_READ_TOKEN }
  }
  const roleMissing = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !env[k])
  if (roleMissing.length === 0) {
    return { source: 'service-role', supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY }
  }
  throw new Error(
    `프리셋을 조회할 환경변수가 없어요. 어드민 읽기 API 경로는 ${apiMissing.join('·')}, ` +
      `서비스 롤 경로는 ${roleMissing.join('·')}가 필요해요. 한쪽 경로의 변수를 .env.local이나 환경변수로 채워 주세요.`
  )
}
