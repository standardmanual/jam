import type { CSSProperties } from 'react';
import type { Rarity } from '../cards/RarityBadge';

/** 캐러셀 카드 1장이 그리는 배지 데이터 */
export interface BadgeRevealItem {
  id: string;
  name: string;
  description: string;
  /** 빈 문자열·null이면 실루엣 폴백 아이콘을 그린다 */
  imageUrl?: string | null;
  rarity?: Rarity;
}

export interface BadgeRevealCarouselProps {
  /**
   * 오버레이 표시 여부.
   * 배지 드랍 엔진의 최종 결과가 나온 뒤에만 true로 올린다 — 열리면 곧바로 실제 배지 카드다.
   * 결과를 기다리는 동안의 대기 표현은 호출부 버튼의 loading 스피너가 담당한다.
   * false → true로 바뀔 때마다 중앙 카드는 항상 첫 배지(0번)로 돌아온다 — 직전 노출에서
   * 스와이프한 위치가 남지 않는다.
   */
  open: boolean;
  /**
   * 노출할 배지 목록(획득 순서 그대로).
   * 10장을 넘기면 호출부에서 10장으로 자르고 나머지 개수를 moreCount로 넘긴다.
   */
  items?: BadgeRevealItem[];
  /** 마지막 "전체 보기" 카드에 표시할 잔여 개수. 0이면 카드 미표시 */
  moreCount?: number;
  /** "전체 보기" CTA 클릭 — 이동 경로는 호출부 책임 */
  onMoreClick?: () => void;
  /** 닫기 버튼·Escape */
  onClose?: () => void;
  /** 중앙 카드 폭(px). 기본 344 = 서비스 컬럼 430px의 80% */
  cardWidth?: number;
  /** 카드 높이(px). 생략 시 cardWidth × 1.34 */
  cardHeight?: number;
  /** 닫기 버튼 aria-label */
  closeLabel?: string;
  /** "전체 보기" CTA 라벨 */
  moreLabel?: string;
  /**
   * "전체 보기" 카드 본문 문구. 문자열이면 그대로, 함수면 잔여 개수를 받아 문자열을 만든다.
   * 기본값 `(n) => \`배지 ${n}개를 더 획득했어요\``.
   * 서비스는 i18n 사전(`d`)에서 주입해 쓴다.
   */
  moreMessage?: string | ((count: number) => string);
  /** dialog·carousel aria-label */
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

export function BadgeRevealCarousel(props: BadgeRevealCarouselProps): JSX.Element | null;
