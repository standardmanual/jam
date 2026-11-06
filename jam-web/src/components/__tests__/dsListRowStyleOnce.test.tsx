/**
 * ListRow 스타일 블록이 행 개수와 관계없이 문서에 한 번만 들어가는지 확인한다 (티켓 20261106_2003, 3-2회차).
 *
 * 예전에는 행마다 `<style>{STATIC_CSS}</style>`를 렌더해 행 20개면 같은 규칙이 20번 들어갔다.
 * 지금은 React 19 `<style href="ds-list-row" precedence="medium">`라 같은 href는 한 번만 나간다.
 * 저장소에는 jsdom이 없어(새 의존성 금지) 서버 렌더 결과의 `data-href` 개수로 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/components/__tests__/dsListRowStyleOnce.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ListRow } from '@ds/components/patterns/ListRow'

const count = (html: string, needle: string) => html.split(needle).length - 1

describe('ListRow 스타일 1회 주입', () => {
  it('행 20개를 렌더해도 ds-list-row <style>이 1개다', () => {
    const html = renderToStaticMarkup(
      <div>
        {Array.from({ length: 20 }, (_, i) => (
          <ListRow key={i} title={`행 ${i}`} />
        ))}
      </div>,
    )
    expect(count(html, 'data-href="ds-list-row"')).toBe(1)
    // 행 자체는 20개 그려진다
    expect(count(html, 'class="ds-list-row-hit"')).toBe(20)
  })
})
