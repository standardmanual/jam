import type { CSSProperties } from 'react';

export interface ItemSerialCodeProps {
  /** 배지 일련번호 원문. 앞 4자(알파벳 prefix)는 카드 1장씩, 나머지(숫자)는 하나의 박스로
   * 렌더링한다. 예: "ABCD000042" (4자리 대문자 + 6자리 zero-pad 숫자). */
  code: string;
  /** 알파벳 카드 1장의 높이(px). 다른 모든 치수(폭·코너·폰트 크기·간격)는 이 값에서
   * 비례 계산된다. 기본 160. */
  height?: number;
  /** 숫자 자리의 슬롯머신 릴 연출 사용 여부. 기본 true(기존 동작 유지).
   * false면 릴 없이 최종 값을 즉시 정적으로 그린다 — 이미 가진 여러 개체의 번호를 비교해
   * 고르는 화면(컬렉션 장착 개체 선택 시트)용. 렌더 결과는 prefers-reduced-motion과 같다. */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ItemSerialCode(props: ItemSerialCodeProps): JSX.Element;
