import type { ReactNode, CSSProperties } from 'react';

export interface BadgeGridCardProps {
  name: string;
  imageUrl?: string | null;
  /** 등급형 배지의 등급. 레벨형(v5)은 `null`이고 대신 `level`을 넘긴다. */
  rarity?: 'common' | 'rare' | 'epic' | 'mystic' | null;
  /**
   * 레벨형 배지의 Lv.N. 값이 있으면 등급 칩 대신 `BadgeLevelChip`을 그린다
   * (`rarity`와 배타 — 마이그레이션 130).
   */
  level?: number | null;
  /** 반복 획득 횟수. 2 이상일 때만 썸네일 모서리에 «×N»을 그린다. */
  count?: number | null;
  /** Link 모드 — <a href> 래핑. onClick과 상호 배타. */
  href?: string;
  /** Button 모드 — <button> 래핑. href와 상호 배타. */
  onClick?: () => void;
  /** href와 함께 쓸 때만 의미가 있는 클릭 핸들러(Link 이동 직전 부수효과용). */
  onNavigate?: () => void;
  /** false → 썸네일 흑백+반투명 (미획득 배지). 기본값 true. */
  earned?: boolean;
  /** true → ??? 표시 + 썸네일 흑백 (아이템북 미발견 배지). */
  undiscovered?: boolean;
  /** 선택 강조 링 (select 모드). */
  selected?: boolean;
  /** 컬렉션 슬롯 장착 모드에서 "지금 넣을 수 있는 칸"을 짚어주는 강조 링. */
  highlighted?: boolean;
  className?: string;
  style?: CSSProperties;
  /** 희귀도 배지 아래 추가 콘텐츠 (만료일, 슬롯 버튼 등). */
  children?: ReactNode;
}

export function BadgeGridCard(props: BadgeGridCardProps): JSX.Element;
