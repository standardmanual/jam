/**
 * 컬렉션 격자의 칸 표시 (티켓 20261028_1408)
 *
 * 등급이 정해진 칸은 그 등급의 칩을, 등급이 없는 칸(`tierUndecided`)은 칩을 그리지 않는다. 미보유 칸은 이미지 없는 윤곽 점선·실제 이름·흐림 없음·링크 없음이고
 * 버튼이 없다. 저장소에 jsdom·testing-library가 없어(vitest.config.ts `environment: 'node'`) 서버 렌더로 마크업만 고정한다 —
 * 시트를 여는 판정은 `shouldOpenCandidateSheet`(`lib/itembook/__tests__/tier-badge-slots.test.ts`)가 맡는다.
 *
 * «모두 빼기» 버튼(티켓 20261028_1420)의 노출 조건도 여기서 고정한다: 본인 화면이고 장착 개수(`slotCount`)가 1 이상일 때만 격자 아래에 한 줄로 그린다.
 * 확인 시트(BottomSheet)는 서버 렌더에서 아무것도 그리지 않아(마운트 게이트) 시트 안의 문구·버튼은 `UnslotAllSheet.test.tsx`가 본다.
 * 요청 중 비활성(`bulkBusy`)은 상태 전이라 서버 렌더로는 볼 수 없다 — 요청 흐름은 `runUnslotAll`·`toUnslotAllOutcome` 시험이 맡는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/collections/[id]/__tests__/SlotGrid.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
// 확인 시트가 토스트를 쓴다 — 서버 렌더에는 ToastProvider가 없다
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

import SlotGrid, { type BadgeSlot } from '../SlotGrid'

function cell(name: string, rarity: string, extra: Partial<BadgeSlot> = {}): BadgeSlot {
  return {
    cellKey: name,
    badge: { id: `${name}-${rarity}`, name, image_url: null, rarity },
    candidates: [],
    slot: null,
    ...extra,
  }
}

const candidate = (id: string) => ({ id, serial_number: 1, serial_prefix: 'AAAA', expires_at: null })
const slotted = { id: 's1', slotted_at: '2026-10-28T00:00:00Z', inventory_item_id: 'inv-1' }

/** 우측 상단 «빼기» 원 버튼 — 보이는 글자가 없어 접근 이름으로 센다 */
const REMOVE = 'aria-label="빼기"'
/** 우측 상단 «추가» 원 버튼 */
const ADD = 'aria-label="추가"'

function count(html: string, text: string): number {
  return html.split(text).length - 1
}

describe('SlotGrid — 등급이 정해진 칸', () => {
  const badgeSlots = [
    cell('이름1', 'rare', { slot: slotted }),
    cell('이름2', 'rare', { candidates: [candidate('c1')] }),
    cell('이름3', 'rare'),
  ]

  it('장착된 칸은 우측 상단 «빼기» 원 버튼, 후보가 있는 칸은 «추가» 원 버튼, 미보유 칸은 이름이 보이고 버튼이 없다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} />)

    expect(count(html, REMOVE)).toBe(1)
    // 칸 아래 «빼기» 알약은 없다
    expect(html).not.toContain('>빼기<')
    expect(count(html, ADD)).toBe(1)
    // 칸 아래 알약은 없다
    expect(html).not.toContain('>추가<')
    // 미보유 칸도 원래 이름을 그리고 «???»는 어디에도 없다. 카드 전체 흐림(opacity-30)도 걷었다
    expect(count(html, '>이름3<')).toBe(1)
    expect(html).not.toContain('???')
    expect(html).not.toContain('opacity-30')
    // 미보유 칸은 링크가 없다 — 링크는 장착된 칸과 후보가 있는 칸 둘
    expect(count(html, 'href="/badges/')).toBe(2)
    expect(html).not.toContain('href="/badges/이름3-rare')
  })

  it('등급이 정해졌으면 보유한 칸에 등급 칩을 그린다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} />)

    // 칩은 미보유 칸을 뺀 두 칸에 있다
    expect(count(html, 'Rare')).toBe(2)
  })

  it('타인 열람(readOnly)은 버튼이 없다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} readOnly />)

    expect(html).not.toContain(REMOVE)
    expect(html).not.toContain(ADD)
    expect(html).not.toContain('>교체<')
  })
})

describe('SlotGrid — 칸 알약(교체)의 색은 tone으로 갈린다 (티켓 20261104_2153)', () => {
  const pillOf = (html: string, label: string) => {
    const match = html.match(new RegExp(`<button[^>]*class="([^"]*)"[^>]*>${label}</button>`))
    return match?.[1] ?? ''
  }
  const allPills = () =>
    renderToStaticMarkup(
      <SlotGrid
        itemBookId="book-1"
        badgeSlots={[
          cell('이름1', 'rare', { slot: slotted }),
          cell('이름2', 'rare', { slot: slotted, candidates: [candidate('c1')] }),
          cell('이름3', 'rare', { candidates: [candidate('c2')] }),
        ]}
      />,
    )

  it('«교체»는 accent 면이다', () => {
    const html = allPills()

    for (const label of ['교체']) {
      const pill = pillOf(html, label)
      expect(pill, label).toContain('bg-accent')
      expect(pill, label).toContain('text-accent-foreground')
      expect(pill, label).not.toContain('bg-default')
    }
  })

  it('«교체» 알약은 같은 모양 클래스를 쓰고 SlotGrid에 손으로 쓴 알약 클래스가 남지 않는다', () => {
    const html = allPills()

    const shape = 'block mx-auto px-3 py-1 text-xs rounded-full whitespace-nowrap transition-all disabled:opacity-40'
    for (const label of ['교체']) expect(pillOf(html, label), label).toContain(shape)
    expect(readFileSync(new URL('../SlotGrid.tsx', import.meta.url), 'utf-8')).not.toContain('rounded-full')
  })
})

describe('SlotGrid — 등급이 없는 칸(tierUndecided)', () => {
  const badgeSlots = [
    cell('이름1', 'rare', { candidates: [{ ...candidate('c1'), rarity: 'rare' }, { ...candidate('c2'), rarity: 'epic' }] }),
    cell('이름2', 'common'),
  ]

  it('등급 칩을 그리지 않고 가진 이름은 «추가», 못 가진 이름은 이름만 보인다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} tierUndecided />)

    expect(html).not.toContain('Rare')
    expect(html).not.toContain('Epic')
    expect(count(html, ADD)).toBe(1)
    expect(count(html, '>이름2<')).toBe(1)
    expect(html).not.toContain('???')
    // 가진 이름의 링크는 대표 배지 상세다
    expect(html).toContain('href="/badges/이름1-rare"')
  })

  it('장착 모드에서는 «추가»가 있는 칸만 하이라이트한다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} tierUndecided slotMode />)

    expect(count(html, 'inset_0_0_0_2px_var(--link)')).toBe(1)
  })
})

describe('SlotGrid — 모두 빼기 버튼의 노출 조건 (티켓 20261028_1420)', () => {
  const badgeSlots = [
    cell('이름1', 'rare', { slot: slotted }),
    cell('이름2', 'rare', { candidates: [candidate('c1')] }),
    cell('이름3', 'rare'),
  ]
  const BUTTON = '>한번에 빼기<'

  it('본인 화면에서 장착이 하나라도 있으면 격자 바로 아래에 버튼이 한 번 보인다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} slotCount={1} />)

    expect(count(html, BUTTON)).toBe(1)
    // 격자의 마지막 칸 뒤에 있다
    expect(html.indexOf(BUTTON)).toBeGreaterThan(html.lastIndexOf('href="/badges/'))
    // 검정 채움(Button primary) — outline·흰 면 덮어쓰기는 없다. 격자 폭 전체, 격자와 12px 간격, 라벨은 한 줄
    expect(html).toContain('bg-background-inverse')
    expect(html).not.toContain('bg-surface!')
    expect(html).toContain('w-full')
    expect(html).toContain('mt-3')
    expect(html).toContain('whitespace-nowrap')
  })

  it('장착이 없으면(slotCount 0) 어떤 흔적도 없다 — 값을 주지 않은 기본값도 같다', () => {
    for (const html of [
      renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} slotCount={0} />),
      renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} />),
    ]) {
      expect(html).not.toContain('한번에 빼기')
      expect(html).not.toContain('bg-surface!')
    }
  })

  it('타인 열람(readOnly)은 장착이 있어도 보이지 않는다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} slotCount={3} readOnly />)

    expect(html).not.toContain('한번에 빼기')
  })

  it('삭제된 배지에 꽂힌 장착만 남아 격자에 장착된 칸이 없어도 slotCount가 있으면 보인다', () => {
    const noVisibleSlot = [cell('이름1', 'rare'), cell('이름2', 'rare', { candidates: [candidate('c1')] })]

    const html = renderToStaticMarkup(
      <SlotGrid itemBookId="book-1" badgeSlots={noVisibleSlot} slotCount={1} tierFixed />,
    )

    expect(count(html, REMOVE)).toBe(0)
    expect(count(html, BUTTON)).toBe(1)
  })
})

describe('SlotGrid — 등급 고정 안내 한 줄 (티켓 20261109_0941)', () => {
  const badgeSlots = [cell('이름1', 'rare', { slot: slotted }), cell('이름2', 'rare')]
  const NOTE = '같은 등급 배지만 장착할 수 있어요.'

  it('등급이 정해진 본인 화면이면 격자 아래에 한 줄이 한 번 보이고, 한번에 빼기 버튼보다 앞에 있다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} slotCount={1} tierFixed />)

    expect(count(html, NOTE)).toBe(1)
    expect(html.indexOf(NOTE)).toBeGreaterThan(html.lastIndexOf('href="/badges/'))
    expect(html.indexOf(NOTE)).toBeLessThan(html.indexOf('>한번에 빼기<'))
    // 등급 이름과 풀리는 방법은 말하지 않는다
    expect(html).not.toContain('등급으로 모으고 있어요')
    expect(html).not.toContain('다시 정할 수 있어요')
  })

  it('등급이 없거나(tierFixed 없음) 타인 열람(readOnly)이면 보이지 않는다', () => {
    for (const html of [
      renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} />),
      renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} tierUndecided slotMode />),
      renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={badgeSlots} tierFixed readOnly />),
    ]) {
      expect(html).not.toContain(NOTE)
    }
  })
})

describe('SlotGrid — 우측 상단 빼기 원 버튼 (2026-11-09 사용자 지시)', () => {
  const removeOf = (html: string) => html.match(/<button[^>]*aria-label="빼기"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? ''

  it('검은 원(background-inverse + snow 아이콘, 24px)이고 칸의 우측 상단 안쪽에 놓인다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={[cell('이름1', 'rare', { slot: slotted })]} />)
    const button = removeOf(html)

    expect(button).toContain('rounded-full')
    expect(button).toContain('bg-background-inverse')
    expect(button).toContain('text-snow')
    expect(button).toContain('absolute')
    expect(button).toContain('h-6 w-6')
    // 오른쪽·위 가장자리에서 6px 안쪽이다 — 모서리 밖으로 밀어내지 않는다
    for (const c of ['right-1.5', 'top-1.5']) expect(button, c).toContain(c)
    expect(button).not.toContain('translate')
    expect(button).toContain('<svg')
    expect(button).toContain('M6 12h12')
    // 버튼 안에 글자가 없다 — 이름은 접근 이름이 맡는다
    expect(button.replace(/<svg[\s\S]*?<\/svg>/, '').replace(/<[^>]+>/g, '')).toBe('')
  })

  it('버튼은 링크 안이 아니라 링크와 같은 칸 래퍼 안의 형제다', () => {
    const html = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={[cell('이름1', 'rare', { slot: slotted })]} />)

    expect(html.indexOf(REMOVE)).toBeGreaterThan(html.indexOf('</a>'))
    expect(html).toContain('class="relative flex"')
  })

  it('교체 후보가 있는 장착 칸에도 원 버튼과 «교체»가 함께 있다', () => {
    const html = renderToStaticMarkup(
      <SlotGrid itemBookId="book-1" badgeSlots={[cell('이름1', 'rare', { slot: slotted, candidates: [candidate('c1')] })]} />,
    )

    expect(count(html, REMOVE)).toBe(1)
    expect(count(html, '>교체<')).toBe(1)
  })

  it('장착되지 않은 칸(빈 칸·추가할 수 있는 칸)에는 없다', () => {
    const html = renderToStaticMarkup(
      <SlotGrid itemBookId="book-1" badgeSlots={[cell('이름2', 'rare', { candidates: [candidate('c1')] }), cell('이름3', 'rare')]} />,
    )

    expect(html).not.toContain(REMOVE)
  })
})

describe('SlotGrid — 이미지 정중앙 추가 원 버튼 (2026-11-09 사용자 지시, 2026-11-12 캔버스 확정으로 위치가 모서리에서 정중앙으로 바뀜)', () => {
  const addOf = (html: string) => html.match(/<button[^>]*aria-label="추가"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? ''
  const html = renderToStaticMarkup(
    <SlotGrid
      itemBookId="book-1"
      badgeSlots={[
        cell('이름1', 'rare', { slot: slotted }),
        cell('이름2', 'rare', { candidates: [candidate('c1')] }),
        cell('이름3', 'rare'),
      ]}
    />,
  )

  it('«빼기»와 같은 검은 원이고 «+» 아이콘이며 글자가 없다. 모서리 위치(right-1.5 top-1.5)는 쓰지 않는다', () => {
    const button = addOf(html)

    for (const c of ['rounded-full', 'bg-background-inverse', 'text-snow', 'h-6 w-6', 'pointer-events-auto']) {
      expect(button, c).toContain(c)
    }
    for (const c of ['right-1.5', 'top-1.5', 'translate']) expect(button, c).not.toContain(c)
    expect(button).toContain('M12 6v12M6 12h12')
    expect(button.replace(/<svg[\s\S]*?<\/svg>/, '').replace(/<[^>]+>/g, '')).toBe('')
  })

  it('이미지 상자와 같은 기하의 틀(pointer-events-none, 카드 안쪽 여백 12px) 가운데에 놓인다 — 버튼을 움직이지 않는다', () => {
    const frame = html.match(/<div class="pointer-events-none[^"]*"><div class="[^"]*"><button[^>]*aria-label="추가"/)?.[0] ?? ''

    expect(frame).toContain('pointer-events-none absolute z-10 inset-x-3 top-3')
    expect(frame).toContain('relative mx-auto flex aspect-square w-full max-w-[90px] items-center justify-center')
  })

  it('넣을 수 있는 칸은 회색 이미지 위에 윤곽 점선이 겹치고, 빈 칸은 이미지 없이 점선만이다', () => {
    // 넣을 수 있는 칸(이름2): 이미지 래퍼 뒤에 겹치는 점선(이미지가 없으니 추적 실패 때처럼 아무것도 그리지 않는다, fallback none)
    // 빈 칸(이름3): 이미지 없이 점선만(주소가 없으니 둥근 사각형 점선, fallback box). 장착된 칸(이름1)에는 점선이 없다
    expect(count(html, 'class="absolute inset-0 h-full w-full"')).toBe(1)
    expect(count(html, 'data-outline-state')).toBe(2)
    expect(count(html, 'data-outline-state="none"')).toBe(1)
    expect(count(html, 'data-outline-state="box"')).toBe(1)
  })

  it('읽기 전용(타인 열람)이면 «+» 없이 이미지와 점선만 남는다', () => {
    const readOnlyHtml = renderToStaticMarkup(
      <SlotGrid itemBookId="book-1" readOnly badgeSlots={[cell('이름2', 'rare', { candidates: [candidate('c1')] })]} />,
    )

    expect(readOnlyHtml).not.toContain(ADD)
    expect(readOnlyHtml).toContain('class="absolute inset-0 h-full w-full"')
  })

  it('넣을 수 있는 칸에만 한 번 보이고, 장착된 칸·빈 칸에는 없다. «빼기»는 장착된 칸에만 있다', () => {
    expect(count(html, ADD)).toBe(1)
    expect(count(html, REMOVE)).toBe(1)
    // 추가 버튼은 이름2 칸의 링크 뒤에 있다(링크 안이 아니라 형제)
    expect(html.indexOf(ADD)).toBeGreaterThan(html.indexOf('이름2'))
  })

  it('«교체» 알약은 그대로 남고, 교체 후보가 있는 장착 칸에는 «빼기» 원과 «교체»가 함께 있다', () => {
    const swap = renderToStaticMarkup(
      <SlotGrid itemBookId="book-1" badgeSlots={[cell('이름1', 'rare', { slot: slotted, candidates: [candidate('c1')] })]} />,
    )

    expect(count(swap, '>교체<')).toBe(1)
    expect(count(swap, REMOVE)).toBe(1)
    expect(swap).not.toContain(ADD)
  })
})

describe('SlotGrid — 장착하지 않은 칸의 배지 이름은 그레이다 (2026-11-09 사용자 지시)', () => {
  const nameClassOf = (html: string, name: string) => html.match(new RegExp(`<p class="([^"]*)">${name}</p>`))?.[1] ?? ''
  const html = renderToStaticMarkup(
    <SlotGrid
      itemBookId="book-1"
      badgeSlots={[
        cell('이름1', 'rare', { slot: slotted }),
        cell('이름2', 'rare', { candidates: [candidate('c1')] }),
        cell('이름3', 'rare'),
      ]}
    />,
  )

  it('장착된 칸은 foreground, 추가할 수 있는 칸과 빈 칸은 연한 그레이(muted + opacity-60)다', () => {
    expect(nameClassOf(html, '이름1')).toContain('text-foreground')
    expect(nameClassOf(html, '이름1')).not.toContain('opacity-60')
    for (const name of ['이름2', '이름3']) {
      expect(nameClassOf(html, name), name).toContain('text-muted')
      expect(nameClassOf(html, name), name).toContain('opacity-60')
      expect(nameClassOf(html, name), name).not.toContain('text-foreground')
      // 원시 색 토큰(--base-*)을 직접 쓰지 않는다
      expect(nameClassOf(html, name), name).not.toContain('base-neutral')
    }
  })
})

describe('SlotGrid — 장착하지 않은 칸의 등급 칩은 회색조다 (2026-11-09 사용자 지시)', () => {
  const html = renderToStaticMarkup(
    <SlotGrid
      itemBookId="book-1"
      badgeSlots={[
        cell('이름1', 'rare', { slot: slotted }),
        cell('이름2', 'epic', { candidates: [candidate('c1')] }),
        cell('이름3', 'rare'),
      ]}
    />,
  )
  /** 칩 글자(Rare·Epic)를 그린 `<span>` 태그 전체 */
  const chipTag = (label: string) => html.match(new RegExp(`<span[^>]*>${label}</span>`))?.[0] ?? ''

  it('추가할 수 있는 칸의 칩에는 grayscale이 걸리고, 장착된 칸의 칩에는 걸리지 않는다', () => {
    expect(chipTag('Epic')).toContain('grayscale')
    expect(chipTag('Rare')).not.toContain('grayscale')
    expect(count(html, 'grayscale')).toBe(1 + count(html, 'grayscale opacity-40'))
  })

  it('래퍼를 두지 않는다 — 칩이 아무것도 그리지 않는 칸(Common)에 빈 요소가 남지 않아 칸 높이가 같다', () => {
    expect(html).not.toContain('inline-flex grayscale')
    const common = renderToStaticMarkup(
      <SlotGrid itemBookId="book-1" badgeSlots={[cell('이름4', 'common', { candidates: [candidate('c1')] })]} />,
    )
    const equipped = renderToStaticMarkup(<SlotGrid itemBookId="book-1" badgeSlots={[cell('이름4', 'common', { slot: slotted })]} />)
    // 이름 줄 바로 뒤에 칩 요소가 없다 — 장착 여부와 상관없이 같은 구조다
    const tail = (h: string) => h.slice(h.indexOf('>이름4</p>') + '>이름4</p>'.length, h.indexOf('</a>'))
    expect(tail(common)).toBe(tail(equipped))
  })
})
