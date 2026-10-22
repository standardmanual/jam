/**
 * 어드민 시뮬레이터 화면의 결과 구역 고정 (티켓 20261022_0938)
 *
 * «아이템 드랍» 구역을 지웠다(옛 드랍 엔진 미리 보기 삭제). 화면은 클라이언트 컴포넌트라 이 환경에서 렌더하지 않고
 * 소스를 읽어, 남기는 구역이 그대로 있고 지운 구역의 필드가 다시 생기지 않는지 확인한다.
 * 화면 실렌더는 머지 뒤 카리나가 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/simulator/__tests__/page-sections.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PAGE = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf-8')

describe('시뮬레이터 결과 구역', () => {
  it.each(['확장 필드', '배지 획득 (', '장소 매칭 (', '컬렉션 완성 (', '미획득 배지 ('])(
    '«%s» 구역이 남아 있다',
    (heading) => {
      expect(PAGE).toContain(heading)
    }
  )

  it('«아이템 드랍» 구역과 그 필드·라벨이 없다', () => {
    expect(PAGE).not.toContain('아이템 드랍')
    for (const word of ['itemDrops', 'itemDropSkips', 'itemDropUnavailable', 'cappedRarity', 'ITEM_DROP_SKIP_LABEL']) {
      expect(PAGE, `${word}가 다시 생겼다`).not.toContain(word)
    }
  })

  it('결과 필드는 /api/admin/simulate가 돌려주는 것과 맞다', () => {
    for (const field of ['badgesEarned', 'badgesMissed', 'poisMatched', 'itemBooksCompleted', 'applied']) {
      expect(PAGE).toContain(field)
    }
  })
})
