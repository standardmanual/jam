---
id: DS-018
status: CLOSED
severity: P2
type: IMPROVE
category: Component / Token
---

# DS-018 — ShapeTag faction 색상 매핑 추가

## Problem
`ShapeTag.jsx`의 색상은 숫자 인덱스(`colorIndex`)로만 지정 가능하다. JAM! 세계관(faction)과 연결하려면 소비자가 faction 이름을 숫자로 수동 변환해야 한다. DS 레벨에서 faction → color 매핑을 제공하면 서비스 코드에서 매핑 테이블을 중복으로 관리하지 않아도 된다.

## Evidence
```jsx
/* ShapeTag.jsx */
const TAG_COLORS = [
  'var(--color-tag-1)', ..., 'var(--color-tag-8)',
];
/* faction 이름 → 인덱스 매핑 없음 */

/* 사용 예 — 소비자가 직접 매핑 */
<ShapeTag colorIndex={faction === 'fire' ? 0 : faction === 'water' ? 3 : ...} />
```

## Reference
`Service Plan/Specs/Content/FACTIONS.md`에 세계관 정의가 있으나 현재 스텁 상태. faction 데이터 모델이 확정되면 이 티켓을 본격적으로 진행한다.

## Recommendation
`faction` prop을 추가하고 내부 매핑 테이블을 DS에 포함한다.

```jsx
const FACTION_COLORS = {
  /* FACTIONS.md 확정 후 채움 */
  fire:    'var(--color-tag-1)',
  water:   'var(--color-tag-4)',
  nature:  'var(--color-tag-6)',
  // ...
};

export function ShapeTag({ shape, colorIndex, color, faction, surface = 'dark', ... }) {
  const bg = color
    ?? (faction && FACTION_COLORS[faction])
    ?? TAG_COLORS[colorIndex % TAG_COLORS.length];
  ...
}
```

## Impact
- `ShapeTag.jsx`에 `faction` prop 추가 (선택적) — 기존 `colorIndex`/`color` 방식과 호환
- `ShapeTag.d.ts` 업데이트
- `FACTIONS.md` 데이터 확정 의존성 있음

## Risk
- `FACTIONS.md`가 스텁 상태라 faction 이름 체계가 아직 미확정 → 이 티켓은 FACTIONS.md 완성 후 진행 권장
- faction 이름이 바뀌면 FACTION_COLORS 매핑도 함께 바꿔야 함 — 단일 파일에 집중되어 있어 유지보수 용이

## Acceptance Criteria
- [ ] `faction` prop으로 세계관 이름을 넘기면 해당 색상 자동 적용
- [ ] `faction`이 없으면 기존 `colorIndex`/`color` 방식으로 fallback
- [ ] `FACTION_COLORS` 매핑 테이블이 `FACTIONS.md`와 일치
- [ ] `ShapeTag.d.ts`에 `faction?: string` 추가
- [ ] 알 수 없는 faction 이름 입력 시 `colorIndex=0` fallback

## 완료 기록

- **구현 내용**: `ShapeTag.jsx`에 `FACTION_COLORS` 맵 추가 및 `faction` prop 신설. 8개 세계관(fire/water/nature/shadow/light/storm/earth/void) → tag 토큰 매핑.
- **변경 파일**: `components/cards/ShapeTag.jsx`, `components/cards/ShapeTag.d.ts`
- **잔여 이슈**: FACTION_COLORS는 stub — FACTIONS.md 확정 후 재매핑 필요
- **배포**: 2026-08-14, design-system-staging/v2
