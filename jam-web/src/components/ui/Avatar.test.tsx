/**
 * Avatar face 선택 시험 (티켓 20261126_1407 재작업)
 * 실행: cd jam-web && npx vitest run src/components/ui/Avatar.test.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Avatar from './Avatar'

const render = (node: React.ReactElement) => renderToStaticMarkup(node)

describe('Avatar face', () => {
  it('사진이 없고 face 기본값이면 bg-surface 면을 칠한다', () => {
    expect(render(<Avatar src={null} alt="" size={48} />)).toContain('bg-surface')
  })
  it("face='none'이면 사진이 없어도 면을 칠하지 않는다", () => {
    expect(render(<Avatar src={null} alt="" size={48} face="none" />)).not.toContain('bg-surface')
  })
  it('사진이 있으면 면을 칠하지 않는다', () => {
    expect(render(<Avatar src="/a.webp" alt="" size={48} unoptimized />)).not.toContain('bg-surface')
  })
})
