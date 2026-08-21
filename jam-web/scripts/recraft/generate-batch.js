#!/usr/bin/env node
/**
 * Recraft 배치 이미지 생성
 *
 * <컬렉션 폴더>/recraft_batch_config.json을 읽어 아이템별로 POST /v1/images/generations
 * 호출 후, 같은 폴더에 PNG로 저장한다.
 *
 * config.json 형식:
 * {
 *   "style_id": "...", "model": "recraftv3", "size": "1024x1024",
 *   "negative_prompt": "...", "no_text": true,
 *   "items": [{ "filename": "01-01_01_common.png", "prompt": "..." }, ...]
 * }
 *
 * 필요 환경변수 (.env.local): RECRAFT_API_KEY
 * 실행: node scripts/recraft/generate-batch.js "<컬렉션 폴더 절대경로>"
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

async function main() {
  const [collectionDir] = process.argv.slice(2)
  if (!collectionDir) {
    console.error('사용법: node generate-batch.js <컬렉션 폴더 절대경로>')
    process.exit(1)
  }

  const env = loadEnv()
  const apiKey = env.RECRAFT_API_KEY
  if (!apiKey) {
    console.error('RECRAFT_API_KEY가 .env.local에 없습니다.')
    process.exit(1)
  }

  const configPath = path.join(collectionDir, 'recraft_batch_config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const { style_id, style, model, size, negative_prompt, no_text, items } = config

  let totalCredits = 0
  for (const item of items) {
    process.stdout.write(`생성 중: ${item.filename} ... `)
    const res = await fetch('https://external.api.recraft.ai/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: item.prompt,
        model,
        style_id,
        style,
        size,
        n: 1,
        negative_prompt,
        response_format: 'b64_json',
        controls: { no_text: !!no_text },
      }),
    })

    if (!res.ok) {
      console.log('실패')
      console.error(`  HTTP ${res.status}: ${await res.text()}`)
      continue
    }

    const data = await res.json()
    const b64 = data.data[0].b64_json
    // Recraft는 b64_json에 WebP를 담아 보내는 경우가 있어(포토샵 등에서 .png로 못 엶),
    // 항상 실제 PNG로 재인코딩해서 저장한다.
    const pngBuf = await sharp(Buffer.from(b64, 'base64')).png().toBuffer()
    fs.writeFileSync(path.join(collectionDir, item.filename), pngBuf)
    const credits = data.data[0].credits ?? 0
    totalCredits += credits
    console.log(`완료 (credits: ${credits})`)
  }

  console.log(`총 사용 크레딧: ${totalCredits}`)
}

main()
