/**
 * JAM! 에셋 제너레이터 배지 등록 스크립트 — 인자 파싱 (티켓 20260924_2202)
 *
 * register-badge.mjs의 CLI 인자를 순수 함수로 파싱한다(`renderArgs.mjs`와 같은 방식). 잘못된
 * 인자는 한국어 메시지의 Error를 던지고, 호출부가 이를 잡아 안내 문구를 찍은 뒤 종료 코드 1로
 * 끝낸다.
 *
 * 두 모드 중 정확히 하나를 고른다.
 * - 등록: `--bundle <bundle.json 절대경로> [--dry-run] [--record-dir <폴더 절대경로>]`
 * - 되돌림: `--undo <registration-record.json 절대경로> [--dry-run]`
 */
import path from 'node:path'

export const REGISTER_USAGE =
  '사용법: --bundle <bundle.json 절대경로> [--dry-run] [--record-dir <폴더 절대경로>]  |  --undo <registration-record.json 절대경로> [--dry-run]'

const VALUE_FLAGS = new Set(['bundle', 'undo', 'record-dir'])
const BOOLEAN_FLAGS = new Set(['dry-run'])

/**
 * CLI 인자를 검증해 `{ mode, bundle, undo, recordDir, dryRun }`를 돌려준다.
 * - `mode`는 'register'(--bundle) 또는 'undo'(--undo)다.
 * - 경로 인자는 전부 절대 경로여야 한다(상대 경로는 실행 위치에 따라 다른 파일을 가리킨다).
 */
export function parseRegisterArgs(argv) {
  const values = {}
  let dryRun = false

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      throw new Error(`인자 형식이 올바르지 않아요: ${token}\n${REGISTER_USAGE}`)
    }
    const key = token.slice(2)
    if (BOOLEAN_FLAGS.has(key)) {
      dryRun = true
      continue
    }
    if (!VALUE_FLAGS.has(key)) {
      throw new Error(`알 수 없는 인자예요: --${key}\n${REGISTER_USAGE}`)
    }
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`--${key} 값이 필요해요.`)
    }
    values[key] = next
    i++
  }

  const hasBundle = values.bundle !== undefined
  const hasUndo = values.undo !== undefined
  if (!hasBundle && !hasUndo) {
    throw new Error(`--bundle 또는 --undo가 필요해요.\n${REGISTER_USAGE}`)
  }
  if (hasBundle && hasUndo) {
    throw new Error('--bundle과 --undo는 함께 쓸 수 없어요. 하나만 골라 주세요.')
  }
  if (hasUndo && values['record-dir'] !== undefined) {
    throw new Error('--record-dir은 --bundle과 함께만 쓸 수 있어요.')
  }

  for (const key of ['bundle', 'undo', 'record-dir']) {
    if (values[key] !== undefined && !path.isAbsolute(values[key])) {
      throw new Error(`--${key}는 절대 경로여야 해요.`)
    }
  }

  return {
    mode: hasBundle ? 'register' : 'undo',
    bundle: values.bundle,
    undo: values.undo,
    recordDir: values['record-dir'],
    dryRun,
  }
}
