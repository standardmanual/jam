---
id: DS-023
status: OPEN
severity: P2
type: FIX
category: Component / Token
---

# DS-023 — WanderingEyesLoader v2 토큰 미반영

## Problem
`WanderingEyesLoader.jsx`가 `project/`에서 그대로 복사된 채로 v2 토큰 수정이 반영되지 않았다. deprecated 토큰(`--color-white`, `--color-surface-card` 등)을 참조하거나 v2에서 제거된 토큰을 사용하고 있을 가능성이 있다. 또한 v2의 motion 토큰(`--duration-*`, `--ease-*`)을 사용하는지 확인되지 않았다.

## Evidence
v2 작업 시 WanderingEyesLoader는 수정 미진입 파일로 명시됨. `project/`와 `v2/` 간 diff에서 이 파일은 변경이 없는 것으로 확인됨.

```bash
# 수정 여부 확인 필요
diff design-system-staging/project/components/feedback/WanderingEyesLoader.jsx \
     design-system-staging/v2/components/feedback/WanderingEyesLoader.jsx
```

## Reference
v2 변경사항:
- deprecated token 제거: `--color-white`, `--color-black`, `--color-surface-card`, `--color-surface-tint`
- motion token 추가: `--duration-micro`, `--ease-linear`
- 색상 token 추가: `--color-bg-inverse`, `--color-text-inverse`, `--color-surface-inverse`

## Recommendation
1. 파일 내용 확인 — deprecated 토큰 사용 여부 검색
2. deprecated 토큰 → 대응 v2 토큰으로 교체
3. 하드코딩 컬러(#fff, #000 등) 토큰으로 교체
4. 애니메이션에 `--ease-linear` 또는 `--ease-smooth-out` 적용 검토

```bash
grep -E "(color-white|color-black|color-surface-card|color-surface-tint|#fff|#000)" \
  "design-system-staging/v2/components/feedback/WanderingEyesLoader.jsx"
```

## Impact
- `WanderingEyesLoader.jsx`만 영향
- deprecated 토큰 사용 시 해당 토큰이 이미 `colors.css`에서 제거됐으므로 렌더링 깨짐 가능

## Risk
- WanderingEyesLoader가 실제로 deprecated 토큰을 쓰지 않을 수도 있음 — 확인 후 티켓 CLOSED 처리
- 애니메이션 로직이 복잡할 경우 모션 토큰 적용이 까다로울 수 있음

## Acceptance Criteria
- [ ] `WanderingEyesLoader.jsx`에서 deprecated 토큰 (`--color-white` 등) 사용 없음
- [ ] 하드코딩 컬러 리터럴(`'#fff'`, `'rgba(255,255,255,...)'` 등) 없음
- [ ] v2 motion 토큰(`--duration-*`, `--ease-*`) 참조 또는 미사용 명시 주석
- [ ] deprecated 토큰 없음 확인 시 티켓 CLOSED 처리 가능
