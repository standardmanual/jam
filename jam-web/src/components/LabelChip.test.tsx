/**
 * MODULAR `LabelChip`(`@ds/components/cards/LabelChip`) 「픽셀 동일」 계약 테스트
 * (티켓 20261001_1204, 상위 20260930_1453 b0).
 *
 * `design-system/components/**` 의 Story `play` 단언은 CI에서 실행되지 않는다(vitest의
 * addon-vitest 연동이 티켓 20260906_1348에서 제거됨 — `vitest.config.ts` 머리말). 그래서
 * 「교체 전 Tailwind 클래스와 계산값이 같다」는 보증을 여기서 한다.
 *
 * 교체 전 클래스(`TodayStatusStrip` CellLabel · `OnboardingQuestCard` CHIP_CLASS 공통, `self-start`
 * 제외): `inline-flex items-center text-[length:var(--text-caption)] leading-none font-bold
 * uppercase px-2.5 py-1.5 rounded-[var(--radius-tags)] bg-surface text-text`.
 * 계산값은 Tailwind v4로 컴파일해 확인했다 — `px-2.5`=`calc(var(--spacing) * 2.5)`·`py-1.5`=
 * `calc(var(--spacing) * 1.5)`이고 `--spacing: 0.25rem`(globals.css에 재정의 없음, root 16px)이라
 * 10px·6px, `leading-none`=`line-height: 1`, `font-bold`=700.
 *
 * 저장소에 jsdom이 없어(vitest `environment: 'node'`) `renderToStaticMarkup`으로 인라인
 * style 속성을 직접 읽는다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LabelChip } from '@ds/components/cards/LabelChip'

/** `style="a:b;c:d"` 속성을 {a:'b', c:'d'}로 푼다. 값 안의 `;`가 없는 단순 선언만 쓰므로 split으로 충분하다 */
function readStyle(html: string): Record<string, string> {
  const m = html.match(/<span[^>]*\sstyle="([^"]*)"/)
  if (!m) throw new Error(`style 속성이 없다: ${html}`)
  return Object.fromEntries(
    m[1]
      .split(';')
      .filter(Boolean)
      .map((decl) => {
        const i = decl.indexOf(':')
        return [decl.slice(0, i), decl.slice(i + 1)]
      })
  )
}

describe('LabelChip — 교체 전 Tailwind 클래스와 같은 계산 스타일', () => {
  it('인라인 style이 정의한 열 개 값과 정확히 같다(그 밖의 속성은 없다)', () => {
    const style = readStyle(renderToStaticMarkup(<LabelChip>내 진행도</LabelChip>))
    expect(style).toEqual({
      display: 'inline-flex',
      'align-items': 'center',
      'font-size': 'var(--text-caption)',
      'line-height': '1',
      'font-weight': '700',
      'text-transform': 'uppercase',
      padding: '6px 10px',
      'border-radius': 'var(--radius-tags)',
      background: 'var(--color-surface)',
      color: 'var(--color-text)',
    })
  })

  it('픽셀을 바꾸는 속성(letterSpacing·minHeight·whiteSpace·그림자)을 넣지 않았다', () => {
    const html = renderToStaticMarkup(<LabelChip>내 진행도</LabelChip>)
    for (const prop of ['letter-spacing', 'min-height', 'white-space', 'box-shadow', 'text-overflow']) {
      expect(html).not.toContain(prop)
    }
    expect(html).not.toContain('gradient')
  })

  it('글자를 <span> 안에 그대로 넣는다', () => {
    const html = renderToStaticMarkup(<LabelChip>내 진행도</LabelChip>)
    expect(html).toMatch(/^<span [^>]*>내 진행도<\/span>$/)
  })

  it('비인터랙티브다 — role·tabindex·onClick 흔적이 없다', () => {
    const html = renderToStaticMarkup(<LabelChip>내 진행도</LabelChip>)
    expect(html).not.toContain('role=')
    expect(html).not.toContain('tabindex')
  })
})

describe('LabelChip — props', () => {
  it('className은 그대로 전달한다(self-start 같은 배치는 호출부 몫)', () => {
    const html = renderToStaticMarkup(<LabelChip className="self-start">내 진행도</LabelChip>)
    expect(html).toContain('class="self-start"')
  })

  it('className을 안 주면 self-start를 붙이지 않는다 — 배치 클래스를 컴포넌트가 굳히지 않는다', () => {
    const html = renderToStaticMarkup(<LabelChip>내 진행도</LabelChip>)
    expect(html).not.toContain('self-start')
  })

  it('style prop은 기본 스타일 위에 덮어쓴다', () => {
    const style = readStyle(renderToStaticMarkup(<LabelChip style={{ padding: '2px 4px' }}>x</LabelChip>))
    expect(style.padding).toBe('2px 4px')
    expect(style['font-size']).toBe('var(--text-caption)')
  })

  it('data-*·aria-* 속성을 통과시킨다', () => {
    const html = renderToStaticMarkup(
      <LabelChip data-testid="chip" aria-label="진행도">
        내 진행도
      </LabelChip>
    )
    expect(html).toContain('data-testid="chip"')
    expect(html).toContain('aria-label="진행도"')
  })

  it('영문 소문자는 그대로 두고 대문자 변환은 CSS(text-transform)에 맡긴다', () => {
    const html = renderToStaticMarkup(<LabelChip>sync</LabelChip>)
    expect(html).toContain('>sync</span>')
    expect(readStyle(html)['text-transform']).toBe('uppercase')
  })
})

describe('LabelChip — 빈 children', () => {
  it.each([
    ['빈 문자열', ''],
    ['null', null],
    ['undefined', undefined],
  ])('children이 %s이면 아무것도 그리지 않는다', (_label, children) => {
    expect(renderToStaticMarkup(<LabelChip>{children}</LabelChip>)).toBe('')
  })

  it('children 없이 호출해도 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<LabelChip />)).toBe('')
  })
})
