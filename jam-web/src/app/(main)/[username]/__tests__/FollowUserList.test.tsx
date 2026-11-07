/**
 * FollowUserList — 사람 행이 ListRow인지 고정한다 (티켓 20261107_1943, 상위 20261106_1750 4단계 3-1배치)
 *
 * 저장소에 jsdom이 없어 서버 렌더 마크업으로 본다. ListRow는 행마다 <style>을 함께 내보내므로(티켓 20261107_1815)
 * 마크업 검사 전에 style 요소를 먼저 걷는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/[username]/__tests__/FollowUserList.test.tsx"
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../FollowButton', () => ({
  FollowButton: ({ targetUserId }: { targetUserId: string }) => <button type="button">팔로우-{targetUserId}</button>,
}))
vi.mock('@/components/BadgeRevealOverlay', () => ({ default: () => null }))

import FollowUserList, { type FollowListUser } from '../FollowUserList'

const users: FollowListUser[] = [
  { id: 'me', username: 'me_name', display_name: '나', avatar_url: null, isFollowing: false },
  { id: 'u2', username: 'other', display_name: '다른 사람', avatar_url: 'https://example.com/a.png', isFollowing: true },
]

const html = () =>
  renderToStaticMarkup(<FollowUserList users={users} currentUserId="me" />).replace(/<style[\s\S]*?<\/style>/g, '')

describe('FollowUserList 행', () => {
  it('행 전체가 /{username} 링크이고 제목은 400 굵기다', () => {
    const out = html()

    expect(out).toContain('href="/me_name"')
    expect(out).toContain('href="/other"')
    expect(out).toContain('font-weight:400')
    expect(out).not.toContain('font-weight:700')
  })

  it('본인 행에는 팔로우 버튼이 없고 다른 행에만 있다', () => {
    const out = html()

    expect(out).not.toContain('팔로우-me')
    expect(out).toContain('팔로우-u2')
    // 본인 행은 trail 영역 자체가 없다 (행 2개 중 1개만 trail)
    expect(out.match(/ds-list-row-trail/g)?.length).toBe(1)
  })

  it('<a> 안에 <a>·<button>이 없다 — 버튼은 링크 밖 trail 형제다', () => {
    const out = html()
    const anchors = out.match(/<a [^>]*>[\s\S]*?<\/a>/g) ?? []

    expect(anchors).toHaveLength(2)
    for (const a of anchors) {
      expect(a.slice(2)).not.toContain('<a ')
      expect(a).not.toContain('<button')
    }
  })

  it('아바타 이미지는 장식(alt="")이고 없으면 UserIcon 하나만 lead에 둔다', () => {
    const out = html()

    expect(out).toContain('alt=""')
    expect(out).not.toContain('alt="다른 사람"')
    // 폴백 안에 별도 div(원형 박스)를 두지 않는다
    expect(out).not.toContain('bg-background-secondary')
    expect(out).toContain('w-5 h-5 text-muted')
  })
})
