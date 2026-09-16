#!/usr/bin/env node
/**
 * 배지 이미지 모서리 라운드(radius 72px) + 배경 투명화 일괄 처리
 * (티켓 20260916_2251, radius는 12→24→48→72px 순으로 샘플링해 사용자가 72px로 확정)
 *
 * 대상: "JAM! 레벨 0" 컬렉션(shader-lab, 19개) + "아스팔트 레인저" 트라이브
 *       (factions/02-01~02-10, 90개), 총 109개 배지 이미지.
 *
 * 처리 로직: 이미지를 실제 크기(w×h)로 로드 → radius 72px 라운드 사각형 SVG 마스크를
 * 같은 크기로 생성 → composite(dest-in)로 마스크 바깥을 투명화 → PNG(알파 포함) 저장.
 * 이미 네 모서리가 투명 처리된 이미지는 멱등성 확보를 위해 건너뛴다.
 *
 * 사용법:
 *   --sample   샘플 2장(쉐이더랩 1 + factions 1)만 로컬 처리, Storage 업로드·DB 반영 없음.
 *              결과 PNG는 round-corners-sample-output/ 에 저장한다.
 *   --full     대상 109개 전량 처리: Storage 재업로드(upsert) + badges.image_url UPDATE +
 *              seed SQL 파일 저장. (샘플 승인 이후에만 실행할 것)
 *
 * 필요 환경변수 (.env.local, --full 모드에만 필요): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY
 *
 * 실행: node scripts/recraft/round-corners.js --sample
 *       node scripts/recraft/round-corners.js --full
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const RADIUS = 72
const BUCKET = 'images'
const SUPABASE_URL = 'https://ceehnkzdbecxwzxrhhns.supabase.co'

// --sample 모드용 고정 샘플 2장 (오케스트레이터가 실측 확인한 완전 불투명 정사각형 이미지)
const SAMPLE_TARGETS = [
  {
    label: 'shader-lab (JAM! 레벨 0)',
    url: `${SUPABASE_URL}/storage/v1/object/public/images/badges/shader-lab/9ca3c406-fc72-48ce-bfb7-b5eb9b5797b9.png`,
    outputName: 'shader-lab-9ca3c406-rounded.png',
  },
  {
    label: 'factions (아스팔트 레인저 02-01)',
    url: `${SUPABASE_URL}/storage/v1/object/public/images/badges/factions/02-01/item-02-01-1.png`,
    outputName: 'factions-02-01-item-1-rounded.png',
  },
]

const SAMPLE_OUTPUT_DIR = path.join(__dirname, 'round-corners-sample-output')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env.local')
  const env = {}
  if (!fs.existsSync(envPath)) return env
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=\"?([^\"]*)\"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

async function downloadBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status}): ${url}`)
  const arrayBuf = await res.arrayBuffer()
  return Buffer.from(arrayBuf)
}

/** 네 모서리 픽셀이 이미 투명(alpha=0)인지 검사 — 이미 처리된 이미지 판별용 */
async function isAlreadyProcessed(buf) {
  const img = sharp(buf)
  const { width, height, hasAlpha } = await img.metadata()
  if (!hasAlpha || !width || !height) return false

  const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  const channels = info.channels
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ]
  return corners.every(([x, y]) => {
    const idx = (y * width + x) * channels
    const alpha = data[idx + channels - 1]
    return alpha === 0
  })
}

/** radius 72px 라운드 사각형 마스크를 씌워 모서리 바깥을 투명화한 버퍼 반환 */
async function applyRoundCornerMask(buf) {
  const img = sharp(buf)
  const { width, height } = await img.metadata()
  if (!width || !height) throw new Error('이미지 크기를 읽을 수 없음')

  const maskSvg = Buffer.from(
    `<svg width="${width}" height="${height}"><rect x="0" y="0" width="${width}" height="${height}" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`
  )

  return img
    .ensureAlpha()
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

async function runSample() {
  fs.mkdirSync(SAMPLE_OUTPUT_DIR, { recursive: true })

  for (const target of SAMPLE_TARGETS) {
    console.log(`\n[샘플] ${target.label}`)
    console.log(`  원본: ${target.url}`)

    const buf = await downloadBuffer(target.url)

    if (await isAlreadyProcessed(buf)) {
      console.log('  이미 모서리가 투명 처리된 이미지 — 건너뜀 (멱등성)')
      continue
    }

    const processed = await applyRoundCornerMask(buf)
    const outPath = path.join(SAMPLE_OUTPUT_DIR, target.outputName)
    fs.writeFileSync(outPath, processed)
    console.log(`  처리 완료 → ${outPath}`)
  }

  console.log(`\n샘플 처리 완료. Storage 업로드·DB 반영 없음 (--sample 모드).`)
  console.log(`결과 확인: ${SAMPLE_OUTPUT_DIR}`)
}

async function runFull() {
  const env = loadEnv()
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY 등 .env.local 환경변수가 필요합니다 (--full 모드).')
    process.exit(1)
  }
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  // 대상 109개: "JAM! 레벨 0" 컬렉션 19개 + "아스팔트 레인저" 트라이브 산하 컬렉션(02-01~02-10) 90개
  const { data: levelZeroBook, error: bookError } = await supabase
    .from('item_books')
    .select('id')
    .eq('name', 'JAM! 레벨 0')
    .maybeSingle()
  if (bookError) throw bookError

  const { data: tribe, error: tribeError } = await supabase
    .from('tribes')
    .select('id')
    .eq('name', '아스팔트 레인저')
    .maybeSingle()
  if (tribeError) throw tribeError

  const orFilters = []
  if (levelZeroBook) orFilters.push(`item_book_id.eq.${levelZeroBook.id}`)
  if (tribe) orFilters.push(`tribe_id.eq.${tribe.id}`)
  if (orFilters.length === 0) {
    console.error('대상 컬렉션/트라이브를 찾지 못했습니다. 이름·매핑을 확인하세요.')
    process.exit(1)
  }

  const { data: badges, error: badgesError } = await supabase
    .from('badges')
    .select('id, name, image_url')
    .or(orFilters.join(','))
    .not('image_url', 'is', null)

  if (badgesError) throw badgesError
  console.log(`대상 배지 ${badges.length}개 조회됨`)

  const sqlLines = [
    `-- 배지 이미지 모서리 라운드(radius ${RADIUS}px) + 배경 투명화 일괄 처리 (티켓 20260916_2251)`,
  ]

  for (const badge of badges) {
    if (!badge.image_url) continue
    console.log(`\n처리 중: ${badge.name} (${badge.id})`)

    const buf = await downloadBuffer(badge.image_url.split('?')[0])

    if (await isAlreadyProcessed(buf)) {
      console.log('  이미 처리됨 — 건너뜀')
      continue
    }

    const processed = await applyRoundCornerMask(buf)

    // image_url 경로에서 버킷 내부 storage path 추출 (?v= 쿼리스트링 제거)
    const urlObj = new URL(badge.image_url)
    const storagePath = decodeURIComponent(
      urlObj.pathname.split(`/object/public/${BUCKET}/`)[1] || ''
    )
    if (!storagePath) {
      console.error(`  storage 경로 파싱 실패: ${badge.image_url}`)
      continue
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, processed, { contentType: 'image/png', upsert: true })
    if (uploadError) {
      console.error(`  업로드 실패: ${uploadError.message}`)
      continue
    }

    const { data: { publicUrl: rawPublicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
    const publicUrl = `${rawPublicUrl}?v=${Date.now()}`

    const { error: updateError } = await supabase
      .from('badges')
      .update({ image_url: publicUrl })
      .eq('id', badge.id)
    if (updateError) {
      console.error(`  DB 반영 실패: ${updateError.message}`)
      continue
    }

    console.log(`  완료 → ${publicUrl}`)
    sqlLines.push(`UPDATE badges SET image_url = '${publicUrl}' WHERE id = '${badge.id}'; -- ${badge.name}`)
  }

  const sqlPath = path.join(
    __dirname,
    '..',
    '..',
    'supabase',
    'seed_배지이미지라운드처리_20260916.sql'
  )
  fs.writeFileSync(sqlPath, sqlLines.join('\n') + '\n')
  console.log(`\nSQL 기록 저장: ${sqlPath}`)
}

async function main() {
  const mode = process.argv.includes('--full') ? 'full' : process.argv.includes('--sample') ? 'sample' : null
  if (!mode) {
    console.error('사용법: node round-corners.js --sample | --full')
    process.exit(1)
  }
  if (mode === 'sample') await runSample()
  else await runFull()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
