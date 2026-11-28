/**
 * 유저 목록 행 모양 (티켓 20261128_1745)
 *
 * 팔로워·팔로잉(프로필 탭, /[username]/followers·following)과 유저 검색 결과 목록은 카드 없는 평평한 행(`tone="flat"`)이고,
 * 프로필 이미지는 36px이다. 서버·클라이언트 화면이 의존이 많아 소스 구조로 고정한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/userListRow.test.ts"
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { USER_LIST_STYLE, USER_ROW_AVATAR_SIZE } from './userListRow'

const strip = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const FILES = {
  '프로필 목록': join(__dirname, 'profile', 'ProfileClient.tsx'),
  '팔로워·팔로잉 페이지 목록': join(__dirname, '[username]', 'FollowUserList.tsx'),
  '유저 검색 결과': join(__dirname, 'search', 'page.tsx'),
}

describe('유저 목록 공용 값', () => {
  it('프로필 이미지는 36px이고 행 앞 칸 토큰도 같은 값으로 줄인다', () => {
    expect(USER_ROW_AVATAR_SIZE).toBe(36)
    expect((USER_LIST_STYLE as Record<string, string>)['--list-row-lead-size']).toBe('36px')
  })
})

describe.each(Object.entries(FILES))('%s', (_name, path) => {
  const code = strip(readFileSync(path, 'utf8'))

  it('카드 없는 평평한 행(tone="flat")이다', () => {
    expect(code).toMatch(/<ListRow\s+key=\{u\.id\}\s+tone="flat"/)
  })

  it('프로필 이미지는 공용 크기를 쓰고 48px을 쓰지 않는다', () => {
    expect(code).toContain('size={USER_ROW_AVATAR_SIZE}')
    expect(code).not.toMatch(/<Avatar[^>]*size=\{48\}/)
  })

  it('목록 감싸는 곳에 앞 칸 크기 덮어쓰기를 건다', () => {
    expect(code).toContain('style={USER_LIST_STYLE}')
  })
})
