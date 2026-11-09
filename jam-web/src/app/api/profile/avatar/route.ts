// POST /api/profile/avatar
// 프로필 이미지 업로드 → Supabase Storage avatars 버킷

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { d } from '@/lib/i18n'
import { sanitizeAvatarImage, type AvatarFormat } from '@/lib/avatarImage'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

const FORMAT_META: Record<AvatarFormat, { ext: string; contentType: string }> = {
  jpeg: { ext: 'jpg', contentType: 'image/jpeg' },
  png: { ext: 'png', contentType: 'image/png' },
  webp: { ext: 'webp', contentType: 'image/webp' },
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: d.common.authRequired }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: d.profileEdit.uploadError }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: d.profileEdit.fileTypeError }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: d.profileEdit.fileTypeError }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: d.profileEdit.fileSizeError }, { status: 400 })
  }

  // EXIF(GPS 등) 제거·방향 적용 — 클라이언트 MIME이 아니라 실제 디코드 형식으로 저장한다 (티켓 20260929_1317)
  let sanitized: Awaited<ReturnType<typeof sanitizeAvatarImage>>
  try {
    sanitized = await sanitizeAvatarImage(Buffer.from(await file.arrayBuffer()))
  } catch {
    return NextResponse.json({ error: d.profileEdit.fileTypeError }, { status: 400 })
  }

  const { ext, contentType } = FORMAT_META[sanitized.format]
  const path = `${user.id}/${Date.now()}.${ext}`

  const serviceClient = createServiceClient()

  // 교체 후 지울 이전 아바타 URL — 읽기에 실패하면 삭제만 건너뛴다 (티켓 20260929_1331)
  const { data: prevRow } = await serviceClient
    .from('users')
    .select('avatar_url')
    .eq('id', user.id)
    .maybeSingle()
  const prevAvatarUrl = prevRow?.avatar_url ?? null

  const { error: uploadError } = await serviceClient.storage
    .from('avatars')
    .upload(path, sanitized.buffer, { contentType, upsert: true })

  if (uploadError) {
    console.error('[profile/avatar] 업로드 오류:', uploadError.message)
    return NextResponse.json({ error: d.profileEdit.uploadError }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = serviceClient.storage.from('avatars').getPublicUrl(path)

  // users 테이블 avatar_url 업데이트
  const usersTable = serviceClient.from('users')
  const { error: updateError } = await usersTable.update({ avatar_url: publicUrl }).eq('id', user.id)

  if (updateError) {
    console.error('[profile/avatar] DB 업데이트 오류:', updateError.message)
    return NextResponse.json({ error: d.profileEdit.uploadError }, { status: 500 })
  }

  // DB 갱신이 성공한 뒤에만 이전 객체를 지운다. 실패해도 응답은 성공이다.
  const prevPath = extractOwnAvatarPath(prevAvatarUrl, publicUrl, path, user.id)
  if (prevPath) {
    try {
      const { error: removeError } = await serviceClient.storage.from('avatars').remove([prevPath])
      if (removeError) {
        console.error('[profile/avatar] 이전 파일 삭제 오류:', removeError.message)
      }
    } catch (e) {
      console.error('[profile/avatar] 이전 파일 삭제 오류:', e instanceof Error ? e.message : e)
    }
  }

  return NextResponse.json({ avatar_url: publicUrl })
}

/**
 * 이전 avatar_url이 같은 버킷의 `{userId}/` 아래 객체일 때만 그 경로를 돌려준다.
 * 외부 URL(구글 기본 이미지 등)·다른 이용자 경로·방금 올린 경로와 같은 경우는 null.
 * 새 URL에서 경로를 뺀 접두(버킷 공개 주소)로 출처를 확인한다.
 */
function extractOwnAvatarPath(
  prevUrl: string | null,
  newPublicUrl: string,
  newPath: string,
  userId: string,
): string | null {
  if (!prevUrl || !newPublicUrl.endsWith(newPath)) return null
  const prefix = newPublicUrl.slice(0, newPublicUrl.length - newPath.length)
  if (!prevUrl.startsWith(prefix)) return null
  const prevPath = prevUrl.slice(prefix.length).split(/[?#]/)[0]
  if (!prevPath.startsWith(`${userId}/`) || prevPath.includes('..')) return null
  if (prevPath === newPath) return null
  return prevPath
}
