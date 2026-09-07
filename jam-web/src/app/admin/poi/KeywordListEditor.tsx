'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import type { PoiCategoryKeyword, PoiKeywordScope } from '@/types/database'

/** 어드민 화면 전체(생성 폼 · 행 인라인 수정)에서 scope 한글 라벨을 통일해 쓴다. */
export const SCOPE_LABELS: Record<PoiKeywordScope, string> = {
  dong: '동',
  gu: '구',
  sido: '시/도',
}

const SCOPE_OPTIONS: PoiKeywordScope[] = ['dong', 'gu', 'sido']

interface KeywordListEditorProps {
  value: PoiCategoryKeyword[]
  onChange: (next: PoiCategoryKeyword[]) => void
  /** Select(Radix Portal) 컨테이너 — 어드민 테마 스코프 노드로 지정(CategoryManager.tsx 참고) */
  themeContainer?: HTMLElement | null
}

/**
 * poi_categories.keywords(jsonb) 편집기 — 키워드마다 지역 검색 단위(scope)를 개별
 * 지정한다(티켓 20260907_1243). CategoryManager.tsx의 생성 폼·행 인라인 수정이 공유한다.
 */
export default function KeywordListEditor({ value, onChange, themeContainer }: KeywordListEditorProps) {
  const updateAt = (index: number, patch: Partial<PoiCategoryKeyword>) => {
    onChange(value.map((kw, i) => (i === index ? { ...kw, ...patch } : kw)))
  }
  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }
  const add = () => {
    onChange([...value, { keyword: '', scope: 'dong' }])
  }

  return (
    <div className="flex flex-col gap-1.5">
      {value.map((kw, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={kw.keyword}
            onChange={(e) => updateAt(i, { keyword: e.target.value })}
            placeholder="키워드"
            className="bg-white border border-border rounded-lg px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 text-xs flex-1 min-w-0"
          />
          <Select value={kw.scope} onValueChange={(v) => updateAt(i, { scope: v as PoiKeywordScope })}>
            <SelectTrigger className="h-auto px-2 py-1.5 text-xs w-[4.5rem] shrink-0" aria-label="지역 단위">
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={themeContainer ?? undefined}>
              {SCOPE_OPTIONS.map((scope) => (
                <SelectItem key={scope} value={scope}>
                  {SCOPE_LABELS[scope]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => removeAt(i)}
            className="text-red-500 hover:text-red-600 text-xs px-1.5 py-1 shrink-0"
            aria-label={`키워드 "${kw.keyword || i + 1}" 삭제`}
          >
            삭제
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-primary hover:text-primary/80 text-xs self-start px-1">
        + 키워드 추가
      </button>
    </div>
  )
}
