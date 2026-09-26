/**
 * JAM! 에셋 제너레이터 CLI — 레이어 번호로 값 지정 (티켓 20260927_0100, PRD §8)
 *
 * 프리셋의 텍스트·이미지 레이어를 어드민 화면의 번호(`text01`, `img01`, …, `layerKeys.ts`)로 지정해 값을 넣는다.
 * 값 맵 `{ text01: '글자', img01: '/절대/경로.png' }`를 받아 프리셋 레이어에 적용한 새 배열을 돌려준다(원본은 바꾸지 않는다).
 * - 텍스트 레이어: `content`를 교체한다.
 * - 이미지 레이어: `assetUrl`을 교체한다. 위치·크기·회전·불투명도·컬러 오버레이는 프리셋 값 그대로다.
 *   이 모듈은 값 형식(절대 경로 또는 http(s) URL)만 본다 — 파일을 읽는 일은 `loadLayerImage.mjs`가 한다.
 * - 지정하지 않은 번호는 프리셋에 저장된 값을 그대로 쓴다. 반환의 `applied`(값을 지정한 번호)와 `saved`(저장된 값을
 *   쓴 번호)를 실행 결과에 보여 줘 빠뜨린 값이 눈에 띄게 한다.
 * 잘못된 번호·프리셋에 없는 번호는 한국어 메시지의 Error를 던진다. 파일 I/O는 없다.
 */
import path from 'node:path'

import { formatLayerKey, getLayerKeys, parseLayerKey } from '../../src/lib/asset-generator/layerKeys'

const INVALID_KEY_MESSAGE = '번호 형식이 올바르지 않아요(예: text01)'

/** 정규 형태(`text01`, `text12`, `img01`)만 통과시킨다. `text1`·`text001`·`Text01`·`img00`은 오류다. */
export function assertCanonicalLayerKey(key) {
  const parsed = parseLayerKey(key)
  if (!parsed || formatLayerKey(parsed.type, parsed.n) !== key) {
    throw new Error(`${INVALID_KEY_MESSAGE}: ${key}`)
  }
  return parsed
}

/** 옛 인자(`--text`·`--subtext`)를 받았을 때 안내하는 문구. 별칭으로 남기지 않는다. */
export const LEGACY_TEXT_FLAGS_MESSAGE = '--text·--subtext는 없어졌어요. 레이어 번호로 지정해 주세요: --text01, --text02 …'

/** CLI 인자 이름이 레이어 번호 값 인자(`--text…숫자`, `--img…숫자`)로 보이는지 본다. 대소문자·자릿수가 틀려도 잡아 형식 오류로 알린다. */
export function isLayerFlagKey(key) {
  return /^(text|img)\d+$/i.test(key)
}

/** 텍스트 값의 리터럴 `\n`(백슬래시+n, 쉘에서 그대로 들어오는 두 글자)을 실제 개행 문자로 바꾼다. */
export function unescapeTextValue(value) {
  return value.replace(/\\n/g, '\n')
}

/**
 * `[번호, 값]` 목록을 값 맵으로 만든다. 번호 형식이 틀렸거나 같은 번호가 두 번 나오면 오류다.
 * 텍스트 번호의 값은 리터럴 `\n`을 개행으로 바꾼다.
 */
export function buildLayerValues(entries) {
  const values = {}
  for (const [key, value] of entries) {
    const { type } = assertCanonicalLayerKey(key)
    if (Object.hasOwn(values, key)) throw new Error(`같은 번호를 두 번 지정했어요: ${key}`)
    values[key] = type === 'text' ? unescapeTextValue(value) : value
  }
  return values
}

/** 이미지 값이 절대 경로 또는 http(s) URL인지 본다. */
export function isImageSourceFormat(value) {
  return path.isAbsolute(value) || /^https?:\/\/\S+$/i.test(value)
}

/**
 * 프리셋 `layers`에 값 맵을 적용한다.
 * 반환: `{ layers, applied, saved }` — `applied`는 값을 지정한 번호, `saved`는 프리셋에 저장된 값을 쓴 번호(둘 다 목록 순서).
 */
export function applyLayerValues(layers, values) {
  const entries = getLayerKeys(layers)
  const keyByIndex = entries.map((entry) => entry.key)

  const requested = Object.keys(values)
  for (const key of requested) assertCanonicalLayerKey(key)

  const missing = requested.filter((key) => !keyByIndex.includes(key))
  if (missing.length > 0) {
    const available = [...keyByIndex].sort().join(', ')
    throw new Error(`이 프리셋에 없는 번호예요: ${missing.join(', ')}. 있는 번호: ${available === '' ? '(없음)' : available}`)
  }

  for (const key of requested) {
    const value = values[key]
    const { type } = parseLayerKey(key)
    if (typeof value !== 'string') throw new Error(`${key}의 값은 문자열이어야 해요.`)
    if (type === 'image' && !isImageSourceFormat(value)) {
      throw new Error(`${key}의 값은 이미지 파일의 절대 경로 또는 http(s) URL이어야 해요(받은 값: ${value}).`)
    }
  }

  const applied = []
  const saved = []
  const nextLayers = layers.map((layer, index) => {
    const key = keyByIndex[index]
    if (!Object.hasOwn(values, key)) {
      saved.push(key)
      return layer
    }
    applied.push(key)
    return layer.type === 'text' ? { ...layer, content: values[key] } : { ...layer, assetUrl: values[key] }
  })

  return { layers: nextLayers, applied, saved }
}
