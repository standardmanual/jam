import type { CSSProperties } from 'react';
import type { Rarity } from '../cards/RarityBadge';

export interface BadgeStampRowProps {
  /** 계열 이름 */
  name: string;
  /** 등급. 반복형은 v5에서 등급이 있다(레벨형만 NULL) */
  rarity?: Rarity | null;
  /** 누적 횟수. `×N` 칩 하나로만 그린다 — 점 그리드는 쓰지 않는다 */
  count?: number | null;
  /** 이름 아래 한 줄 보조 문장(완성 문자열) */
  caption?: string | null;
  /** 획득 여부. false면 이름·칩·카운터에서 색을 거두고 썸네일을 그레이로 둔다 */
  earned?: boolean;
  /** 배지 이미지. 미획득이라 grayscale(1)로 그린다 */
  imageUrl?: string | null;
  /** 이미지 대체 텍스트. 생략하면 name */
  alt?: string | null;
  className?: string;
  style?: CSSProperties;
}

/** 반복형 계열 한 줄. 누적 횟수를 `×N` 칩 하나로만 표현한다. */
export function BadgeStampRow(props: BadgeStampRowProps): JSX.Element;
