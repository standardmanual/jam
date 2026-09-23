---
id: "20260923_0101"
category: Infra
priority: P3
status: OPEN
created: 2026-09-23
closed:
---

# [Infra] `eslint-config-next`가 `next` 16.3.6 상향 후에도 16.2.10에 고정돼 있다

## 핵심 요약

- 요구사항: `eslint-config-next`를 `next`와 같은 마이너 버전대로 맞춰 상향한다.
- 관련 파일: `jam-web/package.json`

## 배경 / 문제 정의

티켓 20260922_2321에서 `next`를 16.2.10→16.3.6으로 상향했으나 `eslint-config-next`는 그대로 16.2.10에 고정돼 있다. `npm audit`가 취약점으로 잡지 않아 그 티켓 범위에서는 의도적으로 남겨졌다(아현 assumptions). lint 규칙이 구버전 next 기준에 머물러 신버전에서 생긴 패턴에 대한 lint 오탐·누락 가능성이 있다.

## 완료 조건
- `eslint-config-next`가 `next` 16.3.x와 같은 마이너 버전대로 상향돼 있다.
- `npm run lint:ci` 통과, 경고 26건 이하 기준선 유지.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: staging (빌드 없음)
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
