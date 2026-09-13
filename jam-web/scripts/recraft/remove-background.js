#!/usr/bin/env node
/**
 * Recraft 배경 제거 (POST /v1/images/removeBackground)
 *
 * 지정한 이미지 파일들의 배경을 제거해 알파 채널이 있는 PNG로 원본을 덮어쓴다.
 * 사용자가 포토샵 등으로 수동 후처리하던 단계를 대체한다 — /jam-img 워크플로우 ⑦ 참조.
 *
 * 필요 환경변수 (.env.local): RECRAFT_API_KEY
 * 실행: node scripts/recraft/remove-background.js <이미지 경로> [<이미지 경로> ...]
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env.local')
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=\"?([^\"]*)\"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

async function removeOne(apiKey, imgPath) {
  const mime = MIME[path.extname(imgPath).toLowerCase()] ?? 'image/png'
  const buf = fs.readFileSync(imgPath)

  const form = new FormData()
  form.append('image', new Blob([buf], { type: mime }), path.basename(imgPath))
  form.append('response_format', 'b64_json')

  const res = await fetch('https://external.api.recraft.ai/v1/images/removeBackground', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  // Recraft의 다른 이미지 엔드포인트(generations 등)와 동일하게 data.data[0] 포맷을 우선
  // 시도하고, 응답 형태가 다르면 눈에 보이는 위치에 원본 응답을 남겨 바로 고칠 수 있게 한다.
  const first = data?.data?.[0] ?? data?.image ?? data
  const b64 = first?.b64_json
  if (!b64) {
    throw new Error(`응답에서 b64_json을 찾지 못했습니다. 원본 응답: ${JSON.stringify(data)}`)
  }

  const pngBuf = await sharp(Buffer.from(b64, 'base64')).png().toBuffer()
  fs.writeFileSync(imgPath, pngBuf)
  return first?.credits ?? data?.credits ?? 0
}

async function main() {
  const paths = process.argv.slice(2)
  if (paths.length === 0) {
    console.error('사용법: node remove-background.js <이미지 경로> [<이미지 경로> ...]')
    process.exit(1)
  }

  const env = loadEnv()
  const apiKey = env.RECRAFT_API_KEY
  if (!apiKey) {
    console.error('RECRAFT_API_KEY가 .env.local에 없습니다.')
    process.exit(1)
  }

  let totalCredits = 0
  for (const p of paths) {
    process.stdout.write(`배경 제거 중: ${p} ... `)
    try {
      const credits = await removeOne(apiKey, p)
      totalCredits += credits
      console.log(`완료 (credits: ${credits})`)
    } catch (e) {
      console.log('실패')
      console.error(`  ${e.message}`)
    }
  }

  console.log(`총 사용 크레딧: ${totalCredits}`)
}

main()
