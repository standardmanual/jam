'use client'

/**
 * JAM! 에셋 제너레이터 — 적용 탭 (티켓 20260924_2200, 미션 확장 20260925_1407,
 * 컬렉션 확장 20260925_1409, 홈피드 확장 20260925_1411)
 *
 * 콘텐츠(배지/미션/컬렉션)를 검색해 고르고, 지금 스테이지 화면(왼쪽 "미리보기" Card의 캔버스 — 이
 * 화면 전체가 공유하는 하나뿐인 캔버스다)을 그 콘텐츠의 대표 이미지로 반영한다. 이 탭은 별도
 * 캔버스를 새로 만들지 않는다 — "제작"/"적용" 탭이 오른쪽 패널만 바뀔 뿐 왼쪽 스테이지는 항상
 * 그대로 보이므로(`page.tsx`), "지금 만들 이미지"(왼쪽 캔버스)와 "현재 이미지"(이 패널의
 * 미리보기 썸네일)가 화면에 나란히 있게 된다.
 *
 * 콘텐츠 유형 드롭다운 하나로 배지/미션/컬렉션/홈피드를 전환한다(상위 티켓 20260925_1404 결정
 * 5). 검색은 각 콘텐츠 전용 검색 컴포넌트를 쓴다 — 배지는 기존 `BadgeSearchSelect`, 미션은
 * `MissionSearchSelect`, 컬렉션은 `ItemBookSearchSelect`, 홈피드는 신규 `TodayCardSearchSelect`
 * (배지·미션·컬렉션은 `/api/admin/{badges|missions|itembooks}/search` 재사용, 홈피드는
 * `today_cards`에 검색 전용 API가 없어 신설한 `/api/admin/today/search`를 쓴다).
 * 컬렉션은 자동 기획 경로가 없어(상위 티켓 결정 4·6) 이 적용 탭이 유일한 제작 경로다.
 *
 * 캡처 직전 로드 대기(재작업 2157·2158과 동일 패턴): 이미지 레이어 원본과 텍스트 레이어 구글
 * 폰트 다운로드가 끝나길 기다린 뒤 PNG를 뽑는다. `AssetGeneratorExport.tsx`의 같은 이름 함수를
 * 그대로 옮겨 썼다(그 파일이 export하지 않아 공용 모듈로 빼는 대신 각 10줄 내외를 복제했다 —
 * 이 티켓 범위에서 리팩터링하지 않는다).
 */
import { useState } from 'react'
import SafeImage from '@/components/SafeImage'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/admin/ui/alert-dialog'
import { Button } from '@/components/admin/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import BadgeSearchSelect, { type BadgeSearchResult } from '@/components/admin/BadgeSearchSelect'
import MissionSearchSelect, { type MissionSearchResult } from '@/components/admin/MissionSearchSelect'
import ItemBookSearchSelect, { type ItemBookSearchResult } from '@/components/admin/ItemBookSearchSelect'
import TodayCardSearchSelect, { type TodayCardSearchResult } from '@/components/admin/TodayCardSearchSelect'
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'
import { MAX_APPLY_IMAGE_BYTES } from '@/lib/admin/applyGeneratedImageConstants'
import { isVideoUrl } from '@/lib/today/cardMedia'
import type { AssetGeneratorViewportHandle } from './AssetGeneratorViewport'

interface ApplyTabProps {
  viewportRef: React.RefObject<AssetGeneratorViewportHandle | null>
}

type ContentType = 'badge' | 'mission' | 'collection' | 'home_feed'

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: 'badge', label: '배지' },
  { value: 'mission', label: '미션' },
  { value: 'collection', label: '컬렉션' },
  { value: 'home_feed', label: '홈피드' },
]

interface ApplyResponse {
  id: string
  name: string
  originalUrl: string
  webpUrl: string
  webpBytes: number
}

/** 캡처 전에 이미지 레이어 원본 로드를 기다린다. 이미 다 불러왔으면 즉시 반환한다. */
async function ensureImageAssetsReady(viewport: AssetGeneratorViewportHandle): Promise<void> {
  if (viewport.areImageAssetsReady()) return
  toast.info('이미지를 불러오는 중이에요. 완료되면 자동으로 진행할게요.')
  await viewport.waitForImageAssets()
}

/** 기다린 뒤에도 로드에 실패해 반영 결과에서 빠지는 레이어가 있으면 알린다. */
function warnIfImageAssetsMissing(viewport: AssetGeneratorViewportHandle): void {
  const missing = viewport.getMissingImageAssetCount()
  if (missing > 0) toast.error(`이미지 레이어 ${missing}개를 불러오지 못해 반영 결과에서 빠졌어요.`)
}

/** 캡처 전에 텍스트 레이어의 구글 폰트 다운로드를 기다린다. */
async function ensureFontsReady(viewport: AssetGeneratorViewportHandle): Promise<void> {
  if (viewport.areFontsReady()) return
  toast.info('폰트를 불러오는 중이에요. 완료되면 자동으로 진행할게요.')
  await viewport.waitForFonts()
}

/** 기다린 뒤에도 로드에 실패해 폴백 글꼴로 반영되는 텍스트 레이어가 있으면 알린다. */
function warnIfFontsMissing(viewport: AssetGeneratorViewportHandle): void {
  const missing = viewport.getMissingFontCount()
  if (missing > 0) toast.error(`텍스트 레이어 ${missing}개의 폰트를 불러오지 못해 기본 글꼴로 반영했어요.`)
}

export default function ApplyTab({ viewportRef }: ApplyTabProps) {
  // AlertDialog(Radix Portal)를 어드민 테마 스코프 노드에 붙인다(PresetPanel.tsx와 동일 패턴,
  // 20260826_018).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )
  const [contentType, setContentType] = useState<ContentType>('badge')
  const [badgeId, setBadgeId] = useState('')
  const [badge, setBadge] = useState<BadgeSearchResult | undefined>(undefined)
  const [missionId, setMissionId] = useState('')
  const [mission, setMission] = useState<MissionSearchResult | undefined>(undefined)
  const [collectionId, setCollectionId] = useState('')
  const [collection, setCollection] = useState<ItemBookSearchResult | undefined>(undefined)
  const [cardId, setCardId] = useState('')
  const [card, setCard] = useState<TodayCardSearchResult | undefined>(undefined)
  const [applyMode, setApplyMode] = useState<'image' | 'video'>('image')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [progressLabel, setProgressLabel] = useState<string | null>(null)

  const targetId =
    contentType === 'badge' ? badgeId : contentType === 'mission' ? missionId : contentType === 'collection' ? collectionId : cardId
  const targetName =
    contentType === 'badge'
      ? badge?.name
      : contentType === 'mission'
        ? mission?.name
        : contentType === 'collection'
          ? collection?.name
          : card?.title
  const targetImageUrl =
    contentType === 'badge'
      ? badge?.image_url
      : contentType === 'mission'
        ? mission?.imageUrl
        : contentType === 'collection'
          ? collection?.imageUrl
          : card?.imageUrl

  function handleContentTypeChange(next: ContentType) {
    setContentType(next)
    // 유형을 바꾸면 이전 선택이 화면에 혼재되지 않도록 전부 비운다
    setBadgeId('')
    setBadge(undefined)
    setMissionId('')
    setMission(undefined)
    setCollectionId('')
    setCollection(undefined)
    setCardId('')
    setCard(undefined)
  }

  function handleSelectBadge(id: string, selected?: BadgeSearchResult) {
    setBadgeId(id)
    setBadge(selected)
  }

  function handleSelectMission(id: string, selected?: MissionSearchResult) {
    setMissionId(id)
    setMission(selected)
  }

  function handleSelectCollection(id: string, selected?: ItemBookSearchResult) {
    setCollectionId(id)
    setCollection(selected)
  }

  function handleSelectCard(id: string, selected?: TodayCardSearchResult) {
    setCardId(id)
    setCard(selected)
  }

  async function handleApply() {
    setConfirmOpen(false)
    const viewport = viewportRef.current
    if (!viewport || !targetId) return
    setApplying(true)
    setProgressLabel(null)
    try {
      await ensureImageAssetsReady(viewport)
      warnIfImageAssetsMissing(viewport)
      await ensureFontsReady(viewport)
      warnIfFontsMissing(viewport)

      const canvas = viewport.getCanvas()
      if (!canvas) throw new Error('캔버스를 찾지 못했어요.')

      const form = new FormData()
      form.append('targetType', contentType)
      form.append('targetId', targetId)

      if (contentType === 'home_feed' && applyMode === 'video') {
        setProgressLabel('동영상 녹화 준비 중…')
        const canvasWithStream = canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }
        if (typeof window === 'undefined' || !('MediaRecorder' in window) || !canvasWithStream.captureStream) {
          throw new Error('이 브라우저는 영상 녹화를 지원하지 않아요. Chrome에서 열어주세요.')
        }
        const candidates = [
          'video/mp4;codecs=avc1.42E01E',
          'video/mp4',
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
        ]
        const type = candidates.find((t) => MediaRecorder.isTypeSupported(t))
        if (!type) throw new Error('지원되는 동영상 형식이 없어요.')

        const stream = canvasWithStream.captureStream(30)
        const chunks: BlobPart[] = []
        const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_500_000 })
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data)
        }
        const done = new Promise<void>((res) => {
          recorder.onstop = () => res()
        })
        const durationSec = 10
        recorder.start(250)
        const t0 = performance.now()
        await new Promise<void>((res) => {
          const timer = setInterval(() => {
            const el = (performance.now() - t0) / 1000
            setProgressLabel(`녹화 중 ${Math.min(durationSec, Math.floor(el))} / ${durationSec}초`)
            if (el >= durationSec) {
              clearInterval(timer)
              res()
            }
          }, 200)
        })
        recorder.stop()
        await done
        stream.getTracks().forEach((t) => t.stop())

        const mime = type.split(';')[0]
        const videoBlob = new Blob(chunks, { type: mime })
        if (!videoBlob.size) throw new Error('녹화된 영상이 비어 있어요.')
        if (videoBlob.size > MAX_APPLY_IMAGE_BYTES) {
          throw new Error(`동영상이 너무 커요(${(videoBlob.size / 1024 / 1024).toFixed(1)}MB). 5MB 이하만 반영할 수 있어요.`)
        }
        const isMp4 = mime.includes('mp4')
        form.append('video', videoBlob, `stage.${isMp4 ? 'mp4' : 'webm'}`)
        setProgressLabel('동영상 업로드 및 반영 중…')
      } else {
        viewport.drawAtHead(viewport.getHead())
        const blob = await canvasToBlob(canvas)
        if (blob.size > MAX_APPLY_IMAGE_BYTES) {
          throw new Error(
            `이미지가 너무 커요(${(blob.size / 1024 / 1024).toFixed(1)}MB). ${MAX_APPLY_IMAGE_BYTES / 1024 / 1024}MB 이하만 반영할 수 있어요.`
          )
        }
        form.append('image', blob, 'stage.png')
      }

      const res = await fetch('/api/admin/asset-generator/apply', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '반영에 실패했어요.')
      const result = data as ApplyResponse & { mediaUrl?: string; isVideo?: boolean }
      const finalUrl = result.mediaUrl ?? result.webpUrl
      toast.success(`'${result.name}'에 ${result.isVideo ? '동영상을' : '이미지를'} 반영했어요.`)
      if (contentType === 'badge') {
        setBadge((prev) => (prev ? { ...prev, image_url: finalUrl } : prev))
      } else if (contentType === 'mission') {
        setMission((prev) => (prev ? { ...prev, imageUrl: finalUrl } : prev))
      } else if (contentType === 'collection') {
        setCollection((prev) => (prev ? { ...prev, imageUrl: finalUrl } : prev))
      } else {
        setCard((prev) => (prev ? { ...prev, imageUrl: finalUrl } : prev))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '반영에 실패했어요.')
    } finally {
      setApplying(false)
      setProgressLabel(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">콘텐츠 유형</label>
        <Select value={contentType} onValueChange={(v) => handleContentTypeChange(v as ContentType)}>
          <SelectTrigger className="w-full" aria-label="콘텐츠 유형">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTENT_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">
          {contentType === 'badge'
            ? '배지 검색'
            : contentType === 'mission'
              ? '미션 검색'
              : contentType === 'collection'
                ? '컬렉션 검색'
                : '홈피드 검색'}
        </label>
        {contentType === 'badge' ? (
          <BadgeSearchSelect value={badgeId} onChange={handleSelectBadge} placeholder="반영할 배지 이름 검색..." />
        ) : contentType === 'mission' ? (
          <MissionSearchSelect value={missionId} onChange={handleSelectMission} placeholder="반영할 미션 이름 검색..." />
        ) : contentType === 'collection' ? (
          <ItemBookSearchSelect
            value={collectionId}
            onChange={handleSelectCollection}
            placeholder="반영할 컬렉션 이름 검색..."
          />
        ) : (
          <TodayCardSearchSelect value={cardId} onChange={handleSelectCard} placeholder="반영할 홈피드 카드 제목 검색..." />
        )}
      </div>

      {contentType === 'home_feed' && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">반영 형식</label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={applyMode === 'image' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setApplyMode('image')}
              className="flex-1 text-xs"
            >
              정지 이미지 (WebP)
            </Button>
            <Button
              type="button"
              variant={applyMode === 'video' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setApplyMode('video')}
              className="flex-1 text-xs"
            >
              동영상 모션 (10초 녹화)
            </Button>
          </div>
        </div>
      )}

      {targetName && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">현재 미디어</p>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted p-3">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-white">
              {targetImageUrl ? (
                isVideoUrl(targetImageUrl) ? (
                  <video
                    src={targetImageUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // 홈피드 기존 카드는 외부 호스트 이미지가 많아 허용 목록 밖일 수 있다 — SafeImage가 일반 <img>로 처리한다
                  <SafeImage src={targetImageUrl} alt={targetName} className="object-contain" />
                )
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
                  없음
                </span>
              )}
            </div>
            <div className="flex flex-col gap-0.5 text-sm">
              <span className="font-medium text-foreground">{targetName}</span>
              {contentType === 'badge' && badge && (
                <span className="text-xs text-muted-foreground">
                  [{badge.type}/{badge.rarity}]
                </span>
              )}
              {targetImageUrl && isVideoUrl(targetImageUrl) && (
                <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  동영상 재생 중
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <Button type="button" onClick={() => setConfirmOpen(true)} disabled={!targetId || applying}>
        {applying
          ? (progressLabel ?? '반영하는 중…')
          : contentType === 'home_feed' && applyMode === 'video'
            ? '지금 스테이지를 동영상으로 녹화해 반영'
            : '지금 스테이지 이미지로 반영'}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {contentType === 'home_feed' && applyMode === 'video'
                ? '동영상을 반영할까요?'
                : '이미지를 반영할까요?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {contentType === 'home_feed' && applyMode === 'video'
                ? `'${targetName}'의 커버를 지금 스테이지의 동영상(10초 모션 녹화)으로 바꿔요. 되돌릴 수 없어요.`
                : `'${targetName}'의 대표 이미지를 지금 스테이지 화면으로 바꿔요. 되돌릴 수 없어요.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleApply()}>반영</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
