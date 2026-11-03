import { Box3, BufferGeometry, Float32BufferAttribute, type MeshPhysicalMaterial } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { LogoGeometry } from '@/lib/logo-3d/buildGeometry'
import { composeBackground } from '../logo3dConfig'
import { createLogoMeshes, disposeLogoMeshes, paintBackground, setLogoColors } from '../Logo3DViewport'

function triangle(): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
  return g
}

function fakeGeometry(): LogoGeometry {
  return { frame: triangle(), tile: triangle(), backPlate: triangle(), bounds: new Box3(), warnings: [] }
}

describe('형상 해제', () => {
  it('disposeLogoMeshes는 이전 형상의 geometry와 material을 모두 dispose한다', () => {
    const meshes = createLogoMeshes(fakeGeometry(), '#999999', '#77aaff')
    const spies = [meshes.frame, meshes.tile, meshes.backPlate].flatMap((m) => [
      vi.spyOn(m.geometry, 'dispose'),
      vi.spyOn(m.material as MeshPhysicalMaterial, 'dispose'),
    ])
    disposeLogoMeshes(meshes)
    expect(spies).toHaveLength(6)
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1)
  })

  it('틀은 금속성이 높고 타일은 광택층이 있는 도자기 재질이다', () => {
    const meshes = createLogoMeshes(fakeGeometry(), '#999999', '#77aaff')
    const frame = meshes.frame.material as MeshPhysicalMaterial
    const tile = meshes.tile.material as MeshPhysicalMaterial
    expect(frame.metalness).toBeGreaterThan(0.8)
    expect(frame.roughness).toBeCloseTo(0.36)
    expect(tile.roughness).toBeCloseTo(0.3)
    expect(tile.clearcoat).toBe(1)
    expect(tile.clearcoatRoughness).toBeCloseTo(0.07)
  })

  it('setLogoColors는 재질을 새로 만들지 않고 색만 바꾼다', () => {
    const meshes = createLogoMeshes(fakeGeometry(), '#999999', '#77aaff')
    const before = meshes.tile.material
    setLogoColors(meshes, '#112233', '#445566')
    expect(meshes.tile.material).toBe(before)
    expect((meshes.tile.material as MeshPhysicalMaterial).color.getHexString()).toBe('445566')
    expect((meshes.frame.material as MeshPhysicalMaterial).color.getHexString()).toBe('112233')
  })
})

describe('paintBackground', () => {
  function fakeContext() {
    const gradient = { addColorStop: vi.fn() }
    return {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      createLinearGradient: vi.fn(() => gradient),
      fillStyle: '' as unknown,
      gradient,
    }
  }

  it('Transparent는 지우기만 하고 칠하지 않아 배경 픽셀 알파가 0으로 남는다', () => {
    const ctx = fakeContext()
    paintBackground(ctx as unknown as CanvasRenderingContext2D, composeBackground('transparent', '#ffffff', '#000000', 0, 10, 10), 10, 10)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 10, 10)
    expect(ctx.fillRect).not.toHaveBeenCalled()
  })

  it('Solid는 한 색으로 전체를 칠한다', () => {
    const ctx = fakeContext()
    paintBackground(ctx as unknown as CanvasRenderingContext2D, composeBackground('solid', '#ff0000', '#000000', 0, 10, 10), 10, 10)
    expect(ctx.fillStyle).toBe('#ff0000')
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 10, 10)
  })

  it('Gradient는 선형 그라데이션으로 전체를 칠한다', () => {
    const ctx = fakeContext()
    paintBackground(ctx as unknown as CanvasRenderingContext2D, composeBackground('gradient', '#000000', '#ffffff', 0, 10, 10), 10, 10)
    expect(ctx.createLinearGradient).toHaveBeenCalled()
    expect(ctx.gradient.addColorStop).toHaveBeenCalled()
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 10, 10)
  })
})
