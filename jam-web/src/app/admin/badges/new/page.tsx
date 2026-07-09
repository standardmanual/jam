import Link from 'next/link'
import BadgeForm from '../BadgeForm'

export default function NewBadgePage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/admin/badges" className="text-white/40 hover:text-white text-sm transition-colors">
          ← 배지 목록
        </Link>
        <h1 className="text-2xl font-bold mt-2">배지 등록</h1>
      </div>
      <BadgeForm />
    </div>
  )
}
