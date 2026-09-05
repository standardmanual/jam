/**
 * 계열 상세 — 인라인 편집 · 레벨 추가 · 일괄 재계산 · 계열 키 발급
 * (티켓 20260905_0032 B-1 · B-3)
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchActivityFamilyBadges } from '@/lib/admin/badge-families-query'
import { groupBadgesIntoFamilies, proposeFamilyKey } from '@/lib/admin/badge-families'
import FamilyDetailManager from './FamilyDetailManager'

interface AdminBadgeFamilyDetailPageProps {
  params: Promise<{ familyKey: string }>
}

export default async function AdminBadgeFamilyDetailPage({ params }: AdminBadgeFamilyDetailPageProps) {
  const { familyKey } = await params
  // 계열 키에는 `:`와 한글·공백이 들어가고, 키가 없는 계열은 `#name:` 폴백을 쓴다 —
  // 링크에서 encodeURIComponent로 감싸 오므로 여기서 되돌린다.
  const key = decodeURIComponent(familyKey)

  const { badges, error } = await fetchActivityFamilyBadges()
  const family = groupBadgesIntoFamilies(badges).find((f) => f.key === key)
  if (!family) notFound()

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin/badge-families" className="text-sm text-muted-foreground underline underline-offset-4">
          ← 계열 관리
        </Link>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <h1 className="text-2xl md:text-3xl font-bold">{family.name}</h1>
          {/* 계열 단위 폐기는 일괄 작업 도구가 맡는다(티켓 20260905_0034) — 이 화면은
              «계열을 고치는» 곳이고, 폐기는 참조 정리·영향 분석이 함께 필요해 도구가 따로 있다.
              계열 키가 없는 계열(`#name:` 폴백)은 키로 대상을 좁힐 수 없어 링크를 걸지 않는다. */}
          {family.familyKey && (
            <Link
              href={`/admin/badges/bulk?family_key=${encodeURIComponent(family.familyKey)}&type=activity`}
              className="text-sm text-muted-foreground underline underline-offset-4"
            >
              이 계열 일괄 작업 →
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          배지를 불러오지 못했어요. 계열 구성이 일부만 보일 수 있어요 — {error}
        </div>
      )}

      <FamilyDetailManager family={family} proposedKey={proposeFamilyKey(family)} />
    </div>
  )
}
