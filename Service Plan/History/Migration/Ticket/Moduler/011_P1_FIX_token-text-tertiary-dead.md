---
id: DS-011
status: CLOSED
severity: P1
type: FIX
category: Token / Color
---

# DS-011 — `--color-text-tertiary` 미사용 dead token

## Problem
`tokens/colors.css`에 `--color-text-tertiary: #b0aaa5`가 정의되어 있으나 DS v2의 어떤 컴포넌트에서도 이 토큰을 참조하지 않는다. 사용되지 않는 토큰은 소비자에게 혼란을 준다 — "tertiary text가 있다면 어디에 써야 하는가?"에 대한 대답이 없다.

## Evidence
```css
/* colors.css */
--color-text-tertiary: #b0aaa5;    /* 정의됨 */
```
```bash
# 전체 v2에서 참조 없음
grep -r "text-tertiary" design-system-staging/v2/
# → 결과 없음
```

## Reference
기존 DS에도 tertiary text 개념 없음. v2에서 `--color-text`(주), `--color-text-secondary`(부) 2단계로 충분히 계층이 표현된다.

## Recommendation
두 가지 옵션:

**Option A — 제거 (권장)**
dead token 제거. tertiary 사용처가 생기면 그때 추가한다. "혹시 쓸 수도 있다"는 이유로 토큰을 미리 만드는 것은 DS 복잡도를 높인다.

**Option B — 실제 사용처 설계 후 유지**
`Toast`의 타임스탬프, `Card` 내 보조 메타 텍스트 등 구체적 사용처를 결정하고 해당 컴포넌트에 적용한다.

우선 Option A로 처리. 필요시 DS-ADD 티켓으로 재등록.

## Impact
- `colors.css`에서 토큰 1개 제거 — 다른 컴포넌트 영향 없음
- DS 소비자가 `--color-text-tertiary`를 이미 사용 중이라면 영향 — 하지만 DS 컴포넌트 외부에서 임의로 사용한 것이므로 소비자 책임

## Risk
- 이미 서비스 코드에서 `--color-text-tertiary`를 직접 참조하는 경우 색상 무효화 → 서비스 코드 사용 여부 사전 확인 필요

## Acceptance Criteria
- [ ] `--color-text-tertiary` 제거 또는 최소 1개 이상 컴포넌트에 실제 적용
- [ ] 제거 시 서비스 코드(`jam-web/src/`)에서 참조 없음 확인
- [ ] `colors.css` 주석에 텍스트 색상 2단계 체계(`--color-text`, `--color-text-secondary`) 명시

---
## 완료 기록
- **날짜**: 2026-08-14
- **구현**: `--color-text-tertiary: #b0aaa5` 제거. jam-web/src 전체 참조 없음 확인. colors.css 주석에 2단계 텍스트 체계(--color-text / --color-text-secondary) 명시.
- **변경 파일**: `design-system-staging/v2/tokens/colors.css`
