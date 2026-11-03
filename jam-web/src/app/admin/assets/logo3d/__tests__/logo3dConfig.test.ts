import { describe, expect, it } from 'vitest'
import { cloneState, INITIAL_STATE } from '@/app/admin/assets/shapeStudioConfig'
import { DEFAULT_LOGO3D_PARAMS } from '@/lib/logo-3d/types'
import {
  applyDragRotation,
  backgroundInputsFor,
  cameraPoseFor,
  composeBackground,
  DEFAULT_LOGO3D_STATE,
  fitBox,
  fitDistance,
  initialStudioStateFor,
  ISOMETRIC_ELEVATION_DEG,
  isometricCameraPose,
  logo3dFileName,
  orthoHalfExtent,
  paletteScenePatch,
  paletteStagePatch,
  PALETTES,
  RATIO_OPTIONS,
  stageSizeFor,
  wrapDegrees,
  ZOOM_RANGE,
  zoomFromWheel,
} from '../logo3dConfig'

describe('기본값', () => {
  it('형상 값은 1번 티켓 기본값(외곽선 폭 0.030, 두께 0.30)이다', () => {
    expect(DEFAULT_LOGO3D_STATE.params).toEqual(DEFAULT_LOGO3D_PARAMS)
    expect(DEFAULT_LOGO3D_STATE.params.frameWidth).toBe(0.03)
    expect(DEFAULT_LOGO3D_STATE.params.depth).toBe(0.3)
  })

  it('회전은 x 14°, y 22°, z 3°이고 시점은 원근, 스테이지는 Gradient다', () => {
    const s = DEFAULT_LOGO3D_STATE
    expect([s.rotX, s.rotY, s.rotZ]).toEqual([14, 22, 3])
    expect(s.view).toBe('perspective')
    expect(s.bgMode).toBe('gradient')
  })

  it('배경 방식은 어드민 에셋과 같고 배경 색·각도는 스틸 · 하늘 팔레트다', () => {
    expect(DEFAULT_LOGO3D_STATE.bgMode).toBe(INITIAL_STATE.bgMode)
    expect(DEFAULT_LOGO3D_STATE.bgA).toBe('#6ed3fe')
    expect(DEFAULT_LOGO3D_STATE.bgB).toBe('#29a3f3')
    expect(DEFAULT_LOGO3D_STATE.bgAngle).toBe(-45)
    expect(DEFAULT_LOGO3D_STATE.tileColor).toBe('#a9e0ff')
  })

  it('기본 색·배경은 첫 팔레트와 어긋나지 않는다', () => {
    const p = PALETTES[0]
    expect(DEFAULT_LOGO3D_STATE).toMatchObject({
      paletteId: p.id,
      frameColor: p.frame,
      tileColor: p.tile,
      bgA: p.bgA,
      bgB: p.bgB,
      bgAngle: p.bgAngle,
    })
  })
})

describe('PALETTES', () => {
  it('7종이 정해진 순서와 값이다', () => {
    expect(PALETTES.map((p) => [p.id, p.name, p.frame, p.tile, p.bgA, p.bgB, p.bgAngle])).toEqual([
      ['steel-sky', '스틸 · 하늘', '#9ba3ab', '#a9e0ff', '#6ed3fe', '#29a3f3', -45],
      ['steel-mint', '스틸 · 민트', '#9ba3ab', '#9ff0d6', '#8fe9d3', '#2fb8a0', -45],
      ['steel-green', '스틸 · 그린', '#9ba3ab', '#7be39b', '#7ee6a0', '#1fae6a', -45],
      ['steel-rose', '스틸 · 로즈', '#a3a0a6', '#ffc0d0', '#ffb3c8', '#ee6f95', -45],
      ['gold-cream', '골드 · 크림', '#c9a24a', '#f6ecd6', '#35457a', '#141a3d', -45],
      ['graphite-lime', '그래파이트 · 라임', '#5d636b', '#c4e56a', '#f1f0eb', '#cfc9b4', -45],
      ['copper-navy', '코퍼 · 네이비', '#b8764f', '#5c7fd1', '#f6e7d6', '#e0b48f', -45],
    ])
  })

  it('paletteScenePatch는 틀·타일 색만, paletteStagePatch는 배경 세 값만 돌려준다', () => {
    const p = PALETTES[2]
    expect(paletteScenePatch(p)).toEqual({ paletteId: 'steel-green', frameColor: '#9ba3ab', tileColor: '#7be39b' })
    expect(paletteStagePatch(p)).toEqual({ bgA: '#7ee6a0', bgB: '#1fae6a', bgAngle: -45 })
  })

  it('-45° 그라데이션은 시작점이 좌상, 끝점이 우하 쪽이다', () => {
    const plan = composeBackground('gradient', '#6ed3fe', '#29a3f3', -45, 100, 100)
    if (plan.kind !== 'gradient') throw new Error('gradient가 아니다')
    expect(plan.x0).toBeLessThan(50)
    expect(plan.y0).toBeLessThan(50)
    expect(plan.x1).toBeGreaterThan(50)
    expect(plan.y1).toBeGreaterThan(50)
  })
})

describe('initialStudioStateFor', () => {
  it('3d면 배경 세 값만 스틸 · 하늘 값으로 바꾸고 나머지는 그대로다', () => {
    const base = cloneState(INITIAL_STATE)
    const next = initialStudioStateFor('3d', base)
    expect(next).toEqual({ ...base, bgA: '#6ed3fe', bgB: '#29a3f3', bgAngle: -45 })
    expect(base.bgAngle).toBe(INITIAL_STATE.bgAngle)
  })

  it('shape·ribbon은 입력과 같다', () => {
    const base = cloneState(INITIAL_STATE)
    expect(initialStudioStateFor('shape', base)).toBe(base)
    expect(initialStudioStateFor('ribbon', base)).toBe(base)
  })
})

describe('isometricCameraPose', () => {
  const pose = isometricCameraPose()

  it('방위각 45°, 고도 약 35.264°의 직교 투영이다', () => {
    expect(pose.kind).toBe('orthographic')
    expect(pose.azimuthDeg).toBe(45)
    expect(pose.elevationDeg).toBeCloseTo(35.264, 3)
    expect(pose.elevationDeg).toBeCloseTo(ISOMETRIC_ELEVATION_DEG, 10)
  })

  it('카메라 방향이 세 축에서 같은 각도를 이룬다(정확한 등각)', () => {
    const [x, y, z] = pose.direction
    expect(x).toBeCloseTo(1 / Math.sqrt(3), 6)
    expect(y).toBeCloseTo(1 / Math.sqrt(3), 6)
    expect(z).toBeCloseTo(1 / Math.sqrt(3), 6)
  })

  it('시점 전환: 원근은 정면, 등각은 등각 자세', () => {
    expect(cameraPoseFor('perspective').kind).toBe('perspective')
    expect(cameraPoseFor('perspective').direction).toEqual([0, 0, 1])
    expect(cameraPoseFor('isometric')).toEqual(pose)
  })
})

describe('stageSizeFor', () => {
  it.each([
    ['1:1', 1280, 1280],
    ['4:5', 1024, 1280],
    ['9:16', 720, 1280],
    ['16:9', 1280, 720],
  ] as const)('%s 비율은 %i×%i로 나온다', (ratio, width, height) => {
    expect(stageSizeFor(ratio)).toEqual({ width, height })
  })

  it('네 비율이 모두 지원된다', () => {
    expect(RATIO_OPTIONS).toEqual(['1:1', '4:5', '9:16', '16:9'])
    for (const r of RATIO_OPTIONS) {
      const { width, height } = stageSizeFor(r)
      expect(Math.max(width, height)).toBe(1280)
    }
  })
})

describe('composeBackground', () => {
  it('Transparent는 칠할 것이 없다', () => {
    expect(composeBackground('transparent', '#ff0000', '#0000ff', 0, 100, 100)).toEqual({ kind: 'transparent' })
  })

  it('Solid는 배경 A 한 색이다', () => {
    expect(composeBackground('solid', '#ff0000', '#0000ff', 90, 100, 100)).toEqual({ kind: 'solid', color: '#ff0000' })
  })

  it('Gradient 0°는 왼쪽(A)에서 오른쪽(B)으로 긴 변의 절반씩 떨어진 점을 잇는다', () => {
    const plan = composeBackground('gradient', '#000000', '#ffffff', 0, 200, 100)
    if (plan.kind !== 'gradient') throw new Error('gradient가 아님')
    expect(plan.x0).toBeCloseTo(0)
    expect(plan.x1).toBeCloseTo(200)
    expect(plan.y0).toBeCloseTo(50)
    expect(plan.y1).toBeCloseTo(50)
    expect(plan.stops[0]).toEqual({ offset: 0, color: '#000000' })
    expect(plan.stops[plan.stops.length - 1]).toEqual({ offset: 1, color: '#ffffff' })
  })

  it('Gradient 90°는 아래(A)에서 위(B)로 향한다(캔버스 y는 아래쪽이 커진다)', () => {
    const plan = composeBackground('gradient', '#000000', '#ffffff', 90, 100, 100)
    if (plan.kind !== 'gradient') throw new Error('gradient가 아님')
    expect(plan.y0).toBeGreaterThan(plan.y1)
    expect(plan.x0).toBeCloseTo(plan.x1)
  })

  it('Gradient 가운데 색은 smoothstep이라 정확히 반반이다', () => {
    const plan = composeBackground('gradient', '#000000', '#ffffff', 0, 100, 100)
    if (plan.kind !== 'gradient') throw new Error('gradient가 아님')
    const mid = plan.stops.find((s) => s.offset === 0.5)
    expect(mid?.color).toBe('#808080')
  })
})

describe('backgroundInputsFor', () => {
  it('모드마다 쓰는 입력만 켠다', () => {
    expect(backgroundInputsFor('gradient')).toEqual({ bgA: true, bgB: true, bgAngle: true })
    expect(backgroundInputsFor('solid')).toEqual({ bgA: true, bgB: false, bgAngle: false })
    expect(backgroundInputsFor('transparent')).toEqual({ bgA: false, bgB: false, bgAngle: false })
  })
})

describe('회전·줌 입력', () => {
  it('wrapDegrees는 -180~180으로 되감는다', () => {
    expect(wrapDegrees(190)).toBe(-170)
    expect(wrapDegrees(-190)).toBe(170)
    expect(wrapDegrees(0)).toBe(0)
    expect(wrapDegrees(360)).toBe(0)
  })

  it('가로 드래그는 rotY, 세로 드래그는 rotX를 돌린다', () => {
    expect(applyDragRotation({ rotX: 0, rotY: 0 }, 20, 0)).toEqual({ rotX: 0, rotY: 10 })
    expect(applyDragRotation({ rotX: 0, rotY: 0 }, 0, -20)).toEqual({ rotX: -10, rotY: 0 })
  })

  it('드래그 결과는 슬라이더 범위(-180~180) 안이다', () => {
    const next = applyDragRotation({ rotX: 175, rotY: -175 }, -100, 100)
    expect(next.rotX).toBeGreaterThanOrEqual(-180)
    expect(next.rotX).toBeLessThanOrEqual(180)
    expect(next.rotY).toBeGreaterThanOrEqual(-180)
    expect(next.rotY).toBeLessThanOrEqual(180)
  })

  it('휠을 위로 굴리면 확대하고 범위를 넘지 않는다', () => {
    expect(zoomFromWheel(100, -100)).toBeGreaterThan(100)
    expect(zoomFromWheel(100, 100)).toBeLessThan(100)
    expect(zoomFromWheel(ZOOM_RANGE.max, -10000)).toBe(ZOOM_RANGE.max)
    expect(zoomFromWheel(ZOOM_RANGE.min, 10000)).toBe(ZOOM_RANGE.min)
  })
})

describe('카메라 맞춤', () => {
  it('fitDistance는 구가 화면에 들어오는 거리를 준다', () => {
    const d = fitDistance(1, 30, 1, 1)
    expect(d * Math.sin((15 * Math.PI) / 180)).toBeCloseTo(1, 6)
  })

  it('가로로 좁은 화면(9:16)에서는 더 멀리 떨어진다', () => {
    expect(fitDistance(1, 30, 9 / 16)).toBeGreaterThan(fitDistance(1, 30, 1))
  })

  it('orthoHalfExtent는 짧은 변 쪽이 반지름에 맞는다', () => {
    expect(orthoHalfExtent(1, 2, 1)).toEqual({ halfW: 2, halfH: 1 })
    expect(orthoHalfExtent(1, 0.5, 1)).toEqual({ halfW: 1, halfH: 2 })
  })

  it('fitBox는 비율을 지키며 컨테이너 안에 들어간다', () => {
    expect(fitBox(800, 600, '16:9', 0)).toEqual({ width: 800, height: 450 })
    const tall = fitBox(800, 600, '9:16', 0)
    expect(tall.height).toBe(600)
    expect(tall.width).toBe(337)
  })
})

describe('logo3dFileName', () => {
  it('logo-3d-{글자열 앞부분}-{ratio}.png 형식이다', () => {
    expect(logo3dFileName('JAM', '1:1')).toBe('logo-3d-JAM-1x1.png')
    expect(logo3dFileName('JAM', '16:9')).toBe('logo-3d-JAM-16x9.png')
  })

  it('긴 글자열은 12자까지만, 파일명에 못 쓰는 문자는 뺀다', () => {
    expect(logo3dFileName('가나다 라마/바사:아자차카타파하', '4:5')).toBe('logo-3d-가나다라마바사아자차카타-4x5.png')
  })

  it('글자가 남지 않으면 logo로 대신한다', () => {
    expect(logo3dFileName('  /// ', '1:1')).toBe('logo-3d-logo-1x1.png')
  })
})
