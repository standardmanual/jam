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

export default function TodayCardList({ cards, badges, missions, itemBooks }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
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

    const res = await fetch('/api/admin/today', {
      method: 'POST',
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
  const inputCls = 'w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm'
  const labelCls = 'text-xs text-white/40 mb-1 block'

  return (
    <div className="space-y-6">
      <button
        onClick={() => setShowForm((v) => !v)}
        className="bg-[#AEEA00] text-black font-bold px-4 py-2 rounded-xl hover:bg-[#c6ff00] transition-colors text-sm"
      >
        {showForm ? '취소' : '+ 콘텐츠 추가'}
      </button>

      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="font-bold">새 투데이 카드</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>템플릿 타입 (콘텐츠 종류)</label>
              <select value={form.template_type}
                onChange={(e) => {
                  const template_type = e.target.value as TodayCardTemplateType
                  setForm((f) => ({ ...f, template_type, layout_type: suggestedLayoutFor[template_type] }))
                }}
                className={inputCls}>
                {templates.map((t) => <option key={t.value} value={t.value} className="bg-[#1a1a1a]">{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>노출 형태 (화면에 보여줄 모양)</label>
              <select value={form.layout_type}
                onChange={(e) => setForm((f) => ({ ...f, layout_type: e.target.value as TodayCardLayoutType }))}
                className={inputCls}>
                {layoutTypes.map((t) => <option key={t.value} value={t.value} className="bg-[#1a1a1a]">{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>제목</label>
              <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className={inputCls} placeholder="핫한 성수동에서 발견된 레전드 배지 5" />
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
            <div className="border border-white/10 rounded-2xl p-4 space-y-2">
              <label className={labelCls}>배지 선택 (복수 가능)</label>
              {selectedBadges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedBadges.map((b) => (
                    <button key={b.id} onClick={() => toggleBadge(b.id)}
                      className="text-xs bg-[#AEEA00]/20 text-[#AEEA00] border border-[#AEEA00]/40 rounded-lg px-2 py-1 hover:bg-[#AEEA00]/30">
                      {b.name} ✕
                    </button>
                  ))}
                </div>
              )}
              <input type="text" value={badgeQuery} onChange={(e) => setBadgeQuery(e.target.value)}
                placeholder="배지 이름 검색..." className={inputCls} />
              <div className="max-h-44 overflow-y-auto border border-white/10 rounded-xl divide-y divide-white/5">
                {filteredBadges.length === 0 && <p className="text-white/30 text-xs px-3 py-2">검색 결과 없음</p>}
                {filteredBadges.slice(0, 100).map((b) => {
                  const checked = form.badge_ids.includes(b.id)
                  return (
                    <button key={b.id} onClick={() => toggleBadge(b.id)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-white/5 ${checked ? 'text-[#AEEA00]' : 'text-white/70'}`}>
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${checked ? 'bg-[#AEEA00] border-[#AEEA00] text-black' : 'border-white/30'}`}>
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
                <option value="" className="bg-[#1a1a1a]">— 없음 —</option>
                {missions.map((m) => <option key={m.id} value={m.id} className="bg-[#1a1a1a]">{m.title}</option>)}
              </select>
            </div>
          )}

          {fields.itemBook && (
            <div>
              <label className={labelCls}>아이템북 선택</label>
              <select value={form.item_book_id} onChange={(e) => setForm((f) => ({ ...f, item_book_id: e.target.value }))}
                className={inputCls}>
                <option value="" className="bg-[#1a1a1a]">— 없음 —</option>
                {itemBooks.map((b) => <option key={b.id} value={b.id} className="bg-[#1a1a1a]">{b.name}</option>)}
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
            <p className="text-white/30 text-xs">이동 경로는 /drops 로 고정됩니다.</p>
          )}
          {form.template_type === 'editorial_article' && (
            <p className="text-white/30 text-xs">이동 경로는 /today/{'{id}'} (전용 기사 페이지)로 고정됩니다.</p>
          )}

          {/* 노출조건 태그 */}
          <div className="border border-white/10 rounded-2xl p-4">
            <label className={labelCls}>노출조건 태그 (OR 매칭 — 하나라도 해당하면 노출)</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {exposureTagOptions.map((t) => {
                const checked = form.exposure_tags.includes(t.value)
                return (
                  <button key={t.value} onClick={() => toggleTag(t.value)}
                    className={`text-xs rounded-lg px-2 py-1 border ${checked ? 'bg-[#AEEA00]/20 text-[#AEEA00] border-[#AEEA00]/40' : 'text-white/50 border-white/20 hover:bg-white/5'}`}>
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
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
                활성화
              </label>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button onClick={handleSave} disabled={saving}
            className="bg-[#AEEA00] text-black font-bold px-4 py-2 rounded-xl hover:bg-[#c6ff00] transition-colors text-sm">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}

      {/* 카드 목록 */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-left">
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
              <tr><td colSpan={7} className="px-5 py-10 text-center text-white/30">카드 없음</td></tr>
            )}
            {cards.map((c) => {
              const started = new Date(c.starts_at) <= now
              const ended = new Date(c.ends_at) < now
              const live = c.is_active && started && !ended
              const status = !c.is_active ? '비활성' : ended ? '종료' : !started ? '예약' : '노출중'
              const statusCls = live ? 'bg-[#AEEA00]/20 text-[#AEEA00]' : ended || !c.is_active ? 'bg-white/10 text-white/30' : 'bg-amber-500/20 text-amber-400'
              return (
                <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 align-top">
                  <td className="px-5 py-3 font-medium max-w-[220px]">{c.title}</td>
                  <td className="px-5 py-3 text-white/60 text-xs">{c.template_type}</td>
                  <td className="px-5 py-3 text-white/60 text-xs">{c.layout_type}</td>
                  <td className="px-5 py-3 text-white/50 text-xs max-w-[180px]">{c.exposure_tags.join(', ')}</td>
                  <td className="px-5 py-3 text-white/50 text-xs">
                    {new Date(c.starts_at).toLocaleDateString('ko-KR')} ~<br />
                    {new Date(c.ends_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusCls}`}>{status}</span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <button onClick={() => handleToggleActive(c)} className="text-white/50 hover:text-white text-xs mr-3">
                      {c.is_active ? '비활성화' : '활성화'}
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-300 text-xs">삭제</button>
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
