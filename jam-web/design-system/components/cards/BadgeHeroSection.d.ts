import type { CSSProperties, ReactNode } from 'react';
import type { Rarity } from './RarityBadge';

export interface BadgeHeroSectionProps {
  /** 배지 이름 — `titleNode`가 없을 때 h1 안에 그린다 */
  name: string;
  /** 등급. `level`이 없을 때만 `RarityBadge`(md)로 그린다. null/undefined면 칩을 그리지 않는다 */
  rarity?: Rarity | null;
  /** 레벨. 있으면 등급 칩 대신 `BadgeLevelChip`(md, Lv.N)을 그린다 */
  level?: number | null;
  /** 설명 문장들 — 문장마다 `<p>` 하나. 문장 나누기는 호출부 몫이다. 없고 `descriptionNode`도 없으면 설명 블록을 그리지 않는다 */
  descriptionLines?: string[];
  /** 설명 문단 하나의 내용을 호출부가 정한다(예: 잠긴 개체의 SwapText). 있으면 `descriptionLines`보다 우선한다 */
  descriptionNode?: ReactNode;
  /** h1 안의 내용을 바꾼다. 없으면 `name` */
  titleNode?: ReactNode;
  /** 등급·레벨 칩 옆에 더하는 칩(예: «잠김») */
  chipExtra?: ReactNode;
  /** 대표 이미지 자리 — 필수. 크기 규칙(page 200 / sheet 176)은 슬롯 안에서 호출부가 정한다 */
  imageSlot: ReactNode;
  /** 카드 안 최하단(z-0)에 깔리는 배경. 카드 안에 갇히고 라운드로 잘린다. 없으면 아무것도 그리지 않는다 */
  backgroundSlot?: ReactNode;
  /** 첫 페인트 폴백 배경색(인라인). 있을 때만 깐다 */
  backgroundColor?: string;
  /** 카드 면이 투명해지고 제목 · 설명이 모두 `text-snow`가 된다. 어두운 면 위 전용. 기본 false */
  onMedia?: boolean;
  /** 글자 블록(칩 · 이름 · 설명)에 거는 style. 배경 위 텍스트 그림자 보정은 호출부가 넘긴다 */
  textStyle?: CSSProperties;
  /** 놓이는 자리. `page`(기본) = 배지 상세 페이지, `sheet` = 바텀시트 안 */
  size?: 'page' | 'sheet';
}

/**
 * 배지 한 장의 대표 카드 — 이미지 · 등급/레벨 칩 · 이름 · 설명을 가운데 정렬로 쌓은 흰 카드 한 장.
 * 서비스 도메인 지식은 모두 슬롯과 값으로 받는다.
 */
export function BadgeHeroSection(props: BadgeHeroSectionProps): JSX.Element;
