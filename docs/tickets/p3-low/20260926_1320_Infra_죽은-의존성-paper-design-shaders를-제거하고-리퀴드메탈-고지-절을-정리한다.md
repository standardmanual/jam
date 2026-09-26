---
id: "20260926_1320"
category: Infra
priority: P3
status: OPEN
created: 2026-09-26
closed:
related:
  - "20260925_1416"
---

# [Infra] 죽은 의존성 `@paper-design/shaders`를 제거하고 리퀴드 메탈 고지 절을 정리한다

> 2026-09-26 티켓 20260925_1416 게이트(민지)의 범위 밖 발견물이다.

## 핵심 요약

- 요구사항: `jam-web/package.json:25`의 `@paper-design/shaders@0.0.80`은 `src` 임포트가 0건인데 남아 있고, 그 때문에 `jam-web/THIRD_PARTY_NOTICES.md`에 리퀴드 메탈 고지 절이 유지된다. 쉐이더 랩 제거(티켓 1416)가 `shaders-react`만 지정해서 이쪽은 손대지 않았다. 패키지를 제거하고 고지 절도 정리한다.
- 구현 계획: `git grep`으로 `@paper-design/shaders` 사용처가 0건임을 다시 확인 → 패키지 제거(링크를 걷고 독립 설치 후 `npm uninstall`, 티켓 20260923_0100 안내) → `THIRD_PARTY_NOTICES.md`의 리퀴드 메탈 절을 코드·패키지가 모두 사라진 경우의 처리(과거형 요약 또는 삭제, 라이선스 근거는 유지 여부 판단)로 정리.
- 관련 파일: `jam-web/package.json:25`, `jam-web/package-lock.json`, `jam-web/THIRD_PARTY_NOTICES.md`.

## 완료 조건

- `@paper-design/shaders`가 `package.json`에서 사라지고 새로 설치(`npm ci`)와 `npm run build`가 통과한다. 고지 문서가 현재 상태와 맞는다.


---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
