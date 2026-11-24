'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/admin/ui/alert-dialog'
import {
  COVER_SIZE,
  colorsToOklab,
  createCoverRenderer,
  defaultTextColors,
  hexToRgb,
  prepareCoverBadge,
  resolveCoverBackground,
  type CoverCanvasLike,
  type CoverRenderer,
  type CollectionCoverResult,
  type PreparedCoverBadge,
  type PreparedCoverDrawInput,
  type TextColors,
} from '@/lib/collection-cover'
import {
  applyCollectionCover,
  buildCoverParams,
  initialCoverState,
  normalizeHex,
  parseCoverParams,
  type CoverBadge,
  type CoverState,
} from './collectionCoverState'

/**
 * 컬렉션 상세의 «대표 이미지 생성기» 구역 (티켓 20261124_1744, 상위 20261124_1741).
 * 2회차 모듈(`src/lib/collection-cover`)을 브라우저 캔버스로 호출해 1024 미리보기를 그리고, 적용하면 apply API로 올린 뒤
 * 영문 이름·생성 설정을 저장한다. 보기 부분(`CollectionCoverGeneratorView`)은 훅이 없는 표시 컴포넌트다(서버 렌더 시험용).
 * 한국어 줄바꿈 설정은 UX_WRITING_GUIDELINE §3.2를 따른다.
 */

const TEXT = 'break-keep wrap-break-word'
const PARAGRAPH = `${TEXT} text-balance`
const LABEL = `${TEXT} whitespace-nowrap`
const TEXT_KEYS = ['title', 'tribe', 'join'] as const
const TEXT_LABELS: Record<(typeof TEXT_KEYS)[number], string> = {
  title: '제목 글자색',
  tribe: '트라이브 글자색',
  join: 'JOIN AND MOVE 글자색',
}
const GRAIN_DEBOUNCE_MS = 120

export interface CollectionCoverGeneratorProps {
  collectionId: string
  collectionName: string
  initialNameEn: string | null
  tribeNameEn: string | null
  /** 저장된 cover_params 원본(모양이 맞지 않으면 무시한다) */
  coverParams: unknown
  badges: CoverBadge[]
  /** 다른 컬렉션 표지 배경의 #rrggbb 목록 */
  otherBgHexes: string[]
}

export interface CoverViewProps {
  loading: boolean
  nameEn: string
  onNameEn: (v: string) => void
  tribeNameEn: string | null
  badges: CoverBadge[]
  badgeId: string | null
  onBadge: (id: string) => void
  result: Pick<CollectionCoverResult, 'bgHex' | 'bgSource' | 'textColors'> | null
  textOverrides: Partial<TextColors>
  /** 저장된 적용 색으로 그리는 중이면 true(라벨 «적용한 색») */
  bgFromSaved?: boolean
  onReroll: () => void
  onBgManual: (hex: string) => void
  onTextColor: (key: keyof TextColors, hex: string | null) => void
  onReset: () => void
  /** 1024 미리보기 <canvas>. 요소와 ref는 컨테이너가 만든다 */
  canvas: React.ReactNode
  applying: boolean
  error: string | null
  onApplyClick: () => void
}

function ColorField({
  label,
  value,
  onCommit,
  extra,
}: {
  label: string
  value: string
  onCommit: (hex: string) => void
  extra?: React.ReactNode
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const pendingHexRef = useRef<string | null>(null)
  const rafRef = useRef<number | null>(null)
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])

  const flushPicker = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const hex = pendingHexRef.current
    if (hex !== null) {
      pendingHexRef.current = null
      setDraft(null)
      onCommitRef.current(hex)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const shown = draft ?? value
  const invalid = draft !== null && normalizeHex(draft) === null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`${LABEL} w-44 text-sm`}>{label}</span>
      {/* 견본을 누르면 컬러 피커가 열린다(다른 어드민 화면과 같은 Input type="color", 티켓 20261124_1956) */}
      <Input
        type="color"
        aria-label={`${label} 고르기`}
        className="h-9 w-12 shrink-0 cursor-pointer p-1"
        value={normalizeHex(shown) ?? value}
        onChange={(e) => {
          const hex = normalizeHex(e.target.value)
          if (!hex) return
          setDraft(hex)
          pendingHexRef.current = hex
          if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = null
              const committed = pendingHexRef.current
              pendingHexRef.current = null
              setDraft(null)
              if (committed) onCommitRef.current(committed)
            })
          }
        }}
        onBlur={flushPicker}
      />
      <Input
        aria-label={label}
        className="w-32 font-mono"
        value={shown}
        aria-invalid={invalid}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          const hex = normalizeHex(next)
          if (hex) onCommit(hex)
        }}
        onBlur={() => setDraft(null)}
      />
      {invalid && <span className={`${TEXT} text-xs text-destructive`}>#rrggbb 형식으로 적어 주세요.</span>}
      {extra}
    </div>
  )
}

export function CollectionCoverGeneratorView(p: CoverViewProps) {
  const hasBadge = p.badges.some((b) => !b.deleted_at && !!b.image_url)
  const nameMissing = p.nameEn.trim() === ''
  const tribeMissing = !p.tribeNameEn
  const blocked = !hasBadge || tribeMissing
  const canApply = !blocked && !nameMissing && !p.loading && !p.applying && !!p.result

  return (
    <section className="space-y-6">
      <h2 className={`${TEXT} text-xl font-bold`}>대표 이미지 생성기</h2>

      {!hasBadge && (
        <Alert variant="destructive">
          <AlertTitle className={TEXT}>이미지가 있는 아이템 배지가 없어요</AlertTitle>
          <AlertDescription className={PARAGRAPH}>
            배지에 이미지를 먼저 올려 주세요. 그 전에는 미리보기와 적용을 쓸 수 없어요.
          </AlertDescription>
        </Alert>
      )}
      {tribeMissing && (
        <Alert variant="destructive">
          <AlertTitle className={TEXT}>트라이브 영문 이름이 비어 있어요</AlertTitle>
          <AlertDescription className={PARAGRAPH}>
            표지 하단에 쓸 트라이브 영문 이름이 없어요. 트라이브 영문 이름은 DB에서만 바꿀 수 있어요.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-2">
          {p.loading && !blocked && <Skeleton className="aspect-square w-full" />}
          <div className={p.loading || blocked ? 'hidden' : ''}>{p.canvas}</div>
          {p.loading && !blocked && <p className={`${PARAGRAPH} text-sm text-muted-foreground`}>글꼴과 배지 이미지를 불러오는 중이에요.</p>}
        </div>

        <div className="space-y-5">
          <div className="space-y-1">
            <label htmlFor="cover-name-en" className={`${TEXT} text-sm font-medium`}>
              컬렉션 영문 이름
            </label>
            <Input
              id="cover-name-en"
              value={p.nameEn}
              placeholder="예: ALLEY FILM SNAPS"
              onChange={(e) => p.onNameEn(e.target.value)}
            />
            {nameMissing && (
              <p className={`${PARAGRAPH} text-sm text-destructive`}>
                영문 이름을 적어 주세요. 비어 있으면 적용할 수 없어요.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <p className={`${TEXT} text-sm font-medium`}>트라이브 영문 이름</p>
            <p className={`${TEXT} text-sm`}>{p.tribeNameEn ?? '비어 있음'}</p>
          </div>

          <div className="space-y-2">
            <p className={`${TEXT} text-sm font-medium`}>대표 배지</p>
            <div className="flex flex-wrap gap-2">
              {p.badges
                .filter((b) => !b.deleted_at && !!b.image_url)
                .map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    title={b.name}
                    aria-pressed={p.badgeId === b.id}
                    onClick={() => p.onBadge(b.id)}
                    className={`h-14 w-14 overflow-hidden rounded border p-1 ${p.badgeId === b.id ? 'ring-2 ring-primary' : ''}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- 어드민 썸네일, 원본 비율 그대로 */}
                    <img src={b.image_url ?? ''} alt={b.name} className="h-full w-full object-contain" />
                  </button>
                ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className={`${TEXT} text-sm font-medium`}>배경색</p>
            <ColorField
              label={p.bgFromSaved ? '배경색(적용한 색)' : p.result?.bgSource === 'override' ? '배경색(직접 지정)' : '배경색(자동)'}
              value={p.result?.bgHex ?? '#ffffff'}
              onCommit={p.onBgManual}
              extra={
                <Button type="button" variant="outline" className={LABEL} disabled={p.loading || blocked} onClick={p.onReroll}>
                  배경색 다시 뽑기
                </Button>
              }
            />
          </div>

          <div className="space-y-3">
            <p className={`${TEXT} text-sm font-medium`}>글자색</p>
            {TEXT_KEYS.map((k) => {
              const auto = p.textOverrides[k] === undefined
              return (
                <ColorField
                  key={k}
                  label={TEXT_LABELS[k]}
                  value={p.result?.textColors[k] ?? '#000000'}
                  onCommit={(hex) => p.onTextColor(k, hex)}
                  extra={
                    <Button
                      type="button"
                      variant={auto ? 'default' : 'outline'}
                      aria-pressed={auto}
                      aria-label={`${TEXT_LABELS[k]} 자동`}
                      className={LABEL}
                      onClick={() => p.onTextColor(k, auto ? (p.result?.textColors[k] ?? '#000000') : null)}
                    >
                      자동
                    </Button>
                  }
                />
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className={LABEL} disabled={p.applying} onClick={p.onReset}>
              기본값으로 되돌리기
            </Button>
            <Button type="button" className={LABEL} disabled={!canApply} onClick={p.onApplyClick}>
              {p.applying ? '적용하는 중' : '적용'}
            </Button>
          </div>
          {p.applying && <p className={`${PARAGRAPH} text-sm text-muted-foreground`}>이미지를 올리고 설정을 저장하고 있어요.</p>}

          {p.error && (
            <Alert variant="destructive">
              <AlertTitle className={TEXT}>적용하지 못했어요</AlertTitle>
              <AlertDescription className={`${PARAGRAPH} whitespace-pre-line`}>{p.error}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </section>
  )
}

// ── 글꼴·이미지 로드 ─────────────────────────────────────────────

let fontPromise: Promise<void> | null = null
/** Sour Gummy 800은 굵기 800 파일을 FontFace로 직접 로드한다(한 번만) */
function loadCoverFont(): Promise<void> {
  if (!fontPromise) {
    fontPromise = (async () => {
      const face = new FontFace('Sour Gummy', 'url(/fonts/sour-gummy/SourGummy-ExtraBold.ttf)', { weight: '800' })
      await face.load()
      document.fonts.add(face)
    })().catch((e) => {
      fontPromise = null
      throw e
    })
  }
  return fontPromise
}

/** crossOrigin을 켜야 캔버스가 오염되지 않아 PNG를 만들 수 있다 */
function loadBadgeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('배지 이미지를 불러오지 못했어요.'))
    img.src = src
  })
}

const createCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c as unknown as CoverCanvasLike
}

const formatPreviewError = (e: unknown) =>
  `[현상] 미리보기를 그리지 못했어요.\n[원인] ${e instanceof Error ? e.message : '알 수 없는 오류'}\n[해결책] 다른 대표 배지를 골라 보세요.`

export function CollectionCoverGenerator(props: CollectionCoverGeneratorProps) {
  const { collectionId, initialNameEn, tribeNameEn, coverParams, badges, otherBgHexes } = props
  const router = useRouter()
  const params = useMemo(() => parseCoverParams(coverParams), [coverParams])
  const savedSource = params?.bgSource
  const [state, setState] = useState<CoverState>(() => initialCoverState(params, badges))
  const [nameEn, setNameEn] = useState(initialNameEn ?? '')
  const [fontReady, setFontReady] = useState(false)
  const [loaded, setLoaded] = useState<{ src: string; prepared: PreparedCoverBadge } | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )
  const rendererRef = useRef<CoverRenderer | null>(null)
  const drawInputRef = useRef<PreparedCoverDrawInput | null>(null)
  const grainAppliedRef = useRef(false)

  const usedLabs = useMemo(() => colorsToOklab(otherBgHexes), [otherBgHexes])
  const titleEn = nameEn.trim().toUpperCase()
  const badge = badges.find((b) => b.id === state.badgeId) ?? null
  const blocked = !badge || !tribeNameEn
  // 배지를 바꾸면 새 이미지가 준비될 때까지 이전 배지를 쓰지 않는다
  const preparedBadge = loaded && loaded.src === badge?.image_url ? loaded.prepared : null
  const canRender = fontReady && !!preparedBadge && !!tribeNameEn && titleEn !== ''

  // 배경색은 배지·시드·다시 뽑기·직접 지정이 바뀔 때만 계산한다(글자색·제목 변경 시 재실행 없음)
  const bgOverride = state.bgManual ?? state.bgSaved ?? undefined
  const resolvedBg = useMemo(() => {
    if (!preparedBadge) return null
    try {
      return {
        ok: true as const,
        bg: resolveCoverBackground({
          seed: collectionId,
          rerolls: state.rerolls,
          badge: preparedBadge.analysis,
          usedColors: otherBgHexes,
          usedLabs,
          bgOverride,
        }),
      }
    } catch (e) {
      return { ok: false as const, message: formatPreviewError(e) }
    }
  }, [preparedBadge, collectionId, state.rerolls, otherBgHexes, usedLabs, bgOverride])

  const textColors = useMemo<TextColors | null>(() => {
    if (!resolvedBg?.ok) return null
    return { ...defaultTextColors(hexToRgb(resolvedBg.bg.bgHex)), ...state.textOverrides }
  }, [resolvedBg, state.textOverrides])

  const colorResult = useMemo<Pick<CollectionCoverResult, 'bgHex' | 'bgSource' | 'textColors'> | null>(() => {
    if (!resolvedBg?.ok || !textColors) return null
    return { bgHex: resolvedBg.bg.bgHex, bgSource: resolvedBg.bg.bgSource, textColors }
  }, [resolvedBg, textColors])

  useEffect(() => {
    let alive = true
    loadCoverFont()
      .then(() => alive && setFontReady(true))
      .catch(() => alive && setError('[현상] 표지 글꼴을 불러오지 못했어요.\n[원인] 글꼴 파일 요청이 실패했어요.\n[해결책] 새로고침한 뒤 다시 열어 주세요.'))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!badge?.image_url) return
    let alive = true
    const src = badge.image_url
    loadBadgeImage(src)
      .then((img) => {
        if (!alive) return
        try {
          const prepared = prepareCoverBadge(img, createCanvas)
          setLoaded({ src, prepared })
          setError(null)
        } catch (e) {
          setError(formatPreviewError(e))
        }
      })
      .catch(() => alive && setError('[현상] 대표 배지 이미지를 불러오지 못했어요.\n[원인] 이미지 주소가 열리지 않아요.\n[해결책] 다른 배지를 고르거나 배지 이미지를 확인해 주세요.'))
    return () => {
      alive = false
    }
  }, [badge?.image_url])

  // 드래그 중에는 rAF당 1회 그레인 생략으로 빠르게 합성하고, 입력이 멈추면 정밀 그레인을 덮는다
  useEffect(() => {
    if (!canvas || !canRender || !preparedBadge || !tribeNameEn || !resolvedBg?.ok || !textColors) {
      drawInputRef.current = null
      grainAppliedRef.current = false
      return
    }
    const drawInput: PreparedCoverDrawInput = {
      titleEn,
      tribeEn: tribeNameEn,
      preparedBadge,
      bgHex: resolvedBg.bg.bgHex,
      bgSource: resolvedBg.bg.bgSource,
      relaxStep: resolvedBg.bg.relaxStep,
      textColors,
    }
    drawInputRef.current = drawInput
    grainAppliedRef.current = false

    const getRenderer = () => {
      if (!rendererRef.current) rendererRef.current = createCoverRenderer({ createCanvas })
      return rendererRef.current
    }

    let grainTimer: ReturnType<typeof setTimeout> | null = null
    const rafId = requestAnimationFrame(() => {
      try {
        getRenderer().render(canvas as unknown as CoverCanvasLike, { ...drawInput, grain: 'skip' })
      } catch (e) {
        setError(formatPreviewError(e))
        return
      }
      grainTimer = setTimeout(() => {
        try {
          getRenderer().render(canvas as unknown as CoverCanvasLike, { ...drawInput, grain: 'exact' })
          grainAppliedRef.current = true
        } catch (e) {
          setError(formatPreviewError(e))
        }
      }, GRAIN_DEBOUNCE_MS)
    })

    return () => {
      cancelAnimationFrame(rafId)
      if (grainTimer !== null) clearTimeout(grainTimer)
    }
  }, [canvas, canRender, preparedBadge, tribeNameEn, titleEn, resolvedBg, textColors])

  const loading = !blocked && (!fontReady || !preparedBadge)

  const onReset = useCallback(() => {
    setState(initialCoverState(null, badges))
    setError(null)
  }, [badges])

  const onBgManual = useCallback((hex: string) => {
    setState((s) => (s.bgManual === hex && s.bgSaved === null ? s : { ...s, bgManual: hex, bgSaved: null }))
  }, [])

  const onTextColor = useCallback((key: keyof TextColors, hex: string | null) => {
    setState((s) => {
      const prev = s.textOverrides[key]
      if (hex === null ? prev === undefined : prev === hex) return s
      const next = { ...s.textOverrides }
      if (hex === null) delete next[key]
      else next[key] = hex
      return { ...s, textOverrides: next }
    })
  }, [])

  const submit = useCallback(async () => {
    if (!canvas || !colorResult || applying) return
    setConfirmOpen(false)
    setApplying(true)
    setError(null)
    try {
      // 디바운스 대기 중 적용을 눌렀다면 PNG 추출 전에 정밀 그레인을 동기 적용한다
      if (!grainAppliedRef.current && drawInputRef.current) {
        if (!rendererRef.current) rendererRef.current = createCoverRenderer({ createCanvas })
        rendererRef.current.render(canvas as unknown as CoverCanvasLike, {
          ...drawInputRef.current,
          grain: 'exact',
        })
        grainAppliedRef.current = true
      }
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG를 만들지 못했어요.'))), 'image/png')
      )
      const out = await applyCollectionCover({
        fetchFn: fetch,
        collectionId,
        nameEn: titleEn,
        png,
        params: buildCoverParams(state, collectionId, colorResult, new Date().toISOString(), savedSource),
      })
      if (!out.ok) {
        setError(out.message)
        return
      }
      toast.success('표지를 적용했어요.')
      router.refresh()
    } catch (e) {
      setError(`[현상] 표지를 적용하지 못했어요.\n[원인] ${e instanceof Error ? e.message : '알 수 없는 오류'}\n[해결책] 다른 대표 배지로 다시 시도해 주세요.`)
    } finally {
      setApplying(false)
    }
  }, [applying, canvas, collectionId, savedSource, colorResult, router, state, titleEn])

  const displayedError = error ?? (resolvedBg && !resolvedBg.ok ? resolvedBg.message : null)

  return (
    <>
      <CollectionCoverGeneratorView
        loading={loading}
        nameEn={nameEn}
        onNameEn={setNameEn}
        tribeNameEn={tribeNameEn}
        badges={badges}
        badgeId={state.badgeId}
        onBadge={(id) => setState((s) => ({ ...s, badgeId: id }))}
        result={titleEn === '' || !tribeNameEn ? null : colorResult}
        textOverrides={state.textOverrides}
        bgFromSaved={state.bgManual == null && state.bgSaved != null}
        onReroll={() => setState((s) => ({ ...s, rerolls: s.rerolls + 1, bgManual: null, bgSaved: null }))}
        onBgManual={onBgManual}
        onTextColor={onTextColor}
        onReset={onReset}
        canvas={
          <canvas
            ref={setCanvas}
            width={COVER_SIZE}
            height={COVER_SIZE}
            className="aspect-square w-full rounded border"
          />
        }
        applying={applying}
        error={displayedError}
        onApplyClick={() => setConfirmOpen(true)}
      />
      <AlertDialog open={confirmOpen} onOpenChange={(open) => !open && !applying && setConfirmOpen(false)}>
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle className={`${TEXT} text-balance`}>이 표지를 적용할까요?</AlertDialogTitle>
            <AlertDialogDescription className={PARAGRAPH}>
              컬렉션 대표 이미지가 지금 미리보기로 바뀌고, 영문 이름과 생성 설정이 저장돼요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className={LABEL} onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button type="button" className={LABEL} onClick={submit}>
              적용
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
