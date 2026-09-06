import type { CSSProperties, ReactNode } from 'react';
import type { Rarity } from '../cards/RarityBadge';

export interface BadgeStampRowProps {
  /** 계열 이름 */
  name: string;
  /**
   * 등급. 반복형은 v5에서 등급이 있다(레벨형만 NULL). 헤더 우측 진행률 옆에 `Epic`
   * **텍스트**로 그린다(칩이 아니다 — 티켓 20260906_2140). `null`이면 라벨 없음.
   */
  rarity?: Rarity | null;
  /** 누적 횟수. `×N` 칩 하나로만 그린다 — 점 그리드는 쓰지 않는다 */
  count?: number | null;
  /** 이름 아래 한 줄 보조 문장(완성 문자열) */
  caption?: string | null;
  /**
   * 다음 회차까지의 0~1 진행률. `null`이면 진행 바를 그리지 않는다 — 계산할 수 없는 계열에
   * 0%짜리 빈 막대를 그리면 「아직 아무것도 안 했다」는 틀린 사실이 된다.
   */
  fraction?: number | null;
  /** 헤더 2행(메타 줄). `null`이면 그리지 않는다 */
  metaText?: ReactNode;
  /** 획득 여부. false면 카운터에서 색을 거두고 썸네일을 그레이로 둔다 */
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
