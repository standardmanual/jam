/**
 * 홈피드 카드 원샷(`make-home-feed-card.mjs`) — 인자 파싱과 묶음 기본값 (티켓 20260926_1544)
 *
 * 인자(모두 `--키 값` 쌍):
 * - 필수: `--preset <프리셋 id>` `--bg <#rrggbb>` `--end <#rrggbb>` `--text <제목>` `--card <카드 JSON>` `--out-dir <묶음 폴더 절대경로>`
 * - 선택: `--subtext <설명>` `--meta <묶음 메타 JSON>` `--seed <정수>`
 * - `--card`·`--meta`는 값이 `{`로 시작하면 인라인 JSON, 아니면 JSON 파일의 절대 경로다.
 * - `--card`는 bundle.json의 `card` 객체(필드는 `HOME_FEED_REGISTRATION_BUNDLE.md` §3.3)다.
 * - `--meta`는 최상위 필드 중 카드·이미지가 아닌 것: `bundle_id`·`author`·`created_at`·`color_rationale_link`·`world_review`.
 *   `color_rationale_link`·`world_review`는 사람이 판단해 적어야 하는 값이라 기본값을 만들지 않는다(빠지면 검증이 실패로 알린다).
 *
 * 묶음 기본값: `bundle_id`는 폴더 이름, `author`는 `윤진`, `created_at`은 지금(KST), `seed`는 묶음 ID에서 정한 값이다
 * (같은 묶음 ID면 항상 같은 이미지가 나온다 — PRD §11).
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseHexColor } from './contrastMath.mjs'

export const MAKE_CARD_USAGE =
  '사용법: --preset <id> --bg <#rrggbb> --end <#rrggbb> --text <제목> [--subtext <설명>] --card <카드 JSON 또는 파일> --out-dir <묶음 폴더 절대경로> [--meta <메타 JSON 또는 파일>] [--seed <정수>]'

const VALUE_FLAGS = new Set(['preset', 'bg', 'end', 'text', 'subtext', 'card', 'meta', 'out-dir', 'seed'])
const REQUIRED_FLAGS = ['preset', 'bg', 'end', 'text', 'card', 'out-dir']
export const META_FIELDS = ['bundle_id', 'author', 'created_at', 'color_rationale_link', 'world_review']

export const DEFAULT_AUTHOR = '윤진'
export const IMAGE_FILE_NAME = 'image.png'
export const BUNDLE_FILE_NAME = 'bundle.json'

/** 묶음 ID에서 정한 시드(FNV-1a 32비트, 0 이상 정수). 같은 묶음 ID는 항상 같은 값이다. */
export function seedFromBundleId(bundleId) {
  let hash = 0x811c9dc5
  for (const byte of Buffer.from(bundleId, 'utf8')) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** 지금 시각을 `+09:00`이 붙은 KST ISO 8601 문자열로 바꾼다(초 단위). */
export function toKstIsoString(ms) {
  const kst = new Date(ms + 9 * 60 * 60 * 1000)
  return `${kst.toISOString().slice(0, 19)}+09:00`
}

/** `--card`·`--meta` 값을 객체로 읽는다. `{`로 시작하면 인라인 JSON, 아니면 절대 경로의 JSON 파일이다. */
function readJsonObject(flag, value) {
  let source = value
  if (!value.trimStart().startsWith('{')) {
    if (!path.isAbsolute(value)) throw new Error(`--${flag}는 JSON 객체(\`{\`로 시작)이거나 JSON 파일의 절대 경로여야 해요.`)
    if (!fs.existsSync(value) || !fs.statSync(value).isFile()) throw new Error(`--${flag} 파일을 찾을 수 없어요: ${value}`)
    source = fs.readFileSync(value, 'utf8')
  }
  let parsed
  try {
    parsed = JSON.parse(source)
  } catch (e) {
    throw new Error(`--${flag}가 올바른 JSON이 아니에요: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`--${flag}는 JSON 객체여야 해요.`)
  }
  return parsed
}

/**
 * CLI 인자를 검증해 `{ preset, bg, end, text, subtext, card, meta, outDir, seed }`를 돌려준다.
 * `seed`는 지정하지 않으면 undefined(묶음 ID에서 정한다). `text`·`subtext`의 리터럴 `\n`은 개행으로 바꾼다.
 * 잘못된 인자는 한국어 메시지의 Error를 던진다.
 */
export function parseMakeCardArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) throw new Error(`인자 형식이 올바르지 않아요: ${token}\n${MAKE_CARD_USAGE}`)
    const key = token.slice(2)
    if (!VALUE_FLAGS.has(key)) throw new Error(`알 수 없는 인자예요: --${key}\n${MAKE_CARD_USAGE}`)
    const next = argv[i + 1]
    if (next === undefined) throw new Error(`--${key} 값이 필요해요.`)
    flags[key] = next
    i++
  }

  const missing = REQUIRED_FLAGS.filter((key) => flags[key] === undefined)
  if (missing.length > 0) {
    throw new Error(`다음 인자가 필요해요: ${missing.map((key) => `--${key}`).join(', ')}\n${MAKE_CARD_USAGE}`)
  }

  parseHexColor(flags.bg)
  parseHexColor(flags.end)

  if (!path.isAbsolute(flags['out-dir'])) throw new Error('--out-dir은 절대 경로여야 해요.')

  let seed
  if (flags.seed !== undefined) {
    if (!/^-?\d+$/.test(flags.seed)) throw new Error('--seed는 정수여야 해요.')
    seed = Number(flags.seed)
  }

  const card = readJsonObject('card', flags.card)
  const meta = flags.meta === undefined ? {} : readJsonObject('meta', flags.meta)
  const unknownMeta = Object.keys(meta).filter((key) => !META_FIELDS.includes(key))
  if (unknownMeta.length > 0) {
    throw new Error(`--meta에 알 수 없는 필드가 있어요 — ${unknownMeta.join(', ')}. 지원 필드: ${META_FIELDS.join(', ')}`)
  }

  return {
    preset: flags.preset,
    bg: flags.bg,
    end: flags.end,
    text: flags.text.replace(/\\n/g, '\n'),
    subtext: flags.subtext === undefined ? undefined : flags.subtext.replace(/\\n/g, '\n'),
    card,
    meta,
    outDir: flags['out-dir'],
    seed,
  }
}
