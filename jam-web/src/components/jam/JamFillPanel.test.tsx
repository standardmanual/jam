/**
 * 공용 잼 채우기 입력 (티켓 20261018_0054 1회) — 서버 렌더로 화면을 고정한다.
 * 값 보정 로직은 `lib/jam/__tests__/jam-fill.test.ts`가 맡는다.
 *
 * 실행: cd jam-web && npx vitest run src/components/jam/JamFillPanel.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import JamFillPanel from './JamFillPanel'
import JamBalance from './JamBalance'
import { d, t } from '@/lib/i18n'

function render(over: { remaining?: number; balance?: number; pending?: boolean } = {}): string {
  return renderToStaticMarkup(
    <JamFillPanel remaining={over.remaining ?? 180} balance={over.balance ?? 500} pending={over.pending ?? false} onConfirm={() => {}} />
  )
}
const textOf = (html: string) => html.replace(/<[^>]*>/g, '')

describe('숫자 입력창', () => {
  it('숫자 키패드, 완료 키, 16px 이상 글자(text-base 토큰), 48px 이상 높이를 쓴다', () => {
    const html = render()
    expect(html).toContain('inputMode="numeric"')
    expect(html).toContain('enterKeyHint="done"')
    expect(html).toMatch(/autocomplete="off"/i)
    expect(html).toContain('font-size:var(--text-base)')
    // DS Input의 44px를 클래스(중요도 지정)로 올린다
    expect(html).toContain('h-12!')
    expect(html).toContain('tabular-nums')
  })

  it('입력창에 스크린리더 이름과 설명(한 줄 안내)이 연결된다', () => {
    const html = render()
    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(describedBy).toBeTruthy()
    expect(html).toContain(`aria-label="${d.capsule.fill.amountLabel}"`)
    expect(html).toContain(`id="${describedBy}"`)
  })

  it('기본값은 남은 양이다', () => {
    expect(render({ remaining: 180, balance: 500 })).toContain('value="180"')
  })

  it('가진 잼이 남은 양보다 적으면 기본값은 가진 양이다', () => {
    expect(render({ remaining: 180, balance: 40 })).toContain('value="40"')
  })
})

describe('안내 한 줄과 버튼', () => {
  it('«잼 {n}만큼 채워요. 채운 잼은 다시 꺼낼 수 없어요.»가 입력값으로 나온다', () => {
    expect(textOf(render({ remaining: 1200, balance: 5000 }))).toContain(t(d.capsule.fill.hint, { n: '1,200' }))
  })

  it('«채우기»는 활성이다', () => {
    const html = render()
    expect(textOf(html)).toContain(d.capsule.fill.submit)
    expect(html).toContain('type="submit"')
    expect(html).not.toContain('disabled=""')
  })

  it('입력할 수 있는 양이 0이면 값이 비고 «채우기»가 비활성이며 입력 안내가 나온다', () => {
    const html = render({ balance: 0 })
    expect(html).toContain('value=""')
    expect(html).toContain('disabled=""')
    expect(textOf(html)).toContain(d.capsule.fill.hintInvalid)
  })

  it('제출 중에는 «채우는 중»이고 입력과 버튼이 막힌다', () => {
    const html = render({ pending: true })
    expect(textOf(html)).toContain(d.capsule.fill.submitting)
    expect(html.match(/disabled=""/g)?.length).toBe(2)
    expect(html).toContain('aria-busy="true"')
  })

  it('한국어 줄바꿈 클래스가 붙는다', () => {
    expect(render()).toContain('break-keep wrap-break-word')
  })
})

describe('가진 잼 줄', () => {
  it('«가진 잼» 라벨과 천 단위 숫자가 포인트 숫자 문법(text-2xl bold --link tabular-nums)으로 나온다', () => {
    const html = renderToStaticMarkup(<JamBalance balance={12345} />)
    expect(textOf(html)).toBe(`${d.capsule.sheet.balanceLabel}12,345`)
    expect(html).toContain('text-2xl font-bold tabular-nums text-[color:var(--link)]')
  })

  it('채우기 입력 단계에서도 가진 잼이 보인다', () => {
    expect(textOf(render({ balance: 50 }))).toContain(`${d.capsule.sheet.balanceLabel}50`)
  })
})
