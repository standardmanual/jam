---
id: "20261128_0002"
category: UI
priority: P3
status: OPEN
created: 2026-11-28
closed:
---

# [UI] 쓰는 곳이 없어진 `--tierup-stage-bg` 토큰을 지운다

## 핵심 요약

- 요구사항: 티켓 20261127_2225에서 `TierUpRevealOverlay`를 지운 뒤 `--tierup-stage-bg`(component 토큰)를 쓰는 곳이 없다. DS를 건드리지 않으려고 그 티켓에서는 남겼다. 토큰과 카탈로그 항목을 지운다.
- 구현 계획: 토큰 정의를 지우고 카탈로그 생성기를 다시 돌린다. 토큰 삭제는 DS 변경이라 사용자 승인 줄이 필요하다.
- 관련 파일: `jam-web/design-system/tokens/component.css`(29행), `docs/service/prd/ui-components/tokens.md`(243·560행, 생성기 산출)

## 배경 / 문제 정의
티켓 20261127_2225 잔여 이슈와 민지 범위 밖 발견물(참고/낮음). 쓰지 않는 토큰이 카탈로그에 남아 사용처 0으로 표시된다.

## 완료 조건
- `--tierup-stage-bg` 정의와 카탈로그 항목이 없고, `git grep tierup-stage-bg`가 문서 기록(티켓) 외에 걸리지 않는다.
- `scripts/verify.sh`(token-refs·token-catalog 포함)가 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
