'use client'

/**
 * JAM! 에셋 제너레이터 — 프리셋 저장·불러오기·삭제 (티켓 20260924_2159)
 *
 * 사용감은 `src/app/admin/shader-lab/ShaderLabSavePanel.tsx`를 참고했다(import하지 않고
 * 새로 작성 — 이 화면은 Accordion 섹션·shadcn(`components/admin/ui`)만 쓰는 규칙을 따른다).
 *
 * 저장은 신규 생성과 덮어쓰기를 한 버튼으로 처리한다: 프리셋을 불러온 적이 없으면(신규) 바로
 * 저장하고, 불러온 프리셋을 수정 중이면 `AlertDialog`로 덮어쓰기 확인을 받는다. 삭제도
 * `AlertDialog`로 확인한다(완료 조건: 덮어쓰기·삭제는 확인 단계를 둔다).
 *
 * 이미지 원본 전송(멀티파트 FormData, 판단 기록): 이미지 레이어가 여러 개일 수 있어 각 레이어를
 * `image_{layerId}` 필드로 붙이고 `layers`는 JSON 문자열로 함께 보낸다 — base64 JSON 한 덩어리로
 * 묶는 대신 기존 `applyGeneratedImage` 계열 라우트(`shader-lab/apply`, `upload-image`)와 같은
 * FormData 관례를 따랐다. 이미 저장소 URL(`http(s)://`)인 이미지 레이어(불러온 프리셋을 다시
 * 저장하는 경우)는 파일을 다시 보내지 않는다. 파일당 상한은 기존 `MAX_APPLY_IMAGE_BYTES`(5MB,
 * `applyGeneratedImage.ts`가 이미 적용 라우트에서 쓰는 값)를 그대로 재사용했다 — 프리셋
 * 하나에 이미지 레이어가 여러 개면 전체 요청 크기는 그 배수가 될 수 있지만, 개별 파일 상한을
 * 넘지 않는 한 라우트가 그대로 받아들인다(전체 요청 크기 상한은 별도로 두지 않았다).
 */
import { useEffect, useState } from 'react'
import { IconTrash } from '@tabler/icons-react'
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
import { Input } from '@/components/admin/ui/input'
import { MAX_APPLY_IMAGE_BYTES } from '@/lib/admin/applyGeneratedImageConstants'
import type { ImageLayerConfig, OverlayLayerConfig, StageRatio } from '@/lib/asset-generator'

const MAX_NAME_LENGTH = 60

interface PresetSummary {
  id: string
  name: string
  stageRatio: StageRatio
  createdAt: string
  updatedAt: string
}

interface PresetPanelProps {
  stageRatio: StageRatio
  overlayLayers: OverlayLayerConfig[]
  onLoadPreset: (stageRatio: StageRatio, layers: OverlayLayerConfig[]) => void
}

async function buildSaveFormData(
  name: string,
  stageRatio: StageRatio,
  overlayLayers: OverlayLayerConfig[],
  presetId: string | null
): Promise<FormData> {
  const form = new FormData()
  form.append('name', name)
  form.append('stageRatio', stageRatio)
  if (presetId) form.append('id', presetId)

  const imageLayers = overlayLayers.filter((l): l is ImageLayerConfig => l.type === 'image')
  for (const imageLayer of imageLayers) {
    if (!imageLayer.assetUrl.startsWith('blob:')) continue // 이미 저장소 URL, 다시 올리지 않는다
    const response = await fetch(imageLayer.assetUrl)
    const blob = await response.blob()
    if (blob.size > MAX_APPLY_IMAGE_BYTES) {
      throw new Error(
        `이미지가 너무 커요(${(blob.size / 1024 / 1024).toFixed(1)}MB). ${MAX_APPLY_IMAGE_BYTES / 1024 / 1024}MB 이하만 저장할 수 있어요.`
      )
    }
    form.append(`image_${imageLayer.id}`, blob, imageLayer.id)
  }

  form.append('layers', JSON.stringify(overlayLayers))
  return form
}

export default function PresetPanel({ stageRatio, overlayLayers, onLoadPreset }: PresetPanelProps) {
  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(ItemBookForm.tsx·ShaderLabSavePanel.tsx와 동일 패턴, 20260826_018).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )
  const [presets, setPresets] = useState<PresetSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function loadList() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/asset-generator/presets')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '목록을 불러오지 못했어요.')
      setPresets(data.presets ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 이펙트 본문에서 곧바로 setState를 동기 호출하면 react-hooks/set-state-in-effect에
    // 걸려 마이크로태스크로 지연한다(ShaderLabSavePanel.tsx와 동일 패턴).
    Promise.resolve().then(() => loadList())
  }, [])

  async function saveOrOverwrite(presetId: string | null) {
    setSaving(true)
    setError(null)
    try {
      const form = await buildSaveFormData(name.trim(), stageRatio, overlayLayers, presetId)
      const res = await fetch('/api/admin/asset-generator/presets', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했어요.')
      setActivePresetId(data.preset?.id ?? null)
      await loadList()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  function handleSaveClick() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('이름을 입력하세요.')
      return
    }
    setError(null)
    if (activePresetId) {
      setConfirmOverwriteOpen(true)
      return
    }
    void saveOrOverwrite(null)
  }

  async function handleConfirmOverwrite() {
    setConfirmOverwriteOpen(false)
    if (activePresetId) await saveOrOverwrite(activePresetId)
  }

  async function handleLoad(id: string) {
    setLoadingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/asset-generator/presets/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '불러오기에 실패했어요.')
      onLoadPreset(data.preset.stageRatio, data.preset.layers ?? [])
      setActivePresetId(data.preset.id)
      setName(data.preset.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기에 실패했어요.')
    } finally {
      setLoadingId(null)
    }
  }

  async function handleConfirmDelete() {
    const id = confirmDeleteId
    if (!id) return
    setDeletingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/asset-generator/presets/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제에 실패했어요.')
      setPresets((prev) => prev.filter((p) => p.id !== id))
      if (activePresetId === id) setActivePresetId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했어요.')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  const confirmDeleteTarget = presets.find((p) => p.id === confirmDeleteId) ?? null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          placeholder="프리셋 이름"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveClick()
          }}
        />
        <Button type="button" onClick={handleSaveClick} disabled={saving}>
          {saving ? '저장 중…' : '저장'}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : presets.length === 0 ? (
        <p className="text-sm text-muted-foreground">저장된 프리셋이 없어요.</p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
          {presets.map((preset) => (
            <li
              key={preset.id}
              className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${
                activePresetId === preset.id ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <span className="truncate text-sm text-foreground">{preset.name}</span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loadingId === preset.id}
                  onClick={() => handleLoad(preset.id)}
                >
                  {loadingId === preset.id ? '불러오는 중…' : '불러오기'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  disabled={deletingId === preset.id}
                  onClick={() => setConfirmDeleteId(preset.id)}
                  aria-label={`${preset.name} 삭제`}
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={confirmOverwriteOpen} onOpenChange={setConfirmOverwriteOpen}>
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>프리셋을 덮어쓸까요?</AlertDialogTitle>
            <AlertDialogDescription>
              불러온 프리셋을 지금 구성으로 다시 저장해요. 이전 구성은 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmOverwrite()}>덮어쓰기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null) }}>
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>프리셋을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteTarget?.name} 프리셋과 저장된 이미지를 함께 지워요. 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmDelete()}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
