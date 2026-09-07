#!/usr/bin/env npx tsx
/**
 * v4 액티비티 배지(소프트삭제 207종) Storage 이미지 정리 (티켓 20260906_1409 ④)
 *
 * v4·v5 액티비티 배지가 같은 폴더(`images/badges/activity/`)를 공유한다 — badges.id(uuid)가
 * 파일명이라 폴더째 지우면 v5 활성 배지(630종) 이미지까지 함께 사라진다. 그래서 이 스크립트는
 * **`badges` 테이블에서 `type='activity' AND deleted_at IS NOT NULL`인 행의 id로 파일명을
 * 계산해, 그 파일만** `images` 버킷에서 지운다.
 *
 * 안전장치: 삭제 직전, 계산한 파일명 중 하나라도 **활성(v5) 배지**의 `image_url`에 나타나면
 * 그 실행 전체를 중단한다(교차 참조 사고 방지).
 *
 * ## 실행
 * ```
 * cd jam-web
 * npx tsx scripts/cleanup-v4-activity-badge-images.ts            # 미리보기(기본) — 지우지 않는다
 * npx tsx scripts/cleanup-v4-activity-badge-images.ts --apply    # 실제 삭제
 * ```
 *
 * 필요 환경변수(`.env.local`): `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY`
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  const envPath = path.join(HERE, '..', '.env.local')
  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
loadEnvLocal()

const APPLY = process.argv.includes('--apply')
const BUCKET = 'images'
const PREFIX = 'badges/activity/'

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: deleted, error: delErr } = await supabase
    .from('badges')
    .select('id, name, image_url')
    .eq('type', 'activity')
    .not('deleted_at', 'is', null)
  if (delErr) throw delErr

  const { data: active, error: actErr } = await supabase
    .from('badges')
    .select('id, image_url')
    .eq('type', 'activity')
    .is('deleted_at', null)
  if (actErr) throw actErr

  const targetFiles = (deleted ?? [])
    .filter((b) => b.image_url && b.image_url.includes(`/${PREFIX}`))
    .map((b) => ({
      id: b.id,
      name: b.name,
      filename: PREFIX + b.image_url!.split(`/${PREFIX}`)[1].split('?')[0],
    }))

  // 안전장치 — 활성 배지가 같은 파일명을 참조하면 중단
  const activeFilenames = new Set(
    (active ?? [])
      .filter((b) => b.image_url && b.image_url.includes(`/${PREFIX}`))
      .map((b) => PREFIX + b.image_url!.split(`/${PREFIX}`)[1].split('?')[0])
  )
  const overlap = targetFiles.filter((f) => activeFilenames.has(f.filename))
  if (overlap.length > 0) {
    console.error(`중단 — 활성 배지가 참조 중인 파일이 삭제 대상에 섞여 있다: ${overlap.length}건`)
    for (const o of overlap) console.error(`  ${o.filename} (${o.name})`)
    process.exit(1)
  }

  console.log(`삭제 대상: ${targetFiles.length}개 파일 (v4 소프트삭제 액티비티 배지)`)
  console.log(`활성(v5) 배지와 겹침: 0건 (안전 확인됨)`)

  if (!APPLY) {
    console.log('\n미리보기 모드 — 아무것도 지우지 않았다. --apply로 실제 삭제.')
    console.log('샘플 5개:', targetFiles.slice(0, 5).map((f) => f.filename))
    return
  }

  // Storage API는 한 번에 최대 1000개 — 207개는 한 배치로 충분하다
  const paths = targetFiles.map((f) => f.filename)
  const { data: removed, error: rmErr } = await supabase.storage.from(BUCKET).remove(paths)
  if (rmErr) throw rmErr

  console.log(`삭제 완료: ${removed?.length ?? 0}개`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
