/**
 * 배지·컬렉션·미션 미리보기 (티켓 20261007_1400, 상위 20261006_1805 ⑤-a).
 *
 * 배지·컬렉션은 서비스 그리드 카드를 `href` 없이 그대로 쓰고, 미션은 서비스 목록 카드(`MissionsListClient`)와 같은 모양
 * (썸네일·제목·설명 2줄·보상 줄)으로 그린다. 카드 아래 한 줄 요약에 설명·조건·기간을 덧붙인다. 항목 안의 값만 쓰고 링크·계측이 없다.
 * 인라인 `style`은 쓰지 않는다(`no-html.test.ts`가 파일 수를 고정한다).
 */
import SafeImage from '@/components/SafeImage'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import CollectionGridCard from '@/components/ui/CollectionGridCard'
import { PackageIcon } from '@/components/ui/icons'
import { formatKstDay } from '@/lib/admin/opsInbox/labels'
import type { KindPreview } from '@/lib/admin/opsInbox/cardPreview'

function periodText(startsAt: string | null, endsAt: string | null): string {
  const start = formatKstDay(startsAt)
  const end = formatKstDay(endsAt)
  if (start && end) return `${start} ~ ${end}`
  if (start) return `${start}부터`
  if (end) return `${end}까지`
  return ''
}

function Summary({ lines }: { lines: string[] }) {
  const shown = lines.filter((line) => line !== '')
  if (shown.length === 0) return null
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground">
      {shown.map((line, i) => (
        <li key={i} className="whitespace-pre-line">
          {line}
        </li>
      ))}
    </ul>
  )
}

export function OpsKindPreview({ preview }: { preview: KindPreview }) {
  if (preview.type === 'badge') {
    const reward = preview.pointReward ? `보상 ${preview.pointReward.toLocaleString('ko-KR')} 포인트` : ''
    return (
      <div className="space-y-2">
        <div className="w-32">
          <BadgeGridCard name={preview.name} imageUrl={preview.imageUrl} rarity={preview.rarity} level={preview.level} earned />
        </div>
        <Summary lines={[preview.description, reward, periodText(preview.startsAt, preview.endsAt)]} />
      </div>
    )
  }

  if (preview.type === 'collection') {
    const reward = preview.rewardPoints ? `보상 ${preview.rewardPoints.toLocaleString('ko-KR')} 포인트` : ''
    return (
      <div className="space-y-2">
        <div className="w-32">
          <CollectionGridCard name={preview.name} imageUrl={preview.imageUrl} collected={0} total={0} />
        </div>
        <Summary lines={[preview.description, preview.storyText, reward, periodText(preview.startsAt, preview.endsAt)]} />
      </div>
    )
  }

  const reward = preview.rewardPoints ? `${preview.rewardPoints.toLocaleString('ko-KR')} 포인트` : '없음'
  return (
    <div className="space-y-2">
      <div className="flex flex-row items-start gap-4 py-3">
        <div className="flex size-[90px] min-w-[90px] items-center justify-center overflow-hidden rounded-lg bg-surface">
          <SafeImage
            src={preview.imageUrl}
            alt={preview.title}
            width={90}
            height={90}
            className="h-full w-full object-contain"
            fallback={<PackageIcon className="h-8 w-8 text-text/30" />}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h3 className="m-0 text-base font-bold leading-tight">{preview.title}</h3>
          {preview.description && <p className="m-0 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{preview.description}</p>}
          <span className="text-xs">{reward}</span>
        </div>
      </div>
      <Summary lines={[preview.conditionText ? `조건: ${preview.conditionText}` : '', periodText(preview.startsAt, preview.endsAt)]} />
    </div>
  )
}
