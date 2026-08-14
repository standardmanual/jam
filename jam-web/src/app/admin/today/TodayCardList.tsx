'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TodayCardRow, TodayCardTemplateType, TodayCardLayoutType } from '@/types/database'

interface BadgeOption { id: string; name: string }
interface MissionOption { id: string; title: string }
interface ItemBookOption { id: string; name: string }

interface Props {
  cards: TodayCardRow[]
  badges: BadgeOption[]
  missions: MissionOption[]
  itemBooks: ItemBookOption[]
}

const templates: { value: TodayCardTemplateType; label: string }[] = [
  { value: 'badge_spotlight', label: '배지 소개 (badge_spotlight)' },
  { value: 'progress_nudge', label: '진행 알림 (progress_nudge)' },
  { value: 'mission_spotlight', label: '미션 소개 (mission_spotlight)' },
  { value: 'itembook_milestone', label: '아이템북 소식 (itembook_milestone)' },
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

export default function TodayCardList({ cards, badges, missions, itemBooks }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [badgeQuery, setBadgeQuery] = useState('')
  const router = useRouter()

  const fields = fieldsFor[form.template_type]
  const selectedBadges = badges.filter((b) => form.badge_ids.includes(b.id))
  const filteredBadges = badgeQuery.trim()
    ? badges.filter((b) => b.name.toLowerCase().includes(badgeQuery.trim().toLowerCase()))
    : badges

  function toggleBadge(id: string) {
    setForm((f) => ({
      ...f,
      badge_ids: f.badge_ids.includes(id) ? f.badge_ids.filter((x) => x !== id) : [...f.badge_ids, id],
    }))
  }

  function toggleTag(value: string) {
    setForm((f) => ({
      ...f,
      exposure_tags: f.exposure_tags.includes(value)
        ? f.exposure_tags.filter((x) => x !== value)
        : [...f.exposure_tags, value],
    }))
  }

  function handleEdit(card: TodayCardRow) {
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
    setBadgeQuery('')
    setError('')
    setShowForm(true)
  }

  function handleCancel() {
    setForm(emptyForm)
    setEditingId(null)
    setBadgeQuery('')
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
    setBadgeQuery('')
    setEditingId(null)
    setShowForm(false)
    router.refresh()
  }

  async function handleToggleActive(card: TodayCardRow) {
    await fetch(`/api/admin/today/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !card.is_active }),
    })
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('카드를 삭제하시겠습니까?')) return
    await fetch(`/api/admin/today/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  const now = new Date()
  const inputCls = 'w-full bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 text-sm'
  const labelCls = 'text-xs text-[#6b7280] mb-1 block'

  return (
    <div className="space-y-6">
      <button
        onClick={() => (showForm ? handleCancel() : setShowForm(true))}
        className="bg-[#111111] text-white font-bold px-4 py-2 rounded-xl hover:bg-[#242424] transition-colors text-sm"
      >
        {showForm ? '취소' : '+ 콘텐츠 추가'}
      </button>

      {showForm && (
        <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6 space-y-4">
          <h2 className="font-bold">{editingId ? '투데이 카드 수정' : '새 투데이 카드'}</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>템플릿 타입 (콘텐츠 종류)</label>
              <select value={form.template_type}
                onChange={(e) => {
                  const template_type = e.target.value as TodayCardTemplateType
                  setForm((f) => ({ ...f, template_type, layout_type: suggestedLayoutFor[template_type] }))
                }}
                className={inputCls}>
                {templates.map((t) => <option key={t.value} value={t.value} className="bg-white">{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>노출 형태 (화면에 보여줄 모양)</label>
              <select value={form.layout_type}
                onChange={(e) => setForm((f) => ({ ...f, layout_type: e.target.value as TodayCardLayoutType }))}
                className={inputCls}>
                {layoutTypes.map((t) => <option key={t.value} value={t.value} className="bg-white">{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>제목</label>
              <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className={inputCls} placeholder="핫한 성수동에서 발견된 Legend 배지 5" />
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
            <div className="border border-[#e5e7eb] rounded-2xl p-4 space-y-2">
              <label className={labelCls}>배지 선택 (복수 가능)</label>
              {selectedBadges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedBadges.map((b) => (
                    <button key={b.id} onClick={() => toggleBadge(b.id)}
                      className="text-xs bg-[#111111]/20 text-[#111111] border border-[#111111]/40 rounded-lg px-2 py-1 hover:bg-[#111111]/30">
                      {b.name} ✕
                    </button>
                  ))}
                </div>
              )}
              <input type="text" value={badgeQuery} onChange={(e) => setBadgeQuery(e.target.value)}
                placeholder="배지 이름 검색..." className={inputCls} />
              <div className="max-h-44 overflow-y-auto border border-[#e5e7eb] rounded-xl divide-y divide-[#f3f4f6]">
                {filteredBadges.length === 0 && <p className="text-[#898989] text-xs px-3 py-2">검색 결과 없음</p>}
                {filteredBadges.slice(0, 100).map((b) => {
                  const checked = form.badge_ids.includes(b.id)
                  return (
                    <button key={b.id} onClick={() => toggleBadge(b.id)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#f8f9fa] ${checked ? 'text-[#111111]' : 'text-[#374151]'}`}>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${checked ? 'bg-[#111111] border-[#111111] text-white' : 'border-[#e5e7eb]'}`}>
                        {checked ? '✓' : ''}
                      </span>
                      {b.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {fields.mission && (
            <div>
              <label className={labelCls}>미션 선택{form.template_type === 'progress_nudge' ? ' (선택)' : ''}</label>
              <select value={form.mission_id} onChange={(e) => setForm((f) => ({ ...f, mission_id: e.target.value }))}
                className={inputCls}>
                <option value="" className="bg-white">— 없음 —</option>
                {missions.map((m) => <option key={m.id} value={m.id} className="bg-white">{m.title}</option>)}
              </select>
            </div>
          )}

          {fields.itemBook && (
            <div>
              <label className={labelCls}>아이템북 선택</label>
              <select value={form.item_book_id} onChange={(e) => setForm((f) => ({ ...f, item_book_id: e.target.value }))}
                className={inputCls}>
                <option value="" className="bg-white">— 없음 —</option>
                {itemBooks.map((b) => <option key={b.id} value={b.id} className="bg-white">{b.name}</option>)}
              </select>
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
            <p className="text-[#898989] text-xs">이동 경로는 /drops 로 고정됩니다.</p>
          )}
          {form.template_type === 'editorial_article' && (
            <p className="text-[#898989] text-xs">이동 경로는 /today/{'{id}'} (전용 기사 페이지)로 고정됩니다.</p>
          )}

          {/* 노출조건 태그 */}
          <div className="border border-[#e5e7eb] rounded-2xl p-4">
            <label className={labelCls}>노출조건 태그 (OR 매칭 — 하나라도 해당하면 노출)</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {exposureTagOptions.map((t) => {
                const checked = form.exposure_tags.includes(t.value)
                return (
                  <button key={t.value} onClick={() => toggleTag(t.value)}
                    className={`text-xs rounded-lg px-2 py-1 border ${checked ? 'bg-[#111111]/20 text-[#111111] border-[#111111]/40' : 'text-[#6b7280] border-[#e5e7eb] hover:bg-[#f8f9fa]'}`}>
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
              <label className="flex items-center gap-2 text-sm text-[#374151]">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
                활성화
              </label>
            </div>
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="bg-[#111111] text-white font-bold px-4 py-2 rounded-xl hover:bg-[#242424] transition-colors text-sm">
              {saving ? '저장 중...' : editingId ? '수정 저장' : '저장'}
            </button>
            {editingId && (
              <button onClick={handleCancel}
                className="text-[#6b7280] font-bold px-4 py-2 rounded-xl hover:bg-[#f8f9fa] transition-colors text-sm">
                취소
              </button>
            )}
          </div>
        </div>
      )}

      {/* 카드 목록 */}
      <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5e7eb] text-[#6b7280] text-left">
              <th className="px-5 py-3 font-medium">제목</th>
              <th className="px-5 py-3 font-medium">템플릿</th>
              <th className="px-5 py-3 font-medium">노출형태</th>
              <th className="px-5 py-3 font-medium">노출조건</th>
              <th className="px-5 py-3 font-medium">기간</th>
              <th className="px-5 py-3 font-medium">상태</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {cards.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-[#898989]">카드 없음</td></tr>
            )}
            {cards.map((c) => {
              const started = new Date(c.starts_at) <= now
              const ended = new Date(c.ends_at) < now
              const live = c.is_active && started && !ended
              const status = !c.is_active ? '비활성' : ended ? '종료' : !started ? '예약' : '노출중'
              const statusCls = live ? 'bg-[#111111]/20 text-[#111111]' : ended || !c.is_active ? 'bg-[#f3f4f6] text-[#898989]' : 'bg-amber-50 text-amber-600'
              return (
                <tr key={c.id} className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa] align-top">
                  <td className="px-5 py-3 font-medium max-w-[220px]">{c.title}</td>
                  <td className="px-5 py-3 text-[#374151] text-xs">{c.template_type}</td>
                  <td className="px-5 py-3 text-[#374151] text-xs">{c.layout_type}</td>
                  <td className="px-5 py-3 text-[#6b7280] text-xs max-w-[180px]">{c.exposure_tags.join(', ')}</td>
                  <td className="px-5 py-3 text-[#6b7280] text-xs">
                    {new Date(c.starts_at).toLocaleDateString('ko-KR')} ~<br />
                    {new Date(c.ends_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusCls}`}>{status}</span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <button onClick={() => handleEdit(c)} className="text-[#6b7280] hover:text-[#111111] text-xs mr-3">
                      수정
                    </button>
                    <button onClick={() => handleToggleActive(c)} className="text-[#6b7280] hover:text-[#111111] text-xs mr-3">
                      {c.is_active ? '비활성화' : '활성화'}
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-700 text-xs">삭제</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
