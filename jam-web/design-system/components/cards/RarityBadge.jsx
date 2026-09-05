import React from 'react';

/**
 * RarityBadge — badge rarity pill.
 * rarity: 'common' | 'rare' | 'epic' | 'mystic'
 *
 * v2 changes:
 *   - Text color changed from '#fff' hardcoded to --color-rarity-*-text tokens
 *     (rare/epic use black text for better contrast on their light backgrounds)
 *   - letterSpacing: --tracking-label applied (uppercase label legibility)
 * v3: chip shrunk to ~65% (8px text, 4px/9px padding) — literal px, not --text-caption
 *     (there's no type-scale token below caption; common no longer renders one at all)
 * v4 (티켓 20260905_0036): 미지 등급 값의 «조용한 Common 폴백»을 걷어냈다. 아래 resolveRarity 참고.
 *
 * 등급 색 `--color-rarity-*`는 **값을 바꾸지 않는다.** 이 토큰들은 등급 밖으로도 새어 있어서
 * (`--color-tag-3/4/5`가 epic/rare/mystic을 참조하고, **폼 입력 에러 색이
 * `--color-rarity-mystic`**이다 — `forms/{Input,Checkbox,Select,Textarea}.jsx`) 값을 건드리면
 * 폼 에러 표시가 함께 깨진다.
 */
const config = {
  common: { label: 'Common', bg: 'var(--color-rarity-common)', text: 'var(--color-rarity-common-text)' },
  rare:   { label: 'Rare',   bg: 'var(--color-rarity-rare)',   text: 'var(--color-rarity-rare-text)' },
  epic:   { label: 'Epic',   bg: 'var(--color-rarity-epic)',   text: 'var(--color-rarity-epic-text)' },
  mystic: { label: 'Mystic', bg: 'var(--color-rarity-mystic)', text: 'var(--color-rarity-mystic-text)' },
};

/**
 * resolveRarity — 등급 값을 config 키로 정규화한다. 셋 중 하나를 돌려준다:
 *   'common'|'rare'|'epic'|'mystic' — 아는 등급
 *   null                            — 등급이 «존재하지 않음»(v5 무한레벨형은 rarity가 NULL)
 *   null + 개발 경고                 — «미지 값». 예전에는 `config[rarity] ?? config.common`으로
 *                                     조용히 Common으로 떨어뜨렸다(티켓 20260905_0036).
 *
 * 왜 폴백을 걷어내나: 오타·신규 등급·잘못된 캐스팅(`rarity as BadgeRarity`)이 화면에 "Common"
 * 이라는 **틀린 사실**로 나가고, 그게 정상 데이터와 구분되지 않아 아무도 눈치채지 못한다.
 * 등급이 없는 것과 등급을 모르는 것은 둘 다 «그리지 않음»이 맞고, 후자만 개발 빌드에서
 * 경고를 남긴다. 프로덕션에서는 경고 없이 조용히 생략한다(화면이 깨지지 않게).
 */
function resolveRarity(rarity, where) {
  if (rarity == null) return null;
  if (Object.prototype.hasOwnProperty.call(config, rarity)) return rarity;
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
    console.warn(`[MODULAR] ${where}: 알 수 없는 등급 값 ${JSON.stringify(rarity)} — 아무것도 그리지 않습니다. 'common'|'rare'|'epic'|'mystic' 또는 null(등급 없음)을 넘기세요.`);
  }
  return null;
}

/**
 * getRarityLabel — 등급의 텍스트 라벨만 반환한다("Common"/"Rare"/"Epic"/"Mystic").
 * 위 config(라벨 단일 소스)를 그대로 재사용한다. RarityBadge는 common일 때 시각적
 * 칩을 렌더하지 않지만(그리드/리스트 노이즈 축소, 20260827_024), 렌더링 없이 텍스트만
 * 필요한 곳(예: 스크린리더 라이브 리전, 20260904_1502)은 이 함수를 쓴다.
 */
export function getRarityLabel(rarity = 'common') {
  // v5: 등급이 없는 배지(무한레벨형)는 라벨 자체가 없다 — null을 그대로 돌려준다.
  // 기본값 `= 'common'`은 undefined에만 걸리므로 명시적 null은 resolveRarity가 따로 잡는다.
  // 이 가드가 없으면 "Common"을 돌려준다(티켓 20260905_0027 개선 리뷰).
  // 미지 값도 마찬가지로 null이다 — 틀린 등급명을 스크린리더가 읽는 게 최악이다
  // (티켓 20260905_0036).
  const key = resolveRarity(rarity, 'getRarityLabel');
  return key == null ? null : config[key].label;
}

export function RarityBadge({ rarity = 'common', className = '' }) {
  // 등급 없음(null) — 무한레벨형은 등급 칩을 그리지 않는다(대신 `BadgeLevelChip`).
  // common과 같은 처리지만 이유가 다르다: common은 "노이즈 축소"(20260827_024),
  // null은 "등급이 존재하지 않음", 미지 값은 "등급을 모름"(개발 빌드에서 경고).
  const key = resolveRarity(rarity, 'RarityBadge');
  if (key == null) return null;
  if (key === 'common') return null;
  const c = config[key];
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '4px 9px', borderRadius: 'var(--radius-pill)',
        fontSize: '8px', lineHeight: 1, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.3px',
        color: c.text, background: c.bg,
      }}
    >
      {c.label}
    </span>
  );
}
