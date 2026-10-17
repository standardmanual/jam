/**
 * 동기화 보류 고르기 화면 (티켓 20261017_1425 2회)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 단계별 화면을 고정한다. 상태 전이와 요청은 순수 로직
 * 시험(`lib/strava/__tests__/pending-pick.test.ts`·`sync-flow.test.ts`)이 맡고, 여기서는 화면이 그 상태를 올바르게 그리는지 본다.
 *
 * 고정하는 것:
 * - 선택 단계: 헤더 제목·보조 문구, 푸터 카운터·«고르지 않은 N개» 안내(안 고른 것이 0개면 숨김)·«N개 담기»(정확히 N개일 때만 활성),
 *   카드마다 토글(`aria-pressed`), 가득 선택이면 안 고른 카드 토글 `aria-disabled`.
 * - 확정 확인: 두 층이 같은 자리에 겹쳐 있고 활성 층만 보인다(비활성 층은 `inert`·`visibility:hidden`).
 * - 제출 중: 닫기 버튼이 막히고(soft disabled) 확정 버튼이 «담는 중» 라벨의 loading이다.
 * - 오류: footer 위 인라인 `role="alert"`.
 * - 칸 0: 캐러셀 없이 안내 카드, «나중에»·«받지 않고 닫기» 두 버튼.
 * - 로딩·닫힘: 로딩은 status, 닫힘은 숨은 라이브 리전만.
 * - 문구는 `d.syncPending.pick.*`에 있고 «확인» CTA가 없다. 하드코딩 색이 없다.
 * - 프로바이더 없는 곳에서 `usePendingItemsPicker().openPicker()`는 'dismissed'다. 프로바이더는 닫힌 채로 자식을 그린다.
 * - `SyncButton`은 프로바이더 없이도 초기 렌더가 깨지지 않는다.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import { PendingItemsPickView, type PendingItemsPickViewProps } from './PendingItemsPickOverlay'
import PendingItemsPickerProvider, { usePendingItemsPicker } from './PendingItemsPickerProvider'
import SyncButton from '@/components/SyncButton'
import { d, t } from '@/lib/i18n'
import type { PendingItemsPayload } from '@/lib/strava/pending-items-contract'

const payload = (over: Partial<PendingItemsPayload> = {}): PendingItemsPayload => ({
  pendingCount: 3,
  freeSlots: 2,
  chooseCount: 2,
  items: [
    { id: 'p1', badgeId: 'b1', name: '바람의 깃', imageUrl: null, rarity: 'rare' },
    { id: 'p2', badgeId: 'b2', name: '들꽃', imageUrl: null, rarity: 'common' },
    { id: 'p3', badgeId: 'b3', name: '새벽 안개', imageUrl: null, rarity: 'epic' },
  ],
  ...over,
})

function view(over: Partial<PendingItemsPickViewProps> = {}): string {
  const noop = () => {}
  return renderToStaticMarkup(
    <PendingItemsPickView
      open
      phase="ready"
      payload={payload()}
      selected={[]}
      confirming={false}
      submitting={false}
      errorText={null}
      cardWidth={292}
      titleId="title-id"
      headerRef={createRef<HTMLDivElement>()}
      footerRef={createRef<HTMLDivElement>()}
      laterButtonRef={createRef<HTMLDivElement>()}
      onToggle={noop}
      onLater={noop}
      onOpenConfirm={noop}
      onBack={noop}
      onSubmitSelected={noop}
      onDiscardAll={noop}
      {...over}
    />
  )
}

/** `aria-label`이 `label`인 버튼(아이콘 버튼)의 태그. 없으면 null */
function iconButtonTag(html: string, label: string): string | null {
  const match = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))
  return match ? match[0] : null
}

/** 라벨이 `label`인 버튼의 여는 태그. 없으면 null */
function buttonTag(html: string, label: string): string | null {
  const match = html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*?${label}(?:(?!</button>).)*?</button>`))
  return match ? match[0] : null
}

describe('선택 단계', () => {
  it('헤더에 제목과 보조 문구가 있다', () => {
    const html = view()

    expect(html).toContain(t(d.syncPending.pick.title, { n: 2 }))
    expect(html).toContain(t(d.syncPending.pick.subtitle, { total: 3 }))
  })

  it('푸터에 카운터와 고르지 않은 개수 안내, «N개 담기»가 있다', () => {
    const html = view({ selected: ['p1'] })

    expect(html).toContain(t(d.syncPending.pick.counter, { k: 1, n: 2 }))
    expect(html).toContain(t(d.syncPending.pick.unselectedNote, { count: 1 }))
    expect(html).toContain(t(d.syncPending.pick.confirmCta, { n: 2 }))
  })

  it('카운터는 aria-live=polite 한 줄이다', () => {
    const html = view()

    expect(html).toMatch(new RegExp(`<p aria-live="polite"[^>]*>${t(d.syncPending.pick.counter, { k: 0, n: 2 })}</p>`))
  })

  it('고른 수가 빈칸 수와 정확히 같을 때만 «담기»가 활성이다', () => {
    const cta = t(d.syncPending.pick.confirmCta, { n: 2 })
    const disabled = (selected: string[]) => /disabled=""/.test(buttonTag(view({ selected }), cta) ?? '')

    expect(disabled([])).toBe(true)
    expect(disabled(['p1'])).toBe(true)
    expect(disabled(['p1', 'p2'])).toBe(false)
  })

  it('카드마다 토글이 있고 골랐으면 골랐어요·aria-pressed=true다', () => {
    const html = view({ selected: ['p2'] })

    expect(html.match(/data-select-toggle/g)).toHaveLength(3)
    expect(html).toContain(`>${d.syncPending.pick.toggleSelected}<`)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2)
  })

  it('가득 선택하면 안 고른 카드의 토글만 aria-disabled다', () => {
    const html = view({ selected: ['p1', 'p2'] })

    expect(html.match(/data-select-toggle="" [^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-select-toggle/g)).toHaveLength(1)
  })

  it('안 고른 것이 0개(칸이 보류 이상)이면 고르지 않은 안내를 숨긴다', () => {
    const html = view({ payload: payload({ freeSlots: 5, chooseCount: 3 }), selected: ['p1', 'p2', 'p3'] })

    expect(html).not.toContain('받을 수 없어요')
    expect(html).not.toContain(t(d.syncPending.pick.unselectedNote, { count: 0 }))
  })

  it('보류 개체는 각자 별개 카드다(같은 배지라도 id가 다르다)', () => {
    const items = [
      { id: 'p1', badgeId: 'same', name: '들꽃', imageUrl: null, rarity: 'common' as const },
      { id: 'p2', badgeId: 'same', name: '들꽃', imageUrl: null, rarity: 'common' as const },
      { id: 'p3', badgeId: 'same', name: '들꽃', imageUrl: null, rarity: 'common' as const },
    ]
    const html = view({ payload: payload({ items }) })

    expect(html.match(/data-select-toggle/g)).toHaveLength(3)
  })

  it('«현재 카드 순서» 같은 새 요소를 만들지 않는다', () => {
    const html = view()

    expect(html).not.toMatch(/\d+\/3 ?장/)
  })
})

describe('확정 확인', () => {
  it('확정 확인 층에 제목·본문·두 버튼이 있다', () => {
    const html = view({ selected: ['p1', 'p2'], confirming: true })

    expect(html).toContain(t(d.syncPending.pick.confirmTitle, { n: 2 }))
    expect(html).toContain(t(d.syncPending.pick.confirmBody, { m: 1 }))
    expect(html).toContain(d.syncPending.pick.confirmBack)
  })

  it('활성 층만 보이고 비활성 층은 inert·hidden이다(같은 자리에 겹쳐 높이가 흔들리지 않는다)', () => {
    const pick = view({ selected: ['p1', 'p2'], confirming: false })
    const confirm = view({ selected: ['p1', 'p2'], confirming: true })

    // 두 층이 항상 DOM에 있다
    for (const html of [pick, confirm]) {
      expect(html.match(/grid-area:1 \/ 1/g)).toHaveLength(2)
      expect(html.match(/inert=""/g)).toHaveLength(1)
      expect(html.match(/(?<![-\w])visibility:hidden/g)).toHaveLength(1)
    }
    // 선택 단계에서는 확정 확인 층이, 확정 확인 단계에서는 선택 층이 비활성이다
    expect(pick.indexOf('inert=""')).toBeGreaterThan(pick.indexOf(t(d.syncPending.pick.counter, { k: 2, n: 2 })))
    expect(confirm.indexOf('inert=""')).toBeLessThan(confirm.indexOf(t(d.syncPending.pick.confirmTitle, { n: 2 })))
  })

  it('안 고른 것이 0개이면 확정 확인 본문을 쓰지 않는다', () => {
    const html = view({ payload: payload({ freeSlots: 5, chooseCount: 3 }), selected: ['p1', 'p2', 'p3'], confirming: true })

    expect(html).not.toContain('다시 받을 수도 없어요')
  })
})

describe('제출 중과 오류', () => {
  it('제출 중이면 닫기 버튼이 막히고 확정 버튼이 «담는 중» loading이다', () => {
    const html = view({ selected: ['p1', 'p2'], confirming: true, submitting: true })

    expect(iconButtonTag(html, d.syncPending.pick.fullLater)).toMatch(/aria-disabled="true"/)
    const submit = buttonTag(html, d.syncPending.pick.submitting)
    expect(submit).toMatch(/aria-busy="true"/)
    expect(submit).toMatch(/disabled=""/)
    // 다시 고르기도 막힌다
    expect(buttonTag(html, d.syncPending.pick.confirmBack)).toMatch(/disabled=""/)
  })

  it('제출 중이 아니면 닫기 버튼이 막히지 않는다', () => {
    const html = view({ selected: ['p1', 'p2'], confirming: true })

    expect(iconButtonTag(html, d.syncPending.pick.fullLater)).not.toMatch(/aria-disabled="true"/)
  })

  it('오류는 푸터 위에 role=alert 인라인 문구로 보인다', () => {
    const html = view({ errorText: d.syncPending.wrongCount })

    expect(html).toMatch(new RegExp(`<p role="alert"[^>]*>${d.syncPending.wrongCount}</p>`))
    expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf(t(d.syncPending.pick.counter, { k: 0, n: 2 })))
  })

  it('오류가 없으면 alert가 없다', () => {
    expect(view()).not.toContain('role="alert"')
  })
})

describe('칸 0 안내', () => {
  const full = () => view({ phase: 'full', payload: payload({ freeSlots: 0, chooseCount: 0 }) })

  it('캐러셀 없이 안내 카드와 두 버튼이 있다', () => {
    const html = full()

    expect(html).toContain(d.syncPending.pick.fullTitle)
    expect(html).toContain(t(d.syncPending.pick.fullBody, { total: 3 }))
    expect(html).toContain(d.syncPending.pick.fullLater)
    expect(html).toContain(d.syncPending.pick.fullDiscard)
    expect(html).not.toContain('aria-roledescription="carousel"')
    expect(html).not.toContain('data-select-toggle')
  })

  it('안내 본문이 «나중에»는 보류를 남기고 «받지 않고 닫기»만 되돌릴 수 없다고 구분해 말한다', () => {
    const body = t(d.syncPending.pick.fullBody, { total: 3 })

    expect(body).toContain('다시 열면 고를 수 있어요')
    expect(body).toContain('받지 않고 닫으면')
    expect(body).toContain('다시 받을 수 없어요')
  })

  it('다이얼로그가 제목에 연결돼 있다', () => {
    expect(full()).toMatch(/role="dialog"[^>]*aria-labelledby="title-id"/)
  })
})

describe('로딩과 닫힘', () => {
  it('로딩은 status와 스크린리더 문구다', () => {
    const html = view({ phase: 'loading', payload: null })

    expect(html).toContain('role="status"')
    expect(html).toContain(d.syncPending.pick.loading)
    expect(html).not.toContain('role="dialog"')
  })

  it('닫혀 있으면 숨은 라이브 리전만 있다', () => {
    const html = view({ open: false })

    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain(d.syncPending.pick.fullLater)
  })

  it('열리면 라이브 리전이 몇 개를 골라야 하는지 알린다', () => {
    const html = view()

    expect(html).toContain(`${t(d.syncPending.pick.title, { n: 2 })}. ${t(d.syncPending.pick.subtitle, { total: 3 })}`)
  })
})

describe('문구와 스타일 규칙', () => {
  it('버튼 라벨에 «확인»이 없다(동사형 라벨만 쓴다)', () => {
    const pick = view({ selected: ['p1', 'p2'] })
    const confirm = view({ selected: ['p1', 'p2'], confirming: true })
    const full = view({ phase: 'full', payload: payload({ chooseCount: 0, freeSlots: 0 }) })

    for (const html of [pick, confirm, full]) {
      for (const [, label] of html.matchAll(/<button[^>]*>((?:(?!<\/button>).)*)<\/button>/g)) {
        expect(label.replace(/<[^>]+>/g, '')).not.toContain('확인')
      }
    }
  })

  it('고르기 문구가 모두 d.syncPending.pick에 있고 «고르기»·«골랐어요»·«나중에» 같은 라벨이 사전 값과 같다', () => {
    expect(d.syncPending.pick.toggleSelect).toBe('고르기')
    expect(d.syncPending.pick.toggleSelected).toBe('골랐어요')
    expect(d.syncPending.pick.confirmBack).toBe('다시 고르기')
    expect(d.syncPending.pick.fullLater).toBe('나중에')
    expect(d.syncPending.pick.fullDiscard).toBe('받지 않고 닫기')
  })

  it('제목 문구에 마침표가 없다', () => {
    for (const title of [d.syncPending.pick.title, d.syncPending.pick.confirmTitle, d.syncPending.pick.fullTitle]) {
      expect(title.endsWith('.')).toBe(false)
    }
  })

  it('렌더 결과와 소스에 하드코딩 색이 없다', () => {
    const html = view({ selected: ['p1'] }) + view({ phase: 'full', payload: payload({ chooseCount: 0, freeSlots: 0 }) })
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(html).not.toMatch(/rgba?\(/)

    const dir = fileURLToPath(new URL('.', import.meta.url))
    for (const file of ['PendingItemsPickOverlay.tsx', 'PendingItemsPickerProvider.tsx']) {
      const source = readFileSync(join(dir, file), 'utf8')
      expect(source).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/)
      expect(source).not.toMatch(/\brgba?\(/)
    }
  })

  it('한국어 문구 요소에 줄바꿈 클래스(break-keep·wrap-break-word)가 붙는다', () => {
    const html = view({ selected: ['p1', 'p2'], confirming: true })

    expect(html).toContain('break-keep wrap-break-word text-balance')
    expect(html).toContain('break-keep wrap-break-word text-pretty')
  })
})

describe('프로바이더', () => {
  it('프로바이더가 없는 곳에서 훅은 dismissed를 돌려준다(안전 기본값)', async () => {
    let result: Promise<string> | null = null
    function Probe() {
      result = usePendingItemsPicker().openPicker()
      return null
    }

    renderToStaticMarkup(<Probe />)

    await expect(result).resolves.toBe('dismissed')
  })

  it('프로바이더는 닫힌 채로 자식을 그리고 고르기 화면을 미리 열지 않는다', () => {
    const html = renderToStaticMarkup(
      <PendingItemsPickerProvider initialPendingCount={2}>
        <span>자식</span>
      </PendingItemsPickerProvider>
    )

    expect(html).toContain('자식')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('role="status"')
  })
})

describe('SyncButton', () => {
  it('프로바이더 없이도 초기 렌더가 깨지지 않고 동기화 버튼이 보인다', () => {
    const html = renderToStaticMarkup(<SyncButton username="runner" />)

    expect(html).toContain(d.today.syncButton)
    expect(html).not.toContain('role="dialog"')
  })
})
