'use client'

/**
 * 3D 로고 미리보기 뷰포트 (티켓 20261103_1352, 에셋 3D 모드로 옮김: 티켓 20261103_1734)
 *
 * `three`의 WebGLRenderer(alpha)로 틀(스틸)·타일(도자기)·바닥판을 그린다.
 * - 회전: 슬라이더가 정한 rotX·rotY·rotZ를 로고 그룹에 적용한다. 마우스 드래그는 같은 값을 `onRotate`로 올려
 *   슬라이더와 한 상태를 공유한다(카메라를 돌리는 OrbitControls는 슬라이더 값과 합칠 수 없어 쓰지 않았다).
 * - 줌: 휠이 `onZoom`으로 같은 줌 상태를 바꾼다. 원근은 카메라 거리, 등각(직교)은 카메라 zoom으로 반영한다.
 * - 보이는 화면은 2D 캔버스 한 장이다. three 렌더러(화면에 붙이지 않음)가 그린 3D 이미지를 `composeStage`가
 *   배경 → 3D → 그레인 → 오버레이 레이어 순으로 쌓는다. PNG 저장·콘텐츠 적용도 같은 합성을 쓴다(티켓 20261103_1735).
 *   반사용 환경 맵은 배경과 상관없이 그대로다.
 * - 배경·그레인·비율·오버레이 레이어는 에셋 화면의 값을 받는다. 그레인은 Shape 모드처럼 배경과 3D 이미지에 입히고 오버레이 아래다.
 * - 에셋 화면의 뷰포트 핸들(`AssetGeneratorViewportHandle`)을 구현해 콘텐츠 적용 탭이 이 스테이지를 그대로 가져간다.
 * - 이 컴포넌트가 사라지면(모드 전환·화면 이동) 렌더러·환경 맵·형상의 geometry·material을 모두 `dispose`한다.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  BackSide,
  BoxGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Sphere,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { ImageLayerConfig, OverlayLayerConfig, TextLayerConfig } from '@/lib/asset-generator'
import type { LogoGeometry } from '@/lib/logo-3d/buildGeometry'
import { buildFontLoadKey, isSystemDefaultFont } from '@/app/admin/asset-generator/assetGeneratorHelpers'
import type { AssetGeneratorViewportHandle } from '@/app/admin/asset-generator/AssetGeneratorViewport'
import { drawOverlayLayersOnto, toContextLike, useOverlayAssets } from '../overlayStage'
import { Logo3DUndoFooter } from './Logo3DUndoFooter'
import {
  applyDragRotation,
  cameraPoseFor,
  composeBackground,
  fitBox,
  fitDistance,
  logo3dFileName,
  orthoHalfExtent,
  stageSizeFor,
  zoomFromWheel,
  type BackgroundMode,
  type CanvasRatio,
  type Logo3DView,
} from './logo3dConfig'
import { VIDEO_SEC } from '../shapeStudioConfig'
import { downloadBlob, pickVideoType, videoBitrate, videoSizeFor } from '../videoRecording'
import { composeStage, exportSizeFor } from './stageCompose'
import { VIDEO_FPS, turntableFrameCount, turntableFrameRotY } from './turntable'

const PERSPECTIVE_FOV_DEG = 30
const FALLBACK_RADIUS = 0.8

const NO_LAYERS: OverlayLayerConfig[] = []

export type Logo3DViewportHandle = AssetGeneratorViewportHandle & {
  /** 선택한 비율의 고정 크기(`stageSizeFor`)로 다시 그려 PNG Blob을 만든다(별도 3D 로고 페이지용). */
  exportPng: (ratio: CanvasRatio) => Promise<Blob>
  /** 에셋 Export 크기(긴 변)와 Canvas 비율로 배경·3D·그레인·오버레이를 합성해 PNG 파일로 저장한다. */
  exportPngFile: (size: number) => Promise<void>
  /**
   * 로고가 Y축으로 한 바퀴 도는 턴테이블 영상을 `VIDEO_SEC`초 동안 녹화해 저장한다(티켓 20261103_1737).
   * 크기·녹화 형식은 Shape 모드와 같다(`videoRecording.ts`). 지금 회전값에서 시작해 같은 각도로 끝난다.
   */
  recordVideo: (longSide: number) => Promise<void>
  cancelVideo: () => void
}

/** 녹화 중 카메라·회전을 고정해 두는 자세. 녹화 도중 슬라이더·드래그가 와도 영상은 이 값만 따른다. */
type RecordingPose = { rotX: number; rotY: number; rotZ: number; zoom: number; view: Logo3DView }

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
  /** 3D 위에 합성할 오버레이 레이어(이미지·텍스트). 없으면 합성하지 않는다. */
  overlayLayers?: OverlayLayerConfig[]
  /** 저장 파일명에 쓰는 글자(폰트 글자열 또는 SVG 이름). */
  fileLabel?: string
  loading: boolean
  onExportBusyChange?: (busy: boolean) => void
  /** 동영상 녹화 시작·끝과 버튼 글자(「녹화 중 3 / 15초」)를 알린다. */
  onVideoRecordingChange?: (recording: boolean, label: string) => void
  onRotate: (rotX: number, rotY: number) => void
  onZoom: (zoom: number) => void
  /** 하단 「되돌리기」 버튼. 기록이 없으면 비활성. */
  canUndo: boolean
  onUndo: () => void
}

export type LogoMeshes = { frame: Mesh; tile: Mesh; backPlate: Mesh }

/** 환경 속 발광 면. `roll`(라디안)은 바라보는 축으로 돌려 반사 줄기를 대각선으로 눕힌다. */
type Softbox = { w: number; h: number; pos: [number, number, number]; intensity: number; roll?: number }

/**
 * 조명·재질 값을 한 곳에 모은다(티켓 20261103_1718). 사용자 레퍼런스(선명한 파랑 배경, 넓은 대각선 반사 줄기가
 * 있는 유약 타일, 베벨에 하이라이트 선이 있는 새틴 스틸 틀)에 맞춰 로컬 실렌더를 보며 정한 값이다.
 * 질감은 밝은 소프트박스와 어두운 바탕의 대비에서 나온다 — 바탕을 밝히면 반사가 평평해진다.
 */
export const LOGO3D_LOOK = {
  exposure: 1,
  /** 환경 바탕(반사에 비치는 어두운 면)의 밝기 */
  envBase: 0.05,
  /**
   * 반사에 비치는 밝은 면. 세기는 HDR 값이다. 면을 크게 하면 확산광이 늘어 타일 바탕색이 허옇게 뜨므로,
   * 작고 아주 밝게 두어 확산광은 줄이고 반사만 또렷하게 한다.
   */
  softboxes: [
    { w: 7, h: 2.2, pos: [-2, 9.5, 3], intensity: 30 },
    { w: 1, h: 13, pos: [-9.5, 1, 3], intensity: 22 },
    { w: 0.8, h: 11, pos: [9.5, 0, 1], intensity: 14 },
    { w: 16, h: 0.6, pos: [0, -3, 9.5], intensity: 8 },
    // 타일 유약의 반사광 띠 세 줄: 기본 각도(x 14°·y 22°)에서 타일 면이 비추는 방향(약 오른쪽 아래 앞쪽) 둘레에
    // 대각선으로 눕혀 둔다. 타일 법선 맵(glaze)의 완만한 굴곡이 이 띠들을 면 위에 흐르듯 맺히게 한다.
    { w: 26, h: 0.8, pos: [7.2, -5.5, 5.5], intensity: 6, roll: 0.6 },
    { w: 26, h: 0.8, pos: [6.1, -3.6, 5.5], intensity: 11, roll: 0.6 },
    { w: 26, h: 0.8, pos: [4.9, -1.8, 5.5], intensity: 6, roll: 0.6 },
  ] as Softbox[],
  /** 대비를 만드는 검은 면 */
  darkPanels: [
    { w: 5, h: 16, pos: [-6, 0, -9.5], intensity: 0 },
    { w: 5, h: 16, pos: [6, 0, 9.5], intensity: 0 },
    { w: 16, h: 4, pos: [0, 5, -9.5], intensity: 0 },
  ] as Softbox[],
  keyLight: { intensity: 1, position: [-2, 4, 5] as [number, number, number] },
  frame: { metalness: 0.95, roughness: 0.3, envMapIntensity: 1.3 },
  tile: { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.1, specularIntensity: 0.8 },
  /**
   * 유약 표면 결. 완전히 평평한 면은 면 전체가 같은 밝기로 비쳐 질감이 없다. 완만한 굴곡(낮은 주파수)과
   * 미세한 결(높은 주파수)을 법선 맵으로 주어 반사광이 흐르듯 맺히게 한다. 형상은 바꾸지 않는다.
   */
  glaze: { size: 256, waveAmp: 1, grainAmp: 0.02, strength: 1, normalScale: 0.18, clearcoatNormalScale: 0.22, repeat: 0.45 },
  backPlate: { roughness: 0.5 },
}

/** 0~1 사이의 결정적 잡음(같은 칸이면 같은 값). 법선 맵이 매번 같게 나오도록 난수를 쓰지 않는다. */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * 유약 결 법선 맵을 만든다. 높이를 이어 붙여도 이음매가 없도록 정수 주파수의 사인 합과 칸 단위 잡음으로 만들고,
 * 이웃 높이 차이로 법선을 구한다(접선 공간, 0~255로 부호화).
 */
export function createGlazeNormalMap(look = LOGO3D_LOOK.glaze): DataTexture {
  const { size, waveAmp, grainAmp, strength } = look
  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const wave =
        0.55 * Math.sin(2 * Math.PI * (u + v)) + 0.35 * Math.sin(2 * Math.PI * (2 * u - v) + 1.3) + 0.2 * Math.sin(2 * Math.PI * (3 * v) + 0.7)
      height[y * size + x] = waveAmp * wave + grainAmp * (hash2(x, y) - 0.5)
    }
  }
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((at(x + 1, y) - at(x - 1, y)) / 2) * strength * (size / 64)
      const dy = ((at(x, y + 1) - at(x, y - 1)) / 2) * strength * (size / 64)
      const len = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255)
      data[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255)
      data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255)
      data[i + 3] = 255
    }
  }
  const texture = new DataTexture(data, size, size)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.repeat.set(look.repeat, look.repeat)
  texture.needsUpdate = true
  return texture
}

/** 유약 법선 맵은 모든 형상이 같이 쓴다(형상을 바꿀 때마다 다시 만들지 않는다). 재질을 해제해도 텍스처는 남는다. */
let sharedGlazeMap: DataTexture | null = null
function glazeNormalMap(): DataTexture {
  if (!sharedGlazeMap) sharedGlazeMap = createGlazeNormalMap()
  return sharedGlazeMap
}

/** 형상마다 재질을 새로 만든다. 틀은 새틴(반무광) 스틸, 타일은 광택층이 있는 도자기다. */
export function createLogoMeshes(geometry: LogoGeometry, frameColor: string, tileColor: string): LogoMeshes {
  const look = LOGO3D_LOOK
  const frameMat = new MeshStandardMaterial({ color: frameColor, ...look.frame })
  const glaze = glazeNormalMap()
  const tileMat = new MeshPhysicalMaterial({
    color: tileColor,
    metalness: 0,
    ...look.tile,
    normalMap: glaze,
    normalScale: new Vector2(look.glaze.normalScale, look.glaze.normalScale),
    clearcoatNormalMap: glaze,
    clearcoatNormalScale: new Vector2(look.glaze.clearcoatNormalScale, look.glaze.clearcoatNormalScale),
  })
  const backMat = new MeshStandardMaterial({ color: tileColor, metalness: 0, ...look.backPlate })
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

/** 대비가 있는 밝은·어두운 띠로 만든 스튜디오 환경. PMREM으로 반사용 맵을 만든다. */
function createStudioEnvironment(renderer: WebGLRenderer): Texture {
  const envScene = new Scene()
  const disposables: { dispose: () => void }[] = []
  const add = (mesh: Mesh) => {
    envScene.add(mesh)
    disposables.push(mesh.geometry, mesh.material as Material)
  }

  const base = LOGO3D_LOOK.envBase
  add(new Mesh(new BoxGeometry(20, 20, 20), new MeshBasicMaterial({ color: new Color(base, base * 1.1, base * 1.3), side: BackSide })))
  const panel = ({ w, h, pos, intensity, roll = 0 }: Softbox) => {
    const mesh = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ color: new Color(intensity, intensity, intensity), side: DoubleSide, toneMapped: false })
    )
    mesh.position.set(...pos)
    mesh.lookAt(0, 0, 0)
    if (roll) mesh.rotateZ(roll)
    add(mesh)
  }
  // 밝은 면(소프트박스)과 어두운 면이 번갈아 비쳐야 금속·유약이 질감 있게 읽힌다
  LOGO3D_LOOK.softboxes.forEach(panel)
  LOGO3D_LOOK.darkPanels.forEach(panel)

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
  const overlayLayers = props.overlayLayers ?? NO_LAYERS

  const hostRef = useRef<HTMLDivElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const displayRef = useRef<HTMLCanvasElement>(null)
  const exportingRef = useRef(false)
  /** 녹화 중이면 고정한 자세(회전은 프레임마다 바뀜). 아니면 null — `draw`가 이 값을 우선한다. */
  const recordingPoseRef = useRef<RecordingPose | null>(null)
  const recAbortRef = useRef(false)
  const refs = useRef<SceneRefs | null>(null)
  const frameRequested = useRef(false)
  const latest = useRef(props)
  latest.current = props
  const rotRef = useRef({ rotX, rotY })
  rotRef.current = { rotX, rotY }
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const [box, setBox] = useState({ width: 0, height: 0 })
  const boxRef = useRef(box)
  boxRef.current = box
  const [webglError, setWebglError] = useState(false)

  /** 현재 상태로 카메라·그룹을 맞추고 한 번 그린다. */
  const draw = (width: number, height: number) => {
    const r = refs.current
    if (!r) return
    // 녹화 중에는 슬라이더·드래그로 들어온 값이 아니라 고정한 자세를 쓴다
    const p = recordingPoseRef.current ?? latest.current
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
    r.light.position.set(...LOGO3D_LOOK.keyLight.position)
    r.renderer.render(r.scene, camera)
  }

  /** 오버레이 레이어를 (width, height) 기준으로 그린다. 위치·크기는 스테이지 대비 %라 미리보기와 저장이 같다. */
  const drawOverlays = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    drawOverlayLayersOnto(
      toContextLike(ctx),
      latest.current.overlayLayers ?? NO_LAYERS,
      imageTrackerRef.current.getValues(),
      width,
      height
    )
  }

  /** 3D를 지금 상태로 그리고, 보이는 2D 캔버스에 배경·그레인·오버레이와 합성한다. */
  const renderPreview = () => {
    const r = refs.current
    const display = displayRef.current
    const ctx = display?.getContext('2d')
    if (!r || !display || !ctx || display.width === 0) return
    draw(r.size.width, r.size.height)
    const p = latest.current
    composeStage(ctx, {
      width: display.width,
      height: display.height,
      background: composeBackground(p.bgMode, p.bgA, p.bgB, p.bgAngle, display.width, display.height),
      logo: r.renderer.domElement,
      grainPct: p.grain,
      drawOverlays,
    })
  }

  const requestRender = () => {
    if (frameRequested.current) return
    frameRequested.current = true
    requestAnimationFrame(() => {
      frameRequested.current = false
      renderPreview()
    })
  }

  // 오버레이 이미지·폰트를 불러오면 다시 합성한다
  const { imageTrackerRef, fontTrackerRef } = useOverlayAssets(overlayLayers, requestRender)

  // 렌더러·씬 생성과 정리
  useEffect(() => {
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: true })
    } catch {
      setWebglError(true)
      return
    }
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = SRGBColorSpace
    // ACES는 채도를 깎아 하늘색 타일이 탁해진다 — 색상·채도를 보존하는 Neutral을 쓴다
    renderer.toneMapping = NeutralToneMapping
    renderer.toneMappingExposure = LOGO3D_LOOK.exposure
    // 렌더러 캔버스는 화면에 붙이지 않는다 — 보이는 것은 합성한 2D 캔버스(`displayRef`)다.

    const scene = new Scene()
    const env = createStudioEnvironment(renderer)
    scene.environment = env
    const light = new DirectionalLight(0xffffff, LOGO3D_LOOK.keyLight.intensity)
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
      recAbortRef.current = true // 녹화 중에 화면이 사라지면 녹화를 멈춘다
      const r = refs.current
      refs.current = null
      if (!r) return
      if (r.meshes) disposeLogoMeshes(r.meshes)
      r.env.dispose()
      r.renderer.dispose()
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

  /** 상자 크기에 맞춰 렌더러·합성 캔버스 크기를 정한다. 녹화가 끝나면 녹화 크기에서 이 크기로 되돌릴 때도 쓴다. */
  const applyStageSize = () => {
    const b = boxRef.current
    if (b.width === 0) return
    const r = refs.current
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(b.width * dpr)
    const h = Math.round(b.height * dpr)
    if (r) {
      r.renderer.setPixelRatio(1)
      r.renderer.setSize(w, h, false)
      r.size = { width: w, height: h }
    }
    const display = displayRef.current
    if (display) {
      display.width = w
      display.height = h
    }
    requestRender()
  }

  // 상자 크기가 바뀌면 렌더러·배경 캔버스 크기를 맞춘다. 녹화 중에는 녹화 크기를 지키고 끝난 뒤 맞춘다.
  useEffect(() => {
    if (recordingPoseRef.current) return
    applyStageSize()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 사유: 상자 크기 변경만 반영한다
  }, [box])

  useEffect(() => {
    requestRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 사유: 배경·그레인·레이어 변경만 다시 합성한다(requestRender는 refs만 읽는다)
  }, [bgMode, bgA, bgB, bgAngle, grain, overlayLayers])

  // 마우스 드래그 회전·휠 줌
  useEffect(() => {
    const el = canvasHostRef.current
    if (!el) return
    let last: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      if (recordingPoseRef.current) return // 녹화 중에는 드래그로 돌리지 않는다
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
      if (recordingPoseRef.current) return // 녹화 중에는 휠 줌도 막는다
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

  /** 저장 크기로 3D를 다시 그리고 배경·그레인·오버레이와 합성해 PNG Blob을 만든다. 끝나면 미리보기 크기로 되돌린다. */
  const renderStageBlob = async (width: number, height: number): Promise<Blob> => {
    const r = refs.current
    if (!r) throw new Error('3D 화면이 아직 준비되지 않았어요.')
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('이미지를 만들 캔버스를 열지 못했어요.')
    const previous = r.size
    try {
      r.renderer.setPixelRatio(1)
      r.renderer.setSize(width, height, false)
      draw(width, height)
      const p = latest.current
      // WebGL 캔버스는 알파가 곱해진 상태라 그대로 얹으면 가장자리에 테두리가 생기지 않는다.
      composeStage(ctx, {
        width,
        height,
        background: composeBackground(p.bgMode, p.bgA, p.bgB, p.bgAngle, width, height),
        logo: r.renderer.domElement,
        grainPct: p.grain,
        drawOverlays,
      })
    } finally {
      r.renderer.setSize(previous.width, previous.height, false)
      renderPreview()
    }
    return new Promise<Blob>((resolve, reject) => {
      out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG를 만들지 못했어요.'))), 'image/png')
    })
  }

  const exportPngFile = async (size: number): Promise<void> => {
    const r = refs.current
    if (!r || exportingRef.current) return
    exportingRef.current = true
    props.onExportBusyChange?.(true)
    try {
      if (!imageTrackerRef.current.isIdle()) {
        toast.info('이미지를 불러오는 중이에요. 완료되면 자동으로 진행할게요.')
        await imageTrackerRef.current.waitUntilIdle()
      }
      if (!fontTrackerRef.current.isIdle()) {
        toast.info('폰트를 불러오는 중이에요. 완료되면 자동으로 진행할게요.')
        await fontTrackerRef.current.waitUntilIdle()
      }
      const gl = r.renderer.getContext()
      const max = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number
      if (size > max) throw new Error(`이 기기의 최대 출력 크기는 ${max}px입니다.`)
      const { width, height } = exportSizeFor(size, latest.current.ratio)
      const blob = await renderStageBlob(width, height)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = logo3dFileName(latest.current.fileLabel ?? '', latest.current.ratio)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      toast(`${width} × ${height} PNG 저장 완료`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'PNG 저장에 실패했습니다.')
    } finally {
      exportingRef.current = false
      props.onExportBusyChange?.(false)
    }
  }

  /**
   * 턴테이블 동영상 저장. Shape 모드 `recordVideo`와 같은 길이(`VIDEO_SEC`)·크기 규칙·녹화 형식을 쓴다.
   * 보이는 합성 캔버스를 녹화 크기로 키워 프레임마다 3D → 합성을 다시 그리고, 그 캔버스를 그대로 녹화한다.
   * 형상(geometry)은 건드리지 않고 로고 그룹의 회전만 바꾸며, 끝나면 크기·자세를 원래대로 되돌린다.
   */
  const recordVideo = async (longSide: number): Promise<void> => {
    const r = refs.current
    const display = displayRef.current
    if (!r || !display || exportingRef.current) return

    const canvasWithStream = display as HTMLCanvasElement & { captureStream?: (frameRate?: number) => MediaStream }
    if (typeof window === 'undefined' || !('MediaRecorder' in window) || !canvasWithStream.captureStream) {
      toast('이 브라우저는 동영상 저장을 지원하지 않아요. Chrome에서 열어주세요.')
      return
    }
    const type = pickVideoType()
    if (!type) {
      toast('지원되는 동영상 형식이 없어요.')
      return
    }

    const onChange = props.onVideoRecordingChange
    const idleLabel = `동영상 저장 (${VIDEO_SEC}초)`
    exportingRef.current = true
    recAbortRef.current = false
    props.onExportBusyChange?.(true)
    onChange?.(true, `녹화 중 0 / ${VIDEO_SEC}초`)

    const { width: w, height: h } = videoSizeFor(longSide, latest.current.ratio)
    const chunks: BlobPart[] = []
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    try {
      if (!imageTrackerRef.current.isIdle()) await imageTrackerRef.current.waitUntilIdle()
      if (!fontTrackerRef.current.isIdle()) await fontTrackerRef.current.waitUntilIdle()
      // 로딩 대기 중 취소됐거나 화면이 사라졌으면 녹화기를 만들지 않고 바로 끝낸다(크기·자세는 finally가 복원)
      if (recAbortRef.current || !refs.current) {
        if (recAbortRef.current) toast('녹화를 취소했어요.')
        return
      }
      const gl = r.renderer.getContext()
      const max = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number
      if (Math.max(w, h) > max) throw new Error(`이 기기의 최대 출력 크기는 ${max}px입니다.`)

      // 시작 자세를 고정한다 — 이 순간부터 슬라이더·드래그·휠 입력은 영상에 반영되지 않는다
      const start: RecordingPose = {
        rotX: latest.current.rotX,
        rotY: latest.current.rotY,
        rotZ: latest.current.rotZ,
        zoom: latest.current.zoom,
        view: latest.current.view,
      }
      recordingPoseRef.current = start
      r.renderer.setPixelRatio(1)
      r.renderer.setSize(w, h, false)
      r.size = { width: w, height: h }
      display.width = w
      display.height = h
      renderPreview()

      // 프레임을 그릴 때마다 requestFrame()으로 한 장씩 밀어 넣는다. requestFrame이 없는 브라우저는 30fps 자동 캡처로 물러선다.
      stream = canvasWithStream.captureStream(0)
      let track = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined
      if (!track || typeof track.requestFrame !== 'function') {
        stream.getTracks().forEach((t) => t.stop())
        stream = canvasWithStream.captureStream(VIDEO_FPS)
        track = undefined
      }
      const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: videoBitrate(w, h) })
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data)
      }
      const done = new Promise<void>((res) => {
        recorder.onstop = () => res()
      })
      recorder.start(500)

      // 회전은 경과 시간이 아니라 프레임 번호(0~n)로 정한다. 다음 프레임까지는 rAF 대신 setTimeout으로 기다린다(숨겨진 창의 rAF 지연 회피).
      const n = turntableFrameCount(VIDEO_FPS, VIDEO_SEC)
      const interval = 1000 / VIDEO_FPS
      const t0 = performance.now()
      let shownSec = -1
      for (let i = 0; i <= n; i++) {
        recordingPoseRef.current = { ...start, rotY: turntableFrameRotY(start.rotY, i, n) }
        renderPreview()
        track?.requestFrame?.()
        const sec = Math.min(VIDEO_SEC, Math.floor(i / VIDEO_FPS))
        if (sec !== shownSec) {
          shownSec = sec
          onChange?.(true, `녹화 중 ${sec} / ${VIDEO_SEC}초`)
        }
        if (recAbortRef.current || !refs.current) break
        // 마지막 프레임도 한 프레임 길이만큼 유지한 뒤 녹화를 멈춘다
        const wait = Math.max(0, t0 + (i + 1) * interval - performance.now())
        await new Promise<void>((resolve) => {
          timer = setTimeout(resolve, wait)
        })
      }
      recorder.stop()
      await done

      if (recAbortRef.current) {
        toast('녹화를 취소했어요.')
      } else {
        const blob = new Blob(chunks, { type: type.split(';')[0] })
        if (!blob.size) throw new Error('녹화된 영상이 비어 있어요.')
        const isMp4 = type.startsWith('video/mp4')
        downloadBlob(blob, `${logo3dFileName(latest.current.fileLabel ?? '', latest.current.ratio).replace(/\.png$/i, '')}${isMp4 ? '.mp4' : '.webm'}`)
        toast(`${w} × ${h} · ${VIDEO_SEC}초 ${isMp4 ? 'MP4' : 'WebM'} 저장 완료`)
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : '동영상 저장에 실패했어요.')
    } finally {
      clearTimeout(timer)
      if (stream) stream.getTracks().forEach((t) => t.stop())
      recordingPoseRef.current = null
      exportingRef.current = false
      props.onExportBusyChange?.(false)
      onChange?.(false, idleLabel)
      // 녹화 크기에서 미리보기 크기로 되돌리고 원래 회전값으로 다시 그린다
      if (refs.current) applyStageSize()
    }
  }

  useImperativeHandle(ref, () => ({
    // 콘텐츠 적용 탭이 쓰는 핸들 — 보이는 합성 캔버스를 그대로 돌려준다. 3D는 움직이지 않아 머리 위치·곡선이 없다.
    getCanvas: () => displayRef.current,
    getPathTotal: () => 0,
    getHead: () => 0,
    setHead: () => {},
    drawAtHead: () => renderPreview(),
    setExporting: () => {},
    areImageAssetsReady: () => imageTrackerRef.current.isIdle(),
    waitForImageAssets: () => imageTrackerRef.current.waitUntilIdle(),
    getMissingImageAssetCount: () =>
      (latest.current.overlayLayers ?? NO_LAYERS).filter(
        (l): l is ImageLayerConfig => l.type === 'image' && !imageTrackerRef.current.has(l.assetUrl)
      ).length,
    areFontsReady: () => fontTrackerRef.current.isIdle(),
    waitForFonts: () => fontTrackerRef.current.waitUntilIdle(),
    getMissingFontCount: () =>
      (latest.current.overlayLayers ?? NO_LAYERS).filter(
        (l): l is TextLayerConfig =>
          l.type === 'text' && !isSystemDefaultFont(l.font) && !fontTrackerRef.current.has(buildFontLoadKey(l.font))
      ).length,
    exportPng: (target: CanvasRatio) => {
      const { width, height } = stageSizeFor(target)
      return renderStageBlob(width, height)
    },
    exportPngFile,
    recordVideo,
    cancelVideo: () => {
      recAbortRef.current = true
    },
  }))

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#eceeea]">
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
          <div
            ref={canvasHostRef}
            className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
            role="img"
            aria-label="3D 로고 미리보기"
          >
            <canvas ref={displayRef} className="block h-full w-full" aria-hidden="true" />
          </div>
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
      <Logo3DUndoFooter canUndo={props.canUndo} onUndo={props.onUndo} />
    </div>
  )
})

export default Logo3DViewport
