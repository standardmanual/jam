---
id: 20260731_002
category: Infra
status: CLOSED
created: 2026-07-31
closed: 2026-07-31
---

# [Infra] 러닝(road_running) 카테고리 속도 조건 배지 2종("리듬의 발견", "스피드 엔듀러", 총 8개

## 배경 / 문제 정의
SERVICE_OPERATIONS_20260731_0241 문서 기반 작업 (Specs/ 폴더에서 이전).

## 상세 요구사항

### 서비스/코드베이스 관점
러닝(road_running) 카테고리 속도 조건 배지 2종("리듬의 발견", "스피드 엔듀러", 총 8개 티어)을 km/h(속도) → 분:초/km(페이스) 단위로 전환. 트레일러닝·걷기 카테고리에는 애초에 속도 조건 배지가 없어 전환 대상 없음.

## 구현 계획
이전 버전을 기준으로 개선.

---
## 완료 기록

### 구현 내용 요약
러닝(road_running) 카테고리 속도 조건 배지 2종("리듬의 발견", "스피드 엔듀러", 총 8개 티어)을 km/h(속도) → 분:초/km(페이스) 단위로 전환. 트레일러닝·걷기 카테고리에는 애초에 속도 조건 배지가 없어 전환 대상 없음.

### 변경된 파일
```
`supabase/migrations/071_running_badges_pace_conversion.sql` (DB `condition_json`·`description` 갱신, jam-prod에 직접 적용 완료)
```

### 테스트 결과
- 문서에 명시된 사항 참고

### 배포 정보
- 배포일: 2026-07-31
- 환경: production
- 원본 문서: SERVICE_OPERATIONS_20260731_0241.md (Specs → History/Operations 아카이브 이동)

### 주요 의사결정 / 핵심 메모
> 상세 내용은 Service Plan/History/Operations/SERVICE_OPERATIONS_20260731_0241.md 참조

### 잔여 이슈
> 문서에 명시된 내용 참고

