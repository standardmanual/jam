'use client'

/**
 * 3D 로고 미리보기 뷰포트 (티켓 20261103_1352, 에셋 3D 모드로 옮김: 티켓 20261103_1734)
 *
 * `three`의 WebGLRenderer(alpha)로 틀(스틸)·타일(도자기)·바닥판을 그린다.
 * - 회전: 슬라이더가 정한 rotX·rotY·rotZ를 로고 그룹에 적용한다. 마우스 드래그는 같은 값을 `onRotate`로 올려
 *   슬라이더와 한 상태를 공유한다(카메라를 돌리는 OrbitControls는 슬라이더 값과 합칠 수 없어 쓰지 않았다).
 * - 줌: 휠이 `onZoom`으로 같은 줌 상태를 바꾼다. 원근은 카메라 거리, 등각(직교)은 카메라 zoom으로 반영한다.
 * - 배경은 렌더러와 별개다. 미리보기는 뒤에 깐 2D 캔버스에 칠하고, PNG 저장은 저장 크기의 2D 캔버스에 칠한 뒤 3D 이미지를 얹는다.
 *   반사용 환경 맵은 배경과 상관없이 그대로다.
 * - 배경·그레인·비율은 에셋 화면의 값을 받는다. 그레인은 배경에만 입힌다(3D 이미지 위에는 얹지 않는다).
 * - 이 컴포넌트가 사라지면(모드 전환·화면 이동) 렌더러·환경 맵·형상의 geometry·material을 모두 `dispose`한다.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  BackSide,
  BoxGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Sphere,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { LogoGeometry } from '@/lib/logo-3d/buildGeometry'
import {
  applyDragRotation,
  cameraPoseFor,
  composeBackground,
  fitBox,
  fitDistance,
  grainCellPx,
  grainNoise,
  orthoHalfExtent,
  stageSizeFor,
  zoomFromWheel,
  type BackgroundMode,
  type BackgroundPlan,
  type CanvasRatio,
  type Logo3DView,
} from './logo3dConfig'

const PERSPECTIVE_FOV_DEG = 30
const FALLBACK_RADIUS = 0.8

export type Logo3DViewportHandle = {
  /** 선택한 비율의 크기로 다시 그려 PNG Blob을 만든다. */
  exportPng: (ratio: CanvasRatio) => Promise<Blob>
}

type Props = {
  geometry: LogoGeometry | null
  frameColor: string
  tileColor: string
  rotX: number
  rotY: number
  rotZ: number
  zoom: number
  view: Logo3DView
  bgMode: BackgroundMode
  bgA: string
  bgB: string
  bgAngle: number
  /** 에셋 그레인(0~20 %). 0이면 입히지 않는다. */
  grain: number
  ratio: CanvasRatio
  loading: boolean
  onRotate: (rotX: number, rotY: number) => void
  onZoom: (zoom: number) => void
}

export type LogoMeshes = { frame: Mesh; tile: Mesh; backPlate: Mesh }

/** 형상마다 재질을 새로 만든다. 틀은 매트 스틸, 타일은 광택층이 있는 도자기다. */
export function createLogoMeshes(geometry: LogoGeometry, frameColor: string, tileColor: string): LogoMeshes {
  const frameMat = new MeshStandardMaterial({ color: frameColor, metalness: 0.95, roughness: 0.36 })
  const tileMat = new MeshPhysicalMaterial({
    color: tileColor,
    metalness: 0,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
  })
  const backMat = new MeshStandardMaterial({ color: tileColor, metalness: 0, roughness: 0.5 })
  return {
    frame: new Mesh(geometry.frame, frameMat),
    tile: new Mesh(geometry.tile, tileMat),
    backPlate: new Mesh(geometry.backPlate, backMat),
  }
}

/** 이전 형상의 geometry·material을 해제한다(GPU 메모리 누수 방지). */
export function disposeLogoMeshes(meshes: LogoMeshes): void {
  for (const mesh of [meshes.frame, meshes.tile, meshes.backPlate]) {
    mesh.geometry.dispose()
    const material = mesh.material as Material | Material[]
    if (Array.isArray(material)) material.forEach((m) => m.dispose())
    else material.dispose()
  }
}

export function setLogoColors(meshes: LogoMeshes, frameColor: string, tileColor: string): void {
  ;(meshes.frame.material as MeshStandardMaterial).color.set(frameColor)
  ;(meshes.tile.material as MeshPhysicalMaterial).color.set(tileColor)
  ;(meshes.backPlate.material as MeshStandardMaterial).color.set(tileColor)
}

/** 칠해 둔 배경 위에 그레인을 더한다. 에셋 셰이더처럼 한 칸(`grainCellPx`)마다 같은 잡음을 R·G·B에 더한다. */
function addGrain(ctx: CanvasRenderingContext2D, width: number, height: number, grainPct: number): void {
  const cell = grainCellPx(height)
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  for (let y = 0; y < height; y++) {
    const cy = Math.floor(y / cell)
    for (let x = 0; x < width; x++) {
      const add = grainNoise(Math.floor(x / cell), cy, grainPct) * 255
      const i = (y * width + x) * 4
      data[i] += add
      data[i + 1] += add
      data[i + 2] += add
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** 배경 계획을 2D 캔버스에 칠한다. 투명이면 아무것도 칠하지 않는다. 그레인(%)이 있으면 칠한 배경에 더한다. */
export function paintBackground(
  ctx: CanvasRenderingContext2D,
  plan: BackgroundPlan,
  width: number,
  height: number,
  grainPct = 0
): void {
  ctx.clearRect(0, 0, width, height)
  if (plan.kind === 'transparent') return
  if (plan.kind === 'solid') {
    ctx.fillStyle = plan.color
  } else {
    const gradient = ctx.createLinearGradient(plan.x0, plan.y0, plan.x1, plan.y1)
    for (const stop of plan.stops) gradient.addColorStop(stop.offset, stop.color)
    ctx.fillStyle = gradient
  }
  ctx.fillRect(0, 0, width, height)
  if (grainPct > 0) addGrain(ctx, width, height, grainPct)
}

/** 대비가 있는 밝은·어두운 띠로 만든 스튜디오 환경. PMREM으로 반사용 맵을 만든다. */
function createStudioEnvironment(renderer: WebGLRenderer): Texture {
  const envScene = new Scene()
  const disposables: { dispose: () => void }[] = []
  const add = (mesh: Mesh) => {
    envScene.add(mesh)
    disposables.push(mesh.geometry, mesh.material as Material)
  }

  add(new Mesh(new BoxGeometry(20, 20, 20), new MeshBasicMaterial({ color: new Color(0.16, 0.18, 0.21), side: BackSide })))
  const panel = (w: number, h: number, pos: [number, number, number], intensity: number) => {
    const mesh = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ color: new Color(intensity, intensity, intensity), side: DoubleSide, toneMapped: false })
    )
    mesh.position.set(...pos)
    mesh.lookAt(0, 0, 0)
    add(mesh)
  }
  // 밝은 띠: 위 소프트박스, 좌우 세로 띠, 앞쪽 낮은 띠
  panel(12, 8, [0, 9.5, 2], 5)
  panel(3, 14, [-9.5, 0, 2], 3.5)
  panel(2, 14, [9.5, 0, -1], 2.5)
  panel(14, 2, [0, -3, 9.5], 1.2)
  // 어두운 띠: 대비를 만든다
  panel(4, 16, [-6, 0, -9.5], 0.01)
  panel(4, 16, [6, 0, 9.5], 0.01)
  panel(16, 3, [0, 4.5, -9.5], 0.01)

  const pmrem = new PMREMGenerator(renderer)
  const target = pmrem.fromScene(envScene, 0.02)
  pmrem.dispose()
  disposables.forEach((d) => d.dispose())
  return target.texture
}

type SceneRefs = {
  renderer: WebGLRenderer
  scene: Scene
  spin: Group
  offset: Group
  persp: PerspectiveCamera
  ortho: OrthographicCamera
  env: Texture
  light: DirectionalLight
  meshes: LogoMeshes | null
  radius: number
  size: { width: number; height: number }
}

const Logo3DViewport = forwardRef<Logo3DViewportHandle, Props>(function Logo3DViewport(props, ref) {
  const { geometry, frameColor, tileColor, rotX, rotY, rotZ, zoom, view, bgMode, bgA, bgB, bgAngle, grain, ratio, loading } = props

  const hostRef = useRef<HTMLDivElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)
  const refs = useRef<SceneRefs | null>(null)
  const frameRequested = useRef(false)
  const latest = useRef(props)
  latest.current = props
  const rotRef = useRef({ rotX, rotY })
  rotRef.current = { rotX, rotY }
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [webglError, setWebglError] = useState(false)

  /** 현재 상태로 카메라·그룹을 맞추고 한 번 그린다. */
  const draw = (width: number, height: number) => {
    const r = refs.current
    if (!r) return
    const p = latest.current
    const aspect = width / height
    const pose = cameraPoseFor(p.view)
    r.spin.rotation.set(
      (p.rotX * Math.PI) / 180,
      (p.rotY * Math.PI) / 180,
      (p.rotZ * Math.PI) / 180,
      'YXZ'
    )
    const zoomFactor = p.zoom / 100
    let camera: PerspectiveCamera | OrthographicCamera
    if (pose.kind === 'perspective') {
      const distance = fitDistance(r.radius, PERSPECTIVE_FOV_DEG, aspect) / zoomFactor
      r.persp.aspect = aspect
      r.persp.position.set(0, 0, distance)
      r.persp.near = Math.max(0.01, distance - r.radius * 3)
      r.persp.far = distance + r.radius * 3
      r.persp.lookAt(0, 0, 0)
      r.persp.updateProjectionMatrix()
      camera = r.persp
    } else {
      const { halfW, halfH } = orthoHalfExtent(r.radius, aspect)
      const distance = r.radius * 6
      r.ortho.left = -halfW
      r.ortho.right = halfW
      r.ortho.top = halfH
      r.ortho.bottom = -halfH
      r.ortho.zoom = zoomFactor
      r.ortho.near = 0.01
      r.ortho.far = distance + r.radius * 3
      r.ortho.position.set(...(pose.direction.map((v) => v * distance) as [number, number, number]))
      r.ortho.lookAt(0, 0, 0)
      r.ortho.updateProjectionMatrix()
      camera = r.ortho
    }
    r.light.position.set(2, 3, 4)
    r.renderer.render(r.scene, camera)
  }

  const requestRender = () => {
    if (frameRequested.current) return
    frameRequested.current = true
    requestAnimationFrame(() => {
      frameRequested.current = false
      const r = refs.current
      if (r) draw(r.size.width, r.size.height)
    })
  }

  const paintPreviewBackground = () => {
    const bg = bgCanvasRef.current
    const ctx = bg?.getContext('2d')
    if (!bg || !ctx) return
    const p = latest.current
    paintBackground(
      ctx,
      composeBackground(p.bgMode, p.bgA, p.bgB, p.bgAngle, bg.width, bg.height),
      bg.width,
      bg.height,
      p.grain
    )
  }

  // 렌더러·씬 생성과 정리
  useEffect(() => {
    const host = canvasHostRef.current
    if (!host) return
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: true })
    } catch {
      setWebglError(true)
      return
    }
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    host.appendChild(renderer.domElement)

    const scene = new Scene()
    const env = createStudioEnvironment(renderer)
    scene.environment = env
    const light = new DirectionalLight(0xffffff, 0.9)
    scene.add(light)
    const spin = new Group()
    const offset = new Group()
    spin.add(offset)
    scene.add(spin)

    refs.current = {
      renderer,
      scene,
      spin,
      offset,
      persp: new PerspectiveCamera(PERSPECTIVE_FOV_DEG, 1, 0.01, 100),
      ortho: new OrthographicCamera(-1, 1, 1, -1, 0.01, 100),
      env,
      light,
      meshes: null,
      radius: FALLBACK_RADIUS,
      size: { width: 1, height: 1 },
    }

    return () => {
      const r = refs.current
      refs.current = null
      if (!r) return
      if (r.meshes) disposeLogoMeshes(r.meshes)
      r.env.dispose()
      r.renderer.dispose()
      r.renderer.domElement.remove()
    }
  }, [])

  // 형상이 바뀌면 이전 형상을 해제하고 새로 만든다. 회전·줌·시점 변경은 이 효과를 거치지 않는다.
  useEffect(() => {
    const r = refs.current
    if (!r || !geometry) return
    const meshes = createLogoMeshes(geometry, latest.current.frameColor, latest.current.tileColor)
    r.offset.add(meshes.frame, meshes.tile, meshes.backPlate)
    r.meshes = meshes
    const center = geometry.bounds.getCenter(new Vector3())
    r.offset.position.copy(center).negate()
    const sphere = new Sphere()
    geometry.bounds.getBoundingSphere(sphere)
    r.radius = sphere.radius > 0 ? sphere.radius : FALLBACK_RADIUS
    requestRender()
    return () => {
      r.offset.remove(meshes.frame, meshes.tile, meshes.backPlate)
      disposeLogoMeshes(meshes)
      if (r.meshes === meshes) r.meshes = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 사유: 형상 객체가 바뀔 때만 다시 만든다(requestRender는 refs만 읽는다)
  }, [geometry])

  useEffect(() => {
    const r = refs.current
    if (r?.meshes) setLogoColors(r.meshes, frameColor, tileColor)
    requestRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 사유: 색 변경만 반영한다
  }, [frameColor, tileColor])

  useEffect(() => {
    requestRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 사유: 카메라·회전 변경만 다시 그린다
  }, [rotX, rotY, rotZ, zoom, view])

  // 컨테이너 크기를 재고, 비율에 맞는 상자 크기를 정한다
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const measure = () => setBox(fitBox(host.clientWidth, host.clientHeight, ratio))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [ratio])

  // 상자 크기가 바뀌면 렌더러·배경 캔버스 크기를 맞춘다
  useEffect(() => {
    const r = refs.current
    if (box.width === 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(box.width * dpr)
    const h = Math.round(box.height * dpr)
    if (r) {
      r.renderer.setPixelRatio(1)
      r.renderer.setSize(w, h, false)
      r.size = { width: w, height: h }
    }
    const bg = bgCanvasRef.current
    if (bg) {
      bg.width = w
      bg.height = h
    }
    paintPreviewBackground()
    requestRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 사유: 상자 크기 변경만 반영한다
  }, [box])

  useEffect(() => {
    paintPreviewBackground()
  }, [bgMode, bgA, bgB, bgAngle, grain])

  // 마우스 드래그 회전·휠 줌
  useEffect(() => {
    const el = canvasHostRef.current
    if (!el) return
    let last: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY }
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!last) return
      const next = applyDragRotation(rotRef.current, e.clientX - last.x, e.clientY - last.y)
      last = { x: e.clientX, y: e.clientY }
      rotRef.current = next
      latest.current.onRotate(next.rotX, next.rotY)
    }
    const up = (e: PointerEvent) => {
      last = null
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const next = zoomFromWheel(zoomRef.current, e.deltaY)
      zoomRef.current = next
      latest.current.onZoom(next)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    exportPng: async (target: CanvasRatio) => {
      const r = refs.current
      if (!r) throw new Error('3D 화면이 아직 준비되지 않았어요.')
      const { width, height } = stageSizeFor(target)
      const previous = r.size
      r.renderer.setPixelRatio(1)
      r.renderer.setSize(width, height, false)
      draw(width, height)

      const out = document.createElement('canvas')
      out.width = width
      out.height = height
      const ctx = out.getContext('2d')
      if (!ctx) throw new Error('이미지를 만들 캔버스를 열지 못했어요.')
      const p = latest.current
      paintBackground(ctx, composeBackground(p.bgMode, p.bgA, p.bgB, p.bgAngle, width, height), width, height, p.grain)
      // WebGL 캔버스는 알파가 곱해진 상태라 그대로 얹으면 가장자리에 테두리가 생기지 않는다.
      ctx.drawImage(r.renderer.domElement, 0, 0)

      r.renderer.setSize(previous.width, previous.height, false)
      draw(previous.width, previous.height)

      return new Promise<Blob>((resolve, reject) => {
        out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG를 만들지 못했어요.'))), 'image/png')
      })
    },
  }))

  return (
    <div ref={hostRef} className="relative flex min-h-[320px] min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#eceeea]">
      <div
        className="relative overflow-hidden rounded-md shadow-sm"
        style={{
          width: box.width,
          height: box.height,
          backgroundColor: '#ffffff',
          backgroundImage:
            bgMode === 'transparent'
              ? 'linear-gradient(45deg,#e4e6e2 25%,transparent 25%),linear-gradient(-45deg,#e4e6e2 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e4e6e2 75%),linear-gradient(-45deg,transparent 75%,#e4e6e2 75%)'
              : undefined,
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
        }}
      >
        <canvas ref={bgCanvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
        <div
          ref={canvasHostRef}
          className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
          role="img"
          aria-label="3D 로고 미리보기"
        />
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-white/50 text-xs text-[#1e2322] break-keep wrap-break-word">
            불러오는 중이에요...
          </div>
        )}
        {!loading && !geometry && !webglError && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-[#6f766c] break-keep wrap-break-word text-balance">
            폰트를 고르고 글자를 입력하거나 SVG를 올리면 3D 로고가 보여요.
          </div>
        )}
        {webglError && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-[#b42318] break-keep wrap-break-word text-balance">
            3D 화면을 열지 못했어요. 이 브라우저에서 WebGL을 쓸 수 없어요. 다른 브라우저에서 다시 열어 주세요.
          </div>
        )}
      </div>
    </div>
  )
})

export default Logo3DViewport
