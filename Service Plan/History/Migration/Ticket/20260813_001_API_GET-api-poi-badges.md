---
id: 20260813_001
category: API
status: CLOSED
created: 2026-08-13
closed: 2026-08-15
---

# [API] GET /api/poi-badges (지도 줌/영역 기반)

## 배경
Phase 17에서 지도 화면에서 현재 보이는 영역의 POI 배지 마커 조회.

## 상세 요구사항
- 쿼리 파라미터: swLat, swLng, neLat, neLng (뷰포트), zoom
- 응답: POI 배지 배열 (id, name, lat, lng, count, rarity%)
- 마커 클러스터링 기준: zoom 레벨별 그룹핑

---

## 완료 기록

### 구현 내용 요약
- GET /api/poi-badges 라우트
- 뷰포트 필터링
- 클러스터링 로직

### 변경된 파일
```
src/app/api/poi-badges/route.ts (신규)
```

### 배포 정보
- 배포일: 2026-08-15
- 커밋: api/poi_badges
