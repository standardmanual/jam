/**
 * 등급 올리기 화면 본문 (티켓 20261022_2119 3회, 채원 사전 판정 2026-10-23) — 정적 렌더로 위에서 아래 순서, 상태별 모양, 문구 규칙을 고정한다.
 * 클릭·상태 전환은 `CombineClient.tierUp.test.tsx`가 맡는다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TierUpPanel, { TierUpSheetContent } from './TierUpPanel'
import { buildTierUpSheet, groupTierUpMaterials, type TierUpMaterial } from './tierUpClient'
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

const EMPTY_SLOTS: (TierUpMaterial | null)[] = [null, null, null, null, null]

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
  it('설명, 확률 안내 링크, 슬롯 5칸, 등급 안내 줄, 버튼, 소각 안내가 위에서 아래로 나온다', () => {
    const out = html()
    const order = [
      d.combine.tierUp.description,
      d.capsule.sheet.probabilityLink,
      'grid grid-cols-3 gap-2',
      'aria-live="polite"',
      d.combine.tierUp.submit,
      d.combine.tierUp.burnNotice,
    ].map((needle) => out.indexOf(needle))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('설명 문단은 운이 좋으면 윗등급이 나오고 아니면 같은 등급이 나온다는 문장을 접지 않고 보인다', () => {
    const out = html()
    expect(out).toContain('운이 좋으면 윗등급이 나오고, 아니면 같은 등급이 나와요')
    expect(out).toContain('Mystic은 넣을 수 없어요')
    expect(out).not.toContain('더 보기')
  })

  it('확률 안내 링크는 /probability로 가고 숫자·퍼센트가 어디에도 없다', () => {
    const out = html({ rarityNote: '지금은 Rare 아이템 배지만 넣을 수 있어요', showNoEnoughNotice: true, pendingBlocked: true })
    expect(out).toMatch(/<a [^>]*href="\/probability"[^>]*>확률 안내<\/a>/)
    expect(out).toContain('min-h-11')
    // 슬롯의 인라인 스타일(width:100%)은 글자가 아니므로 태그를 걷어 낸 보이는 글자만 본다
    const visibleText = out.replace(/<[^>]+>/g, ' ')
    expect(visibleText).not.toMatch(/\d\s*%|퍼센트/)
  })

  it('슬롯은 5칸이고 3열(3+2) 그리드다', () => {
    const out = html()
    expect(out.match(/aria-label="슬롯 채우기"/g)).toHaveLength(5)
    expect(out).toContain('class="grid grid-cols-3 gap-2"')
  })

  it('담은 칸은 이름이 보이고 나머지는 빈 칸이다', () => {
    const out = html({ slots: [material('a', 'rare'), null, material('b', 'rare'), null, null] })
    expect(out).toContain('배지 a')
    expect(out).toContain('배지 b')
    expect(out.match(/aria-label="슬롯 채우기"/g)).toHaveLength(3)
    expect(out.match(/aria-label="슬롯에서 빼기"/g)).toHaveLength(2)
  })

  it('담을 수 있는 배지가 하나도 없으면 빈 칸이 모두 잠긴 모양(opacity 0.5)이다', () => {
    const open = html()
    const locked = html({ noMaterials: true })
    expect(open).not.toContain('border:1px dashed')
    expect(locked.match(/border:1px dashed/g)).toHaveLength(5)
  })

  it('제출 중에는 슬롯을 건드릴 수 없다 — 제거 버튼이 없고 칸 클릭 핸들러도 없다', () => {
    const out = html({ slots: [material('a', 'rare'), null, null, null, null], submitting: true })
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

  it('5개 이상 가진 등급이 없을 때만 안내 블록(role status)이 나온다', () => {
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

  it('5개가 찼고 제출 중이 아니고 받지 않은 결과가 없을 때만 활성이다', () => {
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

describe('TierUpPanel 한국어 줄바꿈 (UX 라이팅 §3.2)', () => {
  it('한국어를 그리는 새 요소는 break-keep과 wrap-break-word를 함께 쓴다', () => {
    const out = html({ rarityNote: '지금은 Rare 아이템 배지만 넣을 수 있어요', showNoEnoughNotice: true, pendingBlocked: true })
    for (const text of [
      d.combine.tierUp.description,
      '지금은 Rare 아이템 배지만 넣을 수 있어요',
      d.combine.tierUp.pendingBlockedNote,
      d.combine.tierUp.burnNotice,
      d.capsule.sheet.probabilityLink,
    ]) {
      const tag = out.match(new RegExp(`<(?:p|a)[^>]*>${text}</(?:p|a)>`))
      expect(tag, text).not.toBeNull()
      expect(tag![0], text).toContain('break-keep')
      expect(tag![0], text).toContain('wrap-break-word')
    }
  })
})

describe('TierUpSheetContent', () => {
  const rare7 = many('r', 'rare', 7)
  const common3 = many('c', 'common', 3)
  const groups = groupTierUpMaterials([...common3, ...rare7])
  const render = (sheet: Parameters<typeof TierUpSheetContent<TierUpMaterial>>[0]['sheet']) =>
    renderToStaticMarkup(<TierUpSheetContent<TierUpMaterial> sheet={sheet} onPick={noop} />)

  it('묶음 보기: 등급 글자와 개수를 제목으로 쓰고, 5개 미만 묶음은 이유 줄이 나온다', () => {
    const out = render(buildTierUpSheet(groups, EMPTY_SLOTS))
    expect(out).toContain('Common · 3개')
    expect(out).toContain('Rare · 7개')
    expect(out.indexOf('Common · 3개')).toBeLessThan(out.indexOf('Rare · 7개'))
    // 5개 미만인 Common 묶음에만 이유 줄이 한 번 나온다
    expect(out.split(d.combine.tierUp.groupShort)).toHaveLength(2)
    expect(out).toContain('<section aria-labelledby="tier-up-group-common"')
    expect(out).toContain('<h3 id="tier-up-group-rare"')
  })

  it('묶음 보기: 5개 미만 묶음의 셀은 모두 비활성(opacity-40)이고 «사용 중» 라벨이 없다', () => {
    const out = render(buildTierUpSheet(groupTierUpMaterials(common3), EMPTY_SLOTS))
    expect(out.match(/opacity-40/g)).toHaveLength(3)
    expect(out.match(/disabled=""/g)).toHaveLength(3)
    expect(out).not.toContain(d.combine.bagUsedLabel)
  })

  it('등급 고정 보기: 묶음 제목 없이 위에 한 줄, 담은 셀은 «사용 중»이다', () => {
    const out = render(buildTierUpSheet(groups, [rare7[0], rare7[1], null, null, null]))
    expect(out).toContain('지금은 Rare 아이템 배지만 넣을 수 있어요')
    expect(out).not.toContain('<h3')
    expect(out).not.toContain('Common')
    expect(out.split(d.combine.bagUsedLabel)).toHaveLength(3)
  })

  it('비어 있음: 안내 문구와 아이콘만 나온다', () => {
    const out = render({ kind: 'empty' })
    expect(out).toContain('등급을 올릴 수 있는 아이템 배지가 없어요')
    expect(out).not.toContain('<button')
  })
})
