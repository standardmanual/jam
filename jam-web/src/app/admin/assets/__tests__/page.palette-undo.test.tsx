/**
 * 에셋 화면의 3D 팔레트 선택 → 되돌리기 (티켓 20261103_2125)
 *
 * 팔레트를 누르면 공유 배경(`bgA`·`bgB`·`bgAngle`)이 팔레트 값으로 바뀌고 `bgMode`는 그대로이며,
 * 되돌리기(⌘/Ctrl Z 키 처리 `handleUndo`)를 하면 이전 값이 돌아오는지 `page.tsx`를 통째로 올려 확인한다.
 * 처리기 안에서 `remember`를 빠뜨리거나 순서를 바꾸면 이 시험이 깨진다.
 * jsdom이 없어 시험용 훅 실행기(`hookRunner`)로 올린다. 뷰포트·패널은 props만 보도록 가짜로 바꾼다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/assets/__tests__/page.palette-undo.test.tsx
 */
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findAll, mount, unmount } from '@/components/capsule/__tests__/hookRunner'
import { PALETTES, type Logo3DPalette } from '../logo3d/logo3dConfig'
import Page from '../page'

vi.mock('react', async (importOriginal) =>
  (await import('@/components/capsule/__tests__/hookRunner')).mockReact(await importOriginal<typeof import('react')>())
)
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('mode=3d') }))
vi.mock('../logo3d/useLogo3DOutline', () => ({
  useLogo3DOutline: () => ({ geometry: null, loading: false, error: null, warnings: [] }),
}))
vi.mock('../logo3d/Logo3DViewport', () => ({ default: () => null }))
vi.mock('../ShapeStudioViewport', () => ({ default: () => null }))
vi.mock('../ShapeStudioPanel', () => ({ default: () => null }))

type Fn = (props: unknown) => ReactElement
type Bg = { bgMode: string; bgA: string; bgB: string; bgAngle: number }

/** 기본 내보내기 → Suspense → 쿼리 읽는 껍데기 → 본체 순으로 풀어, 본체의 훅을 실행기에 태운다 */
function Root(): ReactElement {
  const query = (Page() as ReactElement<{ children: ReactElement }>).props.children
  const studio = (query.type as Fn)(query.props)
  return (studio.type as Fn)(studio.props)
}

const listeners = new Set<(e: unknown) => void>()
const bg = (): Bg => {
  const [viewport] = findAll((el) => 'frameColor' in el.props)
  const { bgMode, bgA, bgB, bgAngle } = viewport.props as Bg
  return { bgMode, bgA, bgB, bgAngle }
}
const palette = (p: Logo3DPalette): Bg => ({ bgMode: bg().bgMode, bgA: p.bgA, bgB: p.bgB, bgAngle: p.bgAngle })
const selectPalette = (p: Logo3DPalette) => {
  const [panel] = findAll((el) => 'onChangeEngineMode' in el.props)
  ;(panel.props.logo3d as { onSelectPalette: (p: Logo3DPalette) => void }).onSelectPalette(p)
}
const pressUndo = () => listeners.forEach((fn) => fn({ code: 'KeyZ', key: 'z', metaKey: true, preventDefault: vi.fn() }))

beforeEach(() => {
  listeners.clear()
  vi.stubGlobal('window', {
    addEventListener: (_: string, fn: (e: unknown) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: unknown) => void) => listeners.delete(fn),
  })
  vi.stubGlobal('document', { activeElement: null })
  mount(Root, {})
})
afterEach(() => {
  unmount()
  vi.unstubAllGlobals()
})

describe('에셋 화면 3D 팔레트 선택 → 되돌리기', () => {
  it('팔레트를 누르면 배경 세 값이 팔레트 값으로 바뀌고 배경 방식은 그대로다', () => {
    const before = bg()
    expect(before).toEqual(palette(PALETTES[0]))
    selectPalette(PALETTES[4])
    expect(bg()).toEqual(palette(PALETTES[4]))
    expect(bg().bgMode).toBe(before.bgMode)
  })

  it('되돌리기를 누르면 이전 배경이 돌아온다', () => {
    selectPalette(PALETTES[4])
    pressUndo()
    expect(bg()).toEqual(palette(PALETTES[0]))
  })

  it('팔레트를 두 번 골랐으면 되돌리기도 한 단계씩 돌아간다', () => {
    selectPalette(PALETTES[3])
    selectPalette(PALETTES[5])
    pressUndo()
    expect(bg()).toEqual(palette(PALETTES[3]))
    pressUndo()
    expect(bg()).toEqual(palette(PALETTES[0]))
  })
})
