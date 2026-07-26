# 팀 작업 계획

- 팀명: kkirikkiri-dev-phase15-today
- 목표: JAM! Phase15 — 홈 → '투데이' 개편(콘텐츠 카드 CMS + 태그 조건부 노출 + 아티클 페이지). PRD Step A~G 전체 + 실서비스 적용 샘플 콘텐츠 20개(전부 ends_at=2026-12-30 23:59:59+09).
- 생성 시각: 2026-07-26
- 참고 PRD: PRD/Phase15_01_PRD.md, PRD/Phase15_02_DATA_MODEL.md, PRD/Phase15_03_PHASES.md, PRD/Phase15_04_PROJECT_SPEC.md

## 팀 구성 (Agent Teams 인프라 없음 — Agent+SendMessage로 대체)
| 이름 | 역할 | 모델 | 담당 업무 |
|------|------|------|----------|
| phase15-lead | 팀장 겸 실행 | Opus | Step A~G 전체 순차 실행(Step D/E는 파일 겹치지 않으면 하위 위임 가능), DB 직접 적용, 샘플 20개 생성+적용, tsc 검증, 문서화, 배포 확인 |

## 중요 제약
- DB 직접 접근: jam-web/.env.local에 SUPABASE_SERVICE_ROLE_KEY 저장돼있음. DDL(CREATE TABLE)은 supabase-js .from()으로 불가 — Management API나 다른 방법 직접 조사해서 실행. 안 되면 SQL 파일만 준비 후 보고.
- TLS 인증서 이슈: NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem 필요 (security find-certificate로 생성)
- 샘플 20개 전부 ends_at = 2026-12-30 23:59:59+09 KST 고정, starts_at은 대부분 NOW(), 2~3개만 미래(예약발행 시연)
- 마크다운 파서 신규설치 금지 — 아티클 본문은 빈줄기준 문단분리만
- 기존 홈 섹션(최근배지/바로가기/피드) 삭제/순서변경 금지 — 카드스택은 추가만
- CLAUDE.md 규칙: (main)/api/migrations 변경 커밋 시 SERVICE_OPERATIONS_YYYYMMDD_HHMM.md 신규 생성 필수
- 코드 변경 후 항상 commit + git push origin main + vercel로 배포 확인

## 태스크 목록
- [x] Step A: today_cards DB 테이블(마이그레이션 048 작성, DDL은 유저 실행 필요) + 타입 + 탭바 개명
- [x] Step B: 노출조건 계산 + 카드조회 로직 (+ 유닛테스트 16/16)
- [x] Step C: 홈 화면 카드스택 삽입 (기존 섹션 회귀 없음)
- [x] Step D: 아티클 페이지 (기간 밖 접근 차단)
- [x] Step E: 어드민 CMS (7템플릿 동적 폼 + API + 내비)
- [x] Step F: 샘플 20개 SQL 작성(seed_phase15_today_cards_20.sql) — DB 적용은 테이블 생성(DDL) 후 가능
- [x] Step G: tsc 0(프로덕션) + SERVICE_OPERATIONS 문서 + commit/push + 배포확인

## 주요 결정사항
- (팀장이 결정할 때마다 기록)
