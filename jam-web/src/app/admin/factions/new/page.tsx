import Link from 'next/link'
import FactionForm from '../FactionForm'

export default async function NewFactionPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/factions" className="text-[#6b7280] hover:text-[#111111] text-sm transition-colors">
          ← 세계관 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">세계관 등록</h1>
      </div>
      <FactionForm />
    </div>
  )
}
