'use client'

import { Card } from '@ds/components/cards/Card'
import { getRarityLabel } from '@ds/components/cards/RarityBadge'
import SafeImage from '@/components/SafeImage'
import Button from '@/components/ui/Button'
import InlineNotice from '@/components/ui/InlineNotice'
import ListRowCard from '@/components/ui/ListRowCard'
import { BookIcon, CheckIcon, ChevronRightIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'
import type { TierUpCollectionOption, TierUpCollectionView } from './tierUpClient'

/**
 * 등급 올리기의 «받을 컬렉션» 행과 고르는 시트 본문 (티켓 20261023_1648 3회, 채원 사전 판정 2026-10-23) — 서비스 전용 표현 컴포넌트,
 * MODULAR 승격은 하지 않는다. Hook을 쓰지 않는 순수 표현이라 서버 렌더·요소 트리 읽기로 시험할 수 있다(`TribeStep`과 같은 방식).
 *
 * 선택 상태·시트 열림·제출은 `CombineClient`가 갖고, `TierUpPanel`은 이 컴포넌트를 슬롯 아래에 끼우기만 한다.
 * 구성은 새 부품 없이 기존 것을 조립한다: 닫힌 행은 믹스 입구와 같은 `ListRowCard`, 시트 줄은 `TribeStep`이 쓰는 단일 선택 관용구
 * (`Card` 기본형 + 고른 줄 `inverse`, `radiogroup`/`radio`), 읽기 실패는 `InlineNotice` + «다시 불러오기».
 *
 * 규칙
 * - 행은 왼쪽 정렬이다. 고를 수 없는 두 상태(재료 전, 고를 컬렉션 없음)는 정적 행이고 `>`를 빼며, 이유는 값 자리에 foreground 글자로 쓴다
 *   (흐리게 하지 않는다).
 * - 컬렉션 이미지는 어드민 자유 입력이라 `SafeImage`로 그린다. 없거나 깨지면 `BookIcon`이다. 이미지 타일은 밝은 면을 깔아 어두운 고른 줄 위에서도
 *   투명 PNG가 보이게 한다.
 * - 진행 수·진행 막대·추천 표시와 확률 숫자는 쓰지 않는다. 선택 표시는 색만으로 하지 않는다(어두운 면 + `CheckIcon`).
 */

/** 한국어 줄바꿈(UX 라이팅 §3.2) — 띄어쓰기 단위로만 끊고 긴 한 단어만 칸 밖으로 넘치지 않게 끊는다 */
const KO_BREAK = 'break-keep wrap-break-word text-pretty'

const copy = d.combine.tierUp.collectionPicker

/** 컬렉션 이미지 타일 — 이미지가 없거나 깨지면 책 아이콘. `size`는 한 변(px)이다 */
function CollectionTile({ imageUrl, size }: { imageUrl: string | null; size: 40 | 48 }) {
  const box = size === 40 ? 'w-10 h-10' : 'w-12 h-12'
  return (
    <div className={`${box} shrink-0 rounded-2xl bg-background-secondary flex items-center justify-center overflow-hidden`}>
      <SafeImage
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        className="object-contain w-full h-full"
        fallback={<BookIcon className="w-5 h-5 text-muted" />}
      />
    </div>
  )
}

interface RowProps {
  view: TierUpCollectionView
  /** 제출 중이면 행을 잠근다(눌림·포커스 없음) */
  submitting: boolean
  onOpen: () => void
  /** 읽기 실패 안내의 «다시 불러오기» — 호출부가 서버 값을 다시 읽는다 */
  onRetry: () => void
}

/**
 * 받을 컬렉션 행 — 갈래마다 한 장이다. 고를 수 있을 때만 버튼(`>`)이고 나머지는 정적 행이며, 읽기 실패는 행 대신 안내 블록이다.
 * 5개 모인 등급이 없어 «5개 모여야 올릴 수 있어요»가 뜨는 때는 호출부가 이 블록 전체를 그리지 않는다.
 */
export function TierUpCollectionRow({ view, submitting, onOpen, onRetry }: RowProps) {
  if (view.kind === 'error') {
    return (
      <InlineNotice
        action={
          <Button variant="outline" onClick={onRetry} className={`self-start whitespace-nowrap ${KO_BREAK}`}>
            {copy.retry}
          </Button>
        }
      >
        {copy.loadFailed}
      </InlineNotice>
    )
  }

  const picked = view.kind === 'ready' ? view.choices.find((choice) => choice.id === view.selectedId) : undefined
  const value =
    view.kind === 'needMaterial'
      ? copy.needMaterial
      : view.kind === 'none'
        ? t(copy.none, { rarity: getRarityLabel(view.rarity) ?? '' })
        : (picked?.name ?? copy.unselected)
  const selectable = view.kind === 'ready'

  return (
    <ListRowCard
      icon={<CollectionTile imageUrl={picked?.imageUrl ?? null} size={40} />}
      onClick={selectable ? onOpen : undefined}
      disabled={submitting}
      trailing={selectable ? <ChevronRightIcon className="w-4 h-4 text-[var(--muted)]" /> : undefined}
    >
      <p className={`m-0 text-sm text-muted ${KO_BREAK}`}>{copy.label}</p>
      <p className={`m-0 text-base text-foreground line-clamp-2 ${KO_BREAK}`}>{value}</p>
    </ListRowCard>
  )
}

interface SheetContentProps {
  choices: readonly TierUpCollectionOption[]
  selectedId: string | null
  onPick: (collectionId: string) => void
}

/**
 * 컬렉션 시트 본문 — 안내 한 줄과 한 줄에 컬렉션 하나씩 세로 1열(2열은 360px에서 이름이 3줄로 접힌다). 줄을 누르면 호출부가 고르고 시트를 닫는다.
 * 확인·취소 버튼은 없다: 화면의 «등급 올리기»가 확정이다. 시트 틀(`BottomSheet`)은 `TierUpPanel`이 그린다.
 */
export function TierUpCollectionSheetContent({ choices, selectedId, onPick }: SheetContentProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className={`m-0 text-sm text-foreground ${KO_BREAK}`}>{copy.sheetNote}</p>
      <div role="radiogroup" aria-label={copy.sheetTitle} className="flex flex-col gap-2">
        {choices.map((choice) => {
          const selected = choice.id === selectedId
          return (
            <Card
              key={choice.id}
              tone={selected ? 'inverse' : 'default'}
              role="radio"
              aria-checked={selected}
              onClick={() => onPick(choice.id)}
              className="flex items-center gap-2 text-left transition-colors duration-[var(--duration-micro)]"
              style={{ padding: 'var(--spacing-16)' }}
            >
              <CollectionTile imageUrl={choice.imageUrl} size={48} />
              <span className={`block min-w-0 flex-1 text-base font-bold line-clamp-2 ${KO_BREAK}`}>{choice.name}</span>
              {selected && <CheckIcon className="w-5 h-5 shrink-0 text-snow" />}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
