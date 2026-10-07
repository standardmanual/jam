/**
 * JAM! 에셋 제너레이터 CLI — 인자 파싱 (티켓 20260924_2201, 레이어 번호 값 지정 20260927_0100)
 *
 * render.mjs의 CLI 인자(`--preset <id> --bg <hex> --end <hex> --out <절대경로.png> [--text01 <글자> …]
 * [--img01 <절대 경로 또는 URL> …] [--seed <정수>]`)를 순수 함수로 파싱한다. 필수 인자 누락·형식 오류는
 * 한국어 메시지의 Error를 던진다 — 호출부(render.mjs)가 이를 잡아 안내 문구를 찍고 종료 코드
 * 1로 끝낸다(PRD §8, 완료 조건).
 */
import path from 'node:path'

import { LEGACY_TEXT_FLAGS_MESSAGE, buildLayerValues, isLayerFlagKey } from './applyLayerValues.mjs'

const REQUIRED_FLAGS = ['preset', 'bg', 'end', 'out']
const VALUE_FLAGS = new Set([...REQUIRED_FLAGS, 'seed'])

/**
 * `--key value` 쌍으로 된 인자 배열을 `{ flags, layerEntries }`로 나눈다(순서 무관).
 * `layerEntries`는 `--text01`·`--img01` 같은 레이어 번호 인자의 `[번호, 값]` 목록이다(중복 검사를 위해 목록으로 둔다).
 * 옛 인자 `--text`·`--subtext`가 오면 새 인자 이름을 안내하는 오류를 던진다.
 */
function parseFlags(argv) {
  const flags = {}
  const layerEntries = []
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    if (key === 'text' || key === 'subtext') throw new Error(LEGACY_TEXT_FLAGS_MESSAGE)
    const value = argv[i + 1]
    const isLayer = isLayerFlagKey(key)
    if (!isLayer && !VALUE_FLAGS.has(key)) throw new Error(`알 수 없는 인자예요: --${key}`)
    // 값 자리에 다른 인자가 오면 삼키지 않고 멈춘다(`--text01 --text02 설명`). 빈 문자열 값도 거절한다(validatePlan과 같은 규칙).
    if (value === undefined || value === '' || value.startsWith('--')) throw new Error(`--${key} 값이 필요해요.`)
    if (isLayer) layerEntries.push([key, value])
    else flags[key] = value
    i++
  }
  return { flags, layerEntries }
}

/**
 * CLI 인자를 검증해 `{ preset, bg, end, values, out, seed }`를 돌려준다.
 * - `values`는 `{ text01: '글자', img01: '/절대/경로.png' }` 형태의 값 맵이다(레이어 번호 규칙은 `applyLayerValues.mjs`).
 *   텍스트 값의 리터럴 `\n`(백슬래시+n, 쉘에서 그대로 들어오는 두 글자)은 실제 개행 문자로 바꾼다 — 여러 줄 텍스트
 *   레이어(§4.3, content.split('\n'))에 그대로 넘기기 위함이다. 값을 하나도 주지 않으면 빈 객체다.
 *   번호가 프리셋에 있는지는 프리셋을 받은 뒤 `applyLayerValues`가 검사한다(§8).
 * - `seed`를 지정하지 않으면 undefined를 돌려준다(호출부가 마스터 시드를 새로 뽑는다).
 */
export function parseRenderArgs(argv) {
  const { flags, layerEntries } = parseFlags(argv)

  const missing = REQUIRED_FLAGS.filter((key) => flags[key] === undefined)
  if (missing.length > 0) {
    throw new Error(`다음 인자가 필요해요: ${missing.map((key) => `--${key}`).join(', ')}`)
  }

  if (!path.isAbsolute(flags.out)) {
    throw new Error('--out은 절대 경로여야 해요.')
  }

  let seed
  if (flags.seed !== undefined) {
    if (!/^-?\d+$/.test(flags.seed)) {
      throw new Error('--seed는 정수여야 해요.')
    }
    seed = Number(flags.seed)
  }

  return {
    preset: flags.preset,
    bg: flags.bg,
    end: flags.end,
    values: buildLayerValues(layerEntries),
    out: flags.out,
    seed,
  }
}
