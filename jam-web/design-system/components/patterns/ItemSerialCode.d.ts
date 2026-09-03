import type { CSSProperties } from 'react';

export interface ItemSerialCodeProps {
  /** 배지 일련번호 원문. 앞 4자(알파벳 prefix)는 카드 1장씩, 나머지(숫자)는 하나의 박스로
   * 렌더링한다. 예: "ABCD000042" (4자리 대문자 + 6자리 zero-pad 숫자). */
  code: string;
  /** 알파벳 카드 1장의 높이(px). 다른 모든 치수(폭·코너·폰트 크기·간격)는 이 값에서
   * 비례 계산된다. 기본 160. */
  height?: number;
  className?: string;
  style?: CSSProperties;
}

export function ItemSerialCode(props: ItemSerialCodeProps): JSX.Element;
