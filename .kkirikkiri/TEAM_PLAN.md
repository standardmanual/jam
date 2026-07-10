# 팀 작업 계획

- 팀명: kkirikkiri-dev-jam-phase6-admin
- 목표: JAM! Admin 패널 + Phase 6 드랍/픽업 시스템
- 생성 시각: 2026-07-09

## 팀 구성
| 이름 | 역할 | 모델 | 담당 업무 |
|------|------|------|----------|
| jam-lead | 팀장 | Opus | Admin 레이아웃/인증, DB 스키마, Phase 6 데이터 모델 |
| jam-admin-content | 개발자 1 | Opus | 배지 CRUD + POI CRUD + 드랍 확률 관리 |
| jam-admin-test | 개발자 2 | Opus | 테스트 도구 + 유저 통계/DAU 대시보드 |
| jam-phase6 | 개발자 3 | Opus | Phase 6 드랍/픽업 시스템 (DB + 백엔드 + 유저 UI) |

## PRD 위치
- /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/01_PRD.md
- /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/02_DATA_MODEL.md
- /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/03_PHASES.md

## 범위

### Admin 패널 (`/admin` route group)
- Admin 인증: `ADMIN_SECRET` 환경변수 기반 패스워드 (쿠키 세션)
- 배지 CRUD: 배지 목록/등록/수정 (condition_json 에디터 포함)
- POI CRUD: POI 목록/등록/수정/삭제 (위경도 입력)
- 드랍 확률 조정: rarity별 확률 테이블 (DB 저장)
- 드랍 이벤트 관리: Phase 6 드랍 포인트 등록/관리
- **테스트 도구** (코딩 몰라도 사용 가능):
  - 가상 활동 시뮬레이션: 종류/거리 선택 → 배지 엔진 + 드랍 엔진 실행
  - 배지 수동 발급: 유저 선택 + 배지 선택 → 즉시 발급
  - 아이템 수동 추가: 유저 선택 + 아이템 배지 선택 → 인벤토리에 추가
  - Strava 강제 동기화: 유저 선택 → 즉시 동기화 트리거
- 유저 통계: 가입자 수, Strava 연동률, 배지 획득 현황

### Phase 6 드랍/픽업 시스템
- 어드민이 GPS 좌표 + 아이템 배지 + 수량 + 기간으로 드랍 이벤트 등록
- 유저 화면: 활성 드랍 목록 (구글맵 아웃링크)
- 픽업: Strava 동기화 시 GPS 경로 ↔ 드랍 위치 50m 교차 검증 → 자동 픽업
- 수량 소진 시 드랍 종료

## 절대 하지 마
- 카카오맵 사용하지 마 (구글맵만)
- 인앱 지도 화면 만들지 마 (아웃링크만)
- Admin 인증 없이 admin 라우트 노출하지 마
- API 키 코드에 직접 쓰지 마

## DB 추가 테이블 (jam-lead가 작성)
- `drop_events`: 드랍 이벤트 (위치, 아이템, 수량, 기간)
- `drop_claims`: 픽업 기록 (유저, 드랍, 픽업 시각)
- `drop_probability`: rarity별 확률 (어드민 조정 가능)
