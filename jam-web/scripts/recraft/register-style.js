#!/usr/bin/env node
/**
 * Recraft 커스텀 스타일 등록 (세계관 1개당 1회)
 *
 * 레퍼런스_이미지/ 폴더의 이미지들로 POST /v1/styles 호출 → style_id 발급.
 * 결과를 해당 세계관 폴더의 recraft_style.json에 저장한다 (재사용 위해).
 *
 * 필요 환경변수 (.env.local): RECRAFT_API_KEY
 * 실행: node scripts/recraft/register-style.js "<세계관 폴더 절대경로>" <baseStyle> <model>
 *   예: node scripts/recraft/register-style.js \
 *     "/Users/.../02_스타일그룹/01 낭만 미식가" digital_illustration recraftv3
 */
const fs = require('fs')
const path = require('path')

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

async function main() {
  const [worldDir, baseStyle, model] = process.argv.slice(2)
  if (!worldDir || !baseStyle || !model) {
    console.error('사용법: node register-style.js <세계관 폴더 절대경로> <baseStyle> <model>')
    process.exit(1)
  }

  const env = loadEnv()
  const apiKey = env.RECRAFT_API_KEY
  if (!apiKey) {
    console.error('RECRAFT_API_KEY가 .env.local에 없습니다.')
    process.exit(1)
  }

  const refDir = path.join(worldDir, '레퍼런스_이미지')
  const files = fs
    .readdirSync(refDir)
    .filter((f) => MIME[path.extname(f).toLowerCase()])
    .sort()

  if (files.length === 0) {
    console.error(`레퍼런스 이미지가 없습니다: ${refDir}`)
    process.exit(1)
  }
  if (files.length > 5) {
    console.error(`레퍼런스 이미지는 최대 5장입니다 (현재 ${files.length}장): ${files.join(', ')}`)
    process.exit(1)
  }

  console.log(`레퍼런스 이미지 ${files.length}장:`)
  files.forEach((f) => console.log(`  - ${f}`))

  const form = new FormData()
  form.append('style', baseStyle)
  form.append('model', model)
  files.forEach((f, i) => {
    const buf = fs.readFileSync(path.join(refDir, f))
    const blob = new Blob([buf], { type: MIME[path.extname(f).toLowerCase()] })
    form.append(`file${i + 1}`, blob, f)
  })

  const res = await fetch('https://external.api.recraft.ai/v1/styles', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    console.error(`스타일 등록 실패: HTTP ${res.status}`)
    console.error(await res.text())
    process.exit(1)
  }

  const data = await res.json()
  console.log('스타일 등록 성공')
  console.log(`- style_id: ${data.id}`)
  console.log(`- 사용 크레딧: ${data.credits}`)

  const outPath = path.join(worldDir, 'recraft_style.json')
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        style_id: data.id,
        base_style: baseStyle,
        model,
        reference_images: files,
        registered_at: new Date().toISOString(),
        credits_used: data.credits,
      },
      null,
      2
    )
  )
  console.log(`저장됨: ${outPath}`)
}

main()
