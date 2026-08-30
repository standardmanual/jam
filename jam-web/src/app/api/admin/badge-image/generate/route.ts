import { createRequire } from 'node:module'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { isKnownBadgeImageDesign } from '@/lib/admin/badgeImageDesigns'

// 렌더링(next/og·resvg)이 수 초 걸릴 수 있어 다른 admin 라우트(strava sync 등)와 동일하게
// 상한을 늘려둔다.
export const maxDuration = 60

const STORAGE_BUCKET = 'images'

/**
 * 체크인 배지 이미지 단건 생성/교체 API (티켓 20260830_1500 — Storage 업로드 + 즉시 DB 반영으로
 * 재설계. 이전 이력: 20260830_1349 단건 선택 방식, 20260830_1252 배치 방식).
 *
 * 특정 체크인 배지 1개를 골라, 관리자가 입력한 텍스트로 그 배지 이미지 1장만 렌더링한다.
 * 렌더링 엔진(`scripts/badge-image-gen/lib/engine.js`)과 config(`configs/*.config.js`)를
 * CLI·구 배치 라우트와 동일하게 재사용한다. process.cwd() 기준 동적 require로 실제
 * 파일시스템 상대경로 그대로 불러온다 — next.config.ts의 outputFileTracingIncludes가
 * 배포 번들에 이 경로들을 포함시킨다(폰트/배경 SVG/config 로드에 여전히 필요).
 *
 * ImageResponse(next/og)는 여기서 **정적으로 import**해 engine.js의 렌더 함수에 인자로
 * 주입한다(티켓 20260830_1438). engine.js 내부에서 동적으로 require('next/og')하면
 * Next.js/Vercel의 빌드 시 의존성 트레이싱(@vercel/nft)이 createRequire 체인 내부의 호출을
 * 정적으로 분석하지 못해 서버리스 함수 번들에서 next/og가 누락되고 프로덕션에서만
 * "ImageResponse를 찾을 수 없습니다" 오류가 난다 — 이 라우트 파일에서 정적 import하면
 * 빌드 파이프라인이 이 함수의 번들에 next/og 의존성을 정상적으로 포함시킨다.
 *
 * 렌더링된 PNG는 `public/`에 파일로 쓰지 않고 Supabase Storage 'images' 버킷에 업로드한다
 * (`/api/admin/upload-image`가 이미 쓰는 패턴 그대로 재사용, 실제 447개 배지가 이 방식의
 * image_url을 쓰고 있어 렌더링 경로가 이미 실서비스에서 검증됨). Storage 업로드는 Next.js
 * 배포와 무관하게 즉시 퍼블릭으로 서빙되므로, 업로드 직후 그 자리에서 바로
 * `badges.image_url`을 UPDATE한다 — public/ 정적 파일 방식에서 있었던 "배포 전 DB부터
 * 갱신하면 이미지가 깨져 보이는" 순서 문제(20260824_020)가 구조적으로 발생하지 않는다.
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
      widthOf,
      ImageResponse
    )
  } catch (e) {
    return NextResponse.json(
      { error: `렌더링 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }

  // Storage 파일명은 배지 id로 고정한다 — 같은 배지를 재생성하면 upsert로 같은 경로를
  // 덮어써 Storage에 고아 파일이 쌓이지 않는다.
  const storagePath = `badges/checkin/${badge.id}.png`
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, png, { contentType: 'image/png', upsert: true })
  if (uploadErr) {
    return NextResponse.json({ error: `이미지 업로드 실패: ${uploadErr.message}` }, { status: 500 })
  }
  const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
  // 같은 경로를 upsert로 덮어쓰므로 CDN·브라우저 캐시가 옛 이미지를 계속 보여줄 수 있다.
  // DB에는 캐시 무효화용 쿼리스트링을 붙여 저장해 재생성 즉시 새 이미지가 보이도록 한다.
  const imageUrl = `${publicUrl}?v=${Date.now()}`

  const { error: updateErr } = await supabase
    .from('badges')
    // @ts-expect-error Supabase 타입 추론 제한 우회
    .update({ image_url: imageUrl })
    .eq('id', badge.id)
  if (updateErr) {
    return NextResponse.json({ error: `이미지는 업로드됐지만 배지 반영에 실패했습니다: ${updateErr.message}` }, { status: 500 })
  }

  return NextResponse.json({
    badgeId: badge.id,
    badgeName: badge.name,
    design: designId,
    text,
    imageUrl,
  })
}
