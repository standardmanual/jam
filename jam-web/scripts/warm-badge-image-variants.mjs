#!/usr/bin/env node
/**
 * 이미 올라가 있는 배지 그림의 변환본을 한 번에 예열한다 (티켓 20261115_1620).
 *
 * 입력: 원본 주소 목록이 든 JSON 파일(`["https://…", …]`). DB 접속 정보를 쓰지 않는다.
 * 실행: node scripts/warm-badge-image-variants.mjs <목록.json> --origin https://stage.j-a-m.app [--dry-run] [--concurrency 6]
 *
 * 폭 목록·주소 형식은 src/lib/images/warmImageVariants.ts의 WARM_IMAGE_WIDTHS와
 * src/lib/imageSrc.ts의 optimizedImageUrl(`/_next/image?url=<encodeURIComponent(원본)>&w=<폭>&q=75`)과 같아야 한다.
 * .mjs 스크립트는 TS 모듈을 가져올 수 없어 여기에 다시 적는다.
 */
import fs from 'node:fs'

const WIDTHS = [96, 256, 384, 640]
const TIMEOUT_MS = 8000
// src/lib/imageSrc.ts IMAGE_REMOTE_PATTERNS 중 배지 그림이 올라가는 Supabase 공개 저장소만 대상으로 한다.
const STORAGE_HOST = 'ceehnkzdbecxwzxrhhns.supabase.co'
const STORAGE_PATH_PREFIX = '/storage/v1/object/public/'

function parseArgs(argv) {
  const out = { file: null, origin: null, dryRun: false, concurrency: 6 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--origin') out.origin = argv[++i]
    else if (a === '--concurrency') out.concurrency = Number(argv[++i])
    else if (!a.startsWith('--') && !out.file) out.file = a
  }
  return out
}

/** 'direct'(정적 파일 배지) | 'skip'(변환 대상 아님) | 'ok' */
function classify(src) {
  const value = typeof src === 'string' ? src.trim() : ''
  if (!value) return 'skip'
  if (value.startsWith('/badges/')) return 'direct'
  if (value.startsWith('//')) return 'skip'
  if (value.startsWith('/')) return 'ok'
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && u.hostname === STORAGE_HOST && u.pathname.startsWith(STORAGE_PATH_PREFIX)
      ? 'ok'
      : 'skip'
  } catch {
    return 'skip'
  }
}

async function main() {
  const { file, origin, dryRun, concurrency } = parseArgs(process.argv.slice(2))
  if (!file || !origin || !Number.isInteger(concurrency) || concurrency < 1) {
    console.error('사용법: node scripts/warm-badge-image-variants.mjs <목록.json> --origin <출처> [--dry-run] [--concurrency 6]')
    process.exit(1)
  }
  const list = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(list)) {
    console.error('목록 파일은 주소 배열이어야 합니다.')
    process.exit(1)
  }

  const targets = []
  let directCount = 0
  let skipCount = 0
  for (const src of new Set(list)) {
    const kind = classify(src)
    if (kind === 'direct') directCount++
    else if (kind === 'skip') skipCount++
    else targets.push(src.trim())
  }
  const jobs = targets.flatMap((src) => WIDTHS.map((w) => ({ src, w })))

  console.log(`대상 그림 ${targets.length}장, 정적 파일 배지 ${directCount}장 건너뜀, 변환 대상 아님 ${skipCount}장 건너뜀`)
  console.log(`폭별 요청 수: ${WIDTHS.map((w) => `${w}=${targets.length}`).join(', ')} (합계 ${jobs.length})`)
  if (dryRun) {
    console.log('--dry-run: 요청하지 않았습니다.')
    return
  }

  const cacheCounts = {}
  const failures = []
  let next = 0
  async function worker() {
    while (next < jobs.length) {
      const { src, w } = jobs[next++]
      try {
        const res = await fetch(`${origin}/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`, {
          headers: { Accept: 'image/webp' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        await res.arrayBuffer().catch(() => undefined)
        const cache = res.headers.get('x-vercel-cache') ?? '없음'
        cacheCounts[cache] = (cacheCounts[cache] ?? 0) + 1
        if (!res.ok) failures.push(`${res.status} w=${w} ${src}`)
      } catch (e) {
        failures.push(`실패(${e.message}) w=${w} ${src}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))

  console.log(`x-vercel-cache 분포: ${JSON.stringify(cacheCounts)}`)
  console.log(`실패 ${failures.length}건`)
  for (const f of failures) console.log(`  ${f}`)
}

main()
