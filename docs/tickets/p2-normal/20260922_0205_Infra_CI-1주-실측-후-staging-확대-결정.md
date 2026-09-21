---
id: "20260922_0205"
category: Infra
priority: P2
status: OPEN
created: 2026-09-22
parent: "20260921_2304"
---

# [Infra] CI 1주 실측 후 staging push까지 넓힐지 정한다

## 핵심 요약

- 요구사항: 리뷰 브랜치(`claude/**`)에만 켠 GitHub Actions `verify`의 1주 사용량을 집계하고, 무료 한도 안에서 staging push까지 넓힐 여유가 있는지 사용자에게 보고해 결정받는다.
- 구현 계획: 2026-09-29 이후에 `gh run list --workflow verify.yml --created '>=2026-09-22' --json databaseId,conclusion,createdAt,updatedAt --limit 500`으로 실행 횟수·실행별 시간·경로(전체·가벼운 검사)를 집계한다. 월 환산 사용량과 staging을 추가했을 때의 예상치를 함께 보고한다.
- 관련 파일: `.github/workflows/verify.yml`, `docs/agents/team-operations.md` §3, `jam-doc/planning/business-plan/02 JAM! 서비스 플랜.md` §8.2 16번
- 상위 티켓: 20260921_2304(2026-09-22 사용자 결정: "1주 실측 후 여유가 있으면 staging을 추가한다"). 경로: 카리나 직접(research). staging 추가를 결정하면 별도 infra 티켓으로 구현한다.

## 배경 / 문제 정의

저장소가 비공개라 GitHub Actions는 무료 한도(GitHub Free 월 2,000분, Pro 월 3,000분)를 쓴다. 초과분은 Linux 2코어 기준 분당 $0.006이고, 결제 수단이 없으면 한도를 다 쓴 뒤 실행이 막힌다(GitHub 문서 「GitHub Actions billing」, 2026-09-22 확인). 2304의 사전 추정은 "하루 리뷰 브랜치 push 12회, 그중 70%가 코드 변경"이라는 가정에서 월 약 860분이었고 실측값이 아니다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. 7일간의 실행 횟수, 전체 검사와 가벼운 검사의 횟수와 평균 시간, 취소된 실행 수를 집계한다.
2. 월 환산 사용량을 계산하고, staging push(하루 push 수는 `git log origin/staging`의 push 단위가 아니므로 티켓 종료 수로 근사한다)를 추가했을 때의 예상치를 함께 낸다.
3. 결제 설정(요금제·결제 수단)은 `gh` 권한으로 조회되지 않으므로 사용자에게 확인을 요청한다.

## 구현 계획

1. 2026-09-29 이후 집계하고 이 티켓에 결과를 적는다.
2. 사용자에게 staging 추가 여부를 묻는다.

## 완료 조건

- 1주 실측 수치와 월 환산값이 기록돼 있다.
- staging 추가 여부에 대한 사용자 결정이 기록돼 있다.

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
