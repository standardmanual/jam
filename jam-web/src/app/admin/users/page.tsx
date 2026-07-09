import { createServiceClient } from '@/lib/supabase/server'
import type { UserRow } from '@/types/database'

export default async function AdminUsersPage() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('id, email, display_name, created_at, region')
    .order('created_at', { ascending: false })
    .limit(100)

  const users = (data ?? []) as Pick<UserRow, 'id' | 'email' | 'display_name' | 'created_at' | 'region'>[]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">유저 조회</h1>
        <p className="text-white/40 text-sm">최근 100명</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-left">
              <th className="px-5 py-3 font-medium">이름</th>
              <th className="px-5 py-3 font-medium">이메일</th>
              <th className="px-5 py-3 font-medium">지역</th>
              <th className="px-5 py-3 font-medium">가입일</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-white/30">
                  유저가 없습니다.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-5 py-3 font-medium">{user.display_name}</td>
                <td className="px-5 py-3 text-white/60">{user.email}</td>
                <td className="px-5 py-3 text-white/60">{user.region ?? '—'}</td>
                <td className="px-5 py-3 text-white/40 text-xs">
                  {new Date(user.created_at).toLocaleDateString('ko-KR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
