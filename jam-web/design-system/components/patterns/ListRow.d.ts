import type { CSSProperties, HTMLAttributes, MouseEvent, ReactNode } from 'react';

export interface ListRowProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title' | 'onClick' | 'children' | 'className' | 'style'> {
  /**
   * `default`는 세로 중앙 정렬, `media`는 상단 정렬이고 `footer` 슬롯을 쓸 수 있다(미션 목록처럼 칩·조건이 붙는 행).
   */
  variant?: 'default' | 'media';
  /**
   * 행 면. `default`는 흰 면 + 1px `--border`(크림 바탕 위), `tint`는 `--background-secondary` 테두리 없음
   * (이미 카드 안에 들어간 행 전용 — 크림 바탕 위 단독 행에 쓰지 않는다), `inverse`는 `--background-inverse` + `--snow`
   * (경고 안내 행 전용), `flat`은 면 없음(세로 12 가로 0).
   */
  tone?: 'default' | 'tint' | 'inverse' | 'flat';
  /** `tone="flat"`일 때만 아래 1px `--separator` 구분선을 그린다. */
  separator?: boolean;
  /** 24px 상태 표지 슬롯(체크 아이콘·순위 숫자). lead보다 왼쪽. */
  indicator?: ReactNode;
  /**
   * 이미지·아이콘. 박스 크기는 CSS 변수 `--list-row-lead-size-proto`(48px) 하나로 정해지고 prop은 없다.
   * 이미지는 `alt=""`(장식)로 넘기면 박스에 cover로 채워진다. 폴백 아이콘 색은 `--muted`.
   */
  lead?: ReactNode;
  /** `tile`(기본, `--radius-2xl`)은 배지·아이템·컬렉션·이벤트·미션·장소, `round`는 사람(아바타)·포인트 코인. */
  leadShape?: 'tile' | 'round';
  /** lead 우하단에 붙는 ×N·개수 칸. 검정(`--foreground`) 배경 + 흰(`--snow`) 글자 + 행 면 색 1px 테두리. */
  leadBadge?: ReactNode;
  /** 있으면 lead(와 indicator)가 클릭 영역 밖의 별도 링크가 된다(알림 아바타의 2단 링크). 행 `href`와 함께 쓴다. */
  leadHref?: string;
  /**
   * `leadHref` lead 링크의 접근 가능한 이름(`aria-label`로 연결). 링크 안은 이미지·아이콘뿐이라 이 값이 없으면
   * 스크린리더가 «링크, 이름 없음»으로 읽는다. `leadHref`를 주면 반드시 함께 준다(개발 모드에서 없으면 콘솔 경고).
   */
  leadLabel?: string;
  /** 문자열(12px muted, 최대 2줄) 또는 칩 줄(노드). */
  eyebrow?: ReactNode;
  /** eyebrow 줄 오른쪽(12px muted, 줄지 않음). eyebrow가 없으면 title 줄 오른쪽. */
  time?: ReactNode;
  /** 16px 제목. 굵기·색은 `titleVariant`가 정한다. */
  title?: ReactNode;
  /** title 줄 오른쪽에 붙는 줄어들지 않는 인라인 노드(순위 행의 «나» 칩 등). title이 말줄임될 때 suffix는 남고 title만 줄어든다. */
  titleSuffix?: ReactNode;
  /** `strong`(기본, 굵게) · `sentence`(보통, 문장 — 핵심어는 `ListRowEm`) · `label`(보통 muted, 값 행·체크 목록). */
  titleVariant?: 'strong' | 'sentence' | 'label';
  /** title 줄 수 1~2. 기본은 `sentence` 2줄, 나머지 1줄. 넘치면 말줄임. */
  titleLines?: 1 | 2;
  /** 14px muted 보조 줄. */
  meta?: ReactNode;
  /** meta 줄 수 1~3(기본 1). 넘치면 말줄임. */
  metaLines?: 1 | 2 | 3;
  /** 칩 줄(12px 칩, 줄바꿈 허용, 간격 4). `ListRowChip`·`RarityBadge`·`BadgeLevelChip` 등. 3개 이하를 기본으로 둔다. */
  chips?: ReactNode;
  /** `variant="media"` 전용 자유 영역. 클릭 영역 안이므로 phrasing 요소만 넣고 인터랙티브 요소는 넣지 않는다. */
  footer?: ReactNode;
  /** 오른쪽 텍스트 값(16px 굵게, 줄지 않음, 세로 중앙). `titleVariant="label"` 행에서는 줄바꿈되고 오른쪽 정렬. */
  value?: ReactNode;
  /** 행 안쪽 오른쪽에 쉐브론을 그린다. `aria-expanded`가 함께 있으면 아래 향 쉐브론이 펼침에서 180도 돈다. */
  chevron?: boolean;
  /** 클릭 영역 바깥 오른쪽 슬롯(팔로우 버튼 등). 안에 버튼을 넣어도 마크업이 유효하다. 바로 아래 자식 버튼·링크는 터치 영역이 44px 이상으로 늘어난다. 행이 `disabled`면 `inert`가 걸려 키보드로도 눌리지 않는다. */
  trail?: ReactNode;
  /**
   * 선택됨. 안쪽 2px 링 + 쉐브론 자리 체크 아이콘으로 그린다.
   * `onClick` 버튼이면 `aria-pressed`가 붙고, 라디오로 쓰면 호출부가 `role`과 `aria-checked`를 넘긴다.
   */
  selected?: boolean;
  /** 비활성 — opacity 0.4, 클릭 차단, 눌림 없음. */
  disabled?: boolean;
  /** Link 모드(`<a>`). `onClick`과 함께 쓰면 링크에 클릭 핸들러도 붙는다. */
  href?: string;
  /** Button 모드(`<button type="button">`). */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /** 행 바깥 면에 붙는다. `role`·`aria-*`·`data-*`는 클릭 영역으로 간다. */
  className?: string;
  /** 행 바깥 면에 붙는다. `--list-row-*-proto` 변수를 덮어쓸 수 있다(스토리의 lead 40/48 비교). */
  style?: CSSProperties;
}

/** 슬롯 구성으로 활동·대상·사람·값·체크 목록 계열을 한 골격에서 만드는 목록 행. 자유 `children` 없음. */
export function ListRow(props: ListRowProps): JSX.Element;

export interface ListRowEmProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** 문장형 title 안의 핵심어를 굵게(`<strong>`). */
export function ListRowEm(props: ListRowEmProps): JSX.Element;

export interface ListRowChipProps {
  /** 면 채움. `neutral`(기본 `--default-soft`) · `accent`(`--accent-soft`) · `warning`(`--warning`). 글자는 항상 `--foreground`. */
  tone?: 'neutral' | 'accent' | 'warning';
  /** `null`/`undefined`/`''`이면 아무것도 그리지 않는다. */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** 행 안 12px 칩 한 크기 — 상태·만료·마지막 파편 칩을 대신한다. */
export function ListRowChip(props: ListRowChipProps): JSX.Element | null;

export interface ListRowSkeletonProps {
  tone?: 'default' | 'tint' | 'flat';
  separator?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** 로딩 자리 — lead 48 + 세 줄. 실제 행과 치수가 같아 레이아웃이 밀리지 않는다. */
export function ListRowSkeleton(props: ListRowSkeletonProps): JSX.Element;
