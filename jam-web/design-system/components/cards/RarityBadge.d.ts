export type Rarity = 'common' | 'rare' | 'epic' | 'mystic';

export interface RarityBadgeProps {
  /**
   * 등급. `null`은 "등급이 존재하지 않음"(무한레벨형, v5 티켓 20260905_0027)을 뜻하며
   * 칩을 그리지 않는다 — `undefined`(미지정, 기본값 common으로 취급)와 의미가 다르다.
   */
  rarity?: Rarity | null;
  className?: string;
}

export function RarityBadge(props: RarityBadgeProps): JSX.Element | null;

/** 등급의 텍스트 라벨만 반환한다("Common"/"Rare"/"Epic"/"Mystic") — 렌더링 없이 값만 필요할 때 사용. */
export function getRarityLabel(rarity?: Rarity | null): string | null;
