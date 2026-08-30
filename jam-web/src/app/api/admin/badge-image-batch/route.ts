import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { BADGE_IMAGE_DESIGNS, isKnownBadgeImageDesign } from '@/lib/admin/badgeImageDesigns'

// 렌더링(next/og·resvg)이 대량 배치에서는 수 초씩 걸릴 수 있어 다른 admin 라우트(strava sync 등)와
// 동일하게 상한을 늘려둔다 (기본 상한은 플랫폼 설정에 따름).
export const maxDuration = 60

/**
 * 체크인 배지 이미지 배치 생성 API (티켓 20260830_1252).
 *
 * `scripts/badge-image-gen/`의 엔진(lib/engine.js)·config(configs/*.config.js)를 CLI와
 * 동일하게 그대로 재사용한다. Vercel 프로덕션 서버리스 함수는 배포 번들이 읽기 전용이라
 * `public/`에 새 파일을 쓰는 것이 실패할 수 있다 — 이 경우 이미지를 base64로 응답에 담아
 * 관리자가 직접 저장하도록 폴백한다(아래 writeGeneratedFiles 참고).
 *
 * process.cwd()를 기준으로 실제 파일을 동적 require한다(웹팩 정적 번들링을 우회) — CLI가
 * 쓰는 __dirname 상대경로 로직(scripts/badge-image-gen/lib/engine.js)이 그대로 동작하려면
 * 이 파일들이 실제 파일시스템에 원래 상대 경로 그대로 존재해야 한다. next.config.ts의
 * outputFileTracingIncludes가 배포 번들에 이 경로들을 포함시킨다.
 */
const nodeRequire = createRequire(path.join(process.cwd(), 'package.json'))
const BADGE_GEN_DIR = path.join(process.cwd(), 'scripts', 'badge-image-gen')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BadgeImageEngine = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BadgeImageConfig = any

function loadEngine(): BadgeImageEngine {
  return nodeRequire(path.join(BADGE_GEN_DIR, 'lib', 'engine.js'))
}

function loadConfig(configId: string): BadgeImageConfig {
  return nodeRequire(path.join(BADGE_GEN_DIR, 'configs', `${configId}.config.js`))
}

interface BadgeImageRow {
  id: string
  name: string
}

const PREVIEW_SAMPLE_LIMIT = 50
// 실행 시 public/에 쓰기가 막힌 환경(프로덕션 Vercel)에서 base64 폴백으로 응답에 담을 수
// 있는 최대 개수 — 응답 페이로드가 과도하게 커지는 것을 막는다. 향후 신규 배지 배치는
// 보통 수십 개 단위라 이 한도로 충분하다(대량 재생성은 기존처럼 로컬에서 CLI로 실행).
const FALLBACK_IMAGE_LIMIT = 150

async function resolveTargetRows(
  config: BadgeImageConfig,
  limit: number | undefined
): Promise<BadgeImageRow[]> {
  const supabase = createServiceClient()
  const rows: BadgeImageRow[] = await config.dataSource(supabase)
  return limit ? rows.slice(0, limit) : rows
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const design = body?.design as string | undefined
  const mode = body?.mode as 'preview' | 'execute' | undefined
  const limit = typeof body?.limit === 'number' && body.limit > 0 ? Math.floor(body.limit) : undefined

  if (!design || !isKnownBadgeImageDesign(design)) {
    return NextResponse.json({ error: '알 수 없는 디자인입니다.' }, { status: 400 })
  }
  if (mode !== 'preview' && mode !== 'execute') {
    return NextResponse.json({ error: 'mode는 preview 또는 execute여야 합니다.' }, { status: 400 })
  }

  let config: BadgeImageConfig
  try {
    config = loadConfig(design)
  } catch (e) {
    return NextResponse.json(
      { error: `config 로드 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }

  if (mode === 'preview') {
    const rows = await resolveTargetRows(config, limit)
    return NextResponse.json({
      design,
      total: rows.length,
      sample: rows.slice(0, PREVIEW_SAMPLE_LIMIT),
      sampleTruncated: rows.length > PREVIEW_SAMPLE_LIMIT,
    })
  }

  // mode === 'execute'
  let engine: BadgeImageEngine
  try {
    engine = loadEngine()
  } catch (e) {
    return NextResponse.json(
      { error: `렌더링 엔진 로드 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }

  const targetRows = await resolveTargetRows(config, limit)
  if (targetRows.length === 0) {
    return NextResponse.json({ error: '대상 배지가 없습니다.' }, { status: 400 })
  }

  const { fontData, backgroundSvg, widthOf } = await engine.prepareRenderContext(config)

  const results: { id: string; name: string; png: Buffer }[] = []
  const errors: { id: string; name: string; message: string }[] = []

  for (const row of targetRows) {
    try {
      const png: Buffer = await engine.renderBadge(row, config, fontData, backgroundSvg, widthOf)
      results.push({ id: row.id, name: row.name, png })
    } catch (e) {
      errors.push({ id: row.id, name: row.name, message: e instanceof Error ? e.message : String(e) })
    }
  }

  // public/{outputDir}에 쓰기 시도 — 로컬 개발 환경(파일시스템 쓰기 가능)에서는 CLI와 동일하게
  // 실제 파일로 저장된다. 프로덕션 Vercel 서버리스는 배포 번들이 읽기 전용이라 여기서 실패할
  // 수 있고, 그 경우 catch로 넘어가 base64 폴백을 응답에 담는다.
  const outputDir = path.join(engine.PROJECT_ROOT, 'public', config.outputDir)
  let filesWritten = false
  try {
    fs.mkdirSync(outputDir, { recursive: true })
    for (const r of results) {
      fs.writeFileSync(path.join(outputDir, `${r.id}.png`), r.png)
    }
    filesWritten = true
  } catch {
    filesWritten = false
  }

  const sql =
    results.length > 0
      ? (config.updateSqlTemplate as string).replace(/\{\{imagePathPrefix\}\}/g, `/${config.outputDir}`) + '\n'
      : ''

  let sqlPath: string | null = null
  if (sql) {
    try {
      const p = path.join(engine.PROJECT_ROOT, 'supabase', 'seed', `update_${config.name}_images.sql`)
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, sql, 'utf-8')
      sqlPath = p
    } catch {
      sqlPath = null
    }
  }

  const fallbackImages = filesWritten
    ? []
    : results.slice(0, FALLBACK_IMAGE_LIMIT).map((r) => ({
        id: r.id,
        filename: `${r.id}.png`,
        base64: r.png.toString('base64'),
      }))

  return NextResponse.json({
    design,
    ok: results.length,
    fail: errors.length,
    errors,
    filesWritten,
    outputDir: config.outputDir,
    sqlPath,
    sql,
    fallbackImages,
    fallbackTruncated: !filesWritten && results.length > FALLBACK_IMAGE_LIMIT,
  })
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  return NextResponse.json({ designs: BADGE_IMAGE_DESIGNS })
}
