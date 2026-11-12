/**
 * 등급 올리기 화면 본문 (티켓 20261022_2119 3회, 채원 사전 판정 2026-10-23) — 정적 렌더로 위에서 아래 순서, 상태별 모양, 문구 규칙을 고정한다.
 * 클릭·상태 전환은 `CombineClient.tierUp.test.tsx`가 맡는다.
 */
import { describe, it, expect, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TierUpPanel, { TierUpSheetContent } from './TierUpPanel'
import BottomSheet from '@/components/ui/BottomSheet'
import {
  buildTierUpSheet,
  groupTierUpMaterials,
  type TierUpMaterial,
} from './tierUpClient'
import { d } from '@/lib/i18n'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/combine',
  useSearchParams: () => new URLSearchParams(),
}))

const noop = () => {}

function material(id: string, rarity: string): TierUpMaterial {
  return { id, badge: { name: `배지 ${id}`, image_url: null, rarity } }
}

function many(prefix: string, rarity: string, count: number): TierUpMaterial[] {
  return Array.from({ length: count }, (_, i) => material(`${prefix}${i + 1}`, rarity))
}

const EMPTY_SLOTS: (TierUpMaterial | null)[] = [null, null, null, null, null, null]

function panel(overrides: Partial<Parameters<typeof TierUpPanel<TierUpMaterial>>[0]> = {}) {
  return (
    <TierUpPanel<TierUpMaterial>
      slots={EMPTY_SLOTS}
      noMaterials={false}
      rarityNote={null}
      showNoEnoughNotice={false}
      canSubmit={false}
      submitting={false}
      pendingBlocked={false}
      onOpenSheet={noop}
      onRemove={noop}
      onSubmit={noop}
      sheetOpen={false}
      onCloseSheet={noop}
      sheet={{ kind: 'empty' }}
      onPick={noop}
      {...overrides}
    />
  )
}

function html(overrides: Partial<Parameters<typeof TierUpPanel<TierUpMaterial>>[0]> = {}) {
  return renderToStaticMarkup(panel(overrides))
}

describe('TierUpPanel 본문 순서', () => {
  it('설명, 슬롯 6칸, 등급 안내 줄, 버튼, 소각 안내가 위에서 아래로 나온다', () => {
    const out = html()
    const order = [
      d.combine.tierUp.description,
      'grid grid-cols-3 gap-2',
      'aria-live="polite"',
      d.combine.tierUp.submit,
      d.combine.tierUp.burnNotice,
    ].map((needle) => out.indexOf(needle))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('설명 문단은 «같은 등급 배지 6개로 등급 업! 도전!» 한 줄을 접지 않고 보이고 «운이 좋으면»·«올랐어요»로 꾸미지 않는다', () => {
    const out = html()
    expect(out).toContain('같은 등급 배지 6개로 등급 업! 도전!')
    // 안내 문장은 가운데 정렬이다(2026-11-12 사용자 지시)
    expect(out).toMatch(/<p class="[^"]*text-center[^"]*">같은 등급 배지 6개로 등급 업! 도전!<\/p>/)
    expect(out).not.toContain('운이 좋')
    expect(out).not.toContain('레벨업')
    expect(out).not.toContain('Mystic은 넣을 수 없어요')
    expect(out).not.toContain('더 보기')
  })

  it('확률 안내 링크가 없고(2026-11-10 사용자 지시) 숫자·퍼센트가 어디에도 없다', () => {
    const out = html({ rarityNote: '지금은 Rare 아이템 배지만 넣을 수 있어요', showNoEnoughNotice: true, pendingBlocked: true })
    expect(out).not.toContain('/probability')
    expect(out).not.toContain('확률 안내')
    // 슬롯의 인라인 스타일(width:100%)은 글자가 아니므로 태그를 걷어 낸 보이는 글자만 본다
    const visibleText = out.replace(/<[^>]+>/g, ' ')
    expect(visibleText).not.toMatch(/\d\s*%|퍼센트/)
  })

  it('슬롯은 6칸이고 3열(3+3) 그리드다', () => {
    const out = html()
    expect(out.match(/aria-label="슬롯 채우기"/g)).toHaveLength(6)
    expect(out).toContain('class="grid grid-cols-3 gap-2"')
  })

  it('빈 칸은 정중앙의 검은 원(24px, background-inverse) 안 흰 «+»다 — 원 없는 foreground 플러스가 아니다 (티켓 20261112_1627)', () => {
    const out = html()
    expect(out.match(/background:var\(--background-inverse\)/g)).toHaveLength(6)
    expect(out.match(/M12 6v12M6 12h12/g)).toHaveLength(6)
    expect(out.match(/stroke-width="4.5"/g)).toHaveLength(6)
    expect(out).not.toContain('viewBox="0 -960 960 960"')
    expect(out).not.toContain('fill="var(--foreground)"')
  })

  it('담은 칸은 이름이 보이고 나머지는 빈 칸이다', () => {
    const out = html({ slots: [material('a', 'rare'), null, material('b', 'rare'), null, null, null] })
    expect(out).toContain('배지 a')
    expect(out).toContain('배지 b')
    expect(out.match(/aria-label="슬롯 채우기"/g)).toHaveLength(4)
    expect(out.match(/aria-label="슬롯에서 빼기"/g)).toHaveLength(2)
  })

  it('담을 수 있는 배지가 하나도 없으면 빈 칸이 모두 잠긴 모양(opacity 0.5)이다', () => {
    const open = html()
    const locked = html({ noMaterials: true })
    expect(open).not.toContain('border:1px dashed')
    expect(locked.match(/border:1px dashed/g)).toHaveLength(6)
  })

  it('제출 중에는 슬롯을 건드릴 수 없다 — 제거 버튼이 없고 칸 클릭 핸들러도 없다', () => {
    const out = html({ slots: [material('a', 'rare'), null, null, null, null, null], submitting: true })
    expect(out).not.toContain('aria-label="슬롯에서 빼기"')
    expect(out).not.toContain('cursor:pointer')
  })
})

describe('TierUpPanel 등급 안내 줄과 안내 블록', () => {
  it('등급 안내 줄은 값이 없어도 자리를 잡고 aria-live(polite)다', () => {
    const out = html({ rarityNote: null })
    expect(out).toMatch(/<p aria-live="polite" class="[^"]*min-h-5[^"]*"><\/p>/)
  })

  it('첫 재료를 담으면 같은 줄에 «지금은 {등급} 아이템 배지만 넣을 수 있어요»가 나온다', () => {
    expect(html({ rarityNote: '지금은 Rare 아이템 배지만 넣을 수 있어요' })).toContain('지금은 Rare 아이템 배지만 넣을 수 있어요')
  })

  it('6개 이상 가진 등급이 없을 때만 안내 블록(role status)이 나온다', () => {
    expect(html({ showNoEnoughNotice: false })).not.toContain(d.combine.tierUp.noEnoughNotice)
    const out = html({ showNoEnoughNotice: true })
    expect(out).toContain(d.combine.tierUp.noEnoughNotice)
    expect(out).toContain('role="status"')
  })
})

describe('TierUpPanel 제출 버튼', () => {
  function button(overrides: Partial<Parameters<typeof TierUpPanel<TierUpMaterial>>[0]> = {}) {
    const out = html(overrides)
    const match = out.match(/<button[^>]*max-w-\[220px\][^>]*>[\s\S]*?<\/button>/)
    return match ? match[0] : ''
  }

  it('6개가 찼고 제출 중이 아니고 받지 않은 결과가 없을 때만 활성이다', () => {
    expect(button({ canSubmit: true })).not.toContain('disabled=""')
    expect(button({ canSubmit: false })).toContain('disabled=""')
    expect(button({ canSubmit: true, submitting: true })).toContain('disabled=""')
    expect(button({ canSubmit: true, pendingBlocked: true })).toContain('disabled=""')
  })

  it('제출 중에는 스피너와 «등급을 올리는 중»이 나온다', () => {
    const out = button({ canSubmit: true, submitting: true })
    expect(out).toContain('animate-spin')
    expect(out).toContain('등급을 올리는 중')
    expect(button()).toContain('>등급 올리기<')
  })

  it('받지 않은 결과가 있으면 막힌 이유가 foreground 글자로 나오고 버튼이 aria-describedby로 잇는다', () => {
    const out = html({ canSubmit: true, pendingBlocked: true })
    expect(out).toContain('aria-describedby="tier-up-pending-note"')
    expect(out).toMatch(/<p id="tier-up-pending-note" class="[^"]*text-foreground[^"]*">받지 않은 믹스 결과를 받으면 등급을 올릴 수 있어요<\/p>/)
    expect(html({ pendingBlocked: false })).not.toContain('tier-up-pending-note')
  })

  it('«넣은 재료는 사라져요»가 muted 글자로 항상 나온다', () => {
    expect(html()).toMatch(/<p class="[^"]*text-muted[^"]*">넣은 재료는 사라져요<\/p>/)
  })
})

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

describe('TierUpPanel 컬렉션 선택 없음 (티켓 20261108_2322)', () => {
  it('받을 컬렉션 행·고르기 문구·다시 불러오기가 어느 상태에도 없다', () => {
    for (const overrides of [{}, { showNoEnoughNotice: true }, { submitting: true }, { rarityNote: '지금은 Rare 아이템 배지만 넣을 수 있어요' }]) {
      const out = html(overrides)
      expect(out).not.toContain('받을 컬렉션')
      expect(out).not.toContain('컬렉션을 골라')
      expect(out).not.toContain('컬렉션 고르기')
      expect(out).not.toContain('다시 불러오기')
    }
  })

  it('등급 안내 줄이 aria-live(polite) 하나뿐이다 — 컬렉션 행의 래퍼가 없다', () => {
    expect(html().match(/aria-live="polite"/g)).toHaveLength(1)
    expect(html({ showNoEnoughNotice: true }).match(/aria-live="polite"/g)).toHaveLength(1)
  })

  it('시트는 재료 시트 하나뿐이고 열림은 호출부가 정한다', () => {
    const base = panel().props as Parameters<typeof TierUpPanel<TierUpMaterial>>[0]
    const sheets = (props: Parameters<typeof TierUpPanel<TierUpMaterial>>[0]) =>
      findAll(TierUpPanel<TierUpMaterial>(props), (el) => el.type === BottomSheet)
    const closed = sheets({ ...base, sheetOpen: false })
    expect(closed).toHaveLength(1)
    expect(closed[0].props.title).toBe(d.combine.bagTitle)
    expect(closed[0].props.open).toBe(false)
    expect(sheets({ ...base, sheetOpen: true })[0].props.open).toBe(true)
  })

  it('확률 숫자·퍼센트가 어디에도 없다', () => {
    const visibleText = html({ showNoEnoughNotice: true, pendingBlocked: true }).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
    expect(visibleText).not.toMatch(/\d\s*%|퍼센트/)
  })
})

describe('TierUpPanel 한국어 줄바꿈 (UX 라이팅 §3.2)', () => {
  it('한국어를 그리는 새 요소는 break-keep과 wrap-break-word를 함께 쓴다', () => {
    const out = html({ rarityNote: '지금은 Rare 아이템 배지만 넣을 수 있어요', showNoEnoughNotice: true, pendingBlocked: true })
    for (const text of [
      d.combine.tierUp.description,
      '지금은 Rare 아이템 배지만 넣을 수 있어요',
      d.combine.tierUp.pendingBlockedNote,
      d.combine.tierUp.burnNotice,
    ]) {
      const tag = out.match(new RegExp(`<p[^>]*>${text}</p>`))
      expect(tag, text).not.toBeNull()
      expect(tag![0], text).toContain('break-keep')
      expect(tag![0], text).toContain('wrap-break-word')
    }
  })
})

describe('TierUpSheetContent', () => {
  const rare7 = many('r', 'rare', 7)
  const common3 = many('c', 'common', 3)
  const mystic6 = many('m', 'mystic', 6)
  const groups = groupTierUpMaterials([...common3, ...rare7, ...mystic6])
  const render = (sheet: Parameters<typeof TierUpSheetContent<TierUpMaterial>>[0]['sheet']) =>
    renderToStaticMarkup(<TierUpSheetContent<TierUpMaterial> sheet={sheet} onPick={noop} />)

  it('묶음 보기: 묶음 제목은 등급 칩 하나이고 개수·이유 줄은 없다 (캔버스 «JAM! 바텀시트» 08번, 티켓 20261110_2150)', () => {
    const out = render(buildTierUpSheet(groups, EMPTY_SLOTS))
    expect(out.indexOf('Common')).toBeGreaterThan(-1)
    expect(out.indexOf('Common')).toBeLessThan(out.indexOf('Rare'))
    expect(out.indexOf('Rare')).toBeLessThan(out.indexOf('Mystic'))
    expect(out).not.toContain('Common · 3개')
    expect(out).not.toContain(d.combine.tierUp.groupShort)
    expect(out).toContain('<section aria-labelledby="tier-up-group-common"')
    expect(out).toContain('<h3 id="tier-up-group-rare"')
    expect(out).toContain('<h3 id="tier-up-group-mystic"')
    // 등급 칩은 가로 가운데다(2026-11-12 사용자 지시, 캔버스 «등급 올리기 · 슬롯을 눌렀을 때»)
    expect(out.match(/<h3 [^>]*class="m-0 flex items-center justify-center"/g)).toHaveLength(3)
  })

  it('묶음 보기: 6개 미만 묶음의 셀은 모두 비활성(opacity-40)이고 «추가됨» 칩이 없다', () => {
    const out = render(buildTierUpSheet(groupTierUpMaterials(common3), EMPTY_SLOTS))
    expect(out.match(/opacity-40/g)).toHaveLength(3)
    expect(out).not.toContain('<button')
    expect(out).not.toContain(d.combine.bagUsedLabel)
  })

  it('등급 고정 보기: 묶음 제목 없이 위에 한 줄, 담은 셀은 «추가됨» 칩이다', () => {
    const out = render(buildTierUpSheet(groups, [rare7[0], rare7[1], null, null, null, null]))
    expect(out).toContain('지금은 Rare 아이템 배지만 넣을 수 있어요')
    // 안내 한 줄은 가운데 정렬이다(2026-11-12 사용자 지시)
    expect(out).toMatch(/<p class="[^"]*text-center[^"]*">지금은 Rare 아이템 배지만 넣을 수 있어요<\/p>/)
    expect(out).not.toContain('<h3')
    expect(out).not.toContain('Common')
    expect(out).not.toContain('Mystic')
    expect(out.split(d.combine.bagUsedLabel)).toHaveLength(3)
  })

  it('등급 고정 보기: Mystic을 첫 재료로 담으면 Mystic 안내 한 줄과 Mystic 셀만 나온다', () => {
    const out = render(buildTierUpSheet(groups, [mystic6[0], null, null, null, null, null]))
    expect(out).toContain('지금은 Mystic 아이템 배지만 넣을 수 있어요')
    expect(out).not.toContain('Rare')
    expect(out.split(d.combine.bagUsedLabel)).toHaveLength(2)
    expect(out.match(/배지 m\d/g)).toHaveLength(6)
  })

  it('비어 있음: 안내 문구와 아이콘만 나온다', () => {
    const out = render({ kind: 'empty' })
    expect(out).toContain('등급을 올릴 수 있는 아이템 배지가 없어요')
    expect(out).not.toContain('<button')
  })
})
