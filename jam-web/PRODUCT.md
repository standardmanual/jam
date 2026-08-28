# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Strava를 쓰는 자전거/러닝/등산/걷기 활동자. 운동 후 저녁에 스마트폰으로 앱을 열어 확인하거나,
야외 활동 중 지도에서 주변 드랍 아이템을 확인한다. 4개 페르소나: 자전거 자출족(2030),
등산 인증샷러(3040), 러닝 크루(2030, 소셜 중심), 일상 걷기러(4050, 최대 DAU).

## Product Purpose

Strava 동기화 한 번으로 운동에 대한 의미 있는 보상(디지털 배지)을 자동 발급하고, 지도에서
아이템을 드랍·픽업하며 세계관 컬렉션을 완성하고, 믹스·미션·포인트로 게임 경제를 순환시키는
피지털 게이미피케이션 모바일 웹 앱. 기존 운동 트래킹 습관을 바꾸지 않고 "저녁에 앱을 열면
배지·아이템이 쌓여 있는" 보상 수확 경험을 제공하는 것이 성공 기준.

## Positioning

Tracker-less(자체 GPS 트래킹 없음, 기존 Strava 데이터 활용) + 배지 달성 시에만 구매 가능한
실물 자수 패치(피지털 커머스, 현재 배지 조건만 존재·D2C 연동 미구현)로 "운동 기록"이 아닌
"운동 보상"을 파는 위치.

## Operating Context

- 배지: 활동/아이템/POI 3개 축, 희귀도(common/rare/legend/mythic) 4단계, 미획득 배지 흐림 처리
- 인벤토리(50슬롯 그리드), 컬렉션(세계관별 슬롯), 믹스(재료 2~10개), 미션, JAM 포인트
- 드랍/픽업: 네이버 지도, 유저 드랍(30일 만료) + 시스템 앰비언트 드랍
- 어드민(`/admin`)은 데스크탑 우선, MODULAR 디자인 시스템 적용 대상 아님(서비스 전용 구현)
- 유저 화면은 모바일 웹 우선, MODULAR 디자인 시스템(`design-system/`) + Storybook 카탈로그 사용

## Capabilities and Constraints

- 희귀도 색상 매핑은 고정(common=black, rare=green, legend=purple, mythic=amber) — 유저가 이미
  학습한 색 언어이므로 재매핑 금지 (`design-system/components/cards/RarityBadge.prompt.md`)
- 배지/아이템 카드가 여러 화면에서 공유 컴포넌트로 재사용됨: `BadgeGridCard`(그리드),
  `ListRowCard`(리스트/아코디언), 이 외 `CollectionGridCard` 등. 한 컴포넌트의 시각 변경은
  배지 컬렉션·인벤토리·컬렉션 슬롯·프로필 피드·믹스·미션 상세 등 여러 화면에 동시 반영됨
- 플리마켓(P2P 거래), D2C 실물 패치 구매 플로우, 푸시 알림: 미구현
- 사용자 노출 텍스트는 `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 톤·용어 규칙을 따름

## Evidence on Hand

- 최신 PRD: `Service Plan/Specs/PRD/01_PRD.md` (2026-08-06 갱신, 라우트 전체 대조 기준)
- 문서 체계 갱신 규칙·화면 구성·성공 기준 전체가 위 PRD와 `Service Plan/` 하위 문서에 기재됨

## Product Principles

- 첫 배지 획득까지 마찰 제로(가입 → Strava 동기화 → 첫 배지)
- 희귀도 색 언어는 불변 — 사용자가 이미 학습한 신호를 흔들지 않는다
- 공유 카드 컴포넌트의 변경은 항상 다중 화면 파급을 전제로 검토한다
- 어드민은 MODULAR 적용 대상이 아니며 서비스 화면과 분리해 판단한다

<!-- 이 파일은 `Service Plan/Specs/PRD/01_PRD.md`에서 도출했습니다. 인터뷰 라운드 없이
     기존 PRD를 근거로 작성했음을 밝힙니다 — 필요시 사실을 정정해 주세요. -->
