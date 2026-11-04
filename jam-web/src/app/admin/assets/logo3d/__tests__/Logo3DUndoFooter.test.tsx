import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/admin/ui/button'
import { Logo3DUndoFooter } from '../Logo3DUndoFooter'

type Props = { disabled?: boolean; onClick?: () => void; children?: ReactNode }

/** 훅이 없는 컴포넌트라 함수로 직접 불러 만든 요소 트리에서 Button 요소를 찾는다. */
function findButton(node: ReactNode): ReactElement<Props> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child)
      if (found) return found
    }
    return null
  }
  if (node && typeof node === 'object' && 'props' in node) {
    const el = node as ReactElement<Props>
    if (el.type === Button) return el
    return findButton(el.props.children)
  }
  return null
}

describe('Logo3DUndoFooter', () => {
  it('기록이 없으면 되돌리기 버튼이 비활성이다', () => {
    const button = findButton(Logo3DUndoFooter({ canUndo: false, onUndo: vi.fn() }))
    expect(button?.props.disabled).toBe(true)
  })

  it('기록이 있으면 버튼이 활성이고, 누르면 onUndo를 부른다', () => {
    const onUndo = vi.fn()
    const button = findButton(Logo3DUndoFooter({ canUndo: true, onUndo }))
    expect(button?.props.disabled).toBe(false)
    button?.props.onClick?.()
    expect(onUndo).toHaveBeenCalledTimes(1)
  })
})
