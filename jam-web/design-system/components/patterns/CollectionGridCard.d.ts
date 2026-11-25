import type { ReactNode, CSSProperties } from 'react';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'mystic';

export interface CollectionGridCardProps {
  name: string;
  imageUrl?: string | null;
  /** 수집한 슬롯 수. */
  collected: number;
  /** 전체 슬롯 수. */
  total: number;
  /** true → 카드 면이 검정(--accent)이 되고, 진행 바·숫자 자리(맨 아래 한 행)에 등급 칩(`rarities`)을 둔다. */
  completed?: boolean;
  /** 완성 카드의 맨 아래 행에 칩으로 그릴 등급들(낮은 등급부터). Common은 칩이 없어 그리지 않는다. 완성하지 않은 카드는 그리지 않는다(티켓 20261125_1113). */
  rarities?: BadgeRarity[];
  /** true → 맨 아래 행의 진행 바와 «수집/전체» 숫자를 그리지 않는다. 전체 슬롯 수를 아직 모르는 운영툴 미리보기용이며 기본은 false다. 단 completed이면 등급 칩 행은 그대로 둔다. */
  hideProgress?: boolean;
  /** Link 모드 — <a href> 래핑. onClick과 상호 배타. */
  href?: string;
  /** Button 모드 — <button> 래핑. href와 상호 배타. */
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function CollectionGridCard(props: CollectionGridCardProps): JSX.Element;
