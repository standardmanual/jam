import Link from 'next/link'
import FactionForm from '../FactionForm'

export default async function NewFactionPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/factions" className="text-white/40 hover:text-white text-sm transition-colors">
          ← 세계관 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">세계관 등록</h1>
      </div>
      <FactionForm />
    </div>
  )
}
