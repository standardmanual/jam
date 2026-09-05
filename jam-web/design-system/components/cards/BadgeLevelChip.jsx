import React from 'react';

/**
 * BadgeLevelChip — 무한레벨형 배지의 «Lv.N» 칩. 티켓 20260905_0036.
 *
 * 왜 `RarityBadge`에 분기를 넣지 않았나:
 * `RarityBadge`는 «등급»(Common~Mystic)을 그리는 컴포넌트이고, v5 무한레벨형 배지는
 * `rarity`가 **NULL**이고 `level`만 있다(193종). 서로 다른 축이라 한 컴포넌트에 분기로
 * 합치면 "등급 칩인데 등급이 없는 상태"라는 모순이 API에 남는다. `RarityBadge`는 서비스
 * 9곳이 쓰므로 비파괴로만 두고, 레벨은 여기서 따로 그린다.
 *
 * 색: `--color-secondary` 채움 + 흰 텍스트 = **5.86:1** (계열 카드 표면 위 실측, WCAG AA
 * 통과). 이번 리뉴얼에서 새로 만든 색은 없다 — 기존 토큰만 쓴다.
 *
 * 폭: 계열 카드 1행 그리드가 `[52px 칩][1fr 이름][auto 카운터]`라 칩 폭이 고정이어야
 * 이름 시작 x가 모든 계열에서 같아진다. 그래서 `width` 기본값 52px + 가운데 정렬이고,
 * 자릿수가 늘어도(Lv.128) 폭이 흔들리지 않게 `tabular-nums`를 건다.
 */
export function BadgeLevelChip({ level, width = 52, className = '', style = {} }) {
  if (level == null) return null;
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width, padding: '4px 0', borderRadius: 'var(--radius-pill)',
        fontSize: '8px', lineHeight: 1, fontWeight: 700,
        letterSpacing: '0.3px', fontVariantNumeric: 'tabular-nums',
        color: 'var(--color-text-on-primary)', background: 'var(--color-secondary)',
        ...style,
      }}
    >
      Lv.{level}
    </span>
  );
}
