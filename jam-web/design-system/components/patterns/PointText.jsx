import React from 'react';

/**
 * PointText — 포인트 «값 + 단위» 표기. 티켓 20261104_2319(1회차).
 *
 * 규칙(UX Writing 가이드 §1.3 «포인트» 행): 포인트 값(숫자)과 «포인트» 글자는 모두 `--point-text`
 * 오렌지로 그린다. 색은 이 컴포넌트 한 곳에서만 정한다 — 호출부는 색을 못 바꾼다(`className`은 글자
 * 크기·굵기용). 서비스 쪽에 같은 컴포넌트의 사본을 만들지 않고 이 파일을 그대로 import한다.
 *
 * layout:
 *   stacked — 우측 보상 칸. 굵은 숫자(16px) 위, 작은 «포인트»(12px) 아래, 가운데 정렬.
 *   inline  — 문장 속. «값 포인트» 한 덩어리를 줄바꿈 없이(nowrap) 칠한다. 앞뒤 조사는 호출부가 밖에 둔다.
 *
 * 값이 null/undefined면 아무것도 그리지 않는다. 0은 그린다(숨길지는 호출부가 정한다).
 * `unit=""`(빈 문자열)이면 값만 그린다 — 라벨이 «포인트»를 이미 말하는 행(필요 포인트·가진 포인트 등)과
 * 단위를 따로 두는 큰 잔액용이다(티켓 20261104_2319 3회차). 값 뒤 공백도 붙이지 않는다.
 * 숫자는 문자열(이미 포맷된 값)이면 그대로, 숫자면 `toLocaleString('ko-KR')` 한 곳에서 포맷한다.
 * 색만으로 «포인트임»을 알리지 않는다 — 숫자 옆에 항상 «포인트» 글자가 붙는다.
 * 버튼 안 포인트는 칠하지 않는다(호출부가 이 컴포넌트를 쓰지 않고 버튼 글자색을 따른다).
 *
 * 색은 인라인 `color: var(--point-text)`가 정하고, `text-point-text` 클래스(서비스 Tailwind 매핑,
 * globals.css)는 같은 토큰을 가리켜 서비스 쪽 검사·선택자가 클래스로 닿게 하는 표지다.
 *
 * 글자 대비 한계: --point-text(#ff4400)는 흰 면 3.45:1·크림 면 약 3.1:1이라 12~16px 글자는 4.5:1에 못 미친다.
 */
const COLOR = 'var(--point-text)';

function formatValue(value) {
  return typeof value === 'number' ? value.toLocaleString('ko-KR') : String(value);
}

export function PointText({ value, unit = '포인트', layout = 'inline', className = '', style = {}, ...rest }) {
  if (value == null) return null;
  const text = formatValue(value);

  if (layout === 'stacked') {
    return (
      <span
        className={className}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', ...style }}
        {...rest}
      >
        <span
          className="text-point-text"
          style={{ fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)', fontWeight: 700, color: COLOR }}
        >
          {text}
        </span>
        {unit !== '' && (
          <span
            className="text-point-text"
            style={{ fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)', color: COLOR }}
          >
            {unit}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={`text-point-text ${className}`.trim()} style={{ whiteSpace: 'nowrap', color: COLOR, ...style }} {...rest}>
      {unit === '' ? text : `${text} ${unit}`}
    </span>
  );
}
