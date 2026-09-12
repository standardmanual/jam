'use client'

import { useEffect, useState } from 'react'
import { IconCircleX, IconTrash } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import {
  MAX_PRESET_NAME_LENGTH,
  extractShaderTextStyle,
  type ShaderTextParams,
  type ShaderTextStyleParams,
} from '@/lib/admin/shaderTextDissolve'

interface PresetSummary {
  id: string
  name: string
  style: ShaderTextStyleParams | null
  createdAt: string
  createdBy: string | null
}

interface ShaderTextPresetPanelProps {
  params: ShaderTextParams
  onApplyStyle: (style: ShaderTextStyleParams) => void
}

/**
 * 스타일 프리셋 저장/불러오기 (티켓 20260912_1532)
 *
 * `shader_text_presets`(마이그레이션 167)에 저장해 여러 관리자·PC 간 공유한다. 문구(`text`)는
 * 프리셋에 담기지 않는다 — 저장된 값을 불러와도 지금 입력한 문구는 그대로 유지된다.
 */
export default function ShaderTextPresetPanel({ params, onApplyStyle }: ShaderTextPresetPanelProps) {
  const [presets, setPresets] = useState<PresetSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadPresets() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/shader-text/presets')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '프리셋을 불러오지 못했습니다.')
      setPresets(data.presets ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '프리셋을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // loadPresets 내부가 첫 await 전에 setLoading을 동기 호출해 react-hooks/set-state-in-effect에
    // 걸리므로 마이크로태스크로 지연한다(`PoiCarouselModal.tsx`와 동일한 기존 패턴). 같은 틱 내,
    // 페인트 이전에 실행되어 체감 타이밍 차이는 없다.
    Promise.resolve().then(() => loadPresets())
  }, [])

  async function savePreset() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('프리셋 이름을 입력하세요.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/shader-text/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, style: extractShaderTextStyle(params) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '프리셋 저장에 실패했습니다.')
      setName('')
      await loadPresets()
    } catch (e) {
      setError(e instanceof Error ? e.message : '프리셋 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function deletePreset(id: string) {
    setError(null)
    try {
      const res = await fetch(`/api/admin/shader-text/presets/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '프리셋 삭제에 실패했습니다.')
      setPresets((prev) => prev.filter((p) => p.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : '프리셋 삭제에 실패했습니다.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          placeholder="프리셋 이름"
          value={name}
          maxLength={MAX_PRESET_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void savePreset()
          }}
        />
        <Button onClick={savePreset} disabled={saving}>
          {saving ? '저장 중…' : '현재 스타일 저장'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <IconCircleX className="h-4 w-4" />
          <AlertTitle>오류</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : presets.length === 0 ? (
        <p className="text-sm text-muted-foreground">저장된 프리셋이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2 max-h-60 overflow-y-auto">
          {presets.map((preset) => (
            <li
              key={preset.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-sm text-foreground">{preset.name}</span>
                {preset.createdBy && (
                  <span className="text-xs text-muted-foreground">{preset.createdBy}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!preset.style}
                  onClick={() => preset.style && onApplyStyle(preset.style)}
                >
                  불러오기
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deletePreset(preset.id)} aria-label={`${preset.name} 삭제`}>
                  <IconTrash className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
