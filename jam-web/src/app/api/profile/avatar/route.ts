// POST /api/profile/avatar
// 프로필 이미지 업로드 → Supabase Storage avatars 버킷

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  return 'webp'
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'INVALID_FILE' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'INVALID_FILE' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 400 })
  }

  const ext = extFromMime(file.type)
  const path = `${user.id}/${Date.now()}.${ext}`

  const serviceClient = createServiceClient()

  const { error: uploadError } = await serviceClient.storage
    .from('avatars')
    .upload(path, file, { contentType: file.type, upsert: true })

  if (uploadError) {
    console.error('[profile/avatar] 업로드 오류:', uploadError.message)
    return NextResponse.json({ error: 'UPLOAD_FAILED' }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = serviceClient.storage.from('avatars').getPublicUrl(path)

  // users 테이블 avatar_url 업데이트
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (serviceClient.from('users') as any)
    .update({ avatar_url: publicUrl })
    .eq('id', user.id)

  if (updateError) {
    console.error('[profile/avatar] DB 업데이트 오류:', updateError.message)
    return NextResponse.json({ error: 'DB_UPDATE_FAILED' }, { status: 500 })
  }

  return NextResponse.json({ avatar_url: publicUrl })
}
