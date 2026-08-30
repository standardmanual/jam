import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { isKnownBadgeImageDesign } from '@/lib/admin/badgeImageDesigns'

// 렌더링(next/og·resvg)이 수 초 걸릴 수 있어 다른 admin 라우트(strava sync 등)와 동일하게
// 상한을 늘려둔다.
export const maxDuration = 60

/**
 * 체크인 배지 이미지 단건 생성/교체 API (티켓 20260830_1349, 20260830_1252 배치 방식을 재설계).
 *
 * 특정 체크인 배지 1개를 골라, 관리자가 입력한 텍스트로 그 배지 이미지 1장만 렌더링한다.
 * 렌더링 엔진(`scripts/badge-image-gen/lib/engine.js`)과 config(`configs/*.config.js`)를
 * CLI·구 배치 라우트와 동일하게 재사용한다. process.cwd() 기준 동적 require로 실제
 * 파일시스템 상대경로 그대로 불러온다 — next.config.ts의 outputFileTracingIncludes가
 * 배포 번들에 이 경로들을 포함시킨다.
 *
 * DB image_url 반영은 이 화면에서 자동 실행하지 않는다 — 생성된 이미지 배포 확인 후 적용할
 * 해당 배지 1건짜리 UPDATE SQL을 응답에 담아 관리자가 직접 복사·적용하도록 한다
 * (20260824_020 이미지-DB 순서 사고 재발 방지 원칙 유지).
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

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const badgeId = typeof body?.badgeId === 'string' ? body.badgeId.trim() : ''
  const designId = typeof body?.designId === 'string' ? body.designId : ''
  const text = typeof body?.text === 'string' ? body.text.trim() : ''

  if (!badgeId) return NextResponse.json({ error: '배지를 선택하세요.' }, { status: 400 })
  if (!designId || !isKnownBadgeImageDesign(designId)) {
    return NextResponse.json({ error: '알 수 없는 디자인입니다.' }, { status: 400 })
  }
  if (!text) return NextResponse.json({ error: '이미지에 표시할 텍스트를 입력하세요.' }, { status: 400 })

  const supabase = createServiceClient()
  // badgeId가 실제 존재하는 체크인 배지인지 확인한다 — 이 값이 뒤에서 파일명(`${id}.png`)에
  // 그대로 쓰이므로 임의 문자열이 통과하지 않도록 DB 검증을 반드시 거친다.
  const { data: badgeRow, error: badgeErr } = await supabase
    .from('badges')
    .select('id, name')
    .eq('id', badgeId)
    .eq('type', 'checkin')
    .is('deleted_at', null)
    .maybeSingle()
  if (badgeErr) return NextResponse.json({ error: badgeErr.message }, { status: 500 })
  if (!badgeRow) return NextResponse.json({ error: '체크인 배지를 찾을 수 없습니다.' }, { status: 404 })
  const badge = badgeRow as { id: string; name: string }

  let config: BadgeImageConfig
  let engine: BadgeImageEngine
  try {
    config = loadConfig(designId)
    engine = loadEngine()
  } catch (e) {
    return NextResponse.json(
      { error: `엔진/config 로드 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }

  let png: Buffer
  try {
    const { fontData, backgroundSvg, widthOf } = await engine.prepareRenderContext(config)
    png = await engine.renderBadgeWithText(
      { id: badge.id, name: badge.name },
      text,
      config,
      fontData,
      backgroundSvg,
      widthOf
    )
  } catch (e) {
    return NextResponse.json(
      { error: `렌더링 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }

  // public/{outputDir}에 쓰기 시도 — 로컬 개발 환경은 성공하지만, 프로덕션 Vercel 서버리스는
  // 배포 번들이 읽기 전용이라 실패할 수 있다. 그 경우 base64로 응답에 담아 관리자가 직접
  // 저장하도록 폴백한다.
  const outputDir = path.join(engine.PROJECT_ROOT, 'public', config.outputDir)
  const fileName = `${badge.id}.png`
  let filesWritten = false
  try {
    fs.mkdirSync(outputDir, { recursive: true })
    fs.writeFileSync(path.join(outputDir, fileName), png)
    filesWritten = true
  } catch {
    filesWritten = false
  }

  const sql =
    `-- 체크인 배지 이미지 단건 반영 (${config.name} 디자인) — badge.id=${badge.id}\n` +
    `UPDATE public.badges SET image_url = '/${config.outputDir}/${fileName}' WHERE id = '${badge.id}';\n`

  return NextResponse.json({
    badgeId: badge.id,
    badgeName: badge.name,
    design: designId,
    text,
    filesWritten,
    outputDir: config.outputDir,
    fileName,
    sql,
    previewBase64: png.toString('base64'),
  })
}
