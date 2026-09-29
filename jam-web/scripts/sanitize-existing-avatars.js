#!/usr/bin/env node
/**
 * avatars 버킷에 이미 올라간 파일의 EXIF(GPS 좌표 포함)를 정제하고, 교체 후 남은 이전 파일을 지운다 (1회성,
 * 티켓 20260929_1330).
 *
 * - `users.avatar_url`이 가리키는 파일: 정제본을 같은 경로에 덮어쓴다(URL 유지, DB 변경 없음)
 * - 아무도 가리키지 않는 파일: Storage API `remove()`로 삭제한다
 *
 * 정제 규칙은 `src/lib/avatarImage.ts`의 `sanitizeAvatarImage`와 같다(rotate → 같은 형식 재인코딩,
 * 메타데이터 유지 옵션 미사용).
 *
 * 기본은 드라이런이다. `--apply`가 있을 때만 쓰고 지운다. `--backup <폴더>`를 주면 적용 전 원본을 저장한다.
 * 좌표 값은 어디에도 출력하지 않는다(유무만 표시).
 *
 * 덮어쓴 파일은 CDN 캐시가 만료될 때까지(최대 1시간) 공개 URL에서 이전 바이트가 보일 수 있다.
 *
 *   node scripts/sanitize-existing-avatars.js
 *   node scripts/sanitize-existing-avatars.js --apply --backup /tmp/avatars-backup
 *
 * 환경 파일 경로는 `JAM_ENV_FILE`로 바꿀 수 있다(기본: jam-web/.env.local).
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { createClient } = require('@supabase/supabase-js')

const BUCKET = 'avatars'
const APPLY = process.argv.includes('--apply')
const backupIdx = process.argv.indexOf('--backup')
const BACKUP_DIR = backupIdx > -1 ? process.argv[backupIdx + 1] : null
const CONTENT_TYPE = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

function loadEnv() {
  const envPath = process.env.JAM_ENV_FILE || path.join(__dirname, '..', '.env.local')
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=\"?([^\"]*)\"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

async function sanitize(input) {
  const { format } = await sharp(input).metadata()
  if (!CONTENT_TYPE[format]) throw new Error(`허용하지 않는 이미지 형식: ${format}`)
  const image = sharp(input).rotate()
  const buffer =
    format === 'jpeg'
      ? await image.jpeg({ quality: 90 }).toBuffer()
      : format === 'png'
        ? await image.png().toBuffer()
        : await image.webp({ quality: 90 }).toBuffer()
  return { buffer, format }
}

async function describe(buffer) {
  const meta = await sharp(buffer).metadata()
  return { format: meta.format, hasExif: Boolean(meta.exif), hasXmp: Boolean(meta.xmp), orientation: meta.orientation }
}

async function listAllObjects(storage) {
  const { data: folders, error } = await storage.list('', { limit: 1000 })
  if (error) throw error
  const names = []
  for (const folder of folders) {
    if (folder.id) {
      names.push(folder.name) // 최상위 파일
      continue
    }
    const { data: files, error: e2 } = await storage.list(folder.name, { limit: 1000 })
    if (e2) throw e2
    for (const f of files) names.push(`${folder.name}/${f.name}`)
  }
  return names
}

async function main() {
  const env = loadEnv()
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const storage = supabase.storage.from(BUCKET)

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('avatar_url')
    .like('avatar_url', `%/storage/v1/object/public/${BUCKET}/%`)
  if (usersError) throw usersError
  const referenced = new Set(users.map((u) => decodeURIComponent(u.avatar_url.split(`/public/${BUCKET}/`)[1])))

  const names = await listAllObjects(storage)
  console.log(`${APPLY ? '[적용]' : '[드라이런]'} ${BUCKET} 객체 ${names.length}개, 참조 중 ${referenced.size}개`)
  if (BACKUP_DIR) fs.mkdirSync(BACKUP_DIR, { recursive: true })

  let failures = 0
  for (const [i, name] of names.entries()) {
    const label = `#${i + 1} ${name.slice(0, 8)}…/${name.split('/').pop()}`
    const { data: blob, error } = await storage.download(name)
    if (error) {
      console.log(`${label} 다운로드 실패: ${error.message}`)
      failures++
      continue
    }
    const original = Buffer.from(await blob.arrayBuffer())
    const before = await describe(original)
    const isReferenced = referenced.has(name)
    const action = isReferenced ? '정제 후 덮어쓰기' : '삭제'
    console.log(`${label} 참조=${isReferenced ? '예' : '아니오'} 형식=${before.format} EXIF=${before.hasExif ? '있음' : '없음'} → ${action}`)
    if (!APPLY) continue

    if (BACKUP_DIR) fs.writeFileSync(path.join(BACKUP_DIR, name.replace(/\//g, '__')), original)

    if (isReferenced) {
      const { buffer, format } = await sanitize(original)
      const { error: upErr } = await storage.upload(name, buffer, {
        contentType: CONTENT_TYPE[format],
        upsert: true,
        cacheControl: '3600',
      })
      if (upErr) {
        console.log(`  덮어쓰기 실패: ${upErr.message}`)
        failures++
        continue
      }
      // 다시 내려받아 확인하지 않는다 — download()도 CDN 캐시(max-age=3600)를 거쳐 덮어쓰기 전 바이트가
      // 돌아온다(2026-09-29 실측, cf-cache-status: HIT). 올린 바이트를 검사하고 저장소 크기와 대조한다.
      const after = await describe(buffer)
      const dir = name.split('/').slice(0, -1).join('/')
      const { data: listed } = await storage.list(dir, { search: name.split('/').pop() })
      const storedSize = listed?.[0]?.metadata?.size
      console.log(`  확인: EXIF=${after.hasExif ? '있음' : '없음'} XMP=${after.hasXmp ? '있음' : '없음'} 방향태그=${after.orientation ?? '없음'} 저장크기일치=${storedSize === buffer.length ? '예' : '아니오'}`)
      if (after.hasExif || after.hasXmp || storedSize !== buffer.length) failures++
    } else {
      const { error: rmErr } = await storage.remove([name])
      if (rmErr) {
        console.log(`  삭제 실패: ${rmErr.message}`)
        failures++
        continue
      }
      console.log('  삭제 완료')
    }
  }

  if (APPLY) {
    const remaining = await listAllObjects(storage)
    const orphans = remaining.filter((n) => !referenced.has(n))
    console.log(`적용 후 객체 ${remaining.length}개, 참조되지 않는 객체 ${orphans.length}개, 실패 ${failures}건`)
  }
  if (failures) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
