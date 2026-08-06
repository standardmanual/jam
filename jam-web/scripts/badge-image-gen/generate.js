#!/usr/bin/env node
/**
 * 배지 이미지 자동 생성 엔진 (범용, 재사용 가능)
 *
 * 사용법:
 *   node scripts/badge-image-gen/generate.js <config-name> [--limit N] [--dry-run]
 *
 * 예:
 *   node scripts/badge-image-gen/generate.js subway-poi-badge --limit 5 --dry-run
 *   node scripts/badge-image-gen/generate.js subway-poi-badge
 *
 * 새 디자인을 추가할 때는 configs/ 아래 새 *.config.js 하나만 작성하면 되고,
 * 이 엔진 파일은 수정하지 않는다. 자세한 설명은 README.md 참고.
 *
 * 필요 환경변수 (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const { ImageResponse } = require('@vercel/og')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env.local')
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)="?([^"]*)"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

const FONTS_DIR = path.join(__dirname, 'fonts')
const BACKGROUNDS_DIR = path.join(__dirname, 'backgrounds')
const PROJECT_ROOT = path.join(__dirname, '..', '..')

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

function fitsOneLine(text, fontSize, width) {
  return text.length * fontSize <= width
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
 * 텍스트가 지정 폭을 넘으면 autoShrink 옵션에 따라 폰트 크기를 줄인다 (근사치 — CJK 정사각형 글자폭 가정).
 * minFontSize까지 줄여도 한 줄에 안 들어가는 이름(예: 27자짜리 극단적 이상치)은 자동으로
 * 2줄 중앙정렬로 전환한다.
 */
function resolveLabelLines(text, config) {
  const { fontSize, width, autoShrink, minFontSize } = config.text
  if (!autoShrink) return { lines: [text], fontSize }

  const min = minFontSize ?? 16
  const HARD_FLOOR = 10

  if (fitsOneLine(text, fontSize, width)) return { lines: [text], fontSize }

  const shrunk = Math.max(min, Math.floor((width / text.length) * 0.98))
  if (fitsOneLine(text, shrunk, width)) return { lines: [text], fontSize: Math.min(fontSize, shrunk) }
  if (fitsOneLine(text, min, width)) return { lines: [text], fontSize: min }

  // 한 줄로는 minFontSize에서도 안 들어감 → 2줄 중앙정렬
  const { line1, line2 } = splitIntoTwoLines(text)
  const longerLen = Math.max(line1.length, line2.length)
  const twoLineFont = Math.max(HARD_FLOOR, Math.min(fontSize, Math.floor((width / longerLen) * 0.98)))
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

async function renderBadge(row, config, fontData, backgroundSvg) {
  const { canvas, text, background } = config
  const label = fillTemplate(text.template, row)
  const { lines, fontSize: resolvedFontSize } = resolveLabelLines(label, config)
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

async function main() {
  const [, , configName, ...rest] = process.argv
  if (!configName) {
    console.error('사용법: node scripts/badge-image-gen/generate.js <config-name> [--limit N] [--ids id1,id2] [--dry-run]')
    process.exit(1)
  }
  const dryRun = rest.includes('--dry-run')
  const limitIdx = rest.indexOf('--limit')
  const limit = limitIdx >= 0 ? parseInt(rest[limitIdx + 1], 10) : undefined
  const idsIdx = rest.indexOf('--ids')
  const idsFilter = idsIdx >= 0 ? new Set(rest[idsIdx + 1].split(',')) : undefined

  const config = require(path.join(__dirname, 'configs', `${configName}.config.js`))
  console.log(`[config] ${config.name} 로드 완료`)

  const env = loadEnv()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다 (.env.local)')
  }
  const supabase = createClient(supabaseUrl, serviceKey)

  const rows = await config.dataSource(supabase)
  let targetRows = idsFilter ? rows.filter((r) => idsFilter.has(r.id)) : rows
  targetRows = limit ? targetRows.slice(0, limit) : targetRows
  console.log(`[data] 대상 row: ${targetRows.length}개${limit ? ` (--limit ${limit})` : ''}`)

  const fontData = await loadFont(config)
  const backgroundSvg = await loadBackground(config)

  const outputDir = path.join(PROJECT_ROOT, 'public', config.outputDir)
  fs.mkdirSync(outputDir, { recursive: true })

  let ok = 0
  let fail = 0
  for (const row of targetRows) {
    try {
      const png = await renderBadge(row, config, fontData, backgroundSvg)
      const outPath = path.join(outputDir, `${row.id}.png`)
      if (!dryRun) {
        fs.writeFileSync(outPath, png)
      }
      ok++
      if (ok % 50 === 0) console.log(`[progress] ${ok}/${targetRows.length}`)
    } catch (e) {
      fail++
      console.error(`[fail] id=${row.id} name=${row.name}:`, e.message)
    }
  }

  console.log(`[done] 성공 ${ok}개, 실패 ${fail}개${dryRun ? ' (dry-run — 파일 미저장)' : ''}`)

  if (!dryRun && ok > 0) {
    const updateSql = config.updateSqlTemplate.replace(/\{\{imagePathPrefix\}\}/g, `/${config.outputDir}`)
    const sqlPath = path.join(PROJECT_ROOT, 'supabase', 'seed', `update_${config.name}_images.sql`)
    fs.mkdirSync(path.dirname(sqlPath), { recursive: true })
    fs.writeFileSync(sqlPath, updateSql + '\n', 'utf-8')
    console.log(`\n[다음 단계] image_url 반영 SQL을 저장했습니다: ${sqlPath}`)
    console.log(`이 SQL을 Supabase에 직접 실행하세요.`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
