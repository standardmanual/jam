---
id: 20260907_1706
category: Admin
priority: P3
status: OPEN
created: 2026-09-07
closed:
---

# [Admin] POI 생성/전체수정 API가 category를 존재 여부로 검증하지 않음

## 배경 / 문제 정의
[20260907_1643](../P2-일반/20260907_1643_Admin_POI관리-다중선택-카테고리-일괄변경.md) 게이트
리뷰 중 발견(범위 밖). `POST /api/admin/poi`·`PUT /api/admin/poi/[id]`는 `category`가
`poi_categories`에 실제 존재하는 슬러그인지 앱 레벨로 검증하지 않는다. 반면 이번 티켓에서
확장한 `PATCH /api/admin/poi/[id]`는 검증을 추가해, 같은 리소스에 대해 엔드포인트별 검증
수준이 다르다.

`poi.category`에는 FK 제약(`poi_category_fkey`, 마이그레이션 050)이 있어 최종적으로는
DB가 막아주지만, 유효하지 않은 값을 보내면 깔끔한 400 대신 원문 그대로의 Postgres FK
violation이 500으로 노출될 수 있다.

## 상세 요구사항
- `POST /api/admin/poi`·`PUT /api/admin/poi/[id]`에도 `PATCH`와 동일한 방식으로
  `poi_categories` 존재 검증을 추가해 3개 엔드포인트의 검증 수준을 통일한다.

## 구현 계획
- `PATCH` 핸들러의 검증 로직(20260907_1643에서 작성)을 공용 함수로 뽑아 POST/PUT에서도
  재사용하는 것을 권장(중복 코드 방지).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 잔여 이슈
-
