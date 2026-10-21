/**
 * 계정을 지울 때 아바타 파일을 함께 지운다(티켓 20261021_1249 1회, 운영 로직 17.2절).
 *
 * 아바타는 `avatars` 버킷의 `${userId}/${Date.now()}.ext`로 올라가며(`api/profile/avatar`) 새 사진을 올릴 때마다 파일이 쌓인다.
 * 계정 삭제의 외래키 CASCADE는 스토리지 파일을 지우지 못하므로 폴더를 목록으로 읽어 모두 지운다.
 * 구글 프로필 사진 URL을 쓰는 유저는 버킷에 파일이 없어 목록이 비고 아무것도 지우지 않는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

export const AVATAR_BUCKET = 'avatars'

/** 목록을 한 번에 읽는 개수와 한 번에 지우는 개수 */
const LIST_PAGE_SIZE = 100
const REMOVE_CHUNK_SIZE = 100

/**
 * `avatars/${userId}/` 폴더의 파일을 모두 지우고 지운 개수를 돌려준다. 읽기·지우기가 실패하면 던진다 —
 * 아바타 삭제 실패를 계정 삭제에서 어떻게 다룰지는 호출부(`deleteAccount`)가 정한다.
 */
export async function removeAvatarFiles(supabase: ServiceClient, userId: string): Promise<number> {
  const bucket = supabase.storage.from(AVATAR_BUCKET)

  // 지우면 목록이 당겨지므로 먼저 이름을 전부 모은 뒤 지운다
  const paths: string[] = []
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await bucket.list(userId, { limit: LIST_PAGE_SIZE, offset })
    if (error) throw new Error(`[avatar-cleanup] 파일 목록 조회 실패: ${error.message}`)
    const page = data ?? []
    // id가 없는 항목은 하위 폴더 표시라 파일이 아니다
    for (const entry of page) if (entry.id) paths.push(`${userId}/${entry.name}`)
    if (page.length < LIST_PAGE_SIZE) break
  }

  for (let i = 0; i < paths.length; i += REMOVE_CHUNK_SIZE) {
    const { error } = await bucket.remove(paths.slice(i, i + REMOVE_CHUNK_SIZE))
    if (error) throw new Error(`[avatar-cleanup] 파일 삭제 실패: ${error.message}`)
  }

  return paths.length
}
