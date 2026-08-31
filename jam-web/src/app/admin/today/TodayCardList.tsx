'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import BadgeMultiSearchSelect from '@/components/admin/BadgeMultiSearchSelect'
import type { BadgeSearchResult } from '@/components/admin/BadgeSearchSelect'
import type { TodayCardRow, TodayCardTemplateType, TodayCardLayoutType } from '@/types/database'
import { TodayCardTable } from './TodayCardTable'

// Radix Select는 SelectItem value=""를 허용하지 않는다 — "선택 안 함"을 나타내는 전용 값.
const NONE_VALUE = '__none__'

interface MissionOption { id: string; title: string }
interface ItemBookOption { id: string; name: string }

interface Props {
  cards: TodayCardRow[]
  /** 이미 카드에 연결된(badge_ids) 배지의 표시용 라벨 — 실제로 참조되는 id만 bounded 조회한
   *  결과다(20260826_011 A2). 신규로 검색해 추가하는 배지는 BadgeMultiSearchSelect의 검색
   *  결과 객체를 그대로 캐시에 얹는다. */
  badgeLabels: BadgeSearchResult[]
  missions: MissionOption[]
  itemBooks: ItemBookOption[]
}

const templates: { value: TodayCardTemplateType; label: string }[] = [
  { value: 'badge_spotlight', label: '배지 소개 (badge_spotlight)' },
  { value: 'progress_nudge', label: '진행 알림 (progress_nudge)' },
  { value: 'mission_spotlight', label: '미션 소개 (mission_spotlight)' },
  { value: 'itembook_milestone', label: '컬렉션 소식 (itembook_milestone)' },
  { value: 'location_trend', label: '지역 트렌드 (location_trend)' },
  { value: 'drop_alert', label: '드랍 유도 (drop_alert)' },
  { value: 'editorial_article', label: '에디토리얼 기사 (editorial_article)' },
]

const layoutTypes: { value: TodayCardLayoutType; label: string }[] = [
  { value: 'large_thumbnail', label: '큰 썸네일형 — 커버 이미지 크게' },
  { value: 'badge_gallery', label: '배지목록형 — 배지 갤러리/리스트' },
  { value: 'shortcut', label: '바로가기형 — 이미지 없는 짧은 CTA' },
  { value: 'banner', label: '배너형 — 가로 띠 배너' },
  { value: 'other', label: '기타 — 기본형' },
]

// 템플릿을 고르면 처음엔 이 레이아웃을 기본 선택해둠(추천값일 뿐, 어드민이 자유롭게 바꿀 수 있음)
const suggestedLayoutFor: Record<TodayCardTemplateType, TodayCardLayoutType> = {
  badge_spotlight: 'large_thumbnail',
  progress_nudge: 'shortcut',
  mission_spotlight: 'shortcut',
  itembook_milestone: 'banner',
  location_trend: 'badge_gallery',
  drop_alert: 'shortcut',
  editorial_article: 'large_thumbnail',
}

// 템플릿별 노출 필드 매트릭스 (Phase15_02_DATA_MODEL §2)
const fieldsFor: Record<TodayCardTemplateType, {
  badges?: boolean; mission?: boolean; itemBook?: boolean; region?: boolean; body?: boolean; targetHref?: boolean
}> = {
  badge_spotlight: { badges: true, targetHref: true },
  progress_nudge: { badges: true, mission: true, targetHref: true },
  mission_spotlight: { mission: true, targetHref: true },
  itembook_milestone: { itemBook: true, targetHref: true },
  location_trend: { badges: true, region: true, targetHref: true },
  drop_alert: {}, // target 고정 /drops
  editorial_article: { body: true }, // target 고정 /today/{id}
}

const exposureTagOptions = [
  { value: 'all', label: 'all (항상 노출)' },
  { value: 'time_dawn', label: 'time_dawn (00~06)' },
  { value: 'time_morning', label: 'time_morning (06~11)' },
  { value: 'time_afternoon', label: 'time_afternoon (11~17)' },
  { value: 'time_evening', label: 'time_evening (17~21)' },
  { value: 'time_night', label: 'time_night (21~24)' },
  { value: 'has_participating_mission', label: 'has_participating_mission' },
  { value: 'has_ending_soon_mission', label: 'has_ending_soon_mission' },
  { value: 'has_incomplete_itembook', label: 'has_incomplete_itembook' },
  { value: 'new_user', label: 'new_user (가입 7일 이내)' },
]

const emptyForm = {
  template_type: 'badge_spotlight' as TodayCardTemplateType,
  layout_type: suggestedLayoutFor.badge_spotlight as TodayCardLayoutType,
  title: '',
  subtitle: '',
  cover_image_url: '',
  badge_ids: [] as string[],
  mission_id: '',
  item_book_id: '',
  region_label: '',
  body_markdown: '',
  target_href: '',
  exposure_tags: ['all'] as string[],
  starts_at: '',
  ends_at: '',
  sort_order: 0,
  is_active: true,
}

// ISO(UTC) 문자열을 datetime-local input이 요구하는 "YYYY-MM-DDTHH:mm" 로컬 형식으로 변환
function toLocalInputValue(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TodayCardList({ cards, badgeLabels, missions, itemBooks }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // 배지 id → 검색 결과 객체 캐시. badgeLabels(초기 참조 배지)로 시작해 새로 검색·선택한
  // 배지가 추가되면서 자라난다.
  const [badgeLabelCache, setBadgeLabelCache] = useState(
    () => new Map(badgeLabels.map((b) => [b.id, b]))
  )
  const router = useRouter()

  const fields = fieldsFor[form.template_type]
  const selectedBadgeChips = form.badge_ids
    .map((id) => badgeLabelCache.get(id))
    .filter((b): b is BadgeSearchResult => !!b)

  function addBadge(b: BadgeSearchResult) {
    setForm((f) => (f.badge_ids.includes(b.id) ? f : { ...f, badge_ids: [...f.badge_ids, b.id] }))
    setBadgeLabelCache((prev) => new Map(prev).set(b.id, b))
  }

  function removeBadge(id: string) {
    setForm((f) => ({ ...f, badge_ids: f.badge_ids.filter((x) => x !== id) }))
  }

  function toggleTag(value: string) {
    setForm((f) => ({
      ...f,
      exposure_tags: f.exposure_tags.includes(value)
        ? f.exposure_tags.filter((x) => x !== value)
        : [...f.exposure_tags, value],
    }))
  }

  const handleEdit = useCallback((card: TodayCardRow) => {
    setForm({
      template_type: card.template_type,
      layout_type: card.layout_type,
      title: card.title,
      subtitle: card.subtitle ?? '',
      cover_image_url: card.cover_image_url ?? '',
      badge_ids: card.badge_ids ?? [],
      mission_id: card.mission_id ?? '',
      item_book_id: card.item_book_id ?? '',
      region_label: card.region_label ?? '',
      body_markdown: card.body_markdown ?? '',
      target_href: card.target_href ?? '',
      exposure_tags: card.exposure_tags ?? ['all'],
      starts_at: toLocalInputValue(card.starts_at),
      ends_at: toLocalInputValue(card.ends_at),
      sort_order: card.sort_order,
      is_active: card.is_active,
    })
    setEditingId(card.id)
    setError('')
    setShowForm(true)
  }, [])

  function handleCancel() {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
    setShowForm(false)
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('제목을 입력하세요.'); return }
    if (!form.starts_at || !form.ends_at) { setError('시작/종료 일시를 입력하세요.'); return }
    if (form.exposure_tags.length === 0) { setError('노출조건 태그를 하나 이상 선택하세요.'); return }
    setError('')
    setSaving(true)

    const f = fields
    const body = {
      template_type: form.template_type,
      layout_type: form.layout_type,
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      cover_image_url: form.cover_image_url.trim() || null,
      badge_ids: f.badges ? form.badge_ids : [],
      mission_id: f.mission ? (form.mission_id || null) : null,
      item_book_id: f.itemBook ? (form.item_book_id || null) : null,
      region_label: f.region ? (form.region_label.trim() || null) : null,
      body_markdown: f.body ? (form.body_markdown || null) : null,
      // editorial_article/drop_alert 은 target_href 무시(자동/고정)
      target_href: f.targetHref ? (form.target_href.trim() || null) : null,
      exposure_tags: form.exposure_tags,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    }

    const res = await fetch(editingId ? `/api/admin/today/${editingId}` : '/api/admin/today', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? '저장 실패')
      return
    }
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(false)
    router.refresh()
  }

  const handleToggleActive = useCallback(async (card: TodayCardRow) => {
    await fetch(`/api/admin/today/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !card.is_active }),
    })
    router.refresh()
  }, [router])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('카드를 삭제하시겠습니까?')) return
    await fetch(`/api/admin/today/${id}`, { method: 'DELETE' })
    router.refresh()
  }, [router])

  const inputCls = 'w-full bg-white border border-border rounded-xl px-3 py-2 text-sm'
  const labelCls = 'text-xs text-muted-foreground mb-1 block'

  return (
    <div className="space-y-6">
      <button
        onClick={() => (showForm ? handleCancel() : setShowForm(true))}
        className="bg-primary text-white font-bold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm"
      >
        {showForm ? '취소' : '+ 콘텐츠 추가'}
      </button>

      {showForm && (
        <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
          <h2 className="font-bold">{editingId ? '투데이 카드 수정' : '새 투데이 카드'}</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>템플릿 타입 (콘텐츠 종류)</label>
              <Select
                value={form.template_type}
                onValueChange={(v) => {
                  const template_type = v as TodayCardTemplateType
                  setForm((f) => ({ ...f, template_type, layout_type: suggestedLayoutFor[template_type] }))
                }}
              >
                <SelectTrigger className={inputCls} aria-label="템플릿 타입">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={labelCls}>노출 형태 (화면에 보여줄 모양)</label>
              <Select
                value={form.layout_type}
                onValueChange={(v) => setForm((f) => ({ ...f, layout_type: v as TodayCardLayoutType }))}
              >
                <SelectTrigger className={inputCls} aria-label="노출 형태">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {layoutTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>제목</label>
              <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className={inputCls} placeholder="핫한 성수동에서 발견된 Epic 배지 5" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>부제 (선택)</label>
              <input type="text" value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>커버 이미지 URL (선택)</label>
              <input type="text" value={form.cover_image_url} onChange={(e) => setForm((f) => ({ ...f, cover_image_url: e.target.value }))}
                className={inputCls} placeholder="https://..." />
            </div>
          </div>

          {/* 템플릿별 참조 필드 */}
          {fields.badges && (
            <div className="border border-border rounded-2xl p-4 space-y-2">
              <label className={labelCls}>배지 선택 (복수 가능)</label>
              <BadgeMultiSearchSelect
                selected={selectedBadgeChips}
                onSelect={addBadge}
                onRemove={removeBadge}
                placeholder="배지 이름 검색..."
              />
            </div>
          )}

          {fields.mission && (
            <div>
              <label className={labelCls}>미션 선택{form.template_type === 'progress_nudge' ? ' (선택)' : ''}</label>
              <Select
                value={form.mission_id || NONE_VALUE}
                onValueChange={(v) => setForm((f) => ({ ...f, mission_id: v === NONE_VALUE ? '' : v }))}
              >
                <SelectTrigger className={inputCls} aria-label="미션 선택">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>— 없음 —</SelectItem>
                  {missions.map((m) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {fields.itemBook && (
            <div>
              <label className={labelCls}>컬렉션 선택</label>
              <Select
                value={form.item_book_id || NONE_VALUE}
                onValueChange={(v) => setForm((f) => ({ ...f, item_book_id: v === NONE_VALUE ? '' : v }))}
              >
                <SelectTrigger className={inputCls} aria-label="컬렉션 선택">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>— 없음 —</SelectItem>
                  {itemBooks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {fields.region && (
            <div>
              <label className={labelCls}>지역명 (자유 입력)</label>
              <input type="text" value={form.region_label} onChange={(e) => setForm((f) => ({ ...f, region_label: e.target.value }))}
                className={inputCls} placeholder="성수동" />
            </div>
          )}

          {fields.body && (
            <div>
              <label className={labelCls}>본문 (빈 줄로 문단 구분)</label>
              <textarea value={form.body_markdown} onChange={(e) => setForm((f) => ({ ...f, body_markdown: e.target.value }))}
                rows={8} className={`${inputCls} font-mono`} placeholder={'첫 문단...\n\n두 번째 문단...'} />
            </div>
          )}

          {fields.targetHref && (
            <div>
              <label className={labelCls}>이동 경로 (선택, 비우면 템플릿 규칙으로 자동 생성)</label>
              <input type="text" value={form.target_href} onChange={(e) => setForm((f) => ({ ...f, target_href: e.target.value }))}
                className={inputCls} placeholder="/badges 또는 /badges/{id}" />
            </div>
          )}
          {form.template_type === 'drop_alert' && (
            <p className="text-muted-foreground text-xs">이동 경로는 /drops 로 고정됩니다.</p>
          )}
          {form.template_type === 'editorial_article' && (
            <p className="text-muted-foreground text-xs">이동 경로는 /today/{'{id}'} (전용 기사 페이지)로 고정됩니다.</p>
          )}

          {/* 노출조건 태그 */}
          <div className="border border-border rounded-2xl p-4">
            <label className={labelCls}>노출조건 태그 (OR 매칭 — 하나라도 해당하면 노출)</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {exposureTagOptions.map((t) => {
                const checked = form.exposure_tags.includes(t.value)
                return (
                  <button key={t.value} onClick={() => toggleTag(t.value)}
                    className={`text-xs rounded-lg px-2 py-1 border ${checked ? 'bg-primary/20 text-foreground border-primary/40' : 'text-muted-foreground border-border hover:bg-muted'}`}>
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>시작 일시</label>
              <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>종료 일시</label>
              <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>정렬 순서 (작을수록 위)</label>
              <input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                className={inputCls} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
                활성화
              </label>
            </div>
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="bg-primary text-white font-bold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm">
              {saving ? '저장 중...' : editingId ? '수정 저장' : '저장'}
            </button>
            {editingId && (
              <button onClick={handleCancel}
                className="text-muted-foreground font-bold px-4 py-2 rounded-xl hover:bg-muted transition-colors text-sm">
                취소
              </button>
            )}
          </div>
        </div>
      )}

      {/* 카드 목록 */}
      <TodayCardTable cards={cards} onEdit={handleEdit} onToggleActive={handleToggleActive} onDelete={handleDelete} />
    </div>
  )
}
