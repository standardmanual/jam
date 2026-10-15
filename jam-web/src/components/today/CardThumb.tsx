import SafeImage from '@/components/SafeImage'
import { resourceIconOf, type ResourceIconView } from './resourceIcon'

/**
 * 64px 칸 공용 (티켓 20261001_2104, 상위 20260930_1453 조각 b5). `BriefCard`의 `BriefSlot`을 그대로 옮겼고 `BriefCard`와 `ListCard` 타일이 쓴다
 * (둘째 소비자가 생기는 b5에서 공용으로 뺀다는 b2 메모).
 *
 * 그림(`src`)이 있으면 그리고, 없거나 로드에 실패하면 같은 칸에 자원 아이콘을 그려 높이가 변하지 않는다. 카드의 자원 아이콘을 쓰는 이유는
 * 같은 카드가 모양만 바꿔도 같은 아이콘이어야 하기 때문이다(`resourceIcon.ts` 한 곳에서 고른다).
 *
 * `alt`가 비어 있는 이유: 이름이 바로 옆·아래 글자로 보인다(확정 설계 3절의 alt 규칙).
 * 흑백(`dimmed`)은 그림에만 건다 — 색 외에 글자 단서가 없는 기존 규칙이다(티켓 20260905_0038 B). 값이 없으면(유저 정보가 없는 미리보기) 컬러다.
 * 칸 바탕 `bg-black/[0.04]`는 흰 카드 위 옅은 면이다(보더 미사용 원칙, 티켓 20260816_012).
 */
export default function CardThumb({ view, src, dimmed = false }: { view: ResourceIconView; src?: string | null; dimmed?: boolean }) {
  const icon = resourceIconOf(view, { className: 'w-6 h-6 text-snow/60' })
  return (
    <div className="w-16 h-16 shrink-0 rounded-2xl bg-black/[0.04] overflow-hidden flex items-center justify-center">
      {src ? (
        <SafeImage
          src={src}
          alt=""
          width={64}
          height={64}
          className={dimmed ? 'w-full h-full object-cover grayscale' : 'w-full h-full object-cover'}
          fallback={icon}
        />
      ) : (
        icon
      )}
    </div>
  )
}
