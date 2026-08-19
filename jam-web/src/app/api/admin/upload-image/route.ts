import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { computeAverageColorHex } from '@/lib/imageAverageColor'

const BUCKET = 'images'
const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']

/**
 * 배경 제너레이터 애니메이션 모드가 굽는 반복 재생 영상 (20260819_012).
 * 유저단은 <video>로 재생만 하므로 iOS Safari 호환이 필수 — H.264 MP4만 허용한다.
 */
const ALLOWED_VIDEO_TYPES = ['video/mp4']
/** 영상 용량 상한. 어드민이 굽는 결과는 수백 KB 수준이지만 인코딩 편차를 감안해 여유를 둔다 */
const MAX_VIDEO_SIZE = 20 * 1024 * 1024 // 20MB

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const folder = (formData.get('folder') as string | null) ?? 'misc'

  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

  // 영상(배경 제너레이터 애니메이션 결과)과 이미지를 분기 처리한다 — 이미지 경로의 검증·평균색
  // 추출 동작은 기존 그대로 유지된다 (20260819_012).
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type)

  if (!isVideo && !ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: '지원하지 않는 파일 형식입니다. (이미지: JPEG, PNG, WebP, GIF, SVG / 영상: MP4)' }, { status: 400 })
  }
  if (isVideo) {
    if (file.size > MAX_VIDEO_SIZE) {
      return NextResponse.json({ error: '영상 파일 크기는 20MB 이하여야 합니다.' }, { status: 400 })
    }
  } else if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '파일 크기는 5MB 이하여야 합니다.' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

  // 평균 컬러 추출(20260818_003, 배지 배경색 자동 프리필용) — 계산 실패해도 업로드 자체는
  // 계속 진행한다. file.arrayBuffer()는 Blob을 소비하지 않으므로 이후 upload에도 file을
  // 그대로 사용할 수 있다.
  // 영상 버퍼에는 sharp가 동작하지 않고(그리고 배경색 프리필 대상도 아니라) 건너뛴다.
  const averageColor = isVideo ? null : await computeAverageColorHex(Buffer.from(await file.arrayBuffer()))

  const supabase = createServiceClient()
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, file, { contentType: file.type, upsert: false })

  if (error) {
    return NextResponse.json({ error: `업로드 실패: ${error.message}` }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  return NextResponse.json({ url: publicUrl, averageColor })
}
