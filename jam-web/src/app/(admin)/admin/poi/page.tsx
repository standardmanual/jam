import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'

export default async function AdminPoiPage() {
  const supabase = createServiceClient()
  const { data: pois, error } = await supabase
    .from('poi')
    .select('*, linked_badge:linked_badge_id(name)')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">POI 관리</h2>
        <Link
          href="/admin/poi/new"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + 새 POI 추가
        </Link>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-4 text-red-300">
          오류: {error.message}
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="text-left px-4 py-3 font-medium text-white/70">이름</th>
              <th className="text-left px-4 py-3 font-medium text-white/70">위도</th>
              <th className="text-left px-4 py-3 font-medium text-white/70">경도</th>
              <th className="text-left px-4 py-3 font-medium text-white/70">반경(m)</th>
              <th className="text-left px-4 py-3 font-medium text-white/70">연결 배지</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {pois && pois.length > 0 ? (
              pois.map((poi) => (
                <tr key={poi.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-medium">{poi.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/70">{poi.latitude}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/70">{poi.longitude}</td>
                  <td className="px-4 py-3">{poi.radius_meters}</td>
                  <td className="px-4 py-3 text-white/60 text-xs">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(poi as any).linked_badge?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right flex gap-3 justify-end">
                    <Link
                      href={`/admin/poi/${poi.id}`}
                      className="text-blue-400 hover:text-blue-300 text-xs"
                    >
                      수정
                    </Link>
                    <PoiDeleteButton id={poi.id} name={poi.name} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/40">
                  POI가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// 삭제 버튼 — 클라이언트 필요하므로 분리
function PoiDeleteButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={`/api/admin/poi/${id}`}
      method="POST"
      onSubmit={undefined}
      className="inline"
    >
      <DeleteButtonClient id={id} name={name} />
    </form>
  )
}

// 클라이언트 없이 form submit으로 DELETE 트리거하기 어려우므로
// 단순 링크로 처리 — 수정 페이지에서 삭제 버튼 제공
function DeleteButtonClient({ id, name }: { id: string; name: string }) {
  // Server Component에서는 onClick 불가. 삭제는 수정 페이지(/admin/poi/[id])에서 처리
  return (
    <Link
      href={`/admin/poi/${id}?delete=1`}
      className="text-red-400 hover:text-red-300 text-xs"
    >
      삭제
    </Link>
  )
}
