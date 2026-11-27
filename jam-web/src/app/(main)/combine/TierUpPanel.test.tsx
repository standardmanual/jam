/**
 * 등급 UP 화면 본문 (티켓 20261022_2119 3회, 가차머신 리뉴얼 티켓 20261127_2225) — 정적 렌더로 머신 구성, 막힘 안내, 문구 규칙을 고정한다.
 * 클릭·자동 제출·결과 갈래는 `CombineClient.tierUp.test.tsx`가 맡는다.
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

type PanelProps = Parameters<typeof TierUpPanel<TierUpMaterial>>[0]

function panel(overrides: Partial<PanelProps> = {}) {
  return (
    <TierUpPanel<TierUpMaterial>
      stageRef={null}
      count={0}
      showNoEnoughNotice={false}
      pendingBlocked={false}
      onOpenSheet={noop}
      sheetOpen={false}
      onCloseSheet={noop}
      sheet={{ kind: 'empty' }}
      onPick={noop}
      onAgain={noop}
      onHandoff={noop}
      {...overrides}
    />
  )
}

function html(overrides: Partial<PanelProps> = {}) {
  return renderToStaticMarkup(panel(overrides))
}

/** 가차머신 몸통의 «배지 넣기» 버튼 태그 */
function insertButton(out: string) {
  const match = out.match(/<button[^>]*>배지 넣기<\/button>/)
  return match ? match[0] : ''
}

describe('TierUpPanel 가차머신 구성', () => {
  it('«배지 넣기» 버튼, 돔 안 개수 상자(n/6, BADGE), 행운 문구 1개가 보인다', () => {
    const out = html({ count: 3 })
    expect(insertButton(out)).not.toBe('')
    expect(out).toContain('<b')
    expect(out).toMatch(/<b[^>]*>3<\/b>/)
    expect(out).toContain('BADGE')
    // 서버 렌더는 첫 문구(진입 뒤 클라이언트에서 무작위로 바뀐다)이고 줄바꿈 위치를 따른다
    const [firstLine, secondLine] = d.combine.tierUp.luck[0].split('\n')
    expect(out).toContain(`${firstLine}<br/>${secondLine}`)
  })

  it('슬롯 6칸·제출 버튼·설명 문장·«넣은 배지는 사라져요»가 없다', () => {
    const out = html()
    expect(out).not.toContain('aria-label="슬롯 채우기"')
    expect(out).not.toContain('data-tier-up-slot')
    expect(out).not.toContain('등급 올리기')
    expect(out).not.toContain('같은 등급 배지 6개로 등급 업')
    expect(out).not.toContain('넣은 재료는 사라져요')
    expect(out).not.toContain('넣은 배지는 사라져요')
  })

  it('확률 안내 링크가 없고(2026-11-10 사용자 지시) 숫자·퍼센트가 어디에도 없다', () => {
    const out = html({ showNoEnoughNotice: true, pendingBlocked: true })
    expect(out).not.toContain('/probability')
    expect(out).not.toContain('확률 안내')
    const visibleText = out.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
    expect(visibleText).not.toMatch(/\d\s*%|퍼센트/)
  })

  it('캔버스와 장식 그림은 보조기기에서 숨긴다', () => {
    const out = html()
    expect(out).toMatch(/<canvas[^>]*aria-hidden="true"/)
    expect(out.match(/<svg[^>]*aria-hidden="true"/g)!.length).toBeGreaterThanOrEqual(3)
  })

  it('결과 영역은 연출 전에는 없다(결과가 나온 뒤에만 role=region)', () => {
    expect(html()).not.toContain(`aria-label="${d.combine.tierUp.resultRegion}"`)
  })
})

describe('TierUpPanel 막힘 상태', () => {
  it('막히지 않았으면 «배지 넣기»가 활성이고 안내가 없다', () => {
    const out = html()
    expect(insertButton(out)).not.toContain('disabled=""')
    expect(out).not.toContain(d.combine.tierUp.noEnoughNotice)
    expect(out).not.toContain(d.combine.tierUp.pendingBlockedNote)
  })

  it('받지 않은 믹스 결과가 있으면 버튼이 비활성이고 막힌 이유가 버튼과 aria-describedby로 이어진다', () => {
    const out = html({ pendingBlocked: true })
    expect(insertButton(out)).toContain('disabled=""')
    expect(insertButton(out)).toContain('aria-describedby="tier-up-notices"')
    expect(out).toContain('id="tier-up-notices"')
    expect(out).toContain(d.combine.tierUp.pendingBlockedNote)
    expect(out).toContain('role="status"')
  })

  it('6개 이상 가진 등급이 없으면 버튼이 비활성이고 noEnoughNotice가 나온다', () => {
    const out = html({ showNoEnoughNotice: true })
    expect(insertButton(out)).toContain('disabled=""')
    expect(out).toContain(d.combine.tierUp.noEnoughNotice)
    expect(out).not.toContain(d.combine.tierUp.pendingBlockedNote)
  })

  it('안내 문구는 한국어 줄바꿈 클래스(break-keep, wrap-break-word)를 쓴다', () => {
    const out = html({ showNoEnoughNotice: true, pendingBlocked: true })
    for (const text of [d.combine.tierUp.pendingBlockedNote, d.combine.tierUp.noEnoughNotice]) {
      const tag = out.match(new RegExp(`<p[^>]*>${text}</p>`))
      expect(tag, text).not.toBeNull()
      expect(tag![0], text).toContain('break-keep')
      expect(tag![0], text).toContain('wrap-break-word')
    }
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

describe('TierUpPanel 시트', () => {
  it('시트는 재료 시트 하나뿐이고 열림은 호출부가 정한다', () => {
    const base = panel().props as PanelProps
    const sheets = (props: PanelProps) => findAll(TierUpPanel<TierUpMaterial>(props), (el) => el.type === BottomSheet)
    const closed = sheets({ ...base, sheetOpen: false })
    expect(closed).toHaveLength(1)
    expect(closed[0].props.title).toBe(d.combine.bagTitle)
    expect(closed[0].props.open).toBe(false)
    expect(sheets({ ...base, sheetOpen: true })[0].props.open).toBe(true)
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
