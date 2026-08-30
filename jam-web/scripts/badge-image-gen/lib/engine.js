/**
 * 배지 이미지 렌더링 엔진 본체 (디자인 무관, 재사용 가능).
 *
 * 원래 generate.js(CLI 전용)에 있던 로직을 그대로 옮긴 것 — 동작은 바꾸지 않았다.
 * CLI(`generate.js`)와 어드민 API 라우트(`/api/admin/badge-image-batch`) 양쪽에서
 * 같은 코드를 쓰기 위해 분리했다(티켓 20260830_1252). 새 디자인을 추가할 때도 이 파일은
 * 건드리지 않는다 — configs/*.config.js만 추가하면 된다.
 */
const fs = require('fs')
const path = require('path')
const { createMeasurer } = require('./measure-text')

/**
 * ImageResponse(satori+resvg) 로더.
 * 프로젝트가 next 16으로 올라오면서 @vercel/og 직접 의존이 빠졌고, 동일 구현이 next/og로
 * 내장돼 있다. 예전 환경(@vercel/og 설치됨)에서도 그대로 돌아가도록 둘 다 시도한다.
 */
function loadImageResponse() {
  for (const mod of ['@vercel/og', 'next/og']) {
    try {
      return require(mod).ImageResponse
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') throw e
    }
  }
  throw new Error('ImageResponse를 찾을 수 없습니다 — next 또는 @vercel/og가 설치돼 있어야 합니다')
}
const ImageResponse = loadImageResponse()

// scripts/badge-image-gen/ 기준 경로 (이 파일은 그 아래 lib/에 있으므로 한 단계 위로)
const BADGE_GEN_ROOT = path.join(__dirname, '..')
const FONTS_DIR = path.join(BADGE_GEN_ROOT, 'fonts')
const BACKGROUNDS_DIR = path.join(BADGE_GEN_ROOT, 'backgrounds')
const PROJECT_ROOT = path.join(BADGE_GEN_ROOT, '..', '..')

async function loadFont(config) {
  const cachePath = path.join(FONTS_DIR, config.font.cacheFile)
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath)
  }
  console.log(`[font] 캐시 없음 — 다운로드: ${config.font.url}`)
  const res = await fetch(config.font.url)
  if (!res.ok) throw new Error(`폰트 다운로드 실패: ${res.status} ${config.font.url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(FONTS_DIR, { recursive: true })
  fs.writeFileSync(cachePath, buf)
  return buf
}

async function loadBackground(config) {
  const bg = config.background
  if (bg.type === 'color') return null

  if (bg.type === 'svg-file') {
    const p = path.isAbsolute(bg.path) ? bg.path : path.join(PROJECT_ROOT, bg.path)
    return sanitizeSvg(fs.readFileSync(p, 'utf-8'))
  }

  // svg-url: 디자인 이름 기준으로 캐시
  const cachePath = path.join(BACKGROUNDS_DIR, `${config.name}.svg`)
  if (fs.existsSync(cachePath)) {
    return sanitizeSvg(fs.readFileSync(cachePath, 'utf-8'))
  }
  console.log(`[background] 캐시 없음 — 다운로드: ${bg.url}`)
  const res = await fetch(bg.url)
  if (!res.ok) throw new Error(`배경 다운로드 실패: ${res.status} ${bg.url}`)
  const svgText = await res.text()
  fs.mkdirSync(BACKGROUNDS_DIR, { recursive: true })
  fs.writeFileSync(cachePath, svgText, 'utf-8')
  return sanitizeSvg(svgText)
}

/**
 * Figma가 내보내는 SVG는 색상을 `fill="#hex"` 속성과 `style="fill:#hex;fill:color(display-p3 ...);"`
 * 로 이중 선언한다. resvg(WASM)는 display-p3 color() 함수를 파싱하지 못해 해당 style 선언 전체가
 * 무시되지 않고 fill이 깨져(검은색/투명) 렌더링되는 문제가 있다 — style 속성을 통째로 제거해
 * 순수 fill/stroke 속성값(hex)만 남긴다. Figma 배경 SVG는 항상 이 패턴이라 범용으로 적용.
 */
function sanitizeSvg(svgText) {
  return svgText.replace(/\s+style="[^"]*"/g, '')
}

function fillTemplate(template, row) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(row[key] ?? ''))
}

/**
 * 텍스트 폭 측정 함수를 만든다.
 * - config.text.measure === 'font': 폰트의 실제 advance width로 정확히 계산.
 *   한글 폰트는 글자폭이 정사각형이 아니라서(Pretendard Bold 한글 = 0.8643em) 근사치를 쓰면
 *   디자인이 지정한 폰트 크기가 실제로는 들어가는데도 불필요하게 축소된다.
 * - 그 외(기본): 기존 근사치 — 모든 글자를 fontSize와 같은 정사각형으로 가정.
 */
function makeWidthOf(config, measurer) {
  if (config.text.measure === 'font') {
    if (!measurer) throw new Error("text.measure='font'인데 폰트 측정기를 만들지 못했습니다")
    return (text, fontSize) => measurer.widthEm(text) * fontSize
  }
  return (text, fontSize) => text.length * fontSize
}

/** 폭에 맞출 때 남겨둘 안전 여유. 실측 모드는 오차가 없어 1.0, 근사 모드는 기존값 유지 */
function fitSafetyOf(config) {
  return config.text.fitSafety ?? (config.text.measure === 'font' ? 1 : 0.98)
}

/** 중간 지점 근처의 공백/괄호/가운뎃점/하이픈 등 자연스러운 경계에서 2줄로 나눈다 */
function splitIntoTwoLines(text) {
  const mid = Math.ceil(text.length / 2)
  const breakChars = [' ', '(', ')', '·', '-']
  for (let offset = 0; offset < 3; offset++) {
    if (breakChars.includes(text[mid - offset])) return { line1: text.slice(0, mid - offset).trim(), line2: text.slice(mid - offset).trim() }
    if (breakChars.includes(text[mid + offset])) return { line1: text.slice(0, mid + offset).trim(), line2: text.slice(mid + offset).trim() }
  }
  return { line1: text.slice(0, mid), line2: text.slice(mid) }
}

/**
 * 텍스트 폭에 맞춰 폰트 크기를 정한다 (근사치 — CJK 정사각형 글자폭 가정).
 * - autoShrink: 폭을 넘치면 minFontSize까지 줄인다. 그래도 한 줄에 안 들어가는 이름
 *   (예: 27자짜리 극단적 이상치)은 자동으로 2줄 중앙정렬로 전환한다.
 * - autoGrow: 반대로 텍스트가 짧아 여백이 많이 남으면(예: 2~3자 산 이름) maxFontSize까지
 *   확대한다. autoShrink와 같은 "폭 대비 이상적 크기" 계산식을 공유하므로 둘 다 켜두면
 *   길이에 따라 자연스럽게 확대/축소가 이어진다.
 */
function resolveLabelLines(text, config, widthOf) {
  const { fontSize, width, autoShrink, autoGrow, minFontSize, maxFontSize } = config.text
  if (!autoShrink && !autoGrow) return { lines: [text], fontSize }

  const min = minFontSize ?? 16
  const max = autoGrow ? maxFontSize ?? fontSize : fontSize
  const HARD_FLOOR = 10
  const safety = fitSafetyOf(config)
  const fits = (t, size) => widthOf(t, size) <= width

  // 폭 대비 이상적인 폰트 크기 — 텍스트가 짧을수록 커지고(autoGrow 켠 경우 max까지),
  // 길수록 작아진다(autoShrink 켠 경우 min까지).
  const idealFor = (t) => {
    const unitWidth = widthOf(t, 1)
    return unitWidth > 0 ? Math.floor((width / unitWidth) * safety) : max
  }
  const singleLineFontSize = Math.max(min, Math.min(max, idealFor(text)))

  if (fits(text, singleLineFontSize)) return { lines: [text], fontSize: singleLineFontSize }
  if (!autoShrink) return { lines: [text], fontSize: singleLineFontSize }
  if (fits(text, min)) return { lines: [text], fontSize: min }

  // 한 줄로는 minFontSize에서도 안 들어감 → 2줄 중앙정렬
  const { line1, line2 } = splitIntoTwoLines(text)
  const longer = line1.length >= line2.length ? line1 : line2
  const twoLineFont = Math.max(HARD_FLOOR, Math.min(max, idealFor(longer)))
  return { lines: [line1, line2], fontSize: twoLineFont }
}

/**
 * config.canvas는 항상 Figma 원본 좌표계(디자인 그대로의 x/y/width/height/fontSize)를 쓴다.
 * 실제 서비스에 내려줄 최종 픽셀 크기는 config.outputSize(정사각형 한 변, px)로 별도 지정하고,
 * 여기서 scale = outputSize / canvas.width 를 구해 모든 레이아웃 값에 일괄 적용한다.
 * → 새 디자인을 추가할 때 Figma가 보여준 숫자를 그대로 옮겨 적기만 하면 되고, 축소 비율 계산은
 *   엔진이 담당한다.
 */
function resolveScale(config) {
  if (!config.outputSize) return 1
  return config.outputSize / config.canvas.width
}

async function renderBadge(row, config, fontData, backgroundSvg, widthOf) {
  const { canvas, text, background } = config
  const label = fillTemplate(text.template, row)
  const { lines, fontSize: resolvedFontSize } = resolveLabelLines(label, config, widthOf)
  const scale = resolveScale(config)

  const outWidth = Math.round(canvas.width * scale)
  const outHeight = Math.round(canvas.height * scale)

  const backgroundNode =
    background.type === 'color'
      ? { type: 'div', props: { style: { position: 'absolute', inset: 0, background: background.value } } }
      : {
          type: 'img',
          props: {
            src: `data:image/svg+xml;base64,${Buffer.from(backgroundSvg).toString('base64')}`,
            width: outWidth,
            height: outHeight,
            style: { position: 'absolute', inset: 0 },
          },
        }

  const element = {
    type: 'div',
    props: {
      style: { width: outWidth, height: outHeight, display: 'flex', position: 'relative' },
      children: [
        backgroundNode,
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              left: text.x * scale,
              top: text.y * scale,
              width: text.width * scale,
              height: text.height * scale,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems:
                text.align === 'left' ? 'flex-start' : text.align === 'right' ? 'flex-end' : 'center',
            },
            children: lines.map((line) => ({
              type: 'div',
              props: {
                style: {
                  fontSize: resolvedFontSize * scale,
                  fontWeight: text.fontWeight ?? 700,
                  color: text.color,
                  lineHeight: lines.length > 1 ? 1.15 : text.lineHeight ?? 1,
                  textAlign: text.align ?? 'center',
                  whiteSpace: 'nowrap',
                },
                children: line,
              },
            })),
          },
        },
      ],
    },
  }

  const imageResponse = new ImageResponse(element, {
    width: outWidth,
    height: outHeight,
    fonts: [{ name: config.font.name, data: fontData, weight: config.font.weight, style: 'normal' }],
  })

  const arrayBuffer = await imageResponse.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * config 하나를 받아 fontData/backgroundSvg/widthOf를 준비해 렌더 가능한 상태로 만든다.
 * CLI와 어드민 API 라우트가 공통으로 쓰는 "실행 전 준비" 단계.
 */
async function prepareRenderContext(config) {
  const fontData = await loadFont(config)
  const backgroundSvg = await loadBackground(config)
  const measurer = config.text.measure === 'font' ? createMeasurer(fontData) : null
  const widthOf = makeWidthOf(config, measurer)
  return { fontData, backgroundSvg, widthOf }
}

module.exports = {
  PROJECT_ROOT,
  loadFont,
  loadBackground,
  sanitizeSvg,
  fillTemplate,
  makeWidthOf,
  fitSafetyOf,
  splitIntoTwoLines,
  resolveLabelLines,
  resolveScale,
  renderBadge,
  prepareRenderContext,
}
