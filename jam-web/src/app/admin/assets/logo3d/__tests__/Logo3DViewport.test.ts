import { Box3, BufferGeometry, Float32BufferAttribute, type MeshPhysicalMaterial } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { LogoGeometry } from '@/lib/logo-3d/buildGeometry'
import { createGlazeNormalMap, createLogoMeshes, disposeLogoMeshes, LOGO3D_LOOK, setLogoColors } from '../Logo3DViewport'

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
    // 틀은 거울 같은 크롬이 아니라 새틴(반무광) 스틸이다(사용자 요청 「스틸 매트한 질감」)
    expect(frame.roughness).toBeCloseTo(LOGO3D_LOOK.frame.roughness)
    expect(frame.roughness).toBeGreaterThanOrEqual(0.22)
    expect(tile.roughness).toBeCloseTo(LOGO3D_LOOK.tile.roughness)
    expect(tile.clearcoat).toBe(1)
    expect(tile.clearcoatRoughness).toBeCloseTo(LOGO3D_LOOK.tile.clearcoatRoughness)
    // 평평한 타일에 반사광이 흐르도록 유약 결 법선 맵을 바탕층과 광택층에 함께 쓴다
    expect(tile.normalMap).not.toBeNull()
    expect(tile.clearcoatNormalMap).toBe(tile.normalMap)
  })

  it('유약 결 법선 맵은 이음매 없이 이어지는 단위 법선이고 매번 같게 만들어진다', () => {
    const look = { ...LOGO3D_LOOK.glaze, size: 32 }
    const a = createGlazeNormalMap(look)
    const b = createGlazeNormalMap(look)
    const data = a.image.data as Uint8Array
    expect(a.image.width).toBe(32)
    expect(Array.from(data)).toEqual(Array.from(b.image.data as Uint8Array))
    for (let i = 0; i < data.length; i += 4) {
      const nx = data[i] / 255 - 0.5
      const ny = data[i + 1] / 255 - 0.5
      const nz = data[i + 2] / 255 - 0.5
      // 0~255 부호화를 되돌리면 길이가 0.5(단위 법선의 절반)에 가깝고, 위(+z)를 향한다
      expect(Math.hypot(nx, ny, nz)).toBeGreaterThan(0.47)
      expect(Math.hypot(nx, ny, nz)).toBeLessThan(0.53)
      expect(nz).toBeGreaterThan(0)
    }
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
