export type Rarity = 'common' | 'rare' | 'epic' | 'mystic';

export interface RarityBadgeProps {
  /**
   * 등급. `null`은 "등급이 존재하지 않음"(무한레벨형, v5 티켓 20260905_0027)을 뜻하며
   * 칩을 그리지 않는다 — `undefined`(미지정, 기본값 common으로 취급)와 의미가 다르다.
   *
   * 타입 밖의 값(오타·잘못된 캐스팅)은 **Common으로 폴백하지 않고** 아무것도 그리지
   * 않으며 개발 빌드에서 `console.warn`을 남긴다 (티켓 20260905_0036).
   */
  rarity?: Rarity | null;
  className?: string;
}

export function RarityBadge(props: RarityBadgeProps): JSX.Element | null;

/**
 * 등급의 텍스트 라벨만 반환한다("Common"/"Rare"/"Epic"/"Mystic") — 렌더링 없이 값만 필요할 때 사용.
 * 등급 없음(null)과 미지 값은 둘 다 `null`을 돌려준다(후자는 개발 빌드에서 경고).
 */
export function getRarityLabel(rarity?: Rarity | null): string | null;
