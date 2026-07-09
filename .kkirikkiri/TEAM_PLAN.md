# 팀 작업 계획

- 팀명: kkirikkiri-dev-jam-phase3
- 목표: JAM! 유저 모바일 웹 Phase 3 병렬 구현
- 생성 시각: 2026-07-09

## 팀 구성
| 이름 | 역할 | 모델 | 담당 업무 |
|------|------|------|----------|
| jam-lead | 팀장 | Opus | DB 스키마, 드랍 로직, 통합 |
| jam-inv | 개발자 1 | Opus | 인벤토리 화면 + 아이템 상세 + 플리마켓 진입점 |
| jam-drop | 개발자 2 | Opus | 아이템 배지 드랍 엔진 + 아이템북 완성 체크 |

## PRD 위치
- 요구사항: /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/01_PRD.md
- 데이터 모델: /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/02_DATA_MODEL.md
- Phase 계획: /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/03_PHASES.md

## Phase 3 범위
- [ ] 아이템 배지 드랍 엔진 (활동 완료 후 확률 드랍) → jam-drop
- [ ] 아이템북 완성 체크 로직 → jam-drop
- [ ] 인벤토리 화면 (50슬롯 시각화, 아이템 배지 그리드) → jam-inv
- [ ] 인벤토리 아이템 상세 (배지 정보, 시리얼 넘버, 만료일) → jam-inv
- [ ] 플리마켓 메뉴 진입점 ("준비 중" 상태) → jam-inv
- [ ] TabBar 인벤토리 탭 잠금 해제 → jam-inv

## 절대 하지 마
- 실제 P2P 거래 기능 구현하지 마 (Phase 4)
- 카카오맵 딥링크 사용하지 마 (구글맵만)
- 자체 GPS 트래킹 UI 만들지 마
- API 키 코드에 직접 쓰지 마
- 드랍 확률 하드코딩하지 마 (badges 테이블 참조 방식으로)

## 주요 결정사항
### 2026-07-09
- 플리마켓은 메뉴만 노출, 실제 거래 기능 없음 ("준비 중" 화면)
- 드랍 확률: rarity별 (common 40%, rare 25%, legendary 10%, mythic 5%, 드랍 없음 20%)
- 아이템 배지 만료: 드랍 후 30일
- 인벤토리 슬롯: used_slots < max_slots(50) 체크 필수
- 카카오맵 사용 안 함 — 구글맵만 사용
