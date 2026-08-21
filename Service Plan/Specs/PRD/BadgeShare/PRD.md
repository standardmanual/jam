# 배지 공유 기능 — PRD

> 생성일: 2026-08-21
> 관련 티켓: `20260821_003`(UI 셸, CLOSED), `20260821_004`(이미지 생성·스트라바 연동·OS 공유시트, 진행 예정)

## 1. 배경

과거 드랍 공유 카드 기능(`ShareCardModal`, `/api/drops/{id}/share`)은 2026-08-17 메뉴 개편으로
삭제됐다(티켓 `20260731_004`). 이는 이후 제대로 재개발하기 위한 임시 삭제였고, 이 PRD는 그
정식 재구현 스펙을 정의한다.

## 2. 한 줄 요약

획득한 액티비티/POI/아이템 배지 상세 페이지에서 배지를 투명 PNG 이미지로 만들어 OS 공유시트
(또는 다운로드)로 내보낼 수 있게 한다.

## 3. 대상 화면

`jam-web/src/app/(main)/badges/[id]/page.tsx` — activity/POI/item 3개 배지 타입이 공통으로
쓰는 단일 라우트. TopNav 우측에 공유 아이콘 버튼을 두고 3타입 공통으로 동작한다.

## 4. 핵심 플로우

1. 유저가 배지 상세 페이지 TopNav의 공유 아이콘(`ios_share`)을 누른다.
2. 전체화면 바텀시트가 열리고, 생성된 공유 이미지를 미리보기로 보여준다.
3. 유저가 공유 액션을 누르면:
   - Web Share API 지원 환경(주로 모바일): OS 공유시트 호출, 유저는 사진앱 등으로 저장 가능
   - 미지원 환경(주로 데스크톱): PNG 다운로드 링크로 대체

## 5. 이미지 생성 방식

- **클라이언트 Canvas API**로 생성한다. 어드민의 `bakePreviewToBlob.ts`(`jam-web/src/app/admin/badges/`)
  가 쓰는 "화면에 보이는 대로 `canvas.toBlob()`으로 캡처" 패턴을 확장한다. 별도 서버사이드
  렌더링 파이프라인은 신설하지 않는다.
- 매 공유 시점에 그때그때 새로 생성한다. DB에 캐싱하지 않는다 — `user_activity_badges.share_card_url`
  (과거 공유 카드 기능이 남긴 죽은 필드)은 이번 기능에서 재사용하지 않는다.

## 6. 템플릿 스펙 (피그마 제공)

피그마: https://www.figma.com/design/UXcBEgFagmO5ARwH5F0mMW/제목-없음

캔버스 공통: 1080×1920, 투명 배경 PNG.

### 6.1 액티비티/POI 배지 공용 템플릿 (node `1:55`)
- 상단 중앙: 배지 이미지 483×483 영역, 비율 유지 `contain`으로 축소 표시
- 하단: 텍스트 3세트 (흰색, `Inter Bold` 폰트, 폴백 `Arial Bold`, 라벨 ~20px / 값 ~51px)
  - `DISTANCE` — 예: `160.29km`
  - `PACE` — 예: `12:00 /km`
  - `TIME` — 예: `12h 59m 59s` (피그마 원본 라벨이 "PACE"로 중복 표기된 오타였으나 `TIME`으로 확정)
- 최하단: `Jam` 로고 174×72

### 6.2 아이템 배지 전용 템플릿 (node `1:60`)
- 배지 이미지 483×483 영역(`contain`) + `Jam` 로고만. 텍스트 없음.

## 7. 데이터 소스

- 배지 이미지: 기존 배지 레코드의 `image_url`
- 거리(`DISTANCE`): `user_activity_badges.triggered_by_distance_km`(DB에 이미 저장됨, 재조회 불필요)
- 페이스(`PACE`)·시간(`TIME`): **DB에 저장돼 있지 않다.** 배지 발급 시 저장되는 건
  `triggered_by_strava_id`, `triggered_by_activity_name`, `triggered_by_distance_km`,
  `triggered_by_activity_date` 뿐이라, 공유 시점에 `triggered_by_strava_id`로 스트라바 API를
  재조회해야 한다(`lib/strava/api.ts`의 `getActivityById` 재사용, `moving_time`/`elapsed_time`에서
  페이스·시간 계산).
- POI 배지는 `user_poi_badge_earns`에서 트리거 활동 정보를 조회(반복 획득 구조, 최신 획득 기준).

## 8. 예외 처리

- **스트라바 토큰 만료/연동 해제**: 액티비티/POI 배지 공유 버튼을 비활성화하고 안내 문구를
  표시한다(아이템 배지는 스트라바 데이터가 없으므로 영향 없음).
- **Web Share API 미지원**: PNG 다운로드 링크로 대체.

## 9. 범위 밖 (이번 PRD에 포함하지 않음)

- 공유 이미지 서버사이드 캐싱/재사용
- 공유 통계·트래킹
- 배지 외 다른 컨텐츠(아이템북, 컬렉션 등)의 공유 기능 확장 — 필요해지면 별도 PRD

## 10. 관련 결정 이력

- `share_card_url` 필드 재사용 안 함 (신규 설계) — 클라이언트 생성·비캐싱 방식과 일관.
- 체크보드 미리보기 프레임은 서비스 전용 구현으로 시작, 다른 화면에서 재사용 수요가 생기면
  MODULAR 승격 재검토 (티켓 `20260821_003` 개선 리뷰 참고).
