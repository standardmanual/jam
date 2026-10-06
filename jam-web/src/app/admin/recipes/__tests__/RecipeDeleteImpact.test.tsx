/**
 * 레시피 일괄 삭제 확인창의 영향 안내 (티켓 20261006_1405, 상위 20260930_1500)
 *
 * 확인하는 것: 카드 수가 0이면 홈 카드 안내가 없고, 1 이상이면 여러 레시피를 가리키는 「지울 레시피를」 안내가 나온다.
 * 레시피·슬롯 수와 건너뜀 목록(3건까지, 나머지는 「외 N개」)은 카드 수와 상관없이 그대로다.
 *
 * jsdom이 없어(`vitest.config.ts` `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 확인한다. 확인창은 눌러야 열려
 * 이 환경에서 그릴 수 없으므로, 안내 부분을 표시 컴포넌트로 떼어 미리보기 값(`cardCount` 등)을 바로 넣는다.
 * 서버 렌더는 이어 붙은 글자 사이에 `<!-- -->`를 끼우므로 주석을 지운 글로 비교한다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/recipes/__tests__/RecipeDeleteImpact.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { RecipeDeleteImpact } from '../RecipeDeleteImpact'

type Props = Parameters<typeof RecipeDeleteImpact>[0]

function render(overrides: Partial<Props> = {}): string {
  const props: Props = { processedCount: 2, slotCount: 5, cardCount: 0, skipped: [], ...overrides }
  return renderToStaticMarkup(<RecipeDeleteImpact {...props} />).replace(/<!-- -->/g, '')
}

describe('RecipeDeleteImpact — 홈 카드 안내', () => {
  it('카드가 0장이면 안내가 없다', () => {
    const out = render({ cardCount: 0 })
    expect(out).toContain('레시피 2개와 슬롯 5개가 함께 삭제됩니다. 되돌릴 수 없습니다.')
    expect(out).not.toContain('홈 카드')
    expect(out).not.toContain('가리켜요')
  })

  it('카드가 1장 이상이면 지울 레시피 전체를 가리키는 안내가 나온다', () => {
    const out = render({ cardCount: 3 })
    expect(out).toContain('홈 카드 3장이 지울 레시피를 가리켜요. 지우면 그 카드는 레시피 정보 없이 남아요.')
    expect(out).not.toContain('이 레시피를 가리켜요')
  })

  it('세지 못한 값(NaN)이면 안내가 없다', () => {
    expect(render({ cardCount: Number.NaN })).not.toContain('홈 카드')
  })
})

describe('RecipeDeleteImpact — 건너뜀 목록', () => {
  it('건너뜀이 없으면 제외 안내가 없다', () => {
    expect(render({ skipped: [] })).not.toContain('삭제 대상에서 제외됩니다')
  })

  it('건너뜀이 있으면 건수와 사유를 보여주고, 카드 안내도 함께 유지된다', () => {
    const out = render({
      cardCount: 2,
      skipped: [{ id: 'aaaaaaaa-1111', label: '봄 레시피', reason: '삭제할 수 없어요. 이 레시피를 가리키는 배지가 1개 있어요.' }],
    })
    expect(out).toContain('선택한 레시피 중 1개는 삭제 대상에서 제외됩니다.')
    expect(out).toContain('봄 레시피: 삭제할 수 없어요. 이 레시피를 가리키는 배지가 1개 있어요.')
    expect(out).toContain('홈 카드 2장이 지울 레시피를 가리켜요.')
  })

  it('이름이 없으면 id 앞 8자를 쓰고, 3건을 넘으면 「외 N개」로 줄인다', () => {
    const skipped = ['a', 'b', 'c', 'd', 'e'].map((ch) => ({ id: `${ch.repeat(8)}-0000`, reason: '사유' }))
    const out = render({ skipped })
    expect(out).toContain('선택한 레시피 중 5개는 삭제 대상에서 제외됩니다.')
    expect(out).toContain('aaaaaaaa: 사유 / bbbbbbbb: 사유 / cccccccc: 사유 외 2개')
    expect(out).not.toContain('dddddddd')
  })
})
