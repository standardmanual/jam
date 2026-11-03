import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Logo3DColorSection } from '../Logo3DSections'
import { DEFAULT_LOGO3D_SCENE, PALETTES } from '../logo3dConfig'

type Props = { 'aria-pressed'?: boolean; onClick?: () => void; children?: ReactNode }

/** 훅이 없는 섹션이라 함수로 직접 불러 만든 요소 트리에서 팔레트 버튼(aria-pressed 있는 요소)을 모은다. */
function collectPaletteButtons(node: ReactNode, out: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(node)) {
    node.forEach((child) => collectPaletteButtons(child, out))
  } else if (node && typeof node === 'object' && 'props' in node) {
    const el = node as ReactElement<Props>
    if ('aria-pressed' in el.props) out.push(el)
    else collectPaletteButtons(el.props.children, out)
  }
  return out
}

describe('Logo3DColorSection 팔레트 버튼', () => {
  it('7개이고, 누르면 그 팔레트로 onSelectPalette를 부른다(onChange는 부르지 않는다)', () => {
    const onChange = vi.fn()
    const onSelectPalette = vi.fn()
    const tree = Logo3DColorSection({ state: DEFAULT_LOGO3D_SCENE, onChange, onSelectPalette })
    const buttons = collectPaletteButtons(tree)
    expect(buttons).toHaveLength(7)
    buttons[2].props.onClick?.()
    expect(onSelectPalette).toHaveBeenCalledWith(PALETTES[2])
    expect(onChange).not.toHaveBeenCalled()
  })
})
