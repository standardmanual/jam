import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value

  if (!token || token !== process.env.ADMIN_SECRET) {
    redirect('/admin/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-white/10 bg-gray-900 px-6 py-3 flex items-center justify-between">
        <span className="text-[#AEEA00] font-black text-xl tracking-tighter">JAM! Admin</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
