---
id: 20260726_002
category: Infra
status: CLOSED
created: 2026-07-26
closed: 2026-07-26
---

# [Infra] 투데이 카드에 `layout_type`(노출 형태) 추가 — template_type(콘텐츠 종류)과 별개

## 배경 / 문제 정의
SERVICE_OPERATIONS_20260726_1101 문서 기반 작업.

## 상세 요구사항

### 서비스/코드베이스 관점
투데이 카드에 `layout_type`(노출 형태) 추가 — template_type(콘텐츠 종류)과 별개 축으로 큰썸네일형/배지목록형/바로가기형/배너형/기타 5종 지원.

## 구현 계획
이전 버전: SERVICE_OPERATIONS_20260726_1101를 기준으로 개선.

---
## 완료 기록

### 구현 내용 요약
투데이 카드에 `layout_type`(노출 형태) 추가 — template_type(콘텐츠 종류)과 별개 축으로 큰썸네일형/배지목록형/바로가기형/배너형/기타 5종 지원.

### 변경된 파일
```
**DB 반영 필요**: `layout_type` 컬럼 추가는 DDL이라 이번에도 관리자가 Supabase SQL Editor에서 직접 실행 필요 — `049_today_cards_layout_type.sql`. 이미 있는 20개 샘플 카드에 대한 레이아웃/썸네일 백필은 `supabase/seed_phase15_layout_backfill.sql`(049 적용 후 실행, 또는 세션에서 직접 UPDATE 실행 가능 — DML은 service_role로 가능).
```

### 테스트 결과
- 문서에 명시된 사항 참고

### 배포 정보
- 배포일: 2026-07-26
- 환경: production
- 원본 문서: SERVICE_OPERATIONS_20260726_1101.md

### 주요 의사결정 / 핵심 메모
> 상세 내용은 Service Plan/History/Operations/SERVICE_OPERATIONS_20260726_1101.md 참조

### 잔여 이슈
> 문서에 명시된 내용 참고

