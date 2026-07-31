-- 삼성산(서울, 관악산 인접) POI 좌표 오매핑 수정
-- import-mountains-poi.js의 동명이인 disambiguation 실패(ambiguous_first 폴백)로
-- 경상도 삼성산(경산시, 35.7652366/128.7900754) 좌표가 잘못 채택되어 있던 것을
-- 서울 관악구·금천구 경계에 위치한 실제 삼성산 좌표로 수정.
update public.poi
set
  latitude = 37.4406,
  longitude = 126.9347,
  naver_id = 'manual:삼성산_서울관악_37.4406_126.9347'
where name = '삼성산'
  and category = 'mountain'
  and naver_id = 'syn:삼성산_35.76524_128.79008';
