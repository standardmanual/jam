-- 208: 아이템배지·컬렉션 문안의 실존 상표·인물·대회명·금기 소재 교체 (티켓 20260930_1517)
--
-- 판정: 윈터 모드 ② 전수 검수(컬렉션 100개·아이템배지 900종), 대체 문안: 윈터 모드 ③, 사용자 항목별 승인(2026-10-01).
-- 생성: 세션 스크래치 스크립트가 DB 현재값을 읽어 옛 값 가드와 되돌림 문장을 만들었다.
--
-- 갱신 조건: 칸의 현재 값이 옛 값과 정확히 같을 때만 바꾼다. 갱신한 칸 수가 112개가 아니면(어드민이 그사이 고친 칸이
-- 있으면) DO 블록이 예외를 내서 트랜잭션 전체가 되돌아간다. 다시 실행해도 이미 바뀐 칸은 옛 값과 달라 건수가 0이 되므로 바뀌지 않는다.
-- ⚠️ Supabase는 staging·프로덕션 공용 단일 DB다. 실행은 사용자 승인 뒤 메인 세션만 한다.

BEGIN;

CREATE TEMP TABLE _copy_fix (tbl TEXT NOT NULL, id UUID NOT NULL, col TEXT NOT NULL, old_value TEXT, new_value TEXT NOT NULL) ON COMMIT DROP;

INSERT INTO _copy_fix (tbl, id, col, old_value, new_value) VALUES
  ('item_books', '88aecafb-04e3-5a28-68ea-396f3c632fe0', 'name', '해장 라이딩의 끝', '새벽 라이딩 끝의 국밥'),
  ('item_books', '88aecafb-04e3-5a28-68ea-396f3c632fe0', 'description', '전날의 숙취를 두 발로 밀어내며 마침내 도달한 국밥집. 영혼마저 씻어내는 뜨거운 국물의 기록입니다.', '해 뜨기 전 새벽 어둠을 두 발로 밀어내며 마침내 도달한 국밥집. 영혼마저 씻어내는 뜨거운 국물의 기록입니다.'),
  ('item_books', '03d35a22-9c9d-f537-031e-89d45895a089', 'description', '자정의 네온사인 아래, 급하게 채우는 플라스틱 만찬. 10km를 뛴 후 맛보는 이 조촐한 식사는 미슐랭 3스타가 부럽지 않습니다.', '자정의 네온사인 아래, 급하게 채우는 플라스틱 만찬. 10km를 뛴 후 맛보는 이 조촐한 식사는 흰 식탁보 깔린 코스 요리가 부럽지 않습니다.'),
  ('badges', 'f42c9682-8dc8-401f-86c1-8f5b53404d3d', 'name', '수박바 막대기', '수박 아이스바 막대기'),
  ('badges', '2b21dc00-99da-4023-9861-ab5cbaf6546b', 'name', '포카리 페트병', '빈 이온음료 페트병'),
  ('badges', 'b4c2da9a-7a89-46fc-8676-3d65f60fbb97', 'name', '바나나맛 우유 뚜껑', '바나나 우유 은박 뚜껑'),
  ('badges', '34ce14f4-be0e-4b82-a708-28f7edb75da8', 'name', '터진 파워젤', '터진 에너지 젤'),
  ('badges', '3c641723-c758-4d60-8cdd-e7d321e2d0f2', 'name', '빈 헛개수 병', '빈 보리차 병'),
  ('badges', '3c641723-c758-4d60-8cdd-e7d321e2d0f2', 'description', '어제의 후회와 알코올을 땀으로 배출하며 갈구했던 구원의 음료. 구수한 냄새가 맴돕니다.', '새벽 찬 바람 속에서 국밥집까지 버티게 해준 구원의 음료. 구수한 냄새가 맴돕니다.'),
  ('badges', '78857d60-bd5a-426b-8ba0-e0d6ea76fe9b', 'description', '''뻥!'' 소리와 함께 탄생한 고소한 원반. 공기 반, 탄수화물 반으로 이루어진 기적의 다이어트 식품입니다.', '''뻥!'' 소리와 함께 탄생한 고소한 원반. 공기 반, 탄수화물 반으로 이루어진 기적의 바삭한 구름입니다.'),
  ('badges', '848729b0-9acd-4aac-b0fb-ffd588373a74', 'description', '스트레스를 단숨에 녹여버리는 마법의 붉은 소스. 라이딩 후 먹으면 칼로리가 0이 된다는 전설이 있습니다.', '스트레스를 단숨에 녹여버리는 마법의 붉은 소스. 라이딩 후 먹으면 소스 한 방울도 남길 수 없다는 전설이 있습니다.'),
  ('badges', 'fb938371-e895-4e02-b8c3-5dea3672f8d1', 'name', '막걸리병 뚜껑', '쌀 음료 병뚜껑'),
  ('badges', 'fb938371-e895-4e02-b8c3-5dea3672f8d1', 'description', '세차게 흔든 뒤 조심스럽게 탄산을 빼며 열었던 흰색 플라스틱 뚜껑. 막걸리의 짜릿함이 담겨있습니다.', '세차게 흔든 뒤 조심스럽게 거품을 달래며 열었던 흰색 플라스틱 뚜껑. 고소한 쌀 향이 담겨있습니다.'),
  ('badges', '11d10277-32b7-4de4-8f36-4c6646315315', 'description', '막걸리를 듬뿍 담아 마시다 빗물에 젖어 흐물흐물해진 종이컵. 운치가 느껴지는 파편입니다.', '쌀 음료를 듬뿍 담아 마시다 빗물에 젖어 흐물흐물해진 종이컵. 운치가 느껴지는 파편입니다.'),
  ('badges', 'd00496e8-3a18-479c-8147-f23f613a43f6', 'name', '찌그러진 막걸리 잔', '찌그러진 양은 잔'),
  ('badges', 'd00496e8-3a18-479c-8147-f23f613a43f6', 'description', '시끌벅적한 노포에서 누군가와 기분 좋게 부딪히며 건배를 외쳤던 흔적이 남아있는 양은 잔입니다.', '시끌벅적한 노포에서 쌀 음료를 가득 채워 누군가와 기분 좋게 부딪히며 웃음을 터뜨렸던 흔적이 남아있는 양은 잔입니다.'),
  ('badges', '4e100432-5b97-49cd-8da5-3d19502ac3cd', 'description', '맥주 안주로 제격인 고소하고 쌉싸름한 은행. 꼬치에서 탈출하여 데굴데굴 굴러다니고 있습니다.', '꼬치집 단골만 아는 고소하고 쌉싸름한 은행. 꼬치에서 탈출하여 데굴데굴 굴러다니고 있습니다.'),
  ('badges', '803a4fac-d6f4-408b-80de-e0c3b60cb2f7', 'name', '막걸리 앙금', '쌀 음료 앙금'),
  ('badges', '261bbd6c-aef0-4353-995a-134643a1bf13', 'description', '새벽 6시, 해장 라이딩을 무사히 마쳤음을 증명하는 영수증. ''특'' 사이즈를 주문한 위대함이 돋보입니다.', '새벽 6시, 첫 국밥을 향한 라이딩을 무사히 마쳤음을 증명하는 영수증. ''특'' 사이즈를 주문한 위대함이 돋보입니다.'),
  ('badges', 'd0506264-4ac3-4a84-8ba3-acae8efd0bf5', 'description', '술이 덜 깬다며 넣지 말라는 농담에도 아랑곳하지 않고 듬뿍 뿌렸던 고소한 가루들의 잔해입니다.', '국물 맛이 흐려진다며 넣지 말라는 농담에도 아랑곳하지 않고 듬뿍 뿌렸던 고소한 가루들의 잔해입니다.'),
  ('badges', 'd372e1f3-814b-4abf-9b32-57475e91967d', 'description', '용암처럼 끓어오르던 국밥을 품었던 검은 그릇의 조각. 해장 러닝의 종착지를 알리는 이정표입니다.', '용암처럼 끓어오르던 국밥을 품었던 검은 그릇의 조각. 새벽 라이딩의 종착지를 알리는 이정표입니다.'),
  ('badges', '0504520b-411e-4f03-8904-44742f9fca34', 'description', '빗소리를 듣자마자 파블로프의 개처럼 반응하여 구워낸 전. 오징어 다리가 삐죽 튀어나와 있습니다.', '빗소리를 듣자마자 조건반사처럼 반응하여 구워낸 전. 오징어 다리가 삐죽 튀어나와 있습니다.'),
  ('badges', '13069000-6544-4c92-8d4d-2bac482cd50c', 'name', '성에 낀 생맥주잔', '성에 낀 유리잔'),
  ('badges', 'd2e15408-37c3-4d7e-9df2-560ec40b1ee7', 'name', '버려진 츄르 비닐', '버려진 고양이 간식 비닐'),
  ('badges', 'd2e15408-37c3-4d7e-9df2-560ec40b1ee7', 'description', '츄르를 다 짜주지 않고 손가락에 묻혀 약올리던 인간을 응징하고 빼앗은 승리의 전리품입니다.', '간식을 다 짜주지 않고 손가락에 묻혀 약올리던 인간을 응징하고 빼앗은 승리의 전리품입니다.'),
  ('badges', '4cbd1eb3-719e-4c6c-8a92-1606e3fc918f', 'name', '부스러진 새우깡', '부스러진 새우 과자'),
  ('badges', '609ebc0f-0af2-4301-b8d2-e0cef059543f', 'description', '야외 테라스에서 밥을 먹다 길고양이에게 테러당한 G사 가방의 뜯겨나간 슬픈 부품입니다.', '야외 테라스에서 밥을 먹다 길고양이에게 테러당한 값비싼 가방의 뜯겨나간 슬픈 부품입니다.'),
  ('badges', '4b5cd6eb-611d-4b07-9691-324805f84830', 'name', '빼앗긴 츄르 껍질', '빼앗긴 고양이 간식 껍질'),
  ('badges', 'a295b2d9-0419-46e9-92ff-747ba38f8cd7', 'description', '맥주병 뚜껑. 둥지 인테리어의 화룡점정을 장식하기 위해 까치가 물고 가던 보물입니다.', '음료수 병뚜껑. 둥지 인테리어의 화룡점정을 장식하기 위해 까치가 물고 가던 보물입니다.'),
  ('badges', '666cc0a8-caa7-4551-8ca0-ad10c28e7b56', 'description', '쓰레기통을 뒤지다 눈이 마주친 순간, 뻔뻔하게 너구리 라면을 연상시키는 가면을 쓴 얼굴 털입니다.', '쓰레기통을 뒤지다 눈이 마주친 순간, 뻔뻔하게 가면무도회 손님인 척 시치미를 뗀 얼굴 털입니다.'),
  ('badges', '9899913e-e606-457c-a8cb-7b9966579df2', 'description', '길고양이 보스들을 단숨에 무장해제시키고 배를 뒤집게 만드는 마약 같은 향기의 허브 뭉치입니다.', '길고양이 보스들을 단숨에 무장해제시키고 배를 뒤집게 만드는, 한 번 맡으면 정신을 못 차리는 향기의 허브 뭉치입니다.'),
  ('badges', '7b48e2cb-9b0a-48c8-a073-243bc2528ffb', 'name', '진흙 묻은 고어텍스 조각', '진흙 묻은 방수 원단 조각'),
  ('badges', '2bea2de9-2da6-4a65-a7c9-6e6fc998020e', 'description', '대일밴드와 연고는 모두 사라지고 정체 모를 알약만 굴러다니는 생존 배낭 속 빨간 파우치입니다.', '반창고와 연고는 모두 사라지고 정체 모를 알약만 굴러다니는 생존 배낭 속 빨간 파우치입니다.'),
  ('badges', '1bf7cc77-44b6-4cb9-8665-07cef971b0e3', 'description', '초현실적인 스피드로 공간을 돌파할 때 시간의 저항을 이기지 못하고 살바도르 달리의 그림처럼 녹아버린 초침입니다.', '초현실적인 스피드로 공간을 돌파할 때 시간의 저항을 이기지 못하고 꿈속에서 본 시계처럼 흐물흐물 녹아버린 초침입니다.'),
  ('badges', 'aef317af-6e8a-40b2-8893-929f201d3f6d', 'description', '나무에서 떨어진 사과가 땅이 아닌 하늘을 향해 치솟다 나뭇가지에 걸려버린, 아이작 뉴턴이 오열할 만한 파편입니다.', '나무에서 떨어진 사과가 땅이 아닌 하늘을 향해 치솟다 나뭇가지에 걸려버린, 물리 교과서가 오열할 만한 파편입니다.'),
  ('badges', 'ae905965-0d21-4245-88b3-25b8f26d1eb1', 'description', '손바닥 위에 올려두면 슬그머니 허공으로 떠오르려 하는, 뉴턴의 사과를 비웃는 건방진 자갈입니다.', '손바닥 위에 올려두면 슬그머니 허공으로 떠오르려 하는, 만유인력을 비웃는 건방진 자갈입니다.'),
  ('badges', '11af9dc4-aa53-43a1-beac-4edd1538345e', 'name', '버려진 서낭당의 부적', '버려진 고갯길의 붉은 쪽지'),
  ('badges', '11af9dc4-aa53-43a1-beac-4edd1538345e', 'description', '길 잃은 자를 유인한다는 오래된 당산나무 밑에서 굴러다니던, 피처럼 붉은 글씨가 적힌 바스락거리는 종이입니다.', '길 잃은 자를 유인한다는 오래된 느티나무 밑에서 굴러다니던, 피처럼 붉은 글씨가 적힌 바스락거리는 종이입니다.'),
  ('item_books', 'add1460a-b2e0-e3c3-ef88-3faaaf098940', 'description', '길을 가다 마주친 러너와 플레이리스트를 에어드랍으로 교환한 훈훈한 소셜 네트워킹의 흔적.', '길을 가다 마주친 러너와 플레이리스트를 무선 전송으로 교환한 훈훈한 소셜 네트워킹의 흔적.'),
  ('item_books', '93c93225-cd68-8b93-a56d-f7494955ac01', 'description', '스트리밍을 거부하고 카세트 워크맨을 들고 달리는 레트로 마니아들의 늘어진 테이프 자국.', '스트리밍을 거부하고 휴대용 카세트 플레이어를 들고 달리는 레트로 마니아들의 늘어진 테이프 자국.'),
  ('badges', '33fe1e74-18c8-4111-a5a2-03876fbe66a1', 'name', '소니 워크맨 부품', '카세트 플레이어 부품'),
  ('badges', '9c26c0b2-54b2-4062-af9b-86be64bfe0b4', 'name', '에어드랍 연결음', '무선 전송 연결음'),
  ('badges', 'b97b217c-c472-4c00-b9f7-02771e57d523', 'description', '오늘 나의 완벽했던 달리기 분위기를 자랑하기 위해 인스타그램 스토리에 올릴 음악 재생 화면 스크린샷입니다.', '오늘 나의 완벽했던 달리기 분위기를 자랑하기 위해 SNS에 올릴 음악 재생 화면 스크린샷입니다.'),
  ('badges', '9b8de95d-1ce7-410c-a08a-d0cde5dc77bc', 'description', '재생하는 순간 다리가 제멋대로 미친 듯이 구르기 시작해 멈출 수 없게 만드는, 도핑 테스트에 걸려야 마땅한 마약 같은 음원 목록입니다.', '재생하는 순간 다리가 제멋대로 미친 듯이 구르기 시작해 멈출 수 없게 만드는, 반칙 휘슬이 울려야 마땅한 헤어나올 수 없는 늪 같은 음원 목록입니다.'),
  ('badges', '078ac64f-1754-4490-9cdf-cc78300311f1', 'description', '고통의 임계점을 넘은 순간, 음악과 호흡이 하나가 되어 몸 전체에 소름이 돋으며 쏟아지는 천연 마약입니다.', '고통의 임계점을 넘은 순간, 음악과 호흡이 하나가 되어 몸 전체에 소름이 돋으며 쏟아지는 몸속 천연 보너스입니다.'),
  ('badges', 'f07ab2db-9fb6-4457-bc75-5461f6b6d479', 'description', '어제 이태원 클럽에서 춤추다 찍힌 도장을 안 씻고 그대로 달리기 시작해, 땀에 번져 기괴한 문신이 되어버린 잉크 자국입니다.', '어제 클럽에서 춤추다 찍힌 도장을 안 씻고 그대로 달리기 시작해, 땀에 번져 기괴한 문신이 되어버린 잉크 자국입니다.'),
  ('badges', 'b301878f-2305-4ad8-a93e-acc8cc5d9866', 'description', '비 내리는 날 장엄한 베토벤 교향곡을 들으며 달리는 순간, 눈앞의 풍경이 한 편의 거대한 오케스트라 악보로 변하는 환각입니다.', '비 내리는 날 장엄한 고전 교향곡을 들으며 달리는 순간, 눈앞의 풍경이 한 편의 거대한 오케스트라 악보로 변하는 환각입니다.'),
  ('badges', '97b043fd-2a98-4e0d-8078-1cd72b4c13ad', 'name', '블루투스 페어링 신호', '이어폰 연결 신호'),
  ('badges', '97b043fd-2a98-4e0d-8078-1cd72b4c13ad', 'description', '페어링이 완료되었습니다''라는 기계음과 함께 비로소 달릴 준비가 끝났음을 알리는 뇌 속의 경쾌한 스위치입니다.', '''연결이 완료되었습니다''라는 기계음과 함께 비로소 달릴 준비가 끝났음을 알리는 뇌 속의 경쾌한 스위치입니다.'),
  ('item_books', '918d9a0a-ce3d-0044-8f55-c6dff8d627ac', 'description', '불타는 단풍나무 아래로 자전거를 타고 달리는 인생 영상을 건지기 위해 고프로를 달고 달린 자들입니다.', '불타는 단풍나무 아래로 자전거를 타고 달리는 인생 영상을 건지기 위해 액션캠을 달고 달린 자들입니다.'),
  ('badges', 'f8178059-866c-40ec-ade6-74866ef2ece4', 'name', '고프로 마운트 나사', '액션캠 마운트 나사'),
  ('badges', 'bc18f4d7-7fa0-45e8-b3bd-1ef79e42ddef', 'name', '다 쓴 코닥 필름통', '다 쓴 노란 필름통'),
  ('badges', '4b07ef6e-a48b-4d85-a778-8fe6b1c1695e', 'name', '블루투스 리모컨', '무선 셔터 리모컨'),
  ('item_books', 'c79fc13c-4edc-a47e-75b6-5aa613958116', 'description', '최신 스마트폰 카메라 대신 낡은 폴라로이드나 일회용 카메라로 풍경을 담은 따뜻한 흔적들.', '최신 스마트폰 카메라 대신 낡은 즉석카메라나 일회용 카메라로 풍경을 담은 따뜻한 흔적들.'),
  ('badges', '62a88abc-5263-4ea4-89a4-5f28f4ba02ee', 'name', '빛바랜 폴라로이드 사진', '빛바랜 즉석사진'),
  ('badges', 'd9b3002b-f38a-44f7-a78e-daf83dfc46fb', 'description', '''1998년 첫 하프 마라톤''. 빛바랜 모나미 볼펜으로 꾹꾹 눌러쓴 누군가의 벅찬 성취감이 묻어나는 뒷면입니다.', '''1998년 첫 하프 마라톤''. 빛바랜 볼펜 잉크로 꾹꾹 눌러쓴 누군가의 벅찬 성취감이 묻어나는 뒷면입니다.'),
  ('badges', '1e33abae-8816-45e2-b6de-642320a59bb5', 'description', '10년 전 춘천 마라톤에서 달고 뛰었던, 땀에 전 자국과 핀 구멍 4개가 선명하게 남아있는 영광의 종이입니다.', '10년 전 어느 마라톤 대회에서 달고 뛰었던, 땀에 전 자국과 핀 구멍 4개가 선명하게 남아있는 영광의 종이입니다.'),
  ('badges', '5a2b6bfa-3455-4ab0-8df5-198e12dab542', 'description', '누구누구의 집이라고 자랑스럽게 걸려있었으나 포크레인에 의해 박살 나버린 청동 재질의 이름표 파편입니다.', '누구누구의 집이라고 자랑스럽게 걸려있었으나 굴착기에 의해 박살 나버린 청동 재질의 이름표 파편입니다.'),
  ('badges', '4ab242df-40b2-4909-b068-b6cbd7cc9d89', 'description', '포크레인이 들어오기 전날, 아날로그 카메라로 황급히 담아낸 익숙하고도 낯선 우리 동네의 마지막 영정 사진입니다.', '굴착기가 들어오기 전날, 아날로그 카메라로 황급히 담아낸 익숙하고도 낯선 우리 동네의 마지막 영정 사진입니다.'),
  ('badges', '1462bbb0-83e2-49e1-9f1a-12025b912889', 'description', '모양과 색이 너무 완벽한 빈티지 코카콜라 뚜껑. 가방에 달아두면 완벽한 레트로 룩이 완성됩니다.', '모양과 색이 너무 완벽한 빈티지 탄산음료 병뚜껑. 가방에 달아두면 완벽한 레트로 룩이 완성됩니다.'),
  ('badges', '74ed5318-a262-4ca0-a8d7-e9bff93b772e', 'description', '''J.H''라는 글자가 각인된 은빛 지포 라이터. 기름은 다 말랐지만 딸깍거리는 뚜껑 소리만큼은 명쾌합니다.', '''J.H''라는 글자가 각인된 은빛 오일 라이터. 기름은 다 말랐지만 딸깍거리는 뚜껑 소리만큼은 명쾌합니다.'),
  ('item_books', '6d5e8172-a74c-8b22-7952-7ff95ea566af', 'description', '최후의 만찬이라며 치킨을 시켜 먹고, 항상 다이어트는 ''내일''부터라고 외치는 평행우주의 반복.', '오늘이 마지막이라며 치킨을 시켜 먹고, 항상 다이어트는 ''내일''부터라고 외치는 평행우주의 반복.'),
  ('item_books', '989fc342-1d1d-4b82-657d-81a7190df782', 'description', '운동화 끈을 묶고 유튜브 쇼츠를 하나만 보려다, 결국 2시간 동안 소파에 앉아있던 허무한 시간.', '운동화 끈을 묶고 짧은 영상을 하나만 보려다, 결국 2시간 동안 소파에 앉아있던 허무한 시간.'),
  ('badges', '288302fa-23f4-403d-9902-439e70f299e9', 'name', '장비 자랑용 인스타 캡처', '장비 자랑용 게시물 캡처'),
  ('badges', '288302fa-23f4-403d-9902-439e70f299e9', 'description', '산에는 안 갔지만 장비 세팅만큼은 엄홍길 대장님 부럽지 않은, #등산스타그램 태그가 달린 허세 가득한 사진입니다.', '산에는 안 갔지만 장비 세팅만큼은 베테랑 산악 대장님 부럽지 않은, #등산룩 태그가 달린 허세 가득한 사진입니다.'),
  ('badges', 'dc4f9362-6dc4-447d-b80d-7fc9df7402b9', 'name', '택도 안 뗀 고어텍스 자켓', '택도 안 뗀 방수 자켓'),
  ('badges', '99cee59c-6d44-4f2c-8dfc-df6e0edccee6', 'description', '매일 밤 잠들기 전 ''내일은 무조건 뛴다''고 적어두지만, 아침이 되면 거짓말처럼 기억에서 삭제되는 마법의 포스트잇입니다.', '매일 밤 잠들기 전 ''내일은 무조건 뛴다''고 적어두지만, 아침이 되면 거짓말처럼 기억에서 삭제되는 마법의 접착 메모지입니다.'),
  ('badges', '45ddecba-90f6-4969-8f94-1116406163fe', 'description', '소파에 누워 넷플릭스를 고르느라 손에서 리모컨이 떨어지지 않는, 사이보그화가 진행 중인 기괴한 파편입니다.', '소파에 누워 볼 영상을 고르느라 손에서 리모컨이 떨어지지 않는, 사이보그화가 진행 중인 기괴한 파편입니다.'),
  ('badges', '1c0d7af4-4aeb-42ea-a253-1c2ac15f5f39', 'description', '하루 10분 전신 박살''이라는 유튜브 썸네일만 쳐다봐도 이미 살이 빠진 것 같은 착각을 유발하는 이미지입니다.', '''하루 10분 전신 박살''이라는 영상 썸네일만 쳐다봐도 이미 살이 빠진 것 같은 착각을 유발하는 이미지입니다.'),
  ('badges', '4e09891d-db67-4f34-ae20-8dbe4c39ac12', 'name', '유튜브 쇼츠 재생 버튼 조각', '짧은 영상 재생 버튼 조각'),
  ('badges', '913d38f2-6453-4a37-b246-2ad7ba8fed4f', 'description', '러닝 앱 대신 배달의 민족을 켜고 야식을 고르다 획득한, 운동의 의지를 완벽하게 꺾어버리는 할인권입니다.', '러닝 앱 대신 배달 앱을 켜고 야식을 고르다 획득한, 운동의 의지를 완벽하게 꺾어버리는 할인권입니다.'),
  ('badges', '590687db-3c2b-4505-80c9-4f8c3890c899', 'description', '회원님, 요즘 왜 안 오시나요? ㅠㅠ''라며 죄책감을 유발하는, 스팸 문자보다 무서운 카카오톡 메시지입니다.', '''회원님, 요즘 왜 안 오시나요? ㅠㅠ''라며 죄책감을 유발하는, 스팸 문자보다 무서운 메신저 메시지입니다.'),
  ('badges', '3925e6f8-10fb-465d-a6c3-4f3ccfde89c9', 'name', '최후의 만찬 영수증', '마지막 식사 영수증'),
  ('badges', '3925e6f8-10fb-465d-a6c3-4f3ccfde89c9', 'description', '매일 밤이 ''다이어트 전 마지막 식사''라며 족발, 보쌈, 엽떡을 번갈아 시켜 먹어 탄생한 기적의 카드 내역서입니다.', '매일 밤이 ''다이어트 전 마지막 식사''라며 족발, 보쌈, 매운 떡볶이를 번갈아 시켜 먹어 탄생한 기적의 카드 내역서입니다.'),
  ('badges', '980e88bf-4794-4b97-98b9-f4843aa1d0f4', 'description', '프로틴 쉐이크 대신 오늘 하루의 스트레스를 날려줄 차가운 알코올의 봉인을 해제한 은빛 금속 파편입니다.', '프로틴 쉐이크를 챙기려던 저녁, ''오늘만 봐주자''며 운동 계획의 봉인을 풀어버리고 회식 자리에 나뒹구는 은빛 금속 파편입니다.'),
  ('badges', 'a7eac3be-78ed-4616-a95d-38a40f14be57', 'description', '한 번 엉덩이를 대면 블랙홀처럼 몸을 빨아들여 절대 일어날 수 없게 만드는 치명적인 마약 쿠션의 파편입니다.', '한 번 엉덩이를 대면 블랙홀처럼 몸을 빨아들여 절대 일어날 수 없게 만드는 치명적인 끈끈이 쿠션의 파편입니다.'),
  ('badges', '91f41826-f3fe-4125-ad36-7ab93e812ad7', 'name', '건배사의 파동', '회식 구호의 파동'),
  ('badges', '91f41826-f3fe-4125-ad36-7ab93e812ad7', 'description', '우리의 건강을 위하여!''라며 술잔을 부딪치는, 헬스장과는 거리가 먼 모순적이고도 유쾌한 외침입니다.', '''우리의 건강을 위하여!''라며 삼겹살 불판 앞에서 합창하는, 헬스장과는 거리가 먼 모순적이고도 유쾌한 외침입니다.'),
  ('badges', '7e89e4c8-6c60-402f-9ce4-04ba22370b85', 'description', '소주 3병을 마신 뒤 불타는 얼굴로 ''내일은 아침에 헬스장 간다''고 외치는, 아무도 믿지 않는 취중 진담입니다.', '회식 자리에서 세 시간을 버틴 뒤 불타는 얼굴로 ''내일은 아침에 헬스장 간다''고 외치는, 아무도 믿지 않는 호언장담입니다.'),
  ('item_books', '31b5587e-d58e-3630-06d9-8a7665ba2ad0', 'name', '당근의 잠복자', '중고장터의 잠복자'),
  ('badges', '985434d8-92cb-48c3-b3e1-018976b89d94', 'description', '당근~'' 하는 소리와 함께 심박수를 150으로 끌어올리는 알림. 원하던 꿀매물이 떴을 때 발생하는 파블로프의 종소리입니다.', '''띠링~'' 하는 소리와 함께 심박수를 150으로 끌어올리는 알림. 원하던 꿀매물이 떴을 때 발생하는 조건반사의 종소리입니다.'),
  ('badges', '27dafd4a-e1e3-4118-97ab-f56c4bd1014d', 'description', '이거 당근에서 10만 원 주고 산 거야''라는 새빨간 거짓말을 지키기 위해 책갈피 깊숙이 숨겨둔 150만 원짜리 영수증입니다.', '''이거 중고로 10만 원 주고 산 거야''라는 새빨간 거짓말을 지키기 위해 책갈피 깊숙이 숨겨둔 150만 원짜리 영수증입니다.'),
  ('badges', '681dfe1e-59cb-46c4-abbd-fce4aeb71e3c', 'description', '다이소 퐁퐁을 써도 되지만, 무조건 ''바이크 전용''이라고 적힌 비싼 핑크색 용액을 고집하는 자들의 사치품입니다.', '천 원짜리 주방 세제를 써도 되지만, 무조건 ''바이크 전용''이라고 적힌 비싼 핑크색 용액을 고집하는 자들의 사치품입니다.'),
  ('badges', 'ed9d8c6a-58a1-4703-9a65-1cb7e5c2c2cd', 'name', '언박싱 유튜브 대본', '언박싱 영상 대본'),
  ('badges', 'ed9d8c6a-58a1-4703-9a65-1cb7e5c2c2cd', 'description', '나도 장비 리뷰 유튜버가 되겠다며 야심 차게 카메라를 켰으나, 결국 혼자 흥분해서 소리 지르다 끝난 영상의 흔적입니다.', '나도 장비 리뷰 크리에이터가 되겠다며 야심 차게 카메라를 켰으나, 결국 혼자 흥분해서 소리 지르다 끝난 영상의 흔적입니다.'),
  ('badges', '89ff2c44-ef55-4b84-af46-bd8dfd8f2860', 'description', '바람을 가르기 위해 헬멧 앞에 장착한 바이저. 마치 다스베이더나 사이보그처럼 보이게 만들어 시선을 강탈합니다.', '바람을 가르기 위해 헬멧 앞에 장착한 바이저. 마치 SF 영화 속 악당이나 사이보그처럼 보이게 만들어 시선을 강탈합니다.'),
  ('item_books', '5891a1e4-cdf5-ab89-ec23-eb03433a9fb1', 'name', '숙취와 포션', '녹초와 포션'),
  ('item_books', '5891a1e4-cdf5-ab89-ec23-eb03433a9fb1', 'description', '전날 마신 술을 땀으로 빼겠다며 달리기 시작했으나, 결국 해장 포션만 찾아 헤맨 슬픈 영혼.', '전날 한계까지 달려 녹초가 된 몸으로 눈을 떴으나, 결국 회복 포션만 찾아 헤맨 슬픈 영혼.'),
  ('item_books', '3b22f8f3-4fb6-6719-afb1-4f1c3f74093d', 'name', '불법 부스터 배합', '봉인된 연금술 배합'),
  ('badges', 'd85e3721-936e-4a96-9732-4b493cb52d4f', 'description', '차가운 포카리스웨트를 마시다 턱을 타고 목덜미로 흘러내린, 아까워서 핥아먹고 싶은 단 한 방울의 이온 음료입니다.', '차가운 이온 음료를 마시다 턱을 타고 목덜미로 흘러내린, 아까워서 핥아먹고 싶은 단 한 방울의 생명수입니다.'),
  ('badges', '396d2e46-a3a7-4030-a5d6-be26bb22fc86', 'description', '불법(?) 배합의 부작용으로 찾아온 속쓰림을 잠재우기 위해 다급하게 까먹은 하얀 제산제 껍데기입니다.', '봉인된(?) 배합의 후폭풍으로 찾아온 속쓰림을 잠재우기 위해 다급하게 까먹은 하얀 제산제 껍데기입니다.'),
  ('badges', '985e1772-a08b-44ea-b78e-41a277d6d7f1', 'description', 'BCAA, 아르기닌, 크레아틴을 섞어 만들었으나, 색깔만 보면 독극물로 오해받기 딱 좋은 자작 부스터입니다.', '온갖 가루를 눈대중으로 섞어 만들었으나, 색깔만 보면 독극물로 오해받기 딱 좋은 자작 부스터입니다.'),
  ('badges', '40655d4d-ff5b-42db-8ecc-6a2f07ae468e', 'description', '하루 1병 이상 섭취 금지''라고 적혀 있으나, 기록 단축을 위해 가볍게 무시해버린 강력한 보충제의 라벨입니다.', '''사용 전 주의사항을 확인하세요''라고 적혀 있으나, 기록 단축에 눈이 멀어 읽을 틈 없이 땀에 번져 버린 보충제의 라벨입니다.'),
  ('badges', 'f8a4ba87-6f40-46f7-b936-51d4a4412079', 'description', '면역력이 떨어지면 다음 날 운동을 못한다는 공포심에 매일 3천 밀리그램씩 털어 넣는 시큼한 결정체입니다.', '면역력이 떨어지면 다음 날 운동을 못한다는 공포심에 매일 빠짐없이 털어 넣는 시큼한 결정체입니다.'),
  ('badges', 'a44989b1-2aee-4f3c-8e52-b2c2c5ba174b', 'description', '폐에 산소가 부족해 헉헉댈 때, 비강과 기도를 강제로 확장시켜 숨을 쉬게 해주는 독한 민트의 냄새입니다.', '폐에 산소가 부족해 헉헉댈 때, 코끝을 찌르며 숨통이 트이는 듯한 착각을 선사하는 독한 민트의 냄새입니다.'),
  ('badges', 'b4759776-9cec-44ec-aa40-427306ba9099', 'name', '간 기능 회복의 기도', '피로 회복의 기도'),
  ('badges', 'b4759776-9cec-44ec-aa40-427306ba9099', 'description', '페달을 한 번 밟을 때마다 알코올이 1ml씩 배출되기를 간절히 바라는, 연금술사의 처절한 종교적 의식입니다.', '페달을 한 번 밟을 때마다 어제의 피로가 한 겹씩 벗겨지기를 간절히 바라는, 연금술사의 처절한 종교적 의식입니다.'),
  ('badges', 'eb32276d-71af-4fd0-a376-c29045ba5f96', 'description', '아무리 물을 마셔도 해소되지 않는, 알코올이 체내 수분을 쥐어짜며 만들어낸 입속의 끔찍한 모래사장입니다.', '아무리 물을 마셔도 해소되지 않는, 녹초가 된 몸이 마지막 수분까지 쥐어짜며 만들어낸 입속의 끔찍한 모래사장입니다.'),
  ('badges', '8afd360c-f54d-438c-8bd6-b1ac70755118', 'description', '알코올로 수분이 말라버린 뇌에 당분을 억지로 쑤셔 넣기 위해 온장고에서 발굴해 낸 따뜻한 생명수입니다.', '녹초가 되어 텅 빈 머리에 당분을 억지로 쑤셔 넣기 위해 온장고에서 발굴해 낸 따뜻한 생명수입니다.'),
  ('badges', '03a5d847-936b-4f14-8ffd-f4d946c8b8fe', 'description', '심장 박동이 빨라질 때마다 뇌를 망치로 때리는 듯한 숙취의 고통을 잠재우려 물 없이 삼킨 하얀 구원자입니다.', '심장 박동이 빨라질 때마다 뇌를 망치로 때리는 듯한, 어제의 무리가 남긴 두통을 잠재워 줄 거라 믿고 삼킨 하얀 구원자입니다.'),
  ('badges', '5e28e0c3-83b4-43aa-9efc-55f300112aad', 'name', '숙취 해소제 병뚜껑', '회복 드링크 병뚜껑'),
  ('badges', '5e28e0c3-83b4-43aa-9efc-55f300112aad', 'description', '어제 마신 폭탄주를 해독하겠다며 라이딩 시작 전 편의점에서 급하게 들이켠 골드 컬러의 뚜껑입니다.', '어제의 피로를 털어내겠다며 라이딩 시작 전 편의점에서 급하게 들이켠 드링크의 골드 컬러 병뚜껑입니다.'),
  ('badges', '173d5fb4-6993-4c07-8938-0351c3270dfb', 'description', '다시는 운동 전날 술을 마시지 않겠다''는 100번째 거짓 맹세가 담긴, 땀과 알코올이 섞인 끈적한 파동입니다.', '''다시는 어제처럼 무리하지 않겠다''는 100번째 거짓 맹세가 담긴, 땀과 한숨이 섞인 끈적한 파동입니다.'),
  ('badges', 'e0ab960a-4312-43ad-a74b-fd1af741f8e6', 'name', '해장국집 간판 불빛', '국밥집 간판 불빛'),
  ('badges', 'e0ab960a-4312-43ad-a74b-fd1af741f8e6', 'description', '고통스러운 해장 러닝의 끝에 신기루처럼 나타난, 뜨끈한 국물로 모든 죄악을 씻어줄 구원의 붉은 네온사인입니다.', '고통스러운 러닝의 끝에 신기루처럼 나타난, 뜨끈한 국물로 모든 허기와 피로를 달래줄 구원의 붉은 네온사인입니다.'),
  ('badges', 'c9e38cd8-cf00-4536-a925-02d9ac71eeee', 'name', '헛개수 티백', '구수한 곡물차 티백'),
  ('badges', 'c9e38cd8-cf00-4536-a925-02d9ac71eeee', 'description', '땀을 흘려 술을 빼겠다는 위험한 발상으로 물통 가득 진하게 우려낸 구수한 간 해독의 결정체입니다.', '녹초가 된 몸을 달래 보겠다는 연금술사다운 집념으로 물통 가득 진하게 우려낸 구수한 위로의 결정체입니다.'),
  ('badges', '870233e1-b1f4-463e-9344-10a39dd9162e', 'description', '어제의 숙취가 완전히 깨지 않아, 앞사람의 뒷바퀴가 두 개로 겹쳐 보이는 아찔하고도 몽환적인 시각적 오류입니다.', '어제의 피로가 완전히 풀리지 않아, 앞사람의 뒷바퀴가 두 개로 겹쳐 보이는 아찔하고도 몽환적인 시각적 오류입니다.'),
  ('badges', '3ab9a525-d646-4e7c-97d1-dbe88163fabb', 'name', '터져버린 파워젤', '터져버린 에너지 젤'),
  ('badges', '4485e305-73c0-4c9b-996d-62ec478eae1a', 'description', '커피 10잔 분량의 각성 효과를 한 알에 응축시킨, 연금술사들의 합법적 도핑 흔적이 남은 빈 캡슐입니다.', '잠을 쫓는 마법을 한 알에 응축시켰다고 굳게 믿는 연금술사들의, 합법적 도핑 흔적이 남은 빈 캡슐입니다.'),
  ('badges', 'f33306de-efc3-4a1c-afe2-f7871e9cf527', 'description', '한계를 넘은 대가로 찾아온 근육통을 견디지 못하고 약국의 힘을 빌려 남용해버린 하얀색 약통입니다.', '한계를 넘은 대가로 찾아온 근육통을 달래려 설명서대로만 먹고 비워 낸, 연금술사답지 않게 얌전한 하얀색 약통입니다.'),
  ('badges', '2fc31d85-ace1-4783-8e2e-e4f4188063e1', 'description', '젖산을 분해하고 숙면을 도와준다는 유튜브 광고를 맹신하여 비싼 돈 주고 직구한 시큼한 붉은 묘약입니다.', '회복에 좋다는 인터넷 광고를 맹신하여 비싼 돈 주고 직구한, 시큼하다 못해 눈이 질끈 감기는 붉은 묘약입니다.');

DO $do$
DECLARE n INT; total INT := 0;
BEGIN
  UPDATE public.badges t SET name = f.new_value FROM _copy_fix f WHERE f.tbl = 'badges' AND f.col = 'name' AND t.id = f.id AND t.name IS NOT DISTINCT FROM f.old_value; GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  UPDATE public.badges t SET description = f.new_value FROM _copy_fix f WHERE f.tbl = 'badges' AND f.col = 'description' AND t.id = f.id AND t.description IS NOT DISTINCT FROM f.old_value; GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  UPDATE public.item_books t SET name = f.new_value FROM _copy_fix f WHERE f.tbl = 'item_books' AND f.col = 'name' AND t.id = f.id AND t.name IS NOT DISTINCT FROM f.old_value; GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  UPDATE public.item_books t SET description = f.new_value FROM _copy_fix f WHERE f.tbl = 'item_books' AND f.col = 'description' AND t.id = f.id AND t.description IS NOT DISTINCT FROM f.old_value; GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  UPDATE public.item_books t SET story_text = f.new_value FROM _copy_fix f WHERE f.tbl = 'item_books' AND f.col = 'story_text' AND t.id = f.id AND t.story_text IS NOT DISTINCT FROM f.old_value; GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
  IF total <> 112 THEN
    RAISE EXCEPTION '갱신 칸 수 %, 기대 112: 옛 값이 달라진 칸이 있어 전체를 되돌린다', total;
  END IF;
  RAISE NOTICE '갱신 칸 수 % (기대 112)', total;
END
$do$;

COMMIT;

-- 되돌림 SQL
-- 새 값이 그대로일 때만 옛 값으로 되돌린다.
-- UPDATE public.item_books SET name = '해장 라이딩의 끝' WHERE id = '88aecafb-04e3-5a28-68ea-396f3c632fe0' AND name = '새벽 라이딩 끝의 국밥';
-- UPDATE public.item_books SET description = '전날의 숙취를 두 발로 밀어내며 마침내 도달한 국밥집. 영혼마저 씻어내는 뜨거운 국물의 기록입니다.' WHERE id = '88aecafb-04e3-5a28-68ea-396f3c632fe0' AND description = '해 뜨기 전 새벽 어둠을 두 발로 밀어내며 마침내 도달한 국밥집. 영혼마저 씻어내는 뜨거운 국물의 기록입니다.';
-- UPDATE public.item_books SET description = '자정의 네온사인 아래, 급하게 채우는 플라스틱 만찬. 10km를 뛴 후 맛보는 이 조촐한 식사는 미슐랭 3스타가 부럽지 않습니다.' WHERE id = '03d35a22-9c9d-f537-031e-89d45895a089' AND description = '자정의 네온사인 아래, 급하게 채우는 플라스틱 만찬. 10km를 뛴 후 맛보는 이 조촐한 식사는 흰 식탁보 깔린 코스 요리가 부럽지 않습니다.';
-- UPDATE public.badges SET name = '수박바 막대기' WHERE id = 'f42c9682-8dc8-401f-86c1-8f5b53404d3d' AND name = '수박 아이스바 막대기';
-- UPDATE public.badges SET name = '포카리 페트병' WHERE id = '2b21dc00-99da-4023-9861-ab5cbaf6546b' AND name = '빈 이온음료 페트병';
-- UPDATE public.badges SET name = '바나나맛 우유 뚜껑' WHERE id = 'b4c2da9a-7a89-46fc-8676-3d65f60fbb97' AND name = '바나나 우유 은박 뚜껑';
-- UPDATE public.badges SET name = '터진 파워젤' WHERE id = '34ce14f4-be0e-4b82-a708-28f7edb75da8' AND name = '터진 에너지 젤';
-- UPDATE public.badges SET name = '빈 헛개수 병' WHERE id = '3c641723-c758-4d60-8cdd-e7d321e2d0f2' AND name = '빈 보리차 병';
-- UPDATE public.badges SET description = '어제의 후회와 알코올을 땀으로 배출하며 갈구했던 구원의 음료. 구수한 냄새가 맴돕니다.' WHERE id = '3c641723-c758-4d60-8cdd-e7d321e2d0f2' AND description = '새벽 찬 바람 속에서 국밥집까지 버티게 해준 구원의 음료. 구수한 냄새가 맴돕니다.';
-- UPDATE public.badges SET description = '''뻥!'' 소리와 함께 탄생한 고소한 원반. 공기 반, 탄수화물 반으로 이루어진 기적의 다이어트 식품입니다.' WHERE id = '78857d60-bd5a-426b-8ba0-e0d6ea76fe9b' AND description = '''뻥!'' 소리와 함께 탄생한 고소한 원반. 공기 반, 탄수화물 반으로 이루어진 기적의 바삭한 구름입니다.';
-- UPDATE public.badges SET description = '스트레스를 단숨에 녹여버리는 마법의 붉은 소스. 라이딩 후 먹으면 칼로리가 0이 된다는 전설이 있습니다.' WHERE id = '848729b0-9acd-4aac-b0fb-ffd588373a74' AND description = '스트레스를 단숨에 녹여버리는 마법의 붉은 소스. 라이딩 후 먹으면 소스 한 방울도 남길 수 없다는 전설이 있습니다.';
-- UPDATE public.badges SET name = '막걸리병 뚜껑' WHERE id = 'fb938371-e895-4e02-b8c3-5dea3672f8d1' AND name = '쌀 음료 병뚜껑';
-- UPDATE public.badges SET description = '세차게 흔든 뒤 조심스럽게 탄산을 빼며 열었던 흰색 플라스틱 뚜껑. 막걸리의 짜릿함이 담겨있습니다.' WHERE id = 'fb938371-e895-4e02-b8c3-5dea3672f8d1' AND description = '세차게 흔든 뒤 조심스럽게 거품을 달래며 열었던 흰색 플라스틱 뚜껑. 고소한 쌀 향이 담겨있습니다.';
-- UPDATE public.badges SET description = '막걸리를 듬뿍 담아 마시다 빗물에 젖어 흐물흐물해진 종이컵. 운치가 느껴지는 파편입니다.' WHERE id = '11d10277-32b7-4de4-8f36-4c6646315315' AND description = '쌀 음료를 듬뿍 담아 마시다 빗물에 젖어 흐물흐물해진 종이컵. 운치가 느껴지는 파편입니다.';
-- UPDATE public.badges SET name = '찌그러진 막걸리 잔' WHERE id = 'd00496e8-3a18-479c-8147-f23f613a43f6' AND name = '찌그러진 양은 잔';
-- UPDATE public.badges SET description = '시끌벅적한 노포에서 누군가와 기분 좋게 부딪히며 건배를 외쳤던 흔적이 남아있는 양은 잔입니다.' WHERE id = 'd00496e8-3a18-479c-8147-f23f613a43f6' AND description = '시끌벅적한 노포에서 쌀 음료를 가득 채워 누군가와 기분 좋게 부딪히며 웃음을 터뜨렸던 흔적이 남아있는 양은 잔입니다.';
-- UPDATE public.badges SET description = '맥주 안주로 제격인 고소하고 쌉싸름한 은행. 꼬치에서 탈출하여 데굴데굴 굴러다니고 있습니다.' WHERE id = '4e100432-5b97-49cd-8da5-3d19502ac3cd' AND description = '꼬치집 단골만 아는 고소하고 쌉싸름한 은행. 꼬치에서 탈출하여 데굴데굴 굴러다니고 있습니다.';
-- UPDATE public.badges SET name = '막걸리 앙금' WHERE id = '803a4fac-d6f4-408b-80de-e0c3b60cb2f7' AND name = '쌀 음료 앙금';
-- UPDATE public.badges SET description = '새벽 6시, 해장 라이딩을 무사히 마쳤음을 증명하는 영수증. ''특'' 사이즈를 주문한 위대함이 돋보입니다.' WHERE id = '261bbd6c-aef0-4353-995a-134643a1bf13' AND description = '새벽 6시, 첫 국밥을 향한 라이딩을 무사히 마쳤음을 증명하는 영수증. ''특'' 사이즈를 주문한 위대함이 돋보입니다.';
-- UPDATE public.badges SET description = '술이 덜 깬다며 넣지 말라는 농담에도 아랑곳하지 않고 듬뿍 뿌렸던 고소한 가루들의 잔해입니다.' WHERE id = 'd0506264-4ac3-4a84-8ba3-acae8efd0bf5' AND description = '국물 맛이 흐려진다며 넣지 말라는 농담에도 아랑곳하지 않고 듬뿍 뿌렸던 고소한 가루들의 잔해입니다.';
-- UPDATE public.badges SET description = '용암처럼 끓어오르던 국밥을 품었던 검은 그릇의 조각. 해장 러닝의 종착지를 알리는 이정표입니다.' WHERE id = 'd372e1f3-814b-4abf-9b32-57475e91967d' AND description = '용암처럼 끓어오르던 국밥을 품었던 검은 그릇의 조각. 새벽 라이딩의 종착지를 알리는 이정표입니다.';
-- UPDATE public.badges SET description = '빗소리를 듣자마자 파블로프의 개처럼 반응하여 구워낸 전. 오징어 다리가 삐죽 튀어나와 있습니다.' WHERE id = '0504520b-411e-4f03-8904-44742f9fca34' AND description = '빗소리를 듣자마자 조건반사처럼 반응하여 구워낸 전. 오징어 다리가 삐죽 튀어나와 있습니다.';
-- UPDATE public.badges SET name = '성에 낀 생맥주잔' WHERE id = '13069000-6544-4c92-8d4d-2bac482cd50c' AND name = '성에 낀 유리잔';
-- UPDATE public.badges SET name = '버려진 츄르 비닐' WHERE id = 'd2e15408-37c3-4d7e-9df2-560ec40b1ee7' AND name = '버려진 고양이 간식 비닐';
-- UPDATE public.badges SET description = '츄르를 다 짜주지 않고 손가락에 묻혀 약올리던 인간을 응징하고 빼앗은 승리의 전리품입니다.' WHERE id = 'd2e15408-37c3-4d7e-9df2-560ec40b1ee7' AND description = '간식을 다 짜주지 않고 손가락에 묻혀 약올리던 인간을 응징하고 빼앗은 승리의 전리품입니다.';
-- UPDATE public.badges SET name = '부스러진 새우깡' WHERE id = '4cbd1eb3-719e-4c6c-8a92-1606e3fc918f' AND name = '부스러진 새우 과자';
-- UPDATE public.badges SET description = '야외 테라스에서 밥을 먹다 길고양이에게 테러당한 G사 가방의 뜯겨나간 슬픈 부품입니다.' WHERE id = '609ebc0f-0af2-4301-b8d2-e0cef059543f' AND description = '야외 테라스에서 밥을 먹다 길고양이에게 테러당한 값비싼 가방의 뜯겨나간 슬픈 부품입니다.';
-- UPDATE public.badges SET name = '빼앗긴 츄르 껍질' WHERE id = '4b5cd6eb-611d-4b07-9691-324805f84830' AND name = '빼앗긴 고양이 간식 껍질';
-- UPDATE public.badges SET description = '맥주병 뚜껑. 둥지 인테리어의 화룡점정을 장식하기 위해 까치가 물고 가던 보물입니다.' WHERE id = 'a295b2d9-0419-46e9-92ff-747ba38f8cd7' AND description = '음료수 병뚜껑. 둥지 인테리어의 화룡점정을 장식하기 위해 까치가 물고 가던 보물입니다.';
-- UPDATE public.badges SET description = '쓰레기통을 뒤지다 눈이 마주친 순간, 뻔뻔하게 너구리 라면을 연상시키는 가면을 쓴 얼굴 털입니다.' WHERE id = '666cc0a8-caa7-4551-8ca0-ad10c28e7b56' AND description = '쓰레기통을 뒤지다 눈이 마주친 순간, 뻔뻔하게 가면무도회 손님인 척 시치미를 뗀 얼굴 털입니다.';
-- UPDATE public.badges SET description = '길고양이 보스들을 단숨에 무장해제시키고 배를 뒤집게 만드는 마약 같은 향기의 허브 뭉치입니다.' WHERE id = '9899913e-e606-457c-a8cb-7b9966579df2' AND description = '길고양이 보스들을 단숨에 무장해제시키고 배를 뒤집게 만드는, 한 번 맡으면 정신을 못 차리는 향기의 허브 뭉치입니다.';
-- UPDATE public.badges SET name = '진흙 묻은 고어텍스 조각' WHERE id = '7b48e2cb-9b0a-48c8-a073-243bc2528ffb' AND name = '진흙 묻은 방수 원단 조각';
-- UPDATE public.badges SET description = '대일밴드와 연고는 모두 사라지고 정체 모를 알약만 굴러다니는 생존 배낭 속 빨간 파우치입니다.' WHERE id = '2bea2de9-2da6-4a65-a7c9-6e6fc998020e' AND description = '반창고와 연고는 모두 사라지고 정체 모를 알약만 굴러다니는 생존 배낭 속 빨간 파우치입니다.';
-- UPDATE public.badges SET description = '초현실적인 스피드로 공간을 돌파할 때 시간의 저항을 이기지 못하고 살바도르 달리의 그림처럼 녹아버린 초침입니다.' WHERE id = '1bf7cc77-44b6-4cb9-8665-07cef971b0e3' AND description = '초현실적인 스피드로 공간을 돌파할 때 시간의 저항을 이기지 못하고 꿈속에서 본 시계처럼 흐물흐물 녹아버린 초침입니다.';
-- UPDATE public.badges SET description = '나무에서 떨어진 사과가 땅이 아닌 하늘을 향해 치솟다 나뭇가지에 걸려버린, 아이작 뉴턴이 오열할 만한 파편입니다.' WHERE id = 'aef317af-6e8a-40b2-8893-929f201d3f6d' AND description = '나무에서 떨어진 사과가 땅이 아닌 하늘을 향해 치솟다 나뭇가지에 걸려버린, 물리 교과서가 오열할 만한 파편입니다.';
-- UPDATE public.badges SET description = '손바닥 위에 올려두면 슬그머니 허공으로 떠오르려 하는, 뉴턴의 사과를 비웃는 건방진 자갈입니다.' WHERE id = 'ae905965-0d21-4245-88b3-25b8f26d1eb1' AND description = '손바닥 위에 올려두면 슬그머니 허공으로 떠오르려 하는, 만유인력을 비웃는 건방진 자갈입니다.';
-- UPDATE public.badges SET name = '버려진 서낭당의 부적' WHERE id = '11af9dc4-aa53-43a1-beac-4edd1538345e' AND name = '버려진 고갯길의 붉은 쪽지';
-- UPDATE public.badges SET description = '길 잃은 자를 유인한다는 오래된 당산나무 밑에서 굴러다니던, 피처럼 붉은 글씨가 적힌 바스락거리는 종이입니다.' WHERE id = '11af9dc4-aa53-43a1-beac-4edd1538345e' AND description = '길 잃은 자를 유인한다는 오래된 느티나무 밑에서 굴러다니던, 피처럼 붉은 글씨가 적힌 바스락거리는 종이입니다.';
-- UPDATE public.item_books SET description = '길을 가다 마주친 러너와 플레이리스트를 에어드랍으로 교환한 훈훈한 소셜 네트워킹의 흔적.' WHERE id = 'add1460a-b2e0-e3c3-ef88-3faaaf098940' AND description = '길을 가다 마주친 러너와 플레이리스트를 무선 전송으로 교환한 훈훈한 소셜 네트워킹의 흔적.';
-- UPDATE public.item_books SET description = '스트리밍을 거부하고 카세트 워크맨을 들고 달리는 레트로 마니아들의 늘어진 테이프 자국.' WHERE id = '93c93225-cd68-8b93-a56d-f7494955ac01' AND description = '스트리밍을 거부하고 휴대용 카세트 플레이어를 들고 달리는 레트로 마니아들의 늘어진 테이프 자국.';
-- UPDATE public.badges SET name = '소니 워크맨 부품' WHERE id = '33fe1e74-18c8-4111-a5a2-03876fbe66a1' AND name = '카세트 플레이어 부품';
-- UPDATE public.badges SET name = '에어드랍 연결음' WHERE id = '9c26c0b2-54b2-4062-af9b-86be64bfe0b4' AND name = '무선 전송 연결음';
-- UPDATE public.badges SET description = '오늘 나의 완벽했던 달리기 분위기를 자랑하기 위해 인스타그램 스토리에 올릴 음악 재생 화면 스크린샷입니다.' WHERE id = 'b97b217c-c472-4c00-b9f7-02771e57d523' AND description = '오늘 나의 완벽했던 달리기 분위기를 자랑하기 위해 SNS에 올릴 음악 재생 화면 스크린샷입니다.';
-- UPDATE public.badges SET description = '재생하는 순간 다리가 제멋대로 미친 듯이 구르기 시작해 멈출 수 없게 만드는, 도핑 테스트에 걸려야 마땅한 마약 같은 음원 목록입니다.' WHERE id = '9b8de95d-1ce7-410c-a08a-d0cde5dc77bc' AND description = '재생하는 순간 다리가 제멋대로 미친 듯이 구르기 시작해 멈출 수 없게 만드는, 반칙 휘슬이 울려야 마땅한 헤어나올 수 없는 늪 같은 음원 목록입니다.';
-- UPDATE public.badges SET description = '고통의 임계점을 넘은 순간, 음악과 호흡이 하나가 되어 몸 전체에 소름이 돋으며 쏟아지는 천연 마약입니다.' WHERE id = '078ac64f-1754-4490-9cdf-cc78300311f1' AND description = '고통의 임계점을 넘은 순간, 음악과 호흡이 하나가 되어 몸 전체에 소름이 돋으며 쏟아지는 몸속 천연 보너스입니다.';
-- UPDATE public.badges SET description = '어제 이태원 클럽에서 춤추다 찍힌 도장을 안 씻고 그대로 달리기 시작해, 땀에 번져 기괴한 문신이 되어버린 잉크 자국입니다.' WHERE id = 'f07ab2db-9fb6-4457-bc75-5461f6b6d479' AND description = '어제 클럽에서 춤추다 찍힌 도장을 안 씻고 그대로 달리기 시작해, 땀에 번져 기괴한 문신이 되어버린 잉크 자국입니다.';
-- UPDATE public.badges SET description = '비 내리는 날 장엄한 베토벤 교향곡을 들으며 달리는 순간, 눈앞의 풍경이 한 편의 거대한 오케스트라 악보로 변하는 환각입니다.' WHERE id = 'b301878f-2305-4ad8-a93e-acc8cc5d9866' AND description = '비 내리는 날 장엄한 고전 교향곡을 들으며 달리는 순간, 눈앞의 풍경이 한 편의 거대한 오케스트라 악보로 변하는 환각입니다.';
-- UPDATE public.badges SET name = '블루투스 페어링 신호' WHERE id = '97b043fd-2a98-4e0d-8078-1cd72b4c13ad' AND name = '이어폰 연결 신호';
-- UPDATE public.badges SET description = '페어링이 완료되었습니다''라는 기계음과 함께 비로소 달릴 준비가 끝났음을 알리는 뇌 속의 경쾌한 스위치입니다.' WHERE id = '97b043fd-2a98-4e0d-8078-1cd72b4c13ad' AND description = '''연결이 완료되었습니다''라는 기계음과 함께 비로소 달릴 준비가 끝났음을 알리는 뇌 속의 경쾌한 스위치입니다.';
-- UPDATE public.item_books SET description = '불타는 단풍나무 아래로 자전거를 타고 달리는 인생 영상을 건지기 위해 고프로를 달고 달린 자들입니다.' WHERE id = '918d9a0a-ce3d-0044-8f55-c6dff8d627ac' AND description = '불타는 단풍나무 아래로 자전거를 타고 달리는 인생 영상을 건지기 위해 액션캠을 달고 달린 자들입니다.';
-- UPDATE public.badges SET name = '고프로 마운트 나사' WHERE id = 'f8178059-866c-40ec-ade6-74866ef2ece4' AND name = '액션캠 마운트 나사';
-- UPDATE public.badges SET name = '다 쓴 코닥 필름통' WHERE id = 'bc18f4d7-7fa0-45e8-b3bd-1ef79e42ddef' AND name = '다 쓴 노란 필름통';
-- UPDATE public.badges SET name = '블루투스 리모컨' WHERE id = '4b07ef6e-a48b-4d85-a778-8fe6b1c1695e' AND name = '무선 셔터 리모컨';
-- UPDATE public.item_books SET description = '최신 스마트폰 카메라 대신 낡은 폴라로이드나 일회용 카메라로 풍경을 담은 따뜻한 흔적들.' WHERE id = 'c79fc13c-4edc-a47e-75b6-5aa613958116' AND description = '최신 스마트폰 카메라 대신 낡은 즉석카메라나 일회용 카메라로 풍경을 담은 따뜻한 흔적들.';
-- UPDATE public.badges SET name = '빛바랜 폴라로이드 사진' WHERE id = '62a88abc-5263-4ea4-89a4-5f28f4ba02ee' AND name = '빛바랜 즉석사진';
-- UPDATE public.badges SET description = '''1998년 첫 하프 마라톤''. 빛바랜 모나미 볼펜으로 꾹꾹 눌러쓴 누군가의 벅찬 성취감이 묻어나는 뒷면입니다.' WHERE id = 'd9b3002b-f38a-44f7-a78e-daf83dfc46fb' AND description = '''1998년 첫 하프 마라톤''. 빛바랜 볼펜 잉크로 꾹꾹 눌러쓴 누군가의 벅찬 성취감이 묻어나는 뒷면입니다.';
-- UPDATE public.badges SET description = '10년 전 춘천 마라톤에서 달고 뛰었던, 땀에 전 자국과 핀 구멍 4개가 선명하게 남아있는 영광의 종이입니다.' WHERE id = '1e33abae-8816-45e2-b6de-642320a59bb5' AND description = '10년 전 어느 마라톤 대회에서 달고 뛰었던, 땀에 전 자국과 핀 구멍 4개가 선명하게 남아있는 영광의 종이입니다.';
-- UPDATE public.badges SET description = '누구누구의 집이라고 자랑스럽게 걸려있었으나 포크레인에 의해 박살 나버린 청동 재질의 이름표 파편입니다.' WHERE id = '5a2b6bfa-3455-4ab0-8df5-198e12dab542' AND description = '누구누구의 집이라고 자랑스럽게 걸려있었으나 굴착기에 의해 박살 나버린 청동 재질의 이름표 파편입니다.';
-- UPDATE public.badges SET description = '포크레인이 들어오기 전날, 아날로그 카메라로 황급히 담아낸 익숙하고도 낯선 우리 동네의 마지막 영정 사진입니다.' WHERE id = '4ab242df-40b2-4909-b068-b6cbd7cc9d89' AND description = '굴착기가 들어오기 전날, 아날로그 카메라로 황급히 담아낸 익숙하고도 낯선 우리 동네의 마지막 영정 사진입니다.';
-- UPDATE public.badges SET description = '모양과 색이 너무 완벽한 빈티지 코카콜라 뚜껑. 가방에 달아두면 완벽한 레트로 룩이 완성됩니다.' WHERE id = '1462bbb0-83e2-49e1-9f1a-12025b912889' AND description = '모양과 색이 너무 완벽한 빈티지 탄산음료 병뚜껑. 가방에 달아두면 완벽한 레트로 룩이 완성됩니다.';
-- UPDATE public.badges SET description = '''J.H''라는 글자가 각인된 은빛 지포 라이터. 기름은 다 말랐지만 딸깍거리는 뚜껑 소리만큼은 명쾌합니다.' WHERE id = '74ed5318-a262-4ca0-a8d7-e9bff93b772e' AND description = '''J.H''라는 글자가 각인된 은빛 오일 라이터. 기름은 다 말랐지만 딸깍거리는 뚜껑 소리만큼은 명쾌합니다.';
-- UPDATE public.item_books SET description = '최후의 만찬이라며 치킨을 시켜 먹고, 항상 다이어트는 ''내일''부터라고 외치는 평행우주의 반복.' WHERE id = '6d5e8172-a74c-8b22-7952-7ff95ea566af' AND description = '오늘이 마지막이라며 치킨을 시켜 먹고, 항상 다이어트는 ''내일''부터라고 외치는 평행우주의 반복.';
-- UPDATE public.item_books SET description = '운동화 끈을 묶고 유튜브 쇼츠를 하나만 보려다, 결국 2시간 동안 소파에 앉아있던 허무한 시간.' WHERE id = '989fc342-1d1d-4b82-657d-81a7190df782' AND description = '운동화 끈을 묶고 짧은 영상을 하나만 보려다, 결국 2시간 동안 소파에 앉아있던 허무한 시간.';
-- UPDATE public.badges SET name = '장비 자랑용 인스타 캡처' WHERE id = '288302fa-23f4-403d-9902-439e70f299e9' AND name = '장비 자랑용 게시물 캡처';
-- UPDATE public.badges SET description = '산에는 안 갔지만 장비 세팅만큼은 엄홍길 대장님 부럽지 않은, #등산스타그램 태그가 달린 허세 가득한 사진입니다.' WHERE id = '288302fa-23f4-403d-9902-439e70f299e9' AND description = '산에는 안 갔지만 장비 세팅만큼은 베테랑 산악 대장님 부럽지 않은, #등산룩 태그가 달린 허세 가득한 사진입니다.';
-- UPDATE public.badges SET name = '택도 안 뗀 고어텍스 자켓' WHERE id = 'dc4f9362-6dc4-447d-b80d-7fc9df7402b9' AND name = '택도 안 뗀 방수 자켓';
-- UPDATE public.badges SET description = '매일 밤 잠들기 전 ''내일은 무조건 뛴다''고 적어두지만, 아침이 되면 거짓말처럼 기억에서 삭제되는 마법의 포스트잇입니다.' WHERE id = '99cee59c-6d44-4f2c-8dfc-df6e0edccee6' AND description = '매일 밤 잠들기 전 ''내일은 무조건 뛴다''고 적어두지만, 아침이 되면 거짓말처럼 기억에서 삭제되는 마법의 접착 메모지입니다.';
-- UPDATE public.badges SET description = '소파에 누워 넷플릭스를 고르느라 손에서 리모컨이 떨어지지 않는, 사이보그화가 진행 중인 기괴한 파편입니다.' WHERE id = '45ddecba-90f6-4969-8f94-1116406163fe' AND description = '소파에 누워 볼 영상을 고르느라 손에서 리모컨이 떨어지지 않는, 사이보그화가 진행 중인 기괴한 파편입니다.';
-- UPDATE public.badges SET description = '하루 10분 전신 박살''이라는 유튜브 썸네일만 쳐다봐도 이미 살이 빠진 것 같은 착각을 유발하는 이미지입니다.' WHERE id = '1c0d7af4-4aeb-42ea-a253-1c2ac15f5f39' AND description = '''하루 10분 전신 박살''이라는 영상 썸네일만 쳐다봐도 이미 살이 빠진 것 같은 착각을 유발하는 이미지입니다.';
-- UPDATE public.badges SET name = '유튜브 쇼츠 재생 버튼 조각' WHERE id = '4e09891d-db67-4f34-ae20-8dbe4c39ac12' AND name = '짧은 영상 재생 버튼 조각';
-- UPDATE public.badges SET description = '러닝 앱 대신 배달의 민족을 켜고 야식을 고르다 획득한, 운동의 의지를 완벽하게 꺾어버리는 할인권입니다.' WHERE id = '913d38f2-6453-4a37-b246-2ad7ba8fed4f' AND description = '러닝 앱 대신 배달 앱을 켜고 야식을 고르다 획득한, 운동의 의지를 완벽하게 꺾어버리는 할인권입니다.';
-- UPDATE public.badges SET description = '회원님, 요즘 왜 안 오시나요? ㅠㅠ''라며 죄책감을 유발하는, 스팸 문자보다 무서운 카카오톡 메시지입니다.' WHERE id = '590687db-3c2b-4505-80c9-4f8c3890c899' AND description = '''회원님, 요즘 왜 안 오시나요? ㅠㅠ''라며 죄책감을 유발하는, 스팸 문자보다 무서운 메신저 메시지입니다.';
-- UPDATE public.badges SET name = '최후의 만찬 영수증' WHERE id = '3925e6f8-10fb-465d-a6c3-4f3ccfde89c9' AND name = '마지막 식사 영수증';
-- UPDATE public.badges SET description = '매일 밤이 ''다이어트 전 마지막 식사''라며 족발, 보쌈, 엽떡을 번갈아 시켜 먹어 탄생한 기적의 카드 내역서입니다.' WHERE id = '3925e6f8-10fb-465d-a6c3-4f3ccfde89c9' AND description = '매일 밤이 ''다이어트 전 마지막 식사''라며 족발, 보쌈, 매운 떡볶이를 번갈아 시켜 먹어 탄생한 기적의 카드 내역서입니다.';
-- UPDATE public.badges SET description = '프로틴 쉐이크 대신 오늘 하루의 스트레스를 날려줄 차가운 알코올의 봉인을 해제한 은빛 금속 파편입니다.' WHERE id = '980e88bf-4794-4b97-98b9-f4843aa1d0f4' AND description = '프로틴 쉐이크를 챙기려던 저녁, ''오늘만 봐주자''며 운동 계획의 봉인을 풀어버리고 회식 자리에 나뒹구는 은빛 금속 파편입니다.';
-- UPDATE public.badges SET description = '한 번 엉덩이를 대면 블랙홀처럼 몸을 빨아들여 절대 일어날 수 없게 만드는 치명적인 마약 쿠션의 파편입니다.' WHERE id = 'a7eac3be-78ed-4616-a95d-38a40f14be57' AND description = '한 번 엉덩이를 대면 블랙홀처럼 몸을 빨아들여 절대 일어날 수 없게 만드는 치명적인 끈끈이 쿠션의 파편입니다.';
-- UPDATE public.badges SET name = '건배사의 파동' WHERE id = '91f41826-f3fe-4125-ad36-7ab93e812ad7' AND name = '회식 구호의 파동';
-- UPDATE public.badges SET description = '우리의 건강을 위하여!''라며 술잔을 부딪치는, 헬스장과는 거리가 먼 모순적이고도 유쾌한 외침입니다.' WHERE id = '91f41826-f3fe-4125-ad36-7ab93e812ad7' AND description = '''우리의 건강을 위하여!''라며 삼겹살 불판 앞에서 합창하는, 헬스장과는 거리가 먼 모순적이고도 유쾌한 외침입니다.';
-- UPDATE public.badges SET description = '소주 3병을 마신 뒤 불타는 얼굴로 ''내일은 아침에 헬스장 간다''고 외치는, 아무도 믿지 않는 취중 진담입니다.' WHERE id = '7e89e4c8-6c60-402f-9ce4-04ba22370b85' AND description = '회식 자리에서 세 시간을 버틴 뒤 불타는 얼굴로 ''내일은 아침에 헬스장 간다''고 외치는, 아무도 믿지 않는 호언장담입니다.';
-- UPDATE public.item_books SET name = '당근의 잠복자' WHERE id = '31b5587e-d58e-3630-06d9-8a7665ba2ad0' AND name = '중고장터의 잠복자';
-- UPDATE public.badges SET description = '당근~'' 하는 소리와 함께 심박수를 150으로 끌어올리는 알림. 원하던 꿀매물이 떴을 때 발생하는 파블로프의 종소리입니다.' WHERE id = '985434d8-92cb-48c3-b3e1-018976b89d94' AND description = '''띠링~'' 하는 소리와 함께 심박수를 150으로 끌어올리는 알림. 원하던 꿀매물이 떴을 때 발생하는 조건반사의 종소리입니다.';
-- UPDATE public.badges SET description = '이거 당근에서 10만 원 주고 산 거야''라는 새빨간 거짓말을 지키기 위해 책갈피 깊숙이 숨겨둔 150만 원짜리 영수증입니다.' WHERE id = '27dafd4a-e1e3-4118-97ab-f56c4bd1014d' AND description = '''이거 중고로 10만 원 주고 산 거야''라는 새빨간 거짓말을 지키기 위해 책갈피 깊숙이 숨겨둔 150만 원짜리 영수증입니다.';
-- UPDATE public.badges SET description = '다이소 퐁퐁을 써도 되지만, 무조건 ''바이크 전용''이라고 적힌 비싼 핑크색 용액을 고집하는 자들의 사치품입니다.' WHERE id = '681dfe1e-59cb-46c4-abbd-fce4aeb71e3c' AND description = '천 원짜리 주방 세제를 써도 되지만, 무조건 ''바이크 전용''이라고 적힌 비싼 핑크색 용액을 고집하는 자들의 사치품입니다.';
-- UPDATE public.badges SET name = '언박싱 유튜브 대본' WHERE id = 'ed9d8c6a-58a1-4703-9a65-1cb7e5c2c2cd' AND name = '언박싱 영상 대본';
-- UPDATE public.badges SET description = '나도 장비 리뷰 유튜버가 되겠다며 야심 차게 카메라를 켰으나, 결국 혼자 흥분해서 소리 지르다 끝난 영상의 흔적입니다.' WHERE id = 'ed9d8c6a-58a1-4703-9a65-1cb7e5c2c2cd' AND description = '나도 장비 리뷰 크리에이터가 되겠다며 야심 차게 카메라를 켰으나, 결국 혼자 흥분해서 소리 지르다 끝난 영상의 흔적입니다.';
-- UPDATE public.badges SET description = '바람을 가르기 위해 헬멧 앞에 장착한 바이저. 마치 다스베이더나 사이보그처럼 보이게 만들어 시선을 강탈합니다.' WHERE id = '89ff2c44-ef55-4b84-af46-bd8dfd8f2860' AND description = '바람을 가르기 위해 헬멧 앞에 장착한 바이저. 마치 SF 영화 속 악당이나 사이보그처럼 보이게 만들어 시선을 강탈합니다.';
-- UPDATE public.item_books SET name = '숙취와 포션' WHERE id = '5891a1e4-cdf5-ab89-ec23-eb03433a9fb1' AND name = '녹초와 포션';
-- UPDATE public.item_books SET description = '전날 마신 술을 땀으로 빼겠다며 달리기 시작했으나, 결국 해장 포션만 찾아 헤맨 슬픈 영혼.' WHERE id = '5891a1e4-cdf5-ab89-ec23-eb03433a9fb1' AND description = '전날 한계까지 달려 녹초가 된 몸으로 눈을 떴으나, 결국 회복 포션만 찾아 헤맨 슬픈 영혼.';
-- UPDATE public.item_books SET name = '불법 부스터 배합' WHERE id = '3b22f8f3-4fb6-6719-afb1-4f1c3f74093d' AND name = '봉인된 연금술 배합';
-- UPDATE public.badges SET description = '차가운 포카리스웨트를 마시다 턱을 타고 목덜미로 흘러내린, 아까워서 핥아먹고 싶은 단 한 방울의 이온 음료입니다.' WHERE id = 'd85e3721-936e-4a96-9732-4b493cb52d4f' AND description = '차가운 이온 음료를 마시다 턱을 타고 목덜미로 흘러내린, 아까워서 핥아먹고 싶은 단 한 방울의 생명수입니다.';
-- UPDATE public.badges SET description = '불법(?) 배합의 부작용으로 찾아온 속쓰림을 잠재우기 위해 다급하게 까먹은 하얀 제산제 껍데기입니다.' WHERE id = '396d2e46-a3a7-4030-a5d6-be26bb22fc86' AND description = '봉인된(?) 배합의 후폭풍으로 찾아온 속쓰림을 잠재우기 위해 다급하게 까먹은 하얀 제산제 껍데기입니다.';
-- UPDATE public.badges SET description = 'BCAA, 아르기닌, 크레아틴을 섞어 만들었으나, 색깔만 보면 독극물로 오해받기 딱 좋은 자작 부스터입니다.' WHERE id = '985e1772-a08b-44ea-b78e-41a277d6d7f1' AND description = '온갖 가루를 눈대중으로 섞어 만들었으나, 색깔만 보면 독극물로 오해받기 딱 좋은 자작 부스터입니다.';
-- UPDATE public.badges SET description = '하루 1병 이상 섭취 금지''라고 적혀 있으나, 기록 단축을 위해 가볍게 무시해버린 강력한 보충제의 라벨입니다.' WHERE id = '40655d4d-ff5b-42db-8ecc-6a2f07ae468e' AND description = '''사용 전 주의사항을 확인하세요''라고 적혀 있으나, 기록 단축에 눈이 멀어 읽을 틈 없이 땀에 번져 버린 보충제의 라벨입니다.';
-- UPDATE public.badges SET description = '면역력이 떨어지면 다음 날 운동을 못한다는 공포심에 매일 3천 밀리그램씩 털어 넣는 시큼한 결정체입니다.' WHERE id = 'f8a4ba87-6f40-46f7-b936-51d4a4412079' AND description = '면역력이 떨어지면 다음 날 운동을 못한다는 공포심에 매일 빠짐없이 털어 넣는 시큼한 결정체입니다.';
-- UPDATE public.badges SET description = '폐에 산소가 부족해 헉헉댈 때, 비강과 기도를 강제로 확장시켜 숨을 쉬게 해주는 독한 민트의 냄새입니다.' WHERE id = 'a44989b1-2aee-4f3c-8e52-b2c2c5ba174b' AND description = '폐에 산소가 부족해 헉헉댈 때, 코끝을 찌르며 숨통이 트이는 듯한 착각을 선사하는 독한 민트의 냄새입니다.';
-- UPDATE public.badges SET name = '간 기능 회복의 기도' WHERE id = 'b4759776-9cec-44ec-aa40-427306ba9099' AND name = '피로 회복의 기도';
-- UPDATE public.badges SET description = '페달을 한 번 밟을 때마다 알코올이 1ml씩 배출되기를 간절히 바라는, 연금술사의 처절한 종교적 의식입니다.' WHERE id = 'b4759776-9cec-44ec-aa40-427306ba9099' AND description = '페달을 한 번 밟을 때마다 어제의 피로가 한 겹씩 벗겨지기를 간절히 바라는, 연금술사의 처절한 종교적 의식입니다.';
-- UPDATE public.badges SET description = '아무리 물을 마셔도 해소되지 않는, 알코올이 체내 수분을 쥐어짜며 만들어낸 입속의 끔찍한 모래사장입니다.' WHERE id = 'eb32276d-71af-4fd0-a376-c29045ba5f96' AND description = '아무리 물을 마셔도 해소되지 않는, 녹초가 된 몸이 마지막 수분까지 쥐어짜며 만들어낸 입속의 끔찍한 모래사장입니다.';
-- UPDATE public.badges SET description = '알코올로 수분이 말라버린 뇌에 당분을 억지로 쑤셔 넣기 위해 온장고에서 발굴해 낸 따뜻한 생명수입니다.' WHERE id = '8afd360c-f54d-438c-8bd6-b1ac70755118' AND description = '녹초가 되어 텅 빈 머리에 당분을 억지로 쑤셔 넣기 위해 온장고에서 발굴해 낸 따뜻한 생명수입니다.';
-- UPDATE public.badges SET description = '심장 박동이 빨라질 때마다 뇌를 망치로 때리는 듯한 숙취의 고통을 잠재우려 물 없이 삼킨 하얀 구원자입니다.' WHERE id = '03a5d847-936b-4f14-8ffd-f4d946c8b8fe' AND description = '심장 박동이 빨라질 때마다 뇌를 망치로 때리는 듯한, 어제의 무리가 남긴 두통을 잠재워 줄 거라 믿고 삼킨 하얀 구원자입니다.';
-- UPDATE public.badges SET name = '숙취 해소제 병뚜껑' WHERE id = '5e28e0c3-83b4-43aa-9efc-55f300112aad' AND name = '회복 드링크 병뚜껑';
-- UPDATE public.badges SET description = '어제 마신 폭탄주를 해독하겠다며 라이딩 시작 전 편의점에서 급하게 들이켠 골드 컬러의 뚜껑입니다.' WHERE id = '5e28e0c3-83b4-43aa-9efc-55f300112aad' AND description = '어제의 피로를 털어내겠다며 라이딩 시작 전 편의점에서 급하게 들이켠 드링크의 골드 컬러 병뚜껑입니다.';
-- UPDATE public.badges SET description = '다시는 운동 전날 술을 마시지 않겠다''는 100번째 거짓 맹세가 담긴, 땀과 알코올이 섞인 끈적한 파동입니다.' WHERE id = '173d5fb4-6993-4c07-8938-0351c3270dfb' AND description = '''다시는 어제처럼 무리하지 않겠다''는 100번째 거짓 맹세가 담긴, 땀과 한숨이 섞인 끈적한 파동입니다.';
-- UPDATE public.badges SET name = '해장국집 간판 불빛' WHERE id = 'e0ab960a-4312-43ad-a74b-fd1af741f8e6' AND name = '국밥집 간판 불빛';
-- UPDATE public.badges SET description = '고통스러운 해장 러닝의 끝에 신기루처럼 나타난, 뜨끈한 국물로 모든 죄악을 씻어줄 구원의 붉은 네온사인입니다.' WHERE id = 'e0ab960a-4312-43ad-a74b-fd1af741f8e6' AND description = '고통스러운 러닝의 끝에 신기루처럼 나타난, 뜨끈한 국물로 모든 허기와 피로를 달래줄 구원의 붉은 네온사인입니다.';
-- UPDATE public.badges SET name = '헛개수 티백' WHERE id = 'c9e38cd8-cf00-4536-a925-02d9ac71eeee' AND name = '구수한 곡물차 티백';
-- UPDATE public.badges SET description = '땀을 흘려 술을 빼겠다는 위험한 발상으로 물통 가득 진하게 우려낸 구수한 간 해독의 결정체입니다.' WHERE id = 'c9e38cd8-cf00-4536-a925-02d9ac71eeee' AND description = '녹초가 된 몸을 달래 보겠다는 연금술사다운 집념으로 물통 가득 진하게 우려낸 구수한 위로의 결정체입니다.';
-- UPDATE public.badges SET description = '어제의 숙취가 완전히 깨지 않아, 앞사람의 뒷바퀴가 두 개로 겹쳐 보이는 아찔하고도 몽환적인 시각적 오류입니다.' WHERE id = '870233e1-b1f4-463e-9344-10a39dd9162e' AND description = '어제의 피로가 완전히 풀리지 않아, 앞사람의 뒷바퀴가 두 개로 겹쳐 보이는 아찔하고도 몽환적인 시각적 오류입니다.';
-- UPDATE public.badges SET name = '터져버린 파워젤' WHERE id = '3ab9a525-d646-4e7c-97d1-dbe88163fabb' AND name = '터져버린 에너지 젤';
-- UPDATE public.badges SET description = '커피 10잔 분량의 각성 효과를 한 알에 응축시킨, 연금술사들의 합법적 도핑 흔적이 남은 빈 캡슐입니다.' WHERE id = '4485e305-73c0-4c9b-996d-62ec478eae1a' AND description = '잠을 쫓는 마법을 한 알에 응축시켰다고 굳게 믿는 연금술사들의, 합법적 도핑 흔적이 남은 빈 캡슐입니다.';
-- UPDATE public.badges SET description = '한계를 넘은 대가로 찾아온 근육통을 견디지 못하고 약국의 힘을 빌려 남용해버린 하얀색 약통입니다.' WHERE id = 'f33306de-efc3-4a1c-afe2-f7871e9cf527' AND description = '한계를 넘은 대가로 찾아온 근육통을 달래려 설명서대로만 먹고 비워 낸, 연금술사답지 않게 얌전한 하얀색 약통입니다.';
-- UPDATE public.badges SET description = '젖산을 분해하고 숙면을 도와준다는 유튜브 광고를 맹신하여 비싼 돈 주고 직구한 시큼한 붉은 묘약입니다.' WHERE id = '2fc31d85-ace1-4783-8e2e-e4f4188063e1' AND description = '회복에 좋다는 인터넷 광고를 맹신하여 비싼 돈 주고 직구한, 시큼하다 못해 눈이 질끈 감기는 붉은 묘약입니다.';
