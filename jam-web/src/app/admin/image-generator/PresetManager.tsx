'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/admin/ui/sheet'
import { callApi, MODEL_OPTIONS, type Preset } from './imageGeneratorApi'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  presets: Preset[]
  onChanged: () => Promise<void>
}

interface Form {
  id: string | null
  name: string
  style_id: string
  model: string
  composition_text: string
  forbid_text: string
  negative_prompt: string
  background_color: string
}

const EMPTY_FORM: Form = {
  id: null,
  name: '',
  style_id: '',
  model: 'recraftv3',
  composition_text: '',
  forbid_text: '',
  negative_prompt: '',
  background_color: '#ffffff',
}

/** 프리셋 관리 시트 — 목록과 추가·수정 폼 */
export default function PresetManager({ open, onOpenChange, presets, onChanged }: Props) {
  const [form, setForm] = useState<Form | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = form?.id ? presets.find((p) => p.id === form.id) : null

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  function edit(p: Preset) {
    setError(null)
    setForm({
      id: p.id,
      name: p.name,
      style_id: p.style_id,
      model: p.model,
      composition_text: p.composition_text,
      forbid_text: p.forbid_text,
      negative_prompt: p.negative_prompt,
      background_color: p.background_color,
    })
  }

  async function save() {
    if (!form) return
    setSaving(true)
    setError(null)
    try {
      const { id, ...fields } = form
      await callApi('/api/admin/badge-image-generator/presets', {
        method: id ? 'PATCH' : 'POST',
        body: id ? { id, ...fields } : fields,
      })
      await onChanged()
      toast.success('프리셋을 저장했어요.')
      setForm(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '프리셋을 저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>프리셋 관리</SheetTitle>
          <SheetDescription>이미지 스타일과 고정 문장을 프리셋으로 묶어 관리해요.</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 p-4">
          {!form && (
            <>
              <Button
                onClick={() => {
                  setError(null)
                  setForm(EMPTY_FORM)
                }}
              >
                프리셋 추가
              </Button>
              <ul className="space-y-2">
                {presets.map((p) => (
                  <li key={p.id} className="space-y-1 rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {p.name}
                        {!p.is_active && <span className="ml-2 text-xs text-muted-foreground">(꺼짐)</span>}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => edit(p)}>
                        수정
                      </Button>
                    </div>
                    <p className="text-muted-foreground">
                      스타일 ID {p.style_id} · 모델 {p.model} · v{p.version} · 적용한 아이템 {p.appliedCount}개
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}

          {form && (
            <div className="space-y-3">
              {editing && editing.appliedCount > 0 && (
                <p className="rounded-md bg-muted p-3 text-sm text-destructive">
                  이 프리셋으로 적용한 아이템 {editing.appliedCount}개와 분위기가 달라질 수 있어요.
                </p>
              )}
              <Field label="이름">
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="스타일 ID">
                <Input value={form.style_id} onChange={(e) => set('style_id', e.target.value)} />
              </Field>
              <Field label="모델" hint="스타일 ID를 만든 모델과 같아야 해요.">
                <Select value={form.model} onValueChange={(v) => set('model', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="구도 고정 문장">
                <Textarea rows={3} value={form.composition_text} onChange={(e) => set('composition_text', e.target.value)} />
              </Field>
              <Field label="금지 고정 문장">
                <Textarea rows={3} value={form.forbid_text} onChange={(e) => set('forbid_text', e.target.value)} />
              </Field>
              <Field label="네거티브 프롬프트" hint="recraftv3에서만 적용돼요.">
                <Textarea rows={2} value={form.negative_prompt} onChange={(e) => set('negative_prompt', e.target.value)} />
              </Field>
              <Field label="배경색 (hex)">
                <Input value={form.background_color} onChange={(e) => set('background_color', e.target.value)} />
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button disabled={saving} onClick={save}>
                  {saving ? '저장 중' : '저장'}
                </Button>
                <Button variant="outline" disabled={saving} onClick={() => setForm(null)}>
                  취소
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}
