import type { CSSProperties, HTMLAttributes, MouseEvent, ReactNode } from 'react';

export interface ListCardProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title' | 'onClick' | 'children' | 'className' | 'style'> {
  /** 이미지 주소. 없거나 불러오지 못하면 `--background-secondary` 자리표시 면 위에 제목만 나온다. */
  imageUrl?: string;
  /** 이미지 대체 글. 기본 `""`(장식) — 제목 글자가 카드 안에 있으므로 보통 비워 둔다. */
  imageAlt?: string;
  /** `object-position` 값. 기본 `'50% 50%'`(가운데). 가로로 자르는 비율이라 폭에 따라 보이는 구간이 달라진다. */
  imagePosition?: string;
  /** 이미지에만 거는 불투명도(0~1). 글자는 딤을 받지 않는다. 1 미만이면 제목이 `--foreground`로 바뀐다. */
  imageDim?: number;
  /** 이미지에만 거는 흑백(`grayscale(1)`). 켜면 제목이 `--foreground`로 바뀐다. */
  grayscale?: boolean;
  /** 이미지 칸 가운데에 얹는 노드(잠금 아이콘 자리). 글자색은 `--foreground`. */
  imageOverlay?: ReactNode;
  /** 이미지 칸 왼쪽 아래에 얹는 20px 굵은 제목(최대 2줄 말줄임). 이미지 위에서는 `--snow`, 어두운 막은 없다. */
  title?: ReactNode;
  /** 칩 줄 왼쪽. `ListRowChip` 등을 최대 3개 넘긴다. 넘치면 아래 줄로 내려간다. */
  chips?: ReactNode;
  /** 칩 줄 오른쪽 끝(14px 굵게, 줄지 않음, 위쪽 정렬). 보통 `PointText`. */
  value?: ReactNode;
  /** 14px `--muted` 설명(최대 2줄 말줄임). */
  description?: ReactNode;
  /** 설명 아래 줄. 클릭 영역 안이므로 phrasing 요소만 넣고 인터랙티브 요소는 넣지 않는다. */
  footer?: ReactNode;
  /** 비활성 — opacity `--opacity-disabled`, 클릭 차단. 눌러서 안내하는 카드는 `disabled` 대신 `aria-disabled="true"`와 `onClick`을 쓴다. */
  disabled?: boolean;
  /** Link 모드(`<a>`). `onClick`과 함께 쓰면 링크에 클릭 핸들러도 붙는다. */
  href?: string;
  /** Button 모드(`<button type="button">`). */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /** 카드 바깥 면에 붙는다. `role`·`aria-*`·`data-*`는 클릭 영역으로 간다. */
  className?: string;
  /** 카드 바깥 면에 붙는다. */
  style?: CSSProperties;
}

/** 큰 이미지 위에 제목을 얹는 세로 목록 카드. 자유 `children` 없음. */
export function ListCard(props: ListCardProps): JSX.Element;

/** 카드가 문서에 한 번 넣는 스타일 블록의 내용(눌림·포커스·reduced-motion). */
export const LIST_CARD_STATIC_CSS: string;
