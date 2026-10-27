'use client'

/**
 * 어드민 디자인 > 에셋 — 통합 에셋 스튜디오 (티켓 20261022_1318)
 *
 * Shape Studio v2(WebGL 세그먼트·메타볼·글자 SDF)와 에셋 제너레이터(2D 리본 곡선 이동 엔진·
 * 마스터 시드) 두 가지 생성 모드를 지원하며, 이미지·텍스트 오버레이 레이어 합성, 서버 DB 프리셋
 * 저장·불러오기(`PresetPanel`), 콘텐츠 바로 적용(`ApplyTab`)을 단일 화면에서 제공한다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import {
  choice,
  deriveRibbonFromSeed,
  type ImageLayerConfig,
  type LetterKey,
  type OverlayLayerConfig,
  type RandomRibbonValues,
  type RibbonLayerConfig,
  type StageRatio,
  type TextLayerConfig,
} from '@/lib/asset-generator'
import {
  computeInitialImageWidthPct,
  createImageLayer,
  createTextLayer,
  deselectIfRemoved,
  generateRandomSeed,
  INITIAL_RIBBON_LAYER,
  LETTER_KEYS,
  moveImageLayer,
  readImageNaturalWidth,
  removeImageLayer,
  resolveStageSize,
} from '@/app/admin/asset-generator/assetGeneratorHelpers'
import ShapeStudioPanel from './ShapeStudioPanel'
import ShapeStudioViewport, { type ShapeStudioViewportHandle } from './ShapeStudioViewport'
import {
  BUILTIN_GLYPHS,
  cloneState,
  GLYPH_PRESETS,
  GT,
  hasActiveRandomOption,
  INITIAL_RAND_TOGGLES,
  INITIAL_STATE,
  isGlyphPreset,
  randomizeState,
  seg,
  SHAPE_PRESETS,
  VIDEO_SEC,
  type AnyShapePreset,
  type BackgroundMode,
  type CanvasRatio,
  type GlyphDefinition,
  type GlyphPreset,
  type GradientPreset,
  type RandomOptionKey,
  type RandomToggleState,
  type SegmentItem,
  type ShapeStudioState,
  type StudioEngineMode,
} from './shapeStudioConfig'

function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      res(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      rej(new Error('이미지를 읽을 수 없어요. 올바른 PNG 또는 SVG인지 확인해 주세요.'))
    }
    img.src = url
  })
}

function applyRandomRibbon(
  random: RandomRibbonValues,
  prev: RibbonLayerConfig
): RibbonLayerConfig {
  return {
    ...prev,
    backgroundColor: random.backgroundColor,
    endColor: random.endColor,
    linkStartToBackground: random.linkStartToBackground,
    startColor: random.linkStartToBackground ? random.backgroundColor : prev.startColor,
    sizePct: random.sizePct,
    blurPct: random.blurPct,
    rotationDeg: random.rotationDeg,
    followPath: random.followPath,
    direction: random.direction,
    irregularityPct: random.irregularityPct,
    seed: random.seed,
    speed: random.speed,
    gap: random.gap,
    count: random.count,
  }
}

export default function AdminAssetsShapeStudioPage() {
  const [engineMode, setEngineMode] = useState<StudioEngineMode>('shape')
  const [state, setState] = useState<ShapeStudioState>(() => {
    const s = cloneState(INITIAL_STATE)
    if (s.width < 500) s.width = 500
    return s
  })
  const [history, setHistory] = useState<ShapeStudioState[]>([])
  const [randOn, setRandOn] = useState<RandomToggleState>(() => ({ ...INITIAL_RAND_TOGGLES }))
  const [customPresets, setCustomPresets] = useState<GlyphPreset[]>([])
  const [glyphsMap, setGlyphsMap] = useState<Record<string, GlyphDefinition>>(() => ({
    ...BUILTIN_GLYPHS,
  }))

  const [ribbonLayer, setRibbonLayer] = useState<RibbonLayerConfig>(INITIAL_RIBBON_LAYER)
  const [uploadedRibbonFileName, setUploadedRibbonFileName] = useState<string | null>(null)

  const [overlayLayers, setOverlayLayers] = useState<OverlayLayerConfig[]>([])
  const [selectedOverlayLayerId, setSelectedOverlayLayerId] = useState<string | null>(null)

  const [statusText, setStatusText] = useState('실시간 렌더링')
  const [exportSize, setExportSize] = useState(2048)
  const [videoSize, setVideoSize] = useState(1080)
  const [exportBusy, setExportBusy] = useState(false)
  const [videoRecording, setVideoRecording] = useState(false)
  const [videoButtonLabel, setVideoButtonLabel] = useState(`동영상 저장 (${VIDEO_SEC}초)`)

  const viewportRef = useRef<ShapeStudioViewportHandle | null>(null)
  const shapeFileInputRef = useRef<HTMLInputElement | null>(null)
  const customCountRef = useRef(0)
  const customPresetsRef = useRef<GlyphPreset[]>(customPresets)
  const uploadedRibbonUrlRef = useRef<string | null>(null)
  const imageLayerUrlsRef = useRef<Set<string>>(new Set())

  const stateRef = useRef<ShapeStudioState>(state)
  const randOnRef = useRef<RandomToggleState>(randOn)
  const engineModeRef = useRef<StudioEngineMode>(engineMode)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    randOnRef.current = randOn
  }, [randOn])

  useEffect(() => {
    engineModeRef.current = engineMode
  }, [engineMode])

  useEffect(() => {
    customPresetsRef.current = customPresets
  }, [customPresets])

  useEffect(() => {
    const imageLayerUrls = imageLayerUrlsRef.current
    return () => {
      if (uploadedRibbonUrlRef.current) URL.revokeObjectURL(uploadedRibbonUrlRef.current)
      imageLayerUrls.forEach((url) => URL.revokeObjectURL(url))
      imageLayerUrls.clear()
    }
  }, [])

  const remember = useCallback((snapshot: ShapeStudioState) => {
    setHistory((prev) => {
      const next = [...prev, cloneState(snapshot)]
      if (next.length > 50) next.shift()
      return next
    })
  }, [])

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (!prev.length) return prev
      const next = [...prev]
      const popped = next.pop()
      if (popped) {
        setState(popped)
      }
      return next
    })
  }, [])

  const handleRandomizeShape = useCallback(() => {
    const cur = stateRef.current
    const toggles = randOnRef.current
    if (!hasActiveRandomOption(cur, toggles)) {
      toast('랜덤 생성할 항목을 하나 이상 체크해 주세요.')
      return
    }
    remember(cur)
    setState(randomizeState(cur, toggles))
  }, [remember])

  const handleRandomizeRibbonAll = useCallback(() => {
    const random = deriveRibbonFromSeed(generateRandomSeed())
    setRibbonLayer((prev) => ({
      ...applyRandomRibbon(random, prev),
      source:
        prev.source.kind === 'upload'
          ? prev.source
          : { kind: 'letter', letter: choice(LETTER_KEYS) },
    }))
  }, [])

  const handleRandomizeActiveMode = useCallback(() => {
    if (engineModeRef.current === 'ribbon') {
      handleRandomizeRibbonAll()
    } else {
      handleRandomizeShape()
    }
  }, [handleRandomizeRibbonAll, handleRandomizeShape])

  const handleReset = useCallback(() => {
    remember(stateRef.current)
    setState(cloneState(INITIAL_STATE))
    setRibbonLayer(INITIAL_RIBBON_LAYER)
    if (uploadedRibbonUrlRef.current) {
      URL.revokeObjectURL(uploadedRibbonUrlRef.current)
      uploadedRibbonUrlRef.current = null
    }
    setUploadedRibbonFileName(null)
    viewportRef.current?.resetMotionTime()
    toast('처음 설정으로 돌아왔어요.')
  }, [remember])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName ?? ''
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(activeTag)) return
      if (e.code === 'Space') {
        e.preventDefault()
        handleRandomizeActiveMode()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleRandomizeActiveMode, handleUndo])

  const allPresets = useMemo<AnyShapePreset[]>(
    () => [...GLYPH_PRESETS, ...SHAPE_PRESETS, ...customPresets],
    [customPresets]
  )

  const handleSelectShapePreset = useCallback(
    (p: AnyShapePreset) => {
      remember(stateRef.current)
      setState((prev) => {
        const next = cloneState(prev)
        next.shape = p.id
        next.width = p.width
        if (isGlyphPreset(p)) {
          next.glyph = p.glyph
          next.soft = 24
        } else {
          next.glyph = null
          next.soft = 38
          next.segments = cloneState(p.segments)
          next.overlap = p.overlap
          next.metaball = p.metaball
          next.merge = p.merge
        }
        return next
      })
    },
    [remember]
  )

  const handleAddShapeFile = useCallback(
    async (file: File) => {
      try {
        const name = file.name || 'shape'
        const isSvg = /\.svg$/i.test(name) || file.type === 'image/svg+xml'
        const isPng = /\.png$/i.test(name) || file.type === 'image/png'
        if (!isSvg && !isPng) {
          throw new Error('PNG 또는 SVG 파일만 추가할 수 있어요.')
        }
        if (file.size > 8 * 1024 * 1024) {
          throw new Error('8MB 이하의 파일을 선택해 주세요.')
        }
        const img = await loadImageFile(file)
        let iw = img.naturalWidth || 0
        let ih = img.naturalHeight || 0
        if (!iw || !ih) {
          iw = 300
          ih = 300
        }
        const sc = (0.8 * GT) / Math.max(iw, ih)
        const dw = Math.max(2, Math.round(iw * sc))
        const dh = Math.max(2, Math.round(ih * sc))

        const tc = document.createElement('canvas')
        tc.width = dw
        tc.height = dh
        const tx = tc.getContext('2d', { willReadFrequently: true })
        if (!tx) throw new Error('캔버스를 초기화할 수 없어요.')
        tx.drawImage(img, 0, 0, dw, dh)
        const tp = tx.getImageData(0, 0, dw, dh).data
        let transparent = 0
        for (let i = 0; i < dw * dh; i++) {
          if (tp[i * 4 + 3] < 250) transparent++
        }
        const useAlpha = transparent > dw * dh * 0.01
        const ci = [0, dw - 1, (dh - 1) * dw, dw * dh - 1].map((i) => [
          tp[i * 4],
          tp[i * 4 + 1],
          tp[i * 4 + 2],
        ])
        const bg = [0, 1, 2].map((k) => ci.reduce((acc, x) => acc + x[k], 0) / 4)

        const c = document.createElement('canvas')
        c.width = GT
        c.height = GT
        const ctx = c.getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('캔버스를 초기화할 수 없어요.')
        ctx.drawImage(img, Math.round((GT - dw) / 2), Math.round((GT - dh) / 2), dw, dh)
        const px = ctx.getImageData(0, 0, GT, GT).data
        const n = GT * GT
        const mask = new Uint8Array(n)
        let count = 0
        for (let i = 0; i < n; i++) {
          const al = px[i * 4 + 3]
          if (al <= 127) continue
          if (useAlpha) {
            mask[i] = 1
            count++
          } else {
            const d =
              Math.abs(px[i * 4] - bg[0]) +
              Math.abs(px[i * 4 + 1] - bg[1]) +
              Math.abs(px[i * 4 + 2] - bg[2])
            if (d > 90) {
              mask[i] = 1
              count++
            }
          }
        }
        if (count < n * 0.003) {
          throw new Error(
            '쉐입 윤곽을 찾지 못했어요. 배경이 투명하거나 단색인 이미지를 사용해 주세요.'
          )
        }
        if (count > n * 0.9) {
          throw new Error(
            '이미지 전체가 쉐입으로 인식됐어요. 배경이 투명하거나 단색인 이미지를 사용해 주세요.'
          )
        }

        customCountRef.current += 1
        const key = `custom${customCountRef.current}`
        const preset: GlyphPreset = {
          id: `glyph-${key}`,
          name: name.replace(/\.(png|svg)$/i, ''),
          glyph: key,
          width: 380,
        }

        const nextCustomPresets = [...customPresetsRef.current, preset]
        const removedPreset = nextCustomPresets.length > 6 ? nextCustomPresets.shift() : undefined
        customPresetsRef.current = nextCustomPresets
        setCustomPresets(nextCustomPresets)
        setGlyphsMap((prev) => {
          const next: Record<string, GlyphDefinition> = {
            ...prev,
            [key]: { box: [0, 0, iw, ih], mask },
          }
          if (removedPreset) {
            delete next[removedPreset.glyph]
          }
          return next
        })

        remember(stateRef.current)
        setState((prev) => ({
          ...cloneState(prev),
          shape: preset.id,
          width: preset.width,
          glyph: key,
          soft: 24,
        }))
        toast(`"${preset.name}" 쉐입을 추가했어요.`)
      } catch (err) {
        toast(err instanceof Error ? err.message : '쉐입을 추가하지 못했어요.')
      }
    },
    [remember]
  )

  const handleToggleRandOption = useCallback(
    (key: RandomOptionKey, label: string, checked: boolean) => {
      setRandOn((prev) => ({ ...prev, [key]: checked }))
      toast(`${label}${checked ? ': 랜덤 생성에 포함' : ': 랜덤 생성에서 제외'}`)
    },
    []
  )

  const handleChangeRatio = useCallback(
    (ratio: CanvasRatio) => {
      remember(stateRef.current)
      setState((prev) => ({ ...cloneState(prev), ratio }))
    },
    [remember]
  )

  const handleChangeSegmentCount = useCallback(
    (count: number) => {
      if (count === stateRef.current.segments.length) return
      remember(stateRef.current)
      setState((prev) => {
        const next = cloneState(prev)
        while (next.segments.length < count) {
          const last = next.segments[next.segments.length - 1]
          next.segments.push(
            seg(
              Math.max(70, Math.round(last.h * 0.8)),
              Math.round(last.rb),
              Math.round(last.rt * 0.7),
              100
            )
          )
        }
        next.segments.length = count
        next.shape = 'custom'
        return next
      })
    },
    [remember]
  )

  const handleUpdateSegment = useCallback(
    (index: number, key: keyof SegmentItem, value: number, commitHistory: boolean) => {
      if (commitHistory) remember(stateRef.current)
      setState((prev) => {
        const next = cloneState(prev)
        if (next.segments[index]) {
          next.segments[index][key] = value
        }
        next.shape = 'custom'
        return next
      })
    },
    [remember]
  )

  const handleUpdateNumberParam = useCallback(
    (
      key:
        | 'width'
        | 'merge'
        | 'overlap'
        | 'soft'
        | 'scale'
        | 'rotation'
        | 'warp'
        | 'direction'
        | 'flow'
        | 'shift'
        | 'contour'
        | 'rim'
        | 'bgAngle'
        | 'grain'
        | 'speed'
        | 'metal'
        | 'vivid',
      value: number,
      commitHistory: boolean
    ) => {
      if (commitHistory) remember(stateRef.current)
      setState((prev) => ({ ...cloneState(prev), [key]: value }))
    },
    [remember]
  )

  const handleToggleMetaball = useCallback(
    (checked: boolean) => {
      remember(stateRef.current)
      setState((prev) => ({ ...cloneState(prev), metaball: checked }))
    },
    [remember]
  )

  const handleToggleAnimate = useCallback(
    (checked: boolean) => {
      remember(stateRef.current)
      setState((prev) => ({ ...cloneState(prev), animate: checked }))
    },
    [remember]
  )

  const handleSelectGradientPreset = useCallback(
    (g: GradientPreset) => {
      remember(stateRef.current)
      setState((prev) => ({
        ...cloneState(prev),
        grad: g.id,
        colors: [...g.c, g.rim],
        bgA: g.bgA,
        bgB: g.bgB,
        bgAngle: g.bgAngle ?? 0,
        direction: g.dir ?? 0,
      }))
    },
    [remember]
  )

  const handleUpdateColor = useCallback(
    (index: number, color: string, commitHistory: boolean) => {
      if (commitHistory) remember(stateRef.current)
      setState((prev) => {
        const next = cloneState(prev)
        next.colors[index] = color
        next.grad = 'custom'
        return next
      })
    },
    [remember]
  )

  const handleChangeBgMode = useCallback(
    (bgMode: BackgroundMode) => {
      remember(stateRef.current)
      setState((prev) => ({ ...cloneState(prev), bgMode }))
    },
    [remember]
  )

  const handleUpdateBgColor = useCallback(
    (key: 'bgA' | 'bgB', color: string, commitHistory: boolean) => {
      if (commitHistory) remember(stateRef.current)
      setState((prev) => ({ ...cloneState(prev), [key]: color }))
    },
    [remember]
  )

  const handleRibbonLayerChange = useCallback((patch: Partial<RibbonLayerConfig>) => {
    setRibbonLayer((prev) => ({ ...prev, ...patch }))
  }, [])

  const handleSelectRibbonLetter = useCallback((letter: LetterKey) => {
    setUploadedRibbonFileName(null)
    setRibbonLayer((prev) => ({ ...prev, source: { kind: 'letter', letter } }))
  }, [])

  const handleSelectRibbonFile = useCallback((file: File) => {
    if (uploadedRibbonUrlRef.current) URL.revokeObjectURL(uploadedRibbonUrlRef.current)
    const url = URL.createObjectURL(file)
    uploadedRibbonUrlRef.current = url
    setUploadedRibbonFileName(file.name)
    setRibbonLayer((prev) => ({ ...prev, source: { kind: 'upload', assetUrl: url } }))
  }, [])

  const handleAddImageLayer = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file)
    imageLayerUrlsRef.current.add(url)
    const naturalWidth = await readImageNaturalWidth(url)
    const { width, height } = resolveStageSize(stateRef.current.ratio)
    const newLayer = createImageLayer(
      url,
      naturalWidth ? { naturalWidth, stageShortSide: Math.min(width, height) } : undefined
    )
    setOverlayLayers((prev) => [newLayer, ...prev])
    setSelectedOverlayLayerId(newLayer.id)
  }, [])

  const handleAddTextLayer = useCallback(() => {
    const newLayer = createTextLayer()
    setOverlayLayers((prev) => [newLayer, ...prev])
    setSelectedOverlayLayerId(newLayer.id)
  }, [])

  const handleRemoveOverlayLayer = useCallback((id: string) => {
    setOverlayLayers((prev) => {
      const target = prev.find((l) => l.id === id)
      if (target && target.type === 'image' && imageLayerUrlsRef.current.has(target.assetUrl)) {
        URL.revokeObjectURL(target.assetUrl)
        imageLayerUrlsRef.current.delete(target.assetUrl)
      }
      return removeImageLayer(prev, id)
    })
    setSelectedOverlayLayerId((prev) => deselectIfRemoved(prev, id))
  }, [])

  const handleMoveOverlayLayer = useCallback((id: string, direction: 'up' | 'down') => {
    setOverlayLayers((prev) => moveImageLayer(prev, id, direction))
  }, [])

  const handleLoadPreset = useCallback(
    (newStageRatio: StageRatio, newLayers: OverlayLayerConfig[]) => {
      remember(stateRef.current)
      setState((prev) => ({ ...cloneState(prev), ratio: newStageRatio }))
      setOverlayLayers((prev) => {
        prev.forEach((l) => {
          if (l.type === 'image' && imageLayerUrlsRef.current.has(l.assetUrl)) {
            URL.revokeObjectURL(l.assetUrl)
            imageLayerUrlsRef.current.delete(l.assetUrl)
          }
        })
        return newLayers
      })
      setSelectedOverlayLayerId(null)
    },
    [remember]
  )

  const handleImageLayerChange = useCallback((id: string, patch: Partial<ImageLayerConfig>) => {
    setOverlayLayers((prev) =>
      prev.map((l) => (l.id === id && l.type === 'image' ? { ...l, ...patch } : l))
    )
  }, [])

  const handleTextLayerChange = useCallback((id: string, patch: Partial<TextLayerConfig>) => {
    setOverlayLayers((prev) =>
      prev.map((l) => (l.id === id && l.type === 'text' ? { ...l, ...patch } : l))
    )
  }, [])

  const handleReplaceImageLayerAsset = useCallback(async (id: string, file: File) => {
    const url = URL.createObjectURL(file)
    imageLayerUrlsRef.current.add(url)
    const naturalWidth = await readImageNaturalWidth(url)
    const { width, height } = resolveStageSize(stateRef.current.ratio)
    const widthPct = naturalWidth
      ? computeInitialImageWidthPct({ naturalWidth, stageShortSide: Math.min(width, height) })
      : null
    setOverlayLayers((prev) =>
      prev.map((l) => {
        if (l.id !== id || l.type !== 'image') return l
        if (imageLayerUrlsRef.current.has(l.assetUrl)) {
          URL.revokeObjectURL(l.assetUrl)
          imageLayerUrlsRef.current.delete(l.assetUrl)
        }
        return { ...l, assetUrl: url, ...(widthPct !== null ? { widthPct } : {}) }
      })
    )
  }, [])

  const handleShapeFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    await handleAddShapeFile(f)
  }

  return (
    <div className="flex w-full h-[calc(100dvh-64px)] flex-col overflow-hidden bg-[#eceeea] text-[#1e2322]">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#e0e4df] bg-[#f8f9f6] px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-[30px] w-[30px] place-items-center rounded-[9px] border border-[#a9bd8e] bg-[#d5edac]">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M7 3h10l-1 6c-1 2-1 3 0 5l1 7H7l1-7c1-2 1-3 0-5Z"
                fill="none"
                stroke="#405735"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <b className="text-base tracking-[-0.5px] whitespace-nowrap">Shape Studio</b>
            <small className="hidden text-[10px] tracking-[0.4px] text-[#7f8582] sm:block whitespace-nowrap">
              {engineMode === 'shape'
                ? 'Segment gradient generator · v2'
                : '2D Ribbon curve generator · v2'}
            </small>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-2 hidden items-center text-[11px] text-[#657260] md:inline-flex whitespace-nowrap">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#86a854]" />
            {statusText}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="hidden border-[#e0e4df] bg-white text-xs text-[#1e2322] hover:bg-[#e8ece4] sm:inline-flex whitespace-nowrap"
          >
            초기화
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRandomizeActiveMode}
            className="border-[#c3db9f] bg-[#d5edac] text-xs text-[#1e2322] hover:bg-[#c8e39c] whitespace-nowrap"
          >
            {engineMode === 'shape' ? '랜덤 생성' : '전체 무작위'}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={exportBusy}
            onClick={() => viewportRef.current?.exportPng(exportSize)}
            className="bg-[#1e2322] text-xs text-white hover:bg-[#40483f] whitespace-nowrap"
          >
            PNG 저장
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ShapeStudioViewport
          ref={viewportRef}
          engineMode={engineMode}
          state={state}
          ribbonLayer={ribbonLayer}
          overlayLayers={overlayLayers}
          glyphsMap={glyphsMap}
          canUndo={history.length > 0}
          onUndo={handleUndo}
          onDropShapeFile={(file) => {
            if (engineModeRef.current === 'ribbon') {
              handleSelectRibbonFile(file)
            } else {
              void handleAddShapeFile(file)
            }
          }}
          onStatusChange={setStatusText}
          onExportBusyChange={setExportBusy}
          onVideoRecordingChange={(rec, label) => {
            setVideoRecording(rec)
            setVideoButtonLabel(label)
          }}
        />

        <ShapeStudioPanel
          viewportRef={viewportRef}
          engineMode={engineMode}
          onChangeEngineMode={setEngineMode}
          state={state}
          presets={allPresets}
          glyphsMap={glyphsMap}
          randOn={randOn}
          ribbonLayer={ribbonLayer}
          uploadedRibbonFileName={uploadedRibbonFileName}
          overlayLayers={overlayLayers}
          selectedOverlayLayerId={selectedOverlayLayerId}
          exportSize={exportSize}
          videoSize={videoSize}
          exportBusy={exportBusy}
          videoRecording={videoRecording}
          videoButtonLabel={videoButtonLabel}
          onSelectShapePreset={handleSelectShapePreset}
          onAddShapeClick={() => shapeFileInputRef.current?.click()}
          onRandomize={handleRandomizeShape}
          onToggleRandOption={handleToggleRandOption}
          onChangeRatio={handleChangeRatio}
          onChangeSegmentCount={handleChangeSegmentCount}
          onUpdateSegment={handleUpdateSegment}
          onUpdateNumberParam={handleUpdateNumberParam}
          onToggleMetaball={handleToggleMetaball}
          onToggleAnimate={handleToggleAnimate}
          onSelectGradientPreset={handleSelectGradientPreset}
          onUpdateColor={handleUpdateColor}
          onChangeBgMode={handleChangeBgMode}
          onUpdateBgColor={handleUpdateBgColor}
          onRibbonLayerChange={handleRibbonLayerChange}
          onSelectRibbonLetter={handleSelectRibbonLetter}
          onSelectRibbonFile={handleSelectRibbonFile}
          onRandomizeRibbonAll={handleRandomizeRibbonAll}
          onSelectOverlayLayer={setSelectedOverlayLayerId}
          onAddImageLayer={handleAddImageLayer}
          onAddTextLayer={handleAddTextLayer}
          onRemoveOverlayLayer={handleRemoveOverlayLayer}
          onMoveOverlayLayer={handleMoveOverlayLayer}
          onImageLayerChange={handleImageLayerChange}
          onTextLayerChange={handleTextLayerChange}
          onReplaceImageLayerAsset={handleReplaceImageLayerAsset}
          onLoadPreset={handleLoadPreset}
          onChangeExportSize={setExportSize}
          onExportPng={() => viewportRef.current?.exportPng(exportSize)}
          onChangeVideoSize={setVideoSize}
          onExportVideo={() => viewportRef.current?.recordVideo(videoSize)}
          onCancelVideo={() => viewportRef.current?.cancelVideo()}
        />
      </main>

      <input
        ref={shapeFileInputRef}
        type="file"
        accept=".png,.svg,image/png,image/svg+xml"
        onChange={handleShapeFileInputChange}
        className="hidden"
      />
    </div>
  )
}
