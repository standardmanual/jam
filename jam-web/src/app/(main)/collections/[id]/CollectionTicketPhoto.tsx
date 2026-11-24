import SafeImage from '@/components/SafeImage'
import { MagicBookIcon } from '@/components/ui/icons'
import { TicketTone } from '../../badges/[id]/BadgeTicket'

/**
 * 컬렉션 상세 티켓의 사진 자리 (티켓 20261124_2253, 서비스 전용).
 * 표지(정사각형 1024 원본)를 모서리 16px 1:1 칸에 그대로 채운다. 오라·블롭·실루엣·그림자는 올리지 않는다.
 * 표지가 없거나 불러오지 못하면 `--card-bg`(티켓색 섞은 연한 면) 1:1 칸에 `MagicBookIcon`을 둔다 — 카드 위 글자라 항상 #171717 계열이다.
 * 바깥 여백은 배지 상세 사진 자리(`TicketPhoto`)와 같다(좌우 16px, 아래 20px).
 */
export default function CollectionTicketPhoto({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  const placeholder = (
    <TicketTone tone="ink" className="flex h-full w-full items-center justify-center bg-card-bg">
      <MagicBookIcon className="h-28 w-28" style={{ color: 'var(--muted)' }} />
    </TicketTone>
  )

  return (
    <div className="relative z-10 px-4 pb-5">
      <div className="aspect-square overflow-hidden rounded-2xl">
        {imageUrl ? (
          <SafeImage
            src={imageUrl}
            alt={name}
            width={358}
            height={358}
            sizes="(min-width: 430px) 334px, calc(100vw - 64px)"
            eager
            className="h-full w-full object-cover"
            fallback={placeholder}
          />
        ) : (
          placeholder
        )}
      </div>
    </div>
  )
}
