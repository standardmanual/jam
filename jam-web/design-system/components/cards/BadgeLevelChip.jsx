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
 * 색: 중립 칩 — `--default-soft` 채움 + `--foreground` 글자(JAM 2.0, 티켓 20261015_2131 승인).
 * 새로 만든 색은 없다 — 새 시스템 토큰만 쓴다.
 *
 * 폭: 계열 카드 1행 그리드가 `[52px 칩][1fr 이름][auto 카운터]`라 칩 폭이 고정이어야
 * 이름 시작 x가 모든 계열에서 같아진다. 그래서 `width` 기본값 52px + 가운데 정렬이고,
 * 자릿수가 늘어도(Lv.128) 폭이 흔들리지 않게 `tabular-nums`를 건다.
 */
/**
 * 칩 크기 (티켓 20260906_2140) — `RarityBadge`와 같은 어휘. `sm`이 **기존 값 그대로**라
 * `size`를 넘기지 않는 서비스 5개 호출부는 렌더가 달라지지 않는다.
 */
const SIZES = {
  sm: { fontSize: '8px', padding: '4px 0', lineHeight: 1 },
  // md·row — ListRowChip과 같은 12px/20px(2026-11-11 사용자 지시, 티켓 20261112_0010). 가로 패딩은 0으로 두고 width로 폭을 잡는다
  md: { fontSize: 'var(--text-xs)', padding: '2px 0', lineHeight: 'var(--text-xs--line-height)' },
  // row (티켓 20261106_2322) — ListRow 안 칩 전용, ListRowChip과 같은 12px/20px.
  // 세로 2px은 --chip-padding(2px 8px)의 세로 값과 같다 — 이 칩은 가로 패딩을 0으로 두고
  // width로 폭을 잡아서 토큰을 그대로 못 쓴다. 토큰의 세로 값을 바꾸면 md·row 둘 다 같이 바꾼다.
  row: { fontSize: 'var(--text-xs)', padding: '2px 0', lineHeight: 'var(--text-xs--line-height)' },
};

export function BadgeLevelChip({ level, size = 'sm', width = 52, className = '', style = {} }) {
  if (level == null) return null;
  const s = SIZES[size] ?? SIZES.sm;
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width, padding: s.padding, borderRadius: 'var(--radius-full)',
        fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--foreground)', background: 'var(--default-soft)',
        ...style,
      }}
    >
      Lv.{level}
    </span>
  );
}
