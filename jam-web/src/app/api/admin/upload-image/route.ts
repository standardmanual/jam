import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { computeAverageColorHex } from '@/lib/imageAverageColor'

const BUCKET = 'images'
const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const folder = (formData.get('folder') as string | null) ?? 'misc'

  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: '지원하지 않는 파일 형식입니다. (JPEG, PNG, WebP, GIF, SVG만 가능)' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '파일 크기는 5MB 이하여야 합니다.' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const filename = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

  // 평균 컬러 추출(20260818_003, 배지 배경색 자동 프리필용) — 계산 실패해도 업로드 자체는
  // 계속 진행한다. file.arrayBuffer()는 Blob을 소비하지 않으므로 이후 upload에도 file을
  // 그대로 사용할 수 있다.
  const buffer = Buffer.from(await file.arrayBuffer())
  const averageColor = await computeAverageColorHex(buffer)

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
