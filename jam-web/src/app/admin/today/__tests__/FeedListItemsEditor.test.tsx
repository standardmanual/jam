/**
 * 목록 항목 입력 칸 (티켓 20261121_1317, 상위 20261120_2026 5회차-3)
 *
 * 확인하는 것: 항목 3개 상한, 주소 오류(`javascript:` 포함), 대표 페이지 주소, 이름 칸·경고, 추가·삭제·이동 버튼과 순수 함수.
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)와 순수 함수로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/today/__tests__/FeedListItemsEditor.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'

import FeedListItemsEditor, {
  blankListItem,
  isBlankListItem,
  LIST_ITEM_NAME_WARN_LENGTH,
  listHrefInvalid,
  listItemNameWarning,
  listItemsMoved,
  listItemsWithAdded,
  listItemsWithout,
  listItemsWithPatch,
  listValidation,
} from '../FeedListItemsEditor'
import type { FeedListItemFormValue } from '@/lib/admin/feedCardFields'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

const item = (patch: Partial<FeedListItemFormValue> = {}): FeedListItemFormValue => ({ ...blankListItem(), ...patch })
const ok = (name: string): FeedListItemFormValue => item({ name, href: `/missions/${name}` })

const render = (props: Partial<ComponentProps<typeof FeedListItemsEditor>> = {}): string =>
  renderToStaticMarkup(<FeedListItemsEditor items={[]} moreHref="" onChange={() => {}} {...props} />)

const disabledButton = (html: string, label: string): boolean =>
  new RegExp(`<button[^>]*disabled=""[^>]*aria-label="${label}"|<button[^>]*aria-label="${label}"[^>]*disabled=""`).test(html)

describe('FeedListItemsEditor — 마크업', () => {
  it('항목이 없으면 항목 추가 버튼과 대표 주소 칸이 있고, 항목이 없다는 경고가 보인다', () => {
    const html = render()
    expect(html).toContain('항목 추가')
    expect(html).toContain('id="feed-card-list-more-href"')
    expect(html).toContain('목록형인데 항목이 없어요')
    expect(html).not.toContain('1번째 항목')
    expect(html).toContain('break-keep wrap-break-word')
  })

  it('항목마다 이름·주소·이미지 칸과 이동·삭제 버튼이 있고 버튼 이름에 순번이 읽힌다', () => {
    const html = render({ items: [ok('a'), ok('b')] })
    for (const text of ['1번째 항목 이름', '1번째 항목 주소', '1번째 항목 이미지 주소', '2번째 항목 이름']) expect(html, text).toContain(text)
    for (const label of ['1번째 항목 위로 이동', '1번째 항목 아래로 이동', '1번째 항목 삭제', '2번째 항목 위로 이동']) {
      expect(html, label).toContain(`aria-label="${label}"`)
    }
  })

  it('첫 항목의 «위로»와 마지막 항목의 «아래로»는 비활성이다', () => {
    const html = render({ items: [ok('a'), ok('b')] })
    expect(disabledButton(html, '1번째 항목 위로 이동')).toBe(true)
    expect(disabledButton(html, '2번째 항목 아래로 이동')).toBe(true)
    expect(disabledButton(html, '1번째 항목 아래로 이동')).toBe(false)
  })

  it('항목이 3개이면 «항목 추가»가 비활성이다', () => {
    const full = render({ items: [ok('a'), ok('b'), ok('c')] })
    expect(full).toMatch(/<button[^>]*disabled=""[^>]*>항목 추가/)
    expect(full).toContain('항목은 3개까지만 둘 수 있어요')
    expect(render({ items: [ok('a'), ok('b')] })).not.toMatch(/<button[^>]*disabled=""[^>]*>항목 추가/)
  })
})

describe('주소 오류', () => {
  it('`javascript:`·`//`·`http:`·공백 주소는 오류이고 입력 칸이 aria-invalid다', () => {
    for (const href of ['javascript:alert(1)', '//evil.example', 'http://x.example', '/a b']) {
      expect(listHrefInvalid(href, true), href).toBe(true)
      const html = render({ items: [item({ name: '가', href })] })
      expect(html, href).toContain('1번째 목록 항목의 주소를 쓸 수 없어요')
      expect(html, href).toMatch(/<input[^>]*id="feed-card-list-item-1-href"[^>]*aria-invalid="true"|<input[^>]*aria-invalid="true"[^>]*id="feed-card-list-item-1-href"/)
    }
  })
  it('내부 경로와 https 주소는 통과한다', () => {
    for (const href of ['/missions/1', 'https://example.com/a']) {
      expect(listHrefInvalid(href, true), href).toBe(false)
      expect(listValidation([item({ name: '가', href })], '').errors, href).toEqual([])
    }
  })
  it('세 칸이 모두 빈 새 항목은 오류로 보지 않는다(저장 때 떨어진다)', () => {
    expect(isBlankListItem(blankListItem())).toBe(true)
    expect(render({ items: [blankListItem()] })).not.toContain('aria-invalid="true"')
  })
  it('이름이 비었는데 주소만 있으면 저장 검증과 같은 문구로 막힌다', () => {
    expect(listValidation([item({ href: '/a' })], '').errors).toContain('1번째 목록 항목에 이름이 없어요. 이름을 적어 주세요.')
  })
})

describe('대표 페이지 주소', () => {
  it('비우면 안내만 보이고 오류가 없다', () => {
    expect(listHrefInvalid('', false)).toBe(false)
    expect(render({ items: [ok('a')], moreHref: '' })).toContain('비워 두면 «→» 칸을 그리지 않아요')
  })
  it('쓸 수 없는 주소면 저장 검증과 같은 문구로 막히고 칸이 aria-invalid다', () => {
    expect(listValidation([ok('a')], 'javascript:void(0)').errors).toContain(
      '대표 페이지 주소를 쓸 수 없어요. 「/」로 시작하는 앱 안 경로나 「https://」로 시작하는 주소를 적어 주세요.',
    )
    const html = render({ items: [ok('a')], moreHref: 'javascript:void(0)' })
    expect(html).toMatch(/<input[^>]*id="feed-card-list-more-href"[^>]*aria-invalid="true"|<input[^>]*aria-invalid="true"[^>]*id="feed-card-list-more-href"/)
  })
  it('올바른 주소는 오류가 없다', () => {
    expect(listValidation([ok('a')], '/missions').errors).toEqual([])
    expect(listValidation([ok('a')], 'https://j-a-m.app/x').errors).toEqual([])
  })
})

describe('이름 칸', () => {
  it('20자를 넘으면 경고만 하고 막지 않는다', () => {
    const long = '가'.repeat(LIST_ITEM_NAME_WARN_LENGTH + 1)
    expect(listItemNameWarning(long)).toContain('21자로 길어요')
    expect(listItemNameWarning('가'.repeat(LIST_ITEM_NAME_WARN_LENGTH))).toBeNull()
    expect(listValidation([item({ name: long, href: '/a' })], '').errors).toEqual([])
    expect(render({ items: [item({ name: long, href: '/a' })] })).toContain('이름이 21자로 길어요')
  })
})

describe('항목 목록 변경 함수', () => {
  it('항목은 3개를 넘게 추가되지 않는다', () => {
    expect(listItemsWithAdded([])).toHaveLength(1)
    expect(listItemsWithAdded([ok('a'), ok('b')])).toHaveLength(3)
    expect(listItemsWithAdded([ok('a'), ok('b'), ok('c')])).toHaveLength(3)
  })
  it('삭제·이동·수정은 원본을 바꾸지 않고 새 목록을 돌려준다', () => {
    const list = [ok('a'), ok('b'), ok('c')]
    expect(listItemsWithout(list, 1).map((i) => i.name)).toEqual(['a', 'c'])
    expect(listItemsMoved(list, 2, -1).map((i) => i.name)).toEqual(['a', 'c', 'b'])
    expect(listItemsMoved(list, 0, 1).map((i) => i.name)).toEqual(['b', 'a', 'c'])
    expect(listItemsMoved(list, 0, -1).map((i) => i.name)).toEqual(['a', 'b', 'c'])
    expect(listItemsMoved(list, 2, 1).map((i) => i.name)).toEqual(['a', 'b', 'c'])
    expect(listItemsWithPatch(list, 1, { imageUrl: 'https://x/y.png' })[1].imageUrl).toBe('https://x/y.png')
    expect(list.map((i) => i.name)).toEqual(['a', 'b', 'c'])
  })
})
