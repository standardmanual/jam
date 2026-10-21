/**
 * removeAvatarFiles — 계정을 지울 때 아바타 파일을 함께 지운다 (티켓 20261021_1249 1회, 운영 로직 17.2절)
 * 스토리지는 가짜다 — 공용 스토리지를 부르지 않는다. 고정하는 것: 유저 폴더의 파일만 모두 지운다 · 구글 사진 URL을 쓰는 유저(폴더가 빔)는 아무것도 지우지 않는다 ·
 * 하위 폴더 표시는 지우지 않는다 · 100개가 넘어도 끝까지 읽고 나눠 지운다 · 읽기·지우기 오류는 던진다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/account/__tests__/avatar-cleanup.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { createServiceClient } from '@/lib/supabase/server'
import { removeAvatarFiles } from '../avatar-cleanup'

type ServiceClient = ReturnType<typeof createServiceClient>

const USER_ID = 'user-1'

interface Entry {
  name: string
  id: string | null
}

function makeStorage(
  entries: Entry[],
  failures: { list?: boolean; remove?: boolean } = {}
) {
  const listCalls: Array<{ bucket: string; folder: string; offset: number; limit: number }> = []
  const removeCalls: string[][] = []
  const client = {
    storage: {
      from: (bucket: string) => ({
        list: async (folder: string, options: { limit: number; offset: number }) => {
          listCalls.push({ bucket, folder, offset: options.offset, limit: options.limit })
          if (failures.list) return { data: null, error: { message: '목록 실패' } }
          return { data: entries.slice(options.offset, options.offset + options.limit), error: null }
        },
        remove: async (paths: string[]) => {
          removeCalls.push(paths)
          return failures.remove ? { data: null, error: { message: '삭제 실패' } } : { data: [], error: null }
        },
      }),
    },
  } as unknown as ServiceClient
  return { client, listCalls, removeCalls }
}

const files = (count: number): Entry[] =>
  Array.from({ length: count }, (_, i) => ({ name: `${1000 + i}.webp`, id: `file-${i}` }))

describe('removeAvatarFiles', () => {
  it('avatars 버킷의 유저 폴더 파일을 모두 지우고 지운 개수를 돌려준다', async () => {
    const { client, listCalls, removeCalls } = makeStorage(files(2))

    const removed = await removeAvatarFiles(client, USER_ID)

    expect(removed).toBe(2)
    expect(listCalls[0]).toMatchObject({ bucket: 'avatars', folder: USER_ID, offset: 0 })
    expect(removeCalls).toEqual([[`${USER_ID}/1000.webp`, `${USER_ID}/1001.webp`]])
  })

  it('폴더가 비어 있으면(구글 프로필 사진 URL을 쓰는 유저) 아무것도 지우지 않는다', async () => {
    const { client, removeCalls } = makeStorage([])
    expect(await removeAvatarFiles(client, USER_ID)).toBe(0)
    expect(removeCalls).toEqual([])
  })

  it('id가 없는 항목(하위 폴더 표시)은 지우지 않는다', async () => {
    const { client, removeCalls } = makeStorage([
      { name: 'nested', id: null },
      { name: '1000.webp', id: 'file-0' },
    ])
    expect(await removeAvatarFiles(client, USER_ID)).toBe(1)
    expect(removeCalls).toEqual([[`${USER_ID}/1000.webp`]])
  })

  it('100개가 넘으면 목록을 끝까지 읽고 나눠서 지운다', async () => {
    const { client, listCalls, removeCalls } = makeStorage(files(230))

    expect(await removeAvatarFiles(client, USER_ID)).toBe(230)
    expect(listCalls.map((c) => c.offset)).toEqual([0, 100, 200])
    expect(removeCalls.map((paths) => paths.length)).toEqual([100, 100, 30])
  })

  it('목록 읽기가 실패하면 던지고 아무것도 지우지 않는다', async () => {
    const { client, removeCalls } = makeStorage(files(2), { list: true })
    await expect(removeAvatarFiles(client, USER_ID)).rejects.toThrow('파일 목록 조회 실패')
    expect(removeCalls).toEqual([])
  })

  it('지우기가 실패하면 던진다', async () => {
    const { client } = makeStorage(files(2), { remove: true })
    await expect(removeAvatarFiles(client, USER_ID)).rejects.toThrow('파일 삭제 실패')
  })
})
