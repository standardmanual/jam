'use client'

/**
 * 쉐이더 랩 — 컴포지션 저장/불러오기 (티켓 20260912_1951)
 *
 * `shader_lab_compositions`(마이그레이션 168)에 레이어 스택 + 파라미터를 저장한다. 1차는
 * 최소 지속성만 갖춘다 — 이미지 레이어의 실제 파일(blob URL)은 저장되지 않아 불러온 뒤에는
 * 이미지를 다시 올려야 한다(완료 기록 참고).
 *
 * UI 개선(티켓 20260913_1613): 항상 펼쳐진 카드 대신 페이지 제목 옆 컴팩트 폼(이름 입력 +
 * 저장 버튼 + "목록" 버튼)으로 옮기고, 목록·불러오기·삭제는 Popover 안으로 옮겼다. 저장/조회
 * 로직은 그대로다. 오류 메시지는 팝오버 열림 여부와 무관하게 항상 보이도록 트리거 바로
 * 아래에 렌더링한다 — 팝오버를 닫아도 저장 실패 등을 놓치지 않기 위함이다.
 */
import { useEffect, useState } from 'react'
import type { ShaderLabLayerConfig } from '@basementstudio/shader-lab'
import { IconChevronDown, IconTrash } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/admin/ui/popover'

const MAX_NAME_LENGTH = 60

interface CompositionSummary {
  id: string
  name: string
  createdAt: string
  createdBy: string | null
}

interface ShaderLabSavePanelProps {
  layers: ShaderLabLayerConfig[]
  onLoad: (layers: ShaderLabLayerConfig[]) => void
}

export default function ShaderLabSavePanel({ layers, onLoad }: ShaderLabSavePanelProps) {
  // Popover(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(BadgeForm.tsx와 동일 패턴, 20260826_018).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )
  const [compositions, setCompositions] = useState<CompositionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function loadList() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/shader-lab/compositions')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '목록을 불러오지 못했습니다.')
      setCompositions(data.compositions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 이펙트 본문에서 곧바로 setState를 동기 호출하면 react-hooks/set-state-in-effect에
    // 걸려 마이크로태스크로 지연한다.
    Promise.resolve().then(() => loadList())
  }, [])

  async function saveComposition() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('이름을 입력하세요.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/shader-lab/compositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, layers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.')
      setName('')
      await loadList()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function loadComposition(id: string) {
    setLoadingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/shader-lab/compositions/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '불러오기에 실패했습니다.')
      onLoad(data.composition?.layers ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.')
    } finally {
      setLoadingId(null)
    }
  }

  async function deleteComposition(id: string) {
    setError(null)
    try {
      const res = await fetch(`/api/admin/shader-lab/compositions/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제에 실패했습니다.')
      setCompositions((prev) => prev.filter((c) => c.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <Input
          placeholder="컴포지션 이름"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveComposition()
          }}
          className="h-9 w-40"
        />
        <Button size="sm" onClick={saveComposition} disabled={saving}>
          {saving ? '저장 중…' : '저장'}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              목록
              <IconChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80" container={themeContainer ?? undefined}>
            {loading ? (
              <p className="text-sm text-muted-foreground">불러오는 중…</p>
            ) : compositions.length === 0 ? (
              <p className="text-sm text-muted-foreground">저장된 컴포지션이 없어요.</p>
            ) : (
              <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {compositions.map((composition) => (
                  <li
                    key={composition.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm text-foreground">{composition.name}</span>
                      {composition.createdBy && (
                        <span className="text-xs text-muted-foreground">{composition.createdBy}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loadingId === composition.id}
                        onClick={() => loadComposition(composition.id)}
                      >
                        {loadingId === composition.id ? '불러오는 중…' : '불러오기'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteComposition(composition.id)}
                        aria-label={`${composition.name} 삭제`}
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              이미지 레이어의 원본 파일은 저장되지 않아요 — 불러온 뒤 이미지를 다시 올려주세요.
            </p>
          </PopoverContent>
        </Popover>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
