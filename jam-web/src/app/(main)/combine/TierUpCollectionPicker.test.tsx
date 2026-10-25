/**
 * 등급 올리기의 «받을 컬렉션» 행과 시트 본문 (티켓 20261023_1648 3회, 채원 사전 판정 2026-10-23) — 정적 렌더로 갈래별 모양을 고정한다.
 * 클릭·상태 전환(시트 열림, 선택 유지, 무효 선택)은 `CombineClient.tierUp.test.tsx`가 맡는다.
 */
import { describe, it, expect, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TierUpCollectionRow, TierUpCollectionSheetContent } from './TierUpCollectionPicker'
import type { TierUpCollectionOption, TierUpCollectionView } from './tierUpClient'
import { d } from '@/lib/i18n'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/combine',
  useSearchParams: () => new URLSearchParams(),
}))

const noop = () => {}

const FOREST: TierUpCollectionOption = { id: 'forest', name: '숲속 산책 컬렉션', imageUrl: 'https://example.com/forest.png', rarities: ['common', 'rare'] }
const RIVER: TierUpCollectionOption = { id: 'river', name: '한강 라이딩 컬렉션', imageUrl: null, rarities: ['common', 'rare'] }

function row(view: TierUpCollectionView, overrides: { submitting?: boolean; onOpen?: () => void; onRetry?: () => void } = {}) {
  return renderToStaticMarkup(
    <TierUpCollectionRow view={view} submitting={overrides.submitting ?? false} onOpen={overrides.onOpen ?? noop} onRetry={overrides.onRetry ?? noop} />,
  )
}

/** 보이는 글자만 — 태그를 걷어 낸다 */
const visibleText = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

type AnyElement = ReactElement<Record<string, unknown>>
function findAll(node: ReactNode, predicate: (el: AnyElement) => boolean, found: AnyElement[] = []): AnyElement[] {
  if (Array.isArray(node)) {
    node.forEach((child) => findAll(child, predicate, found))
    return found
  }
  if (!isValidElement(node)) return found
  const el = node as AnyElement
  if (predicate(el)) found.push(el)
  findAll(el.props.children as ReactNode, predicate, found)
  return found
}

describe('TierUpCollectionRow — 갈래별 표현', () => {
  it('needMaterial: 정적 행(button 아님)에 라벨과 «재료를 넣으면 컬렉션을 고를 수 있어요»가 foreground 글자로 나온다', () => {
    const out = row({ kind: 'needMaterial' })
    expect(out).not.toContain('<button')
    expect(out).not.toContain('w-4 h-4') // > 화살표(ChevronRightIcon)가 없다
    expect(visibleText(out)).toBe('받을 컬렉션 재료를 넣으면 컬렉션을 고를 수 있어요')
    const value = out.match(/<p class="[^"]*">재료를 넣으면 컬렉션을 고를 수 있어요<\/p>/)
    expect(value).not.toBeNull()
    expect(value![0]).toContain('text-foreground')
    // 흐리게 하지 않는다 — 비활성 모양(opacity)도, 눌림(jam-press)도 없다
    expect(out).not.toMatch(/opacity/)
    expect(out).not.toContain('jam-press')
  })

  it('none: 정적 행에 «지금은 {등급} 아이템 배지로 받을 수 있는 컬렉션이 없어요. 다른 등급으로 해 보세요.»가 나온다', () => {
    const out = row({ kind: 'none', rarity: 'epic' })
    expect(out).not.toContain('<button')
    expect(out).not.toContain('w-4 h-4')
    expect(visibleText(out)).toBe('받을 컬렉션 지금은 Epic 아이템 배지로 받을 수 있는 컬렉션이 없어요. 다른 등급으로 해 보세요.')
    expect(out).not.toMatch(/opacity/)
    expect(row({ kind: 'none', rarity: 'common' })).toContain('지금은 Common 아이템 배지로')
  })

  it('error: 행 대신 안내 블록(role status)과 «다시 불러오기» 버튼이 나오고 컬렉션이 없다고 말하지 않는다', () => {
    const out = row({ kind: 'error' })
    expect(out).toContain('role="status"')
    expect(out).toContain('컬렉션 목록을 지금 불러오지 못했어요. 잠시 뒤 다시 불러와 주세요.')
    expect(out).toMatch(/<button[^>]*>다시 불러오기<\/button>/)
    expect(out).not.toContain('받을 컬렉션')
    expect(out).not.toContain('컬렉션이 없어요')
  })

  it('error: «다시 불러오기»를 누르면 onRetry를 부른다', () => {
    const onRetry = vi.fn()
    const tree = TierUpCollectionRow({ view: { kind: 'error' }, submitting: false, onOpen: noop, onRetry })
    // 버튼은 InlineNotice의 action 칸에 들어간다
    const button = (tree as AnyElement).props.action as AnyElement
    expect(button.props.variant).toBe('outline')
    ;(button.props.onClick as () => void)()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('ready·미선택: 책 아이콘 타일, «컬렉션을 골라 주세요», 오른쪽 > 가 있는 버튼이다', () => {
    const out = row({ kind: 'ready', choices: [FOREST, RIVER], selectedId: null })
    expect(out).toMatch(/<button type="button"/)
    expect(visibleText(out)).toBe('받을 컬렉션 컬렉션을 골라 주세요')
    expect(out).toContain('jam-press')
    // 40×40 타일에 밝은 면, 이미지가 없으므로 책 아이콘(타일 안 svg)
    expect(out).toMatch(/<div class="w-10 h-10 shrink-0 rounded-2xl bg-background-secondary[^"]*"><svg/)
    // 오른쪽 화살표(ChevronRightIcon, w-4 h-4)
    expect(out).toMatch(/<div class="shrink-0 flex items-center"><svg[^>]*class="w-4 h-4/)
  })

  it('ready·선택: 타일에 컬렉션 이미지, 값에 컬렉션 이름이 나온다(2줄까지)', () => {
    const out = row({ kind: 'ready', choices: [FOREST, RIVER], selectedId: 'forest' })
    expect(visibleText(out)).toBe('받을 컬렉션 숲속 산책 컬렉션')
    expect(out).toContain('forest.png')
    const value = out.match(/<p class="[^"]*">숲속 산책 컬렉션<\/p>/)
    expect(value).not.toBeNull()
    expect(value![0]).toContain('line-clamp-2')
    expect(value![0]).toContain('text-foreground')
  })

  it('ready·선택(이미지 없음): 이름은 나오고 타일은 책 아이콘이다', () => {
    const out = row({ kind: 'ready', choices: [FOREST, RIVER], selectedId: 'river' })
    expect(visibleText(out)).toBe('받을 컬렉션 한강 라이딩 컬렉션')
    expect(out).toMatch(/<div class="w-10 h-10 shrink-0[^"]*"><svg/)
  })

  it('ready: 행을 누르면 onOpen을 부르고, 제출 중에는 버튼이 잠겨(disabled) 눌림 효과도 없다', () => {
    const onOpen = vi.fn()
    const tree = TierUpCollectionRow({ view: { kind: 'ready', choices: [FOREST], selectedId: null }, submitting: false, onOpen, onRetry: noop })
    ;((tree as AnyElement).props.onClick as () => void)()
    expect(onOpen).toHaveBeenCalledTimes(1)

    const locked = row({ kind: 'ready', choices: [FOREST], selectedId: null }, { submitting: true })
    expect(locked).toContain('disabled=""')
    expect(locked).not.toContain('jam-press')
    expect(row({ kind: 'ready', choices: [FOREST], selectedId: null })).not.toContain('disabled=""')
  })

  it('정적 행(needMaterial·none)은 눌러도 아무 핸들러가 없다', () => {
    for (const view of [{ kind: 'needMaterial' }, { kind: 'none', rarity: 'rare' }] as const) {
      const tree = TierUpCollectionRow({ view, submitting: false, onOpen: noop, onRetry: noop }) as AnyElement
      expect(tree.props.onClick).toBeUndefined()
    }
  })

  it('한국어를 그리는 요소는 break-keep과 wrap-break-word를 함께 쓰고 왼쪽 정렬이다', () => {
    const outs = [
      row({ kind: 'needMaterial' }),
      row({ kind: 'none', rarity: 'rare' }),
      row({ kind: 'ready', choices: [FOREST], selectedId: null }),
      row({ kind: 'ready', choices: [FOREST], selectedId: 'forest' }),
    ]
    for (const out of outs) {
      for (const tag of out.match(/<p class="[^"]*">[^<]+<\/p>/g) ?? []) {
        expect(tag, tag).toContain('break-keep')
        expect(tag, tag).toContain('wrap-break-word')
      }
      expect(out).not.toContain('text-center')
    }
    const error = row({ kind: 'error' })
    expect(error).toMatch(/<p class="[^"]*break-keep[^"]*wrap-break-word[^"]*">컬렉션 목록을/)
    expect(error).toMatch(/<button[^>]*whitespace-nowrap[^>]*break-keep[^>]*wrap-break-word/)
  })

  it('어느 갈래에도 확률 숫자·퍼센트·진행 수(n/m)·추천 표시가 없다', () => {
    const outs = [
      row({ kind: 'needMaterial' }),
      row({ kind: 'none', rarity: 'rare' }),
      row({ kind: 'error' }),
      row({ kind: 'ready', choices: [FOREST], selectedId: null }),
      row({ kind: 'ready', choices: [FOREST], selectedId: 'forest' }),
    ]
    for (const out of outs) {
      const text = visibleText(out)
      expect(text).not.toMatch(/%|퍼센트|추천|빈칸/)
      expect(text).not.toMatch(/\d+\s*\/\s*\d+/)
    }
  })
})

describe('TierUpCollectionSheetContent', () => {
  const render = (selectedId: string | null, choices = [FOREST, RIVER], onPick: (id: string) => void = noop) =>
    renderToStaticMarkup(<TierUpCollectionSheetContent choices={choices} selectedId={selectedId} onPick={onPick} />)

  it('안내 한 줄 아래에 radiogroup이 있고 이름이 시트 제목과 같다', () => {
    const out = render(null)
    expect(out.indexOf('지금 넣은 재료로 받을 수 있는 컬렉션만 보여요')).toBeLessThan(out.indexOf('role="radiogroup"'))
    expect(out).toContain('role="radiogroup"')
    expect(out).toContain('aria-label="컬렉션 고르기"')
    expect(out).toMatch(/<p class="[^"]*text-sm[^"]*text-foreground[^"]*break-keep[^"]*wrap-break-word[^"]*">지금 넣은 재료로/)
  })

  it('줄마다 role=radio이고, 받은 순서 그대로 한 줄에 컬렉션 하나(세로 1열)다', () => {
    const out = render(null)
    expect(out.match(/role="radio"/g)).toHaveLength(2)
    expect(out.indexOf('숲속 산책 컬렉션')).toBeLessThan(out.indexOf('한강 라이딩 컬렉션'))
    expect(out).toContain('class="flex flex-col gap-2"')
    expect(out).not.toContain('grid-cols')
    // 확인·취소 버튼은 없다
    expect(out).not.toContain('<button')
    expect(visibleText(out)).not.toMatch(/확인|취소/)
  })

  it('고른 줄만 어두운 반전 면(inverse) + aria-checked=true + 체크 아이콘이고, 나머지는 기본 면이다', () => {
    const out = render('river')
    // role="radio"로 자른 두 번째·세 번째 조각이 각각 첫 줄(숲속)과 둘째 줄(한강)이다
    const [, forest, river] = out.split('role="radio"')
    expect(forest).toContain('숲속 산책 컬렉션')
    expect(forest).toContain('aria-checked="false"')
    expect(forest).toContain('background:var(--surface)')
    expect(forest).not.toContain('text-snow')
    expect(river).toContain('한강 라이딩 컬렉션')
    expect(river).toContain('aria-checked="true"')
    expect(river).toContain('background:var(--background-inverse)')
    // 색만으로 전하지 않는다 — 체크 아이콘은 고른 줄에만 하나
    expect(out.match(/class="w-5 h-5 shrink-0 text-snow"/g)).toHaveLength(1)
  })

  it('선택이 없으면 어느 줄도 반전 면이 아니고 체크 아이콘이 없다', () => {
    const out = render(null)
    expect(out).not.toContain('--background-inverse')
    expect(out).not.toContain('text-snow')
    expect(out.match(/aria-checked="false"/g)).toHaveLength(2)
  })

  it('줄은 48×48 이미지 타일(이미지 없으면 책 아이콘)과 최대 2줄 이름이고 패딩 16, 한국어 줄바꿈 클래스를 쓴다', () => {
    const out = render(null)
    expect(out).toContain('padding:var(--spacing-16)')
    expect(out.match(/w-12 h-12 shrink-0 rounded-2xl bg-background-secondary/g)).toHaveLength(2)
    expect(out).toContain('forest.png')
    for (const name of ['숲속 산책 컬렉션', '한강 라이딩 컬렉션']) {
      const tag = out.match(new RegExp(`<span class="[^"]*">${name}</span>`))
      expect(tag, name).not.toBeNull()
      for (const klass of ['text-base', 'font-bold', 'line-clamp-2', 'break-keep', 'wrap-break-word']) expect(tag![0], name).toContain(klass)
    }
    expect(out).not.toContain('text-center')
  })

  it('줄을 누르면 그 컬렉션의 id로 onPick을 부른다', () => {
    const onPick = vi.fn()
    const tree = TierUpCollectionSheetContent({ choices: [FOREST, RIVER], selectedId: null, onPick })
    const cards = findAll(tree, (el) => el.props.role === 'radio')
    expect(cards).toHaveLength(2)
    ;(cards[1].props.onClick as () => void)()
    expect(onPick).toHaveBeenCalledWith('river')
  })

  it('문구에 확률 숫자·퍼센트·진행 수·추천 표시가 없다', () => {
    const text = visibleText(render('forest'))
    expect(text).not.toMatch(/%|퍼센트|추천|빈칸/)
    expect(text).not.toMatch(/\d+\s*\/\s*\d+/)
  })
})

describe('컬렉션 고르기 문구', () => {
  it('승인된 문구 그대로이고 유저 화면에 쓰지 않는 말(아이템북·후보·소각·슬롯)이 없다', () => {
    const copy = d.combine.tierUp.collectionPicker
    expect(copy.label).toBe('받을 컬렉션')
    expect(copy.unselected).toBe('컬렉션을 골라 주세요')
    expect(copy.needMaterial).toBe('재료를 넣으면 컬렉션을 고를 수 있어요')
    expect(copy.none).toBe('지금은 {rarity} 아이템 배지로 받을 수 있는 컬렉션이 없어요. 다른 등급으로 해 보세요.')
    expect(copy.sheetTitle).toBe('컬렉션 고르기')
    expect(copy.sheetNote).toBe('지금 넣은 재료로 받을 수 있는 컬렉션만 보여요')
    expect(copy.loadFailed).toBe('컬렉션 목록을 지금 불러오지 못했어요. 잠시 뒤 다시 불러와 주세요.')
    expect(copy.retry).toBe('다시 불러오기')
    expect(copy.invalidCollection).toBe('고른 컬렉션은 지금 받을 수 없어요. 넣은 재료는 그대로 있어요. 다른 컬렉션을 골라 주세요.')
    expect(Object.values(copy).join('\n')).not.toMatch(/아이템북|후보|소각|슬롯|%|퍼센트/)
    expect(d.combine.tierUp.description).toBe(
      '같은 등급 아이템 배지 5개를 넣고 컬렉션을 고르면, 그 컬렉션의 새 아이템 배지 1개를 받아요. 운이 좋으면 윗등급이 나오고, 아니면 같은 등급이 나와요. Mystic은 넣을 수 없어요.',
    )
  })
})
