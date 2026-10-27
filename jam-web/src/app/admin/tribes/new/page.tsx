import Link from 'next/link'
import TribeForm from '../TribeForm'

export default async function NewTribePage() {
  return (
    <div className="w-full p-4 md:p-8 space-y-6">
      <div className="mb-6">
        <Link href="/admin/tribes" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← 트라이브
        </Link>
        <h1 className="text-2xl font-bold mt-2">트라이브 등록</h1>
      </div>
      <TribeForm />
    </div>
  )
}
