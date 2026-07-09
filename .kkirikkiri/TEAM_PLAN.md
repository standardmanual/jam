# 팀 작업 계획

- 팀명: kkirikkiri-dev-jam-phase2
- 목표: JAM! 유저 모바일 웹 Phase 2 병렬 구현
- 생성 시각: 2026-07-09

## 팀 구성
| 이름 | 역할 | 모델 | 담당 업무 |
|------|------|------|----------|
| jam-lead | 팀장 | Opus | DB 스키마 업데이트, 아키텍처, 통합/배포 |
| jam-poi | 개발자 1 | Opus | Strava Streams API + POI 매칭 엔진 |
| jam-map | 개발자 2 | Opus | 배지 상세 지도 아웃링크 활성화 + middleware→proxy 리네임 |

## PRD 위치
- 요구사항: /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/01_PRD.md
- 데이터 모델: /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/02_DATA_MODEL.md
- Phase 계획: /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/03_PHASES.md
- 프로젝트 스펙: /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/04_PROJECT_SPEC.md

## Phase 2 범위
- [ ] DB 마이그레이션: poi 테이블 활성화, user_activity_badges에 triggered_by_poi_id 추가 → jam-lead
- [ ] Strava Streams API 연동: 활동 GPS 경로 데이터 취득 → jam-poi
- [ ] POI 매칭 엔진: 경로 ↔ POI 반경 50m 교차 검증 → jam-poi
- [ ] 배지 동기화 시 POI 자동 인증 + 배지 발급 연동 → jam-poi
- [ ] 배지 상세 화면 지도앱 아웃링크 활성화 (카카오맵/구글맵) → jam-map
- [ ] middleware → proxy 리네임 (Next.js 16 deprecated 경고 해결) → jam-map

## 절대 하지 마
- 인앱 지도 화면 만들지 마 (아웃링크만)
- Garmin 연동 추가하지 마
- 자체 GPS 트래킹 UI 만들지 마
- API 키 코드에 직접 쓰지 마
- Strava 과거 데이터 소급 처리하지 마

## 주요 결정사항
### 2026-07-09 — 메인세션
- Garmin 제외, POI 매칭 + 지도 아웃링크 + middleware 리네임만 구현
- Strava Streams API endpoint: GET /activities/{id}/streams?keys=latlng
- POI 매칭 기준: 반경 50m (Haversine 공식)
- 지도 아웃링크: 카카오맵 앱 딥링크 우선, 미설치 시 구글맵 웹으로 폴백
