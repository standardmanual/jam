import type { CSSProperties } from 'react';
import type { Rarity } from '../cards/RarityBadge';

/** 캐러셀 카드 1장이 그리는 배지 데이터 */
export interface BadgeRevealItem {
  id: string;
  name: string;
  description: string;
  /** 빈 문자열·null이면 실루엣 폴백 아이콘을 그린다 */
  imageUrl?: string | null;
  /**
   * `null`은 "등급이 존재하지 않음"(무한레벨형)이라 등급 칩도 등급 낭독도 하지 않는다.
   * `undefined`(미지정)는 기존대로 common으로 취급한다.
   */
  rarity?: Rarity | null;
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
   * 노출할 배지 목록(획득 순서 그대로) — **서버가 상한(10장)까지 잘라 내려준다**.
   * 호출부는 받은 배열을 그대로 넘기고, 잘려나간 잔여 개수를 moreCount로 넘긴다.
   * (상한 상수는 서버 `src/lib/strava/sync.ts`의 EARNED_BADGE_DETAIL_LIMIT 한 곳에만 있다)
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
  /**
   * dialog·carousel aria-label.
   * 중앙 카드의 등급·이름·설명은 오버레이 안 라이브 리전이 따로 읽는다 —
   * "열렸다 + 몇 개 획득" 안내는 호출부가 별도 라이브 리전으로 처리한다.
   */
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

export function BadgeRevealCarousel(props: BadgeRevealCarouselProps): JSX.Element | null;
