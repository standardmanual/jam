#!/usr/bin/env node
/**
 * Recraft로 생성한 배지 이미지를 Supabase Storage에 업로드하고 badges.image_url에 반영
 *
 * <컬렉션 폴더>/recraft_badge_mapping.json을 읽어 아이템별로:
 * 1) 파일을 Storage 'images' 버킷의 badges/factions/{collectionId}/ 경로에 업로드
 * 2) public URL을 등급(common/rare/legend/mythic) 상관없이 4개 UUID 전부에 동일하게 UPDATE
 *
 * 실제 실행한 UPDATE문은 이후 seed SQL 파일로도 저장해 커밋한다 (레포 관례).
 *
 * 필요 환경변수 (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 실행: node scripts/recraft/register-badge-images.js "<컬렉션 폴더 절대경로>"
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env.local')
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=\"?([^\"]*)\"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

const BUCKET = 'images'

async function main() {
  const [collectionDir] = process.argv.slice(2)
  if (!collectionDir) {
    console.error('사용법: node register-badge-images.js <컬렉션 폴더 절대경로>')
    process.exit(1)
  }

  const env = loadEnv()
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const mappingPath = path.join(collectionDir, 'recraft_badge_mapping.json')
  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'))

  const sqlLines = [`-- ${mapping.collection_id} 배지 이미지 반영 (Recraft 생성 + 로고 합성, register-badge-images.js 실행 기록)`]

  for (const item of mapping.items) {
    const filePath = path.join(collectionDir, item.filename)
    const buf = fs.readFileSync(filePath)
    const storagePath = `badges/factions/${mapping.collection_id}/${item.slug}.png`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buf, { contentType: 'image/png', upsert: true })

    if (uploadError) {
      console.error(`업로드 실패: ${item.filename} — ${uploadError.message}`)
      continue
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

    const { error: updateError } = await supabase
      .from('badges')
      .update({ image_url: publicUrl })
      .in('id', item.ids)

    if (updateError) {
      console.error(`DB 반영 실패: ${item.name} — ${updateError.message}`)
      continue
    }

    console.log(`완료: ${item.name} → ${publicUrl} (${item.ids.length}개 등급 전부 반영)`)
    sqlLines.push(
      `UPDATE badges SET image_url = '${publicUrl}' WHERE id IN ('${item.ids.join("','")}'); -- ${item.name}`
    )
  }

  const sqlPath = path.join(collectionDir, `seed_${mapping.collection_id}_badge_images.sql`)
  fs.writeFileSync(sqlPath, sqlLines.join('\n') + '\n')
  console.log(`\nSQL 기록 저장: ${sqlPath}`)
}

main()
