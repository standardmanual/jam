'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { Textarea } from '@/components/admin/ui/textarea'
import { Badge } from '@/components/admin/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
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
import type { BookItem } from '@/lib/admin/badgeImageGenerator/items'
import {
  ApiError,
  callApi,
  CHECKER_STYLE,
  formatKst,
  STYLE_ID_PLACEHOLDER,
  type Candidate,
  type Preset,
} from './imageGeneratorApi'

const GENERATION_STATUS_LABEL: Record<string, string> = {
  generated: '후보 생성됨',
  applied: '적용됨',
  reverted: '되돌림',
  failed: '실패',
}

interface Props {
  bookId: string
  item: BookItem
  presets: Preset[]
  defaultPresetId: string | null
  /** 서버 상태가 바뀐 뒤 아이템 목록을 다시 불러온다 */
  onChanged: () => Promise<void>
}

type Pending = { kind: 'apply'; index: number } | { kind: 'revert'; generationId: string }
type Busy = 'describe' | 'generate' | 'apply' | 'revert' | null

const API = '/api/admin/badge-image-generator'

/** 오른쪽 칸 — 선택한 아이템의 묘사·프리셋·생성·적용·이력 */
export default function ItemWorkbench({ bookId, item, presets, defaultPresetId, onChanged }: Props) {
  const activePresets = presets.filter((p) => p.is_active)
  const [presetId, setPresetId] = useState<string | null>(
    defaultPresetId ?? activePresets.find((p) => p.name === '기본')?.id ?? activePresets[0]?.id ?? null
  )
  const [draftEn, setDraftEn] = useState(item.descriptionEn ?? '')
  const [feedback, setFeedback] = useState('')
  const latestGenerated = item.generations.find((g) => g.status === 'generated' && g.candidate_urls.length > 0)
  const [current, setCurrent] = useState<{ generationId: string; candidates: Candidate[] } | null>(
    latestGenerated
      ? {
          generationId: latestGenerated.id,
          candidates: latestGenerated.candidate_urls.map((url) => ({ url, touchesEdge: false })),
        }
      : null
  )
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  const preset = activePresets.find((p) => p.id === presetId) ?? null
  const styleMissing = !preset || preset.style_id === STYLE_ID_PLACEHOLDER
  const dirty = draftEn !== (item.descriptionEn ?? '')
  const hasHistory = item.generations.length > 0 || current !== null
  const working = busy !== null

  function fail(e: unknown, fallback: string) {
    setError(e instanceof Error ? e.message : fallback)
  }

  async function describe(body: { manualText?: string; force?: boolean }) {
    setBusy('describe')
    setError(null)
    try {
      const res = await callApi<{ descriptionEn: string }>(`${API}/describe`, {
        method: 'POST',
        body: { bookId, itemName: item.itemName, ...body },
      })
      setDraftEn(res.descriptionEn)
      await onChanged()
      toast.success(body.manualText !== undefined ? '문장을 저장했어요.' : '영어 문장을 다시 만들었어요.')
    } catch (e) {
      fail(e, '문장을 저장하지 못했어요.')
    } finally {
      setBusy(null)
    }
  }

  /** 「생성」과 「다시 뽑기」는 둘 다 generate만 부른다(describe 호출 없음). 불만족 사항이 있을 때만 feedback을 보낸다 */
  async function generate(withFeedback: boolean) {
    if (!presetId) return
    setBusy('generate')
    setError(null)
    try {
      const res = await callApi<{ generationId: string; descriptionEn: string; candidates: Candidate[] }>(
        `${API}/generate`,
        {
          method: 'POST',
          body: {
            bookId,
            itemName: item.itemName,
            presetId,
            ...(withFeedback ? { feedback: feedback.trim() } : {}),
          },
        }
      )
      setCurrent({ generationId: res.generationId, candidates: res.candidates })
      setDraftEn(res.descriptionEn)
      if (withFeedback) setFeedback('')
      await onChanged()
    } catch (e) {
      fail(e, '이미지를 만들지 못했어요.')
      await onChanged()
    } finally {
      setBusy(null)
    }
  }

  async function confirmPending() {
    const target = pending
    setPending(null)
    if (!target) return
    setError(null)
    if (target.kind === 'apply') {
      if (!current) return
      setBusy('apply')
      try {
        await callApi(`${API}/apply`, {
          method: 'POST',
          body: { generationId: current.generationId, index: target.index },
        })
        setCurrent(null)
        await onChanged()
        toast.success('이미지를 적용했어요.')
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && e.message === 'text_detected') {
          setError('이미지 안에 글자로 보이는 부분이 있어 적용하지 않았어요. 다시 뽑거나 문장을 고쳐 주세요.')
        } else {
          fail(e, '이미지를 적용하지 못했어요.')
        }
      } finally {
        setBusy(null)
      }
    } else {
      setBusy('revert')
      try {
        await callApi(`${API}/revert`, { method: 'POST', body: { generationId: target.generationId } })
        await onChanged()
        toast.success('이전 이미지로 되돌렸어요.')
      } catch (e) {
        fail(e, '되돌리지 못했어요.')
      } finally {
        setBusy(null)
      }
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-lg font-bold">{item.itemName}</h2>
        <p className="text-sm text-muted-foreground">형태 묘사</p>
        <p className="rounded-md bg-muted p-3 text-sm">{item.formDescription}</p>
        {item.stale && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-destructive">형태 묘사가 바뀌었어요. 영어 문장을 다시 만들어 주세요.</span>
            <Button size="sm" variant="outline" disabled={working} onClick={() => describe({ force: true })}>
              다시 만들기
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-sm font-semibold">프리셋</p>
        <Select value={presetId ?? undefined} onValueChange={setPresetId}>
          <SelectTrigger>
            <SelectValue placeholder="프리셋을 골라 주세요" />
          </SelectTrigger>
          <SelectContent>
            {activePresets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} (v{p.version})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {preset && preset.style_id === STYLE_ID_PLACEHOLDER && (
          <p className="text-sm text-destructive">프리셋에 스타일 ID를 먼저 넣어 주세요.</p>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-sm font-semibold">영어 프롬프트 문장</p>
        <Textarea
          value={draftEn}
          onChange={(e) => setDraftEn(e.target.value)}
          rows={4}
          placeholder="아직 문장이 없어요. 생성하면 형태 묘사를 옮겨 만들어요."
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={working || !dirty || !draftEn.trim()}
            onClick={() => describe({ manualText: draftEn.trim() })}
          >
            문장 저장
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">저장하지 않은 수정이 있어요.</span>}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button disabled={working || styleMissing || dirty} onClick={() => generate(false)}>
            {busy === 'generate' ? '만드는 중이에요 (최대 1~2분)' : '생성'}
          </Button>
          {hasHistory && (
            <Button variant="outline" disabled={working || styleMissing || dirty} onClick={() => generate(false)}>
              다시 뽑기
            </Button>
          )}
        </div>
        {dirty && <p className="text-xs text-muted-foreground">문장을 저장한 뒤에 생성할 수 있어요.</p>}
        <div className="space-y-2">
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            placeholder="마음에 들지 않는 점을 적어 주세요"
          />
          <Button
            variant="secondary"
            disabled={working || styleMissing || dirty || !feedback.trim()}
            onClick={() => generate(true)}
          >
            반영해서 다시 생성
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>

      {current && (
        <section className="space-y-2">
          <p className="text-sm font-semibold">후보</p>
          <div className="grid grid-cols-2 gap-3">
            {current.candidates.map((c, i) => (
              <div key={c.url} className="space-y-2">
                <div className="aspect-square overflow-hidden rounded-md border" style={CHECKER_STYLE}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 어드민 미리보기, 외부 저장소 URL */}
                  <img src={c.url} alt={`후보 ${i + 1}`} className="size-full object-contain" />
                </div>
                {c.touchesEdge && <p className="text-xs text-destructive">그림이 잘렸을 수 있어요.</p>}
                <Button
                  size="sm"
                  className="w-full"
                  disabled={working}
                  onClick={() => setPending({ kind: 'apply', index: i })}
                >
                  {busy === 'apply' ? '적용 중이에요' : '이 이미지 적용'}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <p className="text-sm font-semibold">생성 이력 (최근 10개)</p>
        {item.generations.length === 0 && <p className="text-sm text-muted-foreground">아직 이력이 없어요.</p>}
        <ul className="space-y-2">
          {item.generations.map((g) => {
            const p = presets.find((x) => x.id === g.preset_id)
            return (
              <li key={g.id} className="space-y-2 rounded-md border p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{formatKst(g.created_at)}</span>
                  <span className="text-muted-foreground">
                    {p?.name ?? '삭제된 프리셋'} v{g.preset_version}
                  </span>
                  <Badge variant={g.status === 'applied' ? 'default' : 'secondary'}>
                    {GENERATION_STATUS_LABEL[g.status] ?? g.status}
                  </Badge>
                  {g.status === 'applied' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={working}
                      onClick={() => setPending({ kind: 'revert', generationId: g.id })}
                    >
                      되돌리기
                    </Button>
                  )}
                </div>
                {g.error && <p className="text-xs text-destructive">{g.error}</p>}
                <div className="flex gap-2">
                  {g.candidate_urls.map((url) => (
                    <span key={url} className="size-14 overflow-hidden rounded border" style={CHECKER_STYLE}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- 어드민 미리보기, 외부 저장소 URL */}
                      <img src={url} alt="" className="size-full object-contain" />
                    </span>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.kind === 'revert' ? '되돌릴까요?' : '이 이미지를 적용할까요?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === 'revert'
                ? '이 적용 이전의 이미지로 4개 등급 배지를 되돌려요. 서비스에 즉시 보여요.'
                : '이 이미지를 4개 등급 배지에 바로 적용합니다. 서비스에 즉시 보여요.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPending}>{pending?.kind === 'revert' ? '되돌리기' : '적용'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
