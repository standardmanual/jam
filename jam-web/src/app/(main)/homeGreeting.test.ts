/**
 * 홈 인사말과 유저 검색창의 자리 (티켓 20261128_1700)
 *
 * 서버 페이지와 프로필 클라이언트는 의존이 많아 렌더하지 않고 소스 구조로 고정한다. 고정하는 것:
 * - 홈 인사말은 두 줄이다(첫 줄 «{이름}님», 둘째 줄 «오늘도 좋은 하루예요») + 글자 크기 눈금 `text-3xl`.
 * - 홈에는 `/search` 링크와 검색 아이콘이 없다.
 * - 프로필의 팔로워·팔로잉 목록 첫 줄 위에 검색창(`UserSearchBar`, 제출하면 `/search?q=`로 이동)이 있고, 내 프로필(isOwnProfile)에서만 그린다. 빈 목록에도 있다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/homeGreeting.test.ts"
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { d, t } from '@/lib/i18n'

const strip = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const home = strip(readFileSync(join(__dirname, 'page.tsx'), 'utf8'))
const profile = strip(readFileSync(join(__dirname, 'profile', 'ProfileClient.tsx'), 'utf8'))

describe('홈 인사말', () => {
  it('문구가 두 줄로 나뉜다', () => {
    expect(t(d.todayStatus.greetingName, { name: '러너' })).toBe('러너님')
    expect(d.todayStatus.greetingBody).toBe('오늘도 좋은 하루예요')
  })

  it('두 줄을 block 요소로 그리고 글자 크기는 text-3xl이다', () => {
    expect(home).toMatch(/<p className="text-3xl font-bold">/)
    expect(home).toMatch(/block truncate[^>]*>\{t\(d\.todayStatus\.greetingName/)
    expect(home).toMatch(/<span className="block">\{d\.todayStatus\.greetingBody\}<\/span>/)
  })

  it('홈에는 검색 링크와 아이콘이 없다', () => {
    expect(home).not.toMatch(/href="\/search"/)
    expect(home).not.toMatch(/SearchIcon|searchAriaLabel/)
  })
})

describe('프로필 목록의 유저 검색창', () => {
  it('내 프로필에서만 검색창을 만든다', () => {
    expect(profile).toMatch(/const searchLink = isOwnProfile \? <UserSearchBar size="mini" \/> : null/)
    expect(profile).not.toMatch(/href="\/search"/)
  })

  it('검색창은 제출하면 검색 결과 페이지로 이동한다', () => {
    const bar = readFileSync(join(__dirname, 'UserSearchBar.tsx'), 'utf8')
    expect(bar).toContain('router.push(`/search?q=${encodeURIComponent(trimmed)}`)')
  })

  it('빈 목록과 채워진 목록 모두 첫 줄 위에 놓인다', () => {
    const emptyAt = profile.indexOf('{searchLink}\n          <EmptyState')
    const listAt = profile.indexOf('{searchLink}\n        {listData.map')
    expect(emptyAt).toBeGreaterThan(-1)
    expect(listAt).toBeGreaterThan(-1)
  })
})
