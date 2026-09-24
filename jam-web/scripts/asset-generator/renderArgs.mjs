/**
 * JAM! 에셋 제너레이터 CLI — 인자 파싱 (티켓 20260924_2201)
 *
 * render.mjs의 CLI 인자(`--preset <id> --bg <hex> --end <hex> --text <문자열>
 * --out <절대경로.png> [--seed <정수>]`)를 순수 함수로 파싱한다. 필수 인자 누락·형식 오류는
 * 한국어 메시지의 Error를 던진다 — 호출부(render.mjs)가 이를 잡아 안내 문구를 찍고 종료 코드
 * 1로 끝낸다(PRD §8, 완료 조건).
 */
import path from 'node:path'

const REQUIRED_FLAGS = ['preset', 'bg', 'end', 'text', 'out']

/** `--key value` 쌍으로 된 인자 배열을 { key: value } 객체로 바꾼다(순서 무관). */
function parseFlags(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    flags[key] = argv[i + 1]
    i++
  }
  return flags
}

/**
 * CLI 인자를 검증해 `{ preset, bg, end, text, out, seed }`를 돌려준다.
 * - `text`는 리터럴 `\n`(백슬래시+n, 쉘에서 그대로 들어오는 두 글자)을 실제 개행 문자로
 *   바꾼다 — 여러 줄 텍스트 레이어(§4.3, content.split('\n'))에 그대로 넘기기 위함이다.
 * - `seed`를 지정하지 않으면 undefined를 돌려준다(호출부가 마스터 시드를 새로 뽑는다).
 */
export function parseRenderArgs(argv) {
  const flags = parseFlags(argv)

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
    text: flags.text.replace(/\\n/g, '\n'),
    out: flags.out,
    seed,
  }
}
