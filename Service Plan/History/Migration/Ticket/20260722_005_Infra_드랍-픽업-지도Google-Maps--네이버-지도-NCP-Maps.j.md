---
id: 20260722_005
category: Infra
status: CLOSED
created: 2026-07-22
closed: 2026-07-22
---

# [Infra] 드랍/픽업 지도(Google Maps → 네이버 지도 NCP Maps.js)와 POI 데이터 소스(T2: O

## 배경 / 문제 정의
SERVICE_OPERATIONS_20260722_1442 문서 기반 작업.

## 상세 요구사항

### 서비스/코드베이스 관점
드랍/픽업 지도(Google Maps → 네이버 지도 NCP Maps.js)와 POI 데이터 소스(T2: OSM Overpass → 네이버 지역검색 오픈API) 전환. `poi.naver_id` 컬럼 추가(마이그레이션 038), 어드민 POI 등록 화면에 네이버 장소 검색 기능 추가.

## 구현 계획
이전 버전: SERVICE_OPERATIONS_20260722_1442를 기준으로 개선.

---
## 완료 기록

### 구현 내용 요약
드랍/픽업 지도(Google Maps → 네이버 지도 NCP Maps.js)와 POI 데이터 소스(T2: OSM Overpass → 네이버 지역검색 오픈API) 전환. `poi.naver_id` 컬럼 추가(마이그레이션 038), 어드민 POI 등록 화면에 네이버 장소 검색 기능 추가.

### 변경된 파일
```
SERVICE_OPERATIONS 문서 참조
```

### 테스트 결과
- 문서에 명시된 사항 참고

### 배포 정보
- 배포일: 2026-07-22
- 환경: production
- 원본 문서: SERVICE_OPERATIONS_20260722_1442.md

### 주요 의사결정 / 핵심 메모
> 상세 내용은 Service Plan/History/Operations/SERVICE_OPERATIONS_20260722_1442.md 참조

### 잔여 이슈
> 문서에 명시된 내용 참고

