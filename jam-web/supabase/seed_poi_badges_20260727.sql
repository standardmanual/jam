-- POI 배지 일괄 생성 (2026-07-27)
-- transit(973) + mountain(847) = 1,820개 POI 전체에 대해 POI 1개당 배지 1개를 생성하고 poi.linked_badge_id를 연결한다.
-- 아이콘: public/badges/poi/anyway_star.png (전체 공용)
-- 이 파일은 이미 service_role 키로 직접 실행된 변경사항의 재현/기록용 SQL이다 (feedback-direct-sql-deploy 규칙).

INSERT INTO public.badges (id, name, description, type, rarity, image_url, activity_types, patch_available) VALUES
  ('000988f7-64e4-4941-8b48-4c7ae7186f59', '만인산', '만인산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('00301a22-f3a9-4dc6-8974-0b9260313903', '천왕산', '천왕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('003dd30d-8202-4e9c-b230-49827e396221', '제기동역', '제기동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('006b988a-aebf-4c7f-be32-b3d8a19c6219', '방학역', '방학역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('007bae4c-eb1b-4297-b4be-329664012c57', '이매역', '이매역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('007bd2a4-4d49-4f2c-b1de-e52d1cdef8b0', '이촌역', '이촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('00b7b9df-28b5-4e71-9736-a34751987248', '금적산', '금적산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('00eee2ee-d3aa-48d9-80ce-fd5a8138c457', '사명산', '사명산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('00f2029b-0a74-4f71-805a-52aa2be73c1f', '판암역', '판암역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0102199c-f42d-4d71-913f-482643ba51fd', '백마산', '백마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('010263c6-61dc-4d1f-9cb2-d5389bc8a397', '불암산역', '불암산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0105fc65-f014-4b75-9ba9-73f164d7a19c', '공주역', '공주역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('011b2308-3bee-44b6-b1d8-288377b56b68', '을지로입구역(하나은행)1-1번출구', '을지로입구역(하나은행)1-1번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('01593492-fb45-4386-8925-0720cb70353a', '보해산', '보해산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('01e0a717-1479-49cf-81db-b4197ca91915', '수로왕릉역', '수로왕릉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('01fb1fb6-ffac-441d-80c2-067a3c62a0c2', '원시역', '원시역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('022ee11e-8c83-4244-ad4b-5058fd14c325', '부모산', '부모산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0266c4d2-70ec-4020-b9ed-55c9652fe58c', '울산역', '울산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('027ac145-ffc6-487b-a4a8-c866f85139f7', '회룡역', '회룡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('027c0793-10b3-4dbd-b611-80299d38a83c', '운악산', '운악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('029326c8-e547-4241-a956-1e61e9e10049', '서정리역', '서정리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('02b91c60-e3b4-4179-950c-b45f4e5694c7', '취암산', '취암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('02cdfad7-3c54-4c8a-9b3c-528c604223d2', '봉수산', '봉수산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('02faf46b-4b4b-4b68-969c-b318f5bac0c7', '칼봉산', '칼봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('030fada0-75da-42f5-a383-c64f53b5777c', '금골산', '금골산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('036e8a3d-b0da-4fbe-8b14-37e8ef8e36b1', '공릉역', '공릉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0388e7a2-979b-4d0b-becc-5a0e292b9f87', '이곡역', '이곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('039a4048-a72f-43bc-8a8e-5214d2376bad', '양각산', '양각산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('03b5346e-50a1-4d76-923d-e548f98e432e', '용마산', '용마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('03f0f828-3311-492a-9376-d5974c615796', '마정산', '마정산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0407e035-1ff6-415e-8895-626b5872a4c9', '봉복산', '봉복산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0407e739-fbf0-4206-82f6-8a2a7c64e7a5', '강동역', '강동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0409f73a-63ef-4c49-8701-97f321376c67', '오이도역', '오이도역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('04239347-11bd-41c0-bdb0-3c47d26829d5', '축령산', '축령산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('042c63e4-0a13-4e69-b9ee-00cbf8ac6566', '검단산', '검단산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('04428494-9180-45ea-969e-18b9eb9b41ec', '합정역', '합정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('047a97ec-b7c8-491b-b3cf-70594751a4c0', '백우산', '백우산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('048cfba9-0796-4010-87ab-43c5952bb4f9', '화명역', '화명역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('04d82046-7dd8-4f40-87be-aab304776ee0', '길동역', '길동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0560499a-28dc-4545-ac53-0d106eab06ab', '보문역', '보문역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('05770fc0-dd98-4bc2-ac38-2009d5f754d7', '반여농산물시장역', '반여농산물시장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('05c1c232-667d-40bd-b0a1-216c2c61bbd6', '도봉산역', '도봉산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('05e5635f-f4f5-4213-a864-64f57e434e98', '압구정로데오역', '압구정로데오역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('05fce504-78d8-4e72-ad75-c629c098c39a', '백월산', '백월산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('060f2567-79fa-4ead-a77f-08f1a6fd1fb1', '화학산', '화학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('064b7af2-74d3-42d3-a513-0533ee3dc254', '주작산', '주작산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0654630c-a4c4-45e9-9c32-af6ff8189845', '대덕산', '대덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('068d9cc8-e8aa-4e79-b96e-73992618dbaf', '용마산', '용마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('06d16be5-526f-46e6-afff-0e4a12f6c2fe', '첨찰산', '첨찰산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('071a0ce9-f473-48d2-986e-b0e648f121c8', '장신대역', '장신대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('074a8e58-a5fd-40cb-8401-b3c535b41a52', '용지역', '용지역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('07537ef5-1624-4645-992c-6fff9ccd69a7', '상동역', '상동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('07608fcd-a1ed-4213-bbd0-d386d072b9e3', '종암산', '종암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('078c2df7-d231-47b1-848a-f209f23e3ded', '명동역', '명동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0794e02b-0452-41bb-a281-d4cd2c37b5cc', '죽엽산', '죽엽산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('07c1b853-eaba-47f9-aeee-321263cda61a', '봉황역', '봉황역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('07c38cd3-7150-49e2-beb5-380365c28242', '진위역', '진위역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('07c736cb-737a-4cb0-bdba-1320bc7560dd', '원통산', '원통산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('07d14f72-c122-4494-81b1-8a251fe8898f', '비조산', '비조산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('07f6be9d-cc70-418f-b640-ee8a1dc55152', '삼성산', '삼성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0806103a-9cfe-4492-bee2-85fd3c32c13e', '학동·증심사입구역', '학동·증심사입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('082b2edb-ca5f-4adc-9621-61f6612dfa3a', '양천산', '양천산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('08b165fc-5cd8-4c6f-948a-e5aaaeaec4c6', '병풍산', '병풍산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('08fcaaf8-d511-481e-9506-6ae03876c72c', '마이산', '마이산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('08fe331f-f82e-4d6d-a63b-8417f44c95cd', '재약산', '재약산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('090e705a-708c-4597-a55a-518b9d9f786c', '진악산', '진악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0915e99c-80cc-47bd-9ea5-460bf7785ace', '동묘앞역', '동묘앞역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('094735fe-4fd2-4e48-a9c3-56c4b847b6d4', '건지산', '건지산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('095f57de-2c67-4bdf-a074-1138d8513a3e', '만덕산', '만덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('09c9ba77-def4-42c3-9240-68ad4ba2f0f3', '대성리역', '대성리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('09d06f61-d4ed-4814-afee-8369ed13be23', '평안산', '평안산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('09fbbd3f-4767-472f-aac5-2035bb4c67e1', '경복궁역', '경복궁역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0a8b2789-7d85-436f-93ed-ba8fdadbfa3f', '낙가산', '낙가산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0ab28d52-55ae-430d-94d1-68a03c0799f2', '망산', '망산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0af75580-bc77-4166-9534-f5183a47d692', '서대문역', '서대문역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0b0f7d15-09f2-497c-ab74-9590ae43b2e7', '배산', '배산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0b2def2b-abfa-4a2d-bd67-4481060a656a', '고성산', '고성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0b4440fb-02ea-4332-a2ba-a90c7cfcbf88', '상천역', '상천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0b72edf4-8118-4d3e-baff-2fc7081f2d93', '용마산역', '용마산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0b85d07a-6f55-4d80-94a4-3460ba225769', '경인교대입구역', '경인교대입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0bbbbf5a-353b-416d-b944-c12677c83942', '독립문역', '독립문역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0bcbe5ce-b78c-4558-822e-5e7e360bf6b6', '해운대역', '해운대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0bd3b011-66e3-4639-8127-6dd4abf57fcc', '억산', '억산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0c06ace2-3ea8-422f-ab6b-027fc308e074', '오목교역', '오목교역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0c27ad39-77bb-4333-985f-2d19b1fb9cbc', '곤제역', '곤제역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0c39062e-df91-4f8a-b494-538964532526', '용인중앙시장역', '용인중앙시장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0c5c6451-0526-43f0-a5ce-d4b4150be988', '창동역', '창동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0c79704b-8c6c-46ab-b45e-ec21536c22d7', '사가정역', '사가정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0c7c57f2-2d9e-460e-a6e5-a0f3c720c52c', '인천공항2터미널역', '인천공항2터미널역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0c9adce8-fb7e-4643-931d-078e069529c8', '우장산', '우장산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0ccee6f6-d8f3-4d92-9364-d8a344feeb95', '태청산', '태청산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0d4ae5aa-466e-4fde-ab72-6402f759c4ef', '구룡산', '구룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0d814cff-bf53-45d0-8827-182e730f406c', '금원산', '금원산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0d84d513-9e01-449a-8801-879eb65d333e', '복우산', '복우산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0d945cf6-cf0c-4fe4-bef6-a1894dfbb793', '구곡산', '구곡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0daa6fb6-9b49-4e8a-bc81-cc4aa06b8fd6', '서원역', '서원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0df394d5-f069-41ae-a304-51862cdc97d6', '면산', '면산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0e00e7f8-ac25-4b06-a93b-de3a90713e7e', '부천역', '부천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0e07f039-12f7-40fd-844c-2f9e7ae27b9b', '수안역', '수안역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0e31c0b2-4d33-4c35-9da4-190dcd264350', '가라산', '가라산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0e7172c0-6d86-4fb3-b575-6a282c250c04', '원등산', '원등산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0e74dc1e-0b88-47db-bb87-d6aef7272121', '한석산', '한석산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0ed1c551-baf0-4b2c-91d2-b65f84d70a9e', '교대역 2호선', '교대역 2호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0ed4dd2e-430f-45bb-96cc-37fe396f4f75', '사룡산', '사룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0eea93ea-564a-492d-86ec-8f85458cd830', '양천구청역', '양천구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0f54da5d-dd93-424b-bfaa-2b05d41cdbc4', '연봉산', '연봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0fb8856a-0bd7-4064-b5b4-abd3c0004e3d', '화랑대역', '화랑대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0fd2cba4-81b3-44c8-9154-29afabc27840', '안산', '안산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0fdb9fc6-7b26-4595-933b-cfe2e45fb87f', '가정역', '가정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('0fdd2eac-7e09-47e7-b6fc-48356cf1e97f', '가능역', '가능역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('100db122-fe85-47b3-a15c-7d36c42786cf', '불곡산', '불곡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1012cd7c-6603-44c9-ac7a-9d93174cb6e8', '뚝섬역 2호선', '뚝섬역 2호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('105882eb-d857-482d-87c4-f545b18358f1', '마장역2번출구', '마장역2번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('10a65aca-24d2-40d1-ae55-a68f9cfccba5', '어정역', '어정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('10ce6652-1aad-4609-ba6e-33a50ce67a06', '디지털미디어시티역', '디지털미디어시티역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('10d5e6a0-9314-4499-831d-8f5a4e0070ea', '안국역(현대건설)4번출구', '안국역(현대건설)4번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1125707b-63cc-4551-b194-8a35ddd99b83', '인천역', '인천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1167ddcb-4c07-4174-bb23-667232faeff4', '양촌역', '양촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('11e96b1d-a561-4c32-85a2-76f61a76b515', '거머리산', '거머리산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('11ea1d16-7ee7-475c-bd76-f8c315236546', '둔덕산', '둔덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('121651a7-049d-4d81-b0e3-a1b3e6b82ea0', '석천사거리역', '석천사거리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('122c3724-606c-4f47-9916-d2cfdf7ced3b', '평동역', '평동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('12661761-2c8a-4e46-b168-b0eb4e85ec5a', '경산역', '경산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1279feaf-0a91-48b5-b02c-d6ddbad3745f', '호구포역', '호구포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('129eb8e5-d2e6-4e95-aaea-c257562e7540', '태봉산', '태봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('12a6d8d6-e8ff-4128-9f1c-9f9caca79560', '오정산', '오정산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('12b2cd83-4735-4fd9-a5f8-aea44ba3814f', '악견산', '악견산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('130861f0-0973-47ec-bce3-ba6632ea6cd3', '영남대역', '영남대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('13110547-f906-4636-90e2-40e3af945585', '효양산', '효양산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('137cc1f3-e430-47cd-8f7d-10b4b664eee9', '성불산', '성불산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('138943ae-ab63-4c6c-bd7f-85675aea06f2', '월아산', '월아산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1392b79c-c568-44d3-a042-7011883fc7c7', '갈두산', '갈두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('13a5b3a8-a961-42f7-826b-877aff3ec780', '작전역', '작전역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('14036d1f-f865-4a5a-8c70-591e8b256e25', '송탄역', '송탄역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('140ee80d-0f96-44d5-b3ad-468b2bc75fde', '봉래산', '봉래산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('142b530b-085a-4dff-b6dc-54c65af061c8', '국제금융센터·부산은행역', '국제금융센터·부산은행역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1480c052-4bbc-415f-b7c0-67a197c7429b', '주왕산', '주왕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('14acd0ca-f6ea-4c01-97c1-9ab8d61fdef5', '운연역', '운연역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('14dfb74b-e83a-4356-8481-1659a221d6ca', '천마산', '천마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('14f87cc1-fe70-442d-a621-c4df584db980', '봉미산', '봉미산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1508eab1-b240-4c55-a848-71a17307eb97', '왕십리역', '왕십리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('151a281b-2189-4669-91a8-3f1c5342f8e0', '한남역', '한남역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('152bf417-360c-4f53-96e8-7edf3e4769f9', '팔봉산', '팔봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('15724955-1873-404f-b8f9-20db01d866c7', '문복산', '문복산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('15ac4249-be19-40fc-ae0d-0b0eb19338bb', '고루포기산', '고루포기산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('15b70430-b91f-4266-b9fc-19f4684aad5f', '문수산', '문수산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('15ddd13f-be78-4cf0-9c11-d4cabfc3f676', '소래포구역', '소래포구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('161ccf8d-9227-493c-beef-350d0978d800', '희양산', '희양산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('162f3fa4-8115-41e1-91d4-734f1081644e', '종각역', '종각역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('16591cba-86cc-4071-aef5-d3839c3b4292', '가리왕산', '가리왕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1688b34c-9456-4aa3-8198-0fa190779501', '연석산', '연석산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('16ba13ab-73aa-4b05-b332-0716d1796b7d', '간대산', '간대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('16d98acf-d68b-4f81-80a0-4fb3ffd46a02', '올산', '올산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('16e85191-c30d-4346-91d0-23415a026ee1', '칠성시장역', '칠성시장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('16ebf0aa-fa73-4f2a-a739-6d7dcea22eed', '동대산', '동대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('17378579-0673-4f7a-b61b-1196940f790c', '장승배기역', '장승배기역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('17489d12-99ed-4b40-97d0-3e70051596ab', '병무산', '병무산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1756848c-97c3-4355-aaf3-5dc307ca8f97', '관악산역', '관악산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('175b20b0-1cc7-4781-896f-f466d91892a7', '서대산', '서대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('17927ac0-411c-4928-a72f-c050a3589211', '마구산', '마구산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1826f3b8-73b4-436f-bbb0-e1191779b0db', '보금산', '보금산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1830a5bc-142c-4a9b-bc0f-519459c28439', '노자산', '노자산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('18b9ca82-7804-40ab-b1cb-7f1227814f5e', '문정역', '문정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('18c359b3-64c4-4279-87d9-09aadcf2048b', '하남시청역', '하남시청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('18f56b0f-7e19-4a92-8c46-1feb7a84908e', '상주역', '상주역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('19651152-8a62-4741-bf1a-7560b4df3dfb', '마석역', '마석역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('19b5fae7-771f-4279-8743-98d04a76de4e', '일림산', '일림산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1a178309-9724-4659-940d-e2a97258fcf6', '팔당역', '팔당역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1a795de6-d7bf-44eb-8298-7afd71c467f4', '인제대역', '인제대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1a907667-4d43-4a74-82f6-9e471567da47', '금련산역', '금련산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1a908a9f-4548-4d3a-8ad5-cb89a3ec69ba', '옥갑산', '옥갑산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1a918ee5-ca28-44a0-b1ee-81e474b9a78c', '퇴계원역', '퇴계원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1b164505-36bd-40e1-8344-e29723563a9b', '못골역', '못골역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1b1a8848-64c9-4ad5-a570-749e41436c66', '반월역', '반월역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1b53a5e1-b79a-4b4a-89a3-d3d0fff5e33e', '신대방역', '신대방역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1b5baed0-b9cd-41d1-8085-1b0252039571', '석남역', '석남역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1b959400-064d-4106-b5b7-b5ec6022bce8', '새말역', '새말역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1be3e7db-9d03-431b-a1de-7e27c59abc6c', '봉실산', '봉실산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1c128559-6bbc-4e2b-be3b-20f7b50ac0eb', '구로역', '구로역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1c166f2b-5353-46f6-b3e5-fda81f966c4e', '원미산', '원미산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1c33813f-4487-4d4f-9377-09c5011b1ef3', '시우역', '시우역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1c509595-b79a-4810-b423-4509cbaf37f3', '도화역', '도화역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1c5a09ea-519b-43c2-a5c2-f764c415d464', '초지역', '초지역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1c77be0e-1003-4f9c-a0a7-d680695bd6e2', '매악산', '매악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1d2cb9f7-1430-456e-b3bb-cdc29b649a7e', '롯데호텔서울정류장', '롯데호텔서울정류장을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1d75596a-97df-4a7f-a17f-09c8104d56d8', '서대전네거리역', '서대전네거리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1da10fbc-27aa-4e03-a40a-2684543f8613', '보라매역', '보라매역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1de68426-9ffa-48e5-aa76-a50f71771d74', '연산역', '연산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1dea0838-ef07-49c3-8322-695300bb6b20', '동매역', '동매역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1e41a55e-3862-4407-891c-8e16513f7ff4', '김천(구미)역', '김천(구미)역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1e47135e-944e-4226-b729-5e991366b6cf', '학여울역', '학여울역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1e6aba0d-24e8-4e3c-b116-b35198081ceb', '수정산', '수정산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1f1eb703-1dd7-4b47-9eb3-04b566b88d14', '쌍문역', '쌍문역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1f28ed67-b698-41ea-a565-a93bb22aa79c', '부흥산', '부흥산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1f2f76c0-a856-46ed-bbb4-a8094158e6d9', '수색역', '수색역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1f412eec-abc8-4965-af0d-55fa72198fed', '전포역', '전포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1f760e9a-f635-41a1-8def-5d3d1f3ebd0d', '별내역', '별내역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1f8987d5-7df1-4ff1-9f93-5b591f75e515', '금계산', '금계산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1faf19a9-41e4-4e8d-911d-7a1ab148c285', '두무산', '두무산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1feb2cf2-d232-45ea-a606-ec1e67cf6a42', '마적산', '마적산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('1ff74c99-9c32-4400-82a9-528d2cd61b74', '가덕산', '가덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('205d8a29-e6e4-4abb-830f-99460af471f7', '삼송역', '삼송역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('206d4820-692d-4825-871f-358da6519777', '천등산', '천등산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('20781c20-309c-46f3-9e8a-83ff09e05634', '성수역 2호선', '성수역 2호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('20b915f3-56cc-44ad-bece-cc85e2442092', '인등산', '인등산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('20c3ee33-31d3-4a8c-9f63-4630fe05fc33', '신원역', '신원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('20d2d842-bac3-4c1c-b56b-02e9b7d4a3a0', '태화산', '태화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('20e093e4-0c67-413b-8e8e-82292386ed13', '범계역', '범계역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('211f8526-63a7-42c7-98cb-de6f0356fdb4', '여수EXPO역', '여수EXPO역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2139cb8e-0c1a-4a31-a6fa-e466f1cae4fb', '영대병원역', '영대병원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('213e017b-44e3-4be7-8206-09294e2d71c1', '연호역', '연호역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('216c3d3b-05bf-43d9-a456-b2582fee1811', '계방산', '계방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2170b7e1-8b2c-49cb-83c6-7ff71b35b616', '명덕산', '명덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('21c26840-0b47-4956-b24b-6643be4f081b', '만어산', '만어산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('21c607cf-8950-4635-8039-29780cbc9946', '소새울역', '소새울역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('21fe9a66-e5fd-421d-89ef-3a872d768b70', '바위산', '바위산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2253c620-e277-4ccc-83ad-fdd25eac3993', '호랑산', '호랑산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('22820c46-3304-441c-9058-93e6bcffba51', '건들바위역', '건들바위역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('229b034a-f2b3-4d1a-97cf-ab5ca3d183cd', '어답산', '어답산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('22a09124-f39c-4ec7-a793-3c7cf8f38d96', '선의산', '선의산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('22a70f51-7403-4436-a342-c6d0b1084aa8', '유달산', '유달산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('22c06dc0-3805-4002-b019-936233c13f39', '신흥역', '신흥역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('22cdbe85-4a83-458a-88bb-5ae798d9d8f0', '미륵산', '미륵산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2328dad0-3fda-4288-84c1-aa402ed65c29', '동원역', '동원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('23748521-d854-4a36-b366-33c4d00f6a70', '방문산', '방문산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('23dea50a-bc02-4ea7-9a81-1a3b31ad426f', '하남검단산역', '하남검단산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('23f05953-68eb-47ff-b99b-b268de13e336', '금성산', '금성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('241cb52f-cbd4-449e-8866-f8eb44d58ea1', '지장산', '지장산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2427f893-475b-437f-af38-fa4f8e8414b8', '시묘산', '시묘산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('244601d6-9694-4081-a83a-3f05214735b1', '혜화역', '혜화역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('246152b7-bea4-4e5d-b4d0-ee6ff2ce2f5e', '송내역', '송내역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('24824c59-9701-4530-9aad-a942fe964678', '동구릉역', '동구릉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2485f774-e092-4140-8ea3-b50462e9d570', '각산', '각산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('24947cb3-7e86-4eb8-a92d-c21ded212fb4', '백운산', '백운산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('24aa2e12-e22f-4430-819b-0bea36bd002d', '모란역', '모란역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('24d02ed3-40c7-4e31-b23e-97bff8024cfc', '덕봉산', '덕봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('24d37b9b-de81-46e5-98a8-aec03586b20f', '대저역', '대저역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('24e309a1-d872-4b9a-bccc-6a6601b5dc06', '천마산', '천마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('24f96292-c088-412f-842c-72a0a28f4d7e', '오송역', '오송역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('250f0296-358f-4307-a59f-6c72c877fe8f', '동대구역', '동대구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('256f7fab-e711-4ae8-b7d1-03694c0fe7ac', '탄방역', '탄방역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2570a78c-f5e3-4424-a1d1-2f4bbc5f2953', '금곡역', '금곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('25f1983b-bbd3-43ff-8662-9886217bfa0c', '마장역 5호선', '마장역 5호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('260111c1-52ad-489d-ba83-93b9f0dc36fd', '응암역', '응암역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('261c9778-6d39-4c0a-ae47-7fe6fccd0c23', '양정역', '양정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('26219af3-76b2-44f1-9791-3d33fc3823ef', '용문산', '용문산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('267bafb3-22ac-42d4-87f3-50f71c6af78e', '병점역', '병점역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2684c7c6-6887-49dc-9a0e-770096c6764b', '화부산', '화부산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('26a31f10-75d6-431d-bdb8-3746f6f18f67', '경주역', '경주역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('26ab1854-f442-47bb-8475-a0939d87e42e', '기흥역', '기흥역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('26b845bf-1249-4e00-8137-ca2b8612eb21', '시청·용인대역', '시청·용인대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('26c2a575-afd6-46c0-ac0b-6270706ff186', '암사역', '암사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('26d513de-efb2-4b97-9cb7-fbc1941a9c73', '서현역', '서현역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('27272239-63c3-4d48-a64e-226ccb5d8800', '둔내역', '둔내역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2797cdcb-8a1d-4331-bf3e-fd8c57178a25', '방어산', '방어산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('27a1416c-cfdb-48bf-8527-cb0425fc55e8', '계양역', '계양역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('27a27494-4fd1-455c-9b53-6204c3d598cd', '공덕산', '공덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('27be807b-c3c3-4db8-9164-ce349d150308', '혈구산', '혈구산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('27d5459c-e1bb-4ac9-96da-00af55fc10ea', '칠락산', '칠락산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('27d9fc98-9ab2-481c-90d7-c6a5d83cace6', '동천역', '동천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('27dacc31-bf42-46b8-b2b9-1dbf394a7a29', '삼전역', '삼전역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('283bf74c-cf94-4657-955b-715b86329a77', '화정역', '화정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2852fb1a-8e96-485a-85b7-8fabb1cf52c3', '회문산', '회문산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('285da55f-ecf8-4fe5-bcd1-17aa0ec1fd1c', '충렬사역', '충렬사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2891c04b-536b-410d-949f-76ea4b10faa1', '원적산', '원적산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2941c98d-ee98-4b62-943c-3952499d1b57', '답십리역5번출구', '답십리역5번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('294689d0-b8b0-447f-90a4-a4a65e83a8e2', '갑하산', '갑하산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('296be2f0-d17a-4f45-83d1-0a55cacfcd7b', '한티역', '한티역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('298daa56-288f-43de-a674-22f5b32ac231', '밝얼산', '밝얼산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('29b934d8-1ff1-4bdd-b5e9-6197c63dd113', '신현역', '신현역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('29dec2ca-d704-42ed-b92c-fbe747a0eb00', '건대입구역', '건대입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2a2efbad-78eb-4504-a466-7e3a30d76665', '백병산', '백병산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2a3b5510-bf56-4a3f-91ed-750ec471d97d', '연화산', '연화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2a818f2c-7199-472f-ad43-6545e24c0723', '석계역', '석계역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2a9f7abd-916c-4986-951a-76f86632f459', '대곡역', '대곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2adb823c-58aa-4fa3-bd7e-7b7413f4f232', '개봉역', '개봉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2aeebbb1-5122-4ca0-9570-fc96363192c8', '선유산', '선유산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2b01eec5-6cf5-4b0f-8c87-2fcda1e2b14f', '백이산', '백이산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2b253c99-7c64-4365-947a-e8488ae19311', '영취산', '영취산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2b4cbf7a-b649-4a00-9fa0-e909fd9e80f0', '비학산', '비학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2b6f7bf8-6b81-438e-84fe-7e6ce83e8446', '번암산', '번암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2b763044-6218-4dd9-b97f-dc3505d47dcb', '향적산', '향적산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2b8db362-6f2c-476e-a8c7-8a3416764230', '금박산', '금박산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2baef46c-f921-4269-9c05-13fd96305d84', '포도산', '포도산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2bb14f97-d7bf-49d2-8309-1782d6e797aa', '영등포구청역', '영등포구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2bb994bc-e44c-400d-9da6-705aeb7f7255', '거류산', '거류산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2be45020-f576-45d9-8bc1-95c8997b88d1', '천생산', '천생산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2c078fee-1b72-4a67-92c2-94eda451718a', '마래산', '마래산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2c8dec11-24da-4898-8dc4-d60772227849', '연수역', '연수역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2cc11e9f-13ec-4fad-b523-d5dadb372bc6', '신연수역', '신연수역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2d066e6f-791d-412e-8c00-56b7705c2160', '동대입구역', '동대입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2da257a0-51e0-4a96-84a8-d1f162cb91f6', '을지로4가역', '을지로4가역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2dcd8994-3ff2-41e6-b0da-6c9935e3f6f4', '백양리역', '백양리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2dd17cbf-f285-4df3-ae51-0fa84bfb092a', '내방역', '내방역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2dd6c464-e05f-4b2d-b073-3c3f5596c1bb', '내동산', '내동산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2df9072d-03af-4b40-9dcd-155dcb1ed241', '안평역', '안평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2e091777-eb2d-4e07-9a02-64ff9d02848a', '상원산', '상원산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2e1be30b-a915-4744-bcb9-2494a474737f', '화곡역', '화곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2e31be62-26dd-43fb-93b0-ccfe6b7b0870', '봉제산', '봉제산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2e4bd770-0a6e-4398-9c07-423715b41a5d', '모래내시장역', '모래내시장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2e752b36-ee97-4174-9195-5e3ddeb04c78', '선운산', '선운산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2e9b21e0-bd47-4ff2-93ba-755ee4b7630d', '원당역', '원당역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2f2171ca-64c3-4868-92f4-720e24a34812', '신반포역', '신반포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2f2a2479-6e33-4b9f-8dff-e4488d135fcd', '황방산', '황방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2f3c8803-7d34-4af4-b66f-ae773d4468c8', '신어산', '신어산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2f71817d-fadd-43aa-b3ac-74dbed59d074', '태백산', '태백산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2f7b50e7-d304-4302-adec-581788ba7ff5', '장안산', '장안산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2f870cc2-9380-4484-8215-9d8c871e0e69', '무등산', '무등산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2faaefdd-93ee-4afc-907e-91f996d40720', '구미산', '구미산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2fe825ab-46be-4ff9-916a-4b5eac678eb3', '천관산', '천관산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('2ffe42ad-72af-418a-8817-5cad1d178b1e', '구봉산', '구봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3009d8bc-15c5-4698-b210-9ba75fc9ffd6', '구례구역', '구례구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('301a53e2-93cf-4e35-a814-64d49f4e5aea', '어룡역', '어룡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3088886d-0d3b-409f-ad91-22a8f1f5b4f1', '뇌암산', '뇌암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('309d3c4d-319f-4fe7-a9e6-bdf7451e1757', '부평삼거리역', '부평삼거리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('309d8611-9a16-4919-8c86-5c6df14954b4', '지내역', '지내역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('30a7f77b-ed33-4e5e-9d35-b26aeec899ef', '남광주역', '남광주역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3105a5e0-d2f4-4126-8808-7d0fd05ddc66', '종로3가역(탑골공원)5번출구', '종로3가역(탑골공원)5번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('31339f9a-53b4-4b88-9af4-10f22971bb66', '대운산', '대운산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('313d64b7-c4a8-405f-afa1-9492db1f65eb', '아신역', '아신역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('31e4bcdd-a034-4058-9e51-f52000b8a1c1', '사달산', '사달산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('31e6dee2-4ef5-4c44-8aef-207cff43600b', '민둥산', '민둥산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('32011a8f-e25c-4a9b-be6d-373bab3fac8d', '칠보산', '칠보산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3245def9-45bb-40e8-b8aa-e7770e2d2c0f', '대구역', '대구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('324b852e-0003-4052-a0bd-8239ab790b41', '백운산', '백운산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('325d537a-99e5-45c6-b213-b3e4d195d308', '화정역', '화정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('327c3ce5-4778-4bac-9a87-439281e21c8b', '방가산', '방가산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3285dbf1-e9e9-451d-8767-557c8dac4c80', '칠봉산', '칠봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('32a761fd-7f30-4964-bfaf-0eb4b1a37d2a', '다봉산', '다봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('330b12f5-73c4-4658-8acd-7356543544c7', '돈달산', '돈달산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('331b32d6-ae3e-4702-9b17-72e92a02f615', '광화문역', '광화문역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('333e3a21-f1ec-4fc7-a7f2-f9cc10573b87', '식장산', '식장산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3345374c-45d7-432f-a983-08c639fade6b', '양평역', '양평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('33ad1502-e5c6-4d15-bf68-4c9e8d478b49', '조비산', '조비산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3415fa53-2d57-42aa-badb-0c8406c9e421', '구학산', '구학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('34281627-6250-47ba-94b0-709084f86ec7', '구절산', '구절산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('348f5d71-aa29-4c1b-9c31-92b99c474406', '쌍용역', '쌍용역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('34a20e2e-e75f-4b84-aa6b-7b06487da0b5', '녹번역', '녹번역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('34f61aa6-cab7-4d24-904f-e4f27e4c06e1', '하단역', '하단역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3516a730-b7d0-46cb-9ac5-8296432d2846', '남위례역', '남위례역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('353429a8-1e91-4eb2-819d-d0bfa2b12f7b', '갈산역', '갈산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('357e73b1-7622-41d8-a848-9051b0c335c2', '가양역', '가양역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('358900ab-c48d-403c-a2ed-6b31272dc9a7', '오봉산', '오봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3592b248-8000-475b-8b50-2086f80a839c', '고양산', '고양산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('35980af3-c86d-4e42-a611-46890a029162', '청계산입구역', '청계산입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('35b8a60b-46a7-46fc-9748-1ccea2b8209b', '불기산', '불기산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('36114ebc-a67e-48b4-9721-179abef1c206', '경기도청북부청사역', '경기도청북부청사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3690acbf-9d04-41d2-b331-c4d53b543e2a', '작약산', '작약산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('36b45a4d-09f1-4d9d-873f-31eeab6ce2c6', '봉은사역', '봉은사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('36d495f1-756d-4a74-bba4-06d8459362de', '장육산', '장육산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('36e39744-c920-499e-a1cb-154c33cd03ad', '지평역', '지평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('36e79c00-2012-46fa-b759-b2ceed469178', '금강산', '금강산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('37186b88-4130-40e8-a3f4-d837998fdc0f', '공작산', '공작산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('37318d5e-7c55-4a69-b333-edf36c88cb47', '역촌역', '역촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('373ee848-cf24-4e9f-848e-9dd80de2e6db', '부산대역', '부산대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('374610b8-68fa-4a1e-9fb1-ba3b5591996f', '반야월역', '반야월역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3751f60e-d612-4bef-a92d-3fa0d9dc491d', '도락산', '도락산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('376483b4-251a-4f48-bb94-bf2b8bc9b2c2', '안암역', '안암역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('37b3f225-70f4-41d7-b584-bc28832e9197', '베틀산', '베틀산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('37bba4c1-3984-40d6-a3f0-f8fdfd22c7f2', '돈암초교입구버스정류장(한성대입구역방면)자전거대여소', '돈암초교입구버스정류장(한성대입구역방면)자전거대여소를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('37da0bf9-7cf3-45fd-89ae-4c93c1e34489', '횡성역', '횡성역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('37e97cad-4d5d-472a-a00e-dffa9c748456', '천황산', '천황산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('37feb4c7-f0bd-49e7-9c3e-941f0d0a4bc2', '4.19민주묘지역', '4.19민주묘지역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('38049dfe-c0bb-41d2-ba42-37746021b74e', '주봉산', '주봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('38947796-d181-4e18-aaba-c935e967d66f', '복두산', '복두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('38c945a6-2e70-46ef-bca1-b11308d2aeb9', '와룡산', '와룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('38fb59b8-187c-4ca2-b8e5-4cada2a8ba89', '아차산', '아차산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('38fdff21-034b-4699-852d-7f2b3591f9b2', '천방산', '천방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3900584f-08e2-43cc-9cfa-c1e6c5a0f57f', '몽덕산', '몽덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('39289505-bf9e-4bc5-bc24-5277997246a6', '잠두산', '잠두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('393cf0d6-8680-4215-90e8-60e9dda909fe', '보개산', '보개산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('39571f4a-751e-4d50-ad7f-11d69047469f', '석촌역(한솔병원)3번출구', '석촌역(한솔병원)3번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3a05a9b1-b85f-46fa-96c0-6bb93f3a428c', '동대산', '동대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3a3e06af-95f5-465f-a6ea-4e00d37c99f3', '소태역', '소태역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3a53526c-4daf-4cb5-9a76-f608656c282a', '무안역', '무안역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3a582905-ea1f-4c0b-b537-b20a515fa2b7', '궁성산', '궁성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3a68d640-c430-4741-bce9-d9d8e70390a4', '용산역', '용산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3a6ad21a-6788-4db9-bee7-8029c57a48fb', '웅산', '웅산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3a72d00b-b1dd-45c0-8238-bbae533ec362', '천왕역', '천왕역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3a9e5a1f-0ebe-4ee6-a819-9c05e1eca688', '영축산', '영축산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3ab53a17-1903-4731-a076-cd4389818bd6', '북배산', '북배산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3accd303-e7c7-4663-b82d-94760050d517', '무선산', '무선산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3b0cc341-426a-4059-aa0e-c016126cd97b', '공단역', '공단역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3b71953d-b7bc-4311-a31a-8f6442c5fb8c', '서울대벤처타운역', '서울대벤처타운역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3b9754d2-6f71-4b5c-9b62-ff973847da28', '용산역', '용산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3bb378f1-295d-4225-bb07-ee87dfe44c75', '황장산', '황장산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3bf0f93b-48b2-4f73-a11e-4ffd7349f00c', '설화산', '설화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3c05da96-7397-4dec-82d5-2876b98d16fc', '소리산', '소리산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3c096ef0-6606-4ebb-8c2e-debf1fac7e8d', '계명산', '계명산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3c11bd31-1e89-4823-9904-a7a594814e59', '괘법르네시떼역', '괘법르네시떼역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3c424930-bdc3-4211-b8c7-d61c479b0ca4', '소요산', '소요산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3c647878-2e88-493e-9a88-be0ce00f35c3', '말목산', '말목산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3c9659d5-298c-4fd5-9e92-a56f82af4e1f', '마장역3번출구', '마장역3번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3ca40975-43eb-4793-b26f-a8fca4e69597', '동촌역', '동촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3ca52343-cabe-4a83-b94e-8f4ebf7a8649', '온천장역', '온천장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3cf188fe-3d11-49dd-bdd1-2ad6348611d3', '구수산', '구수산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3d28de0b-29c6-4cc6-8109-378e1da378f5', '모후산', '모후산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3d58212d-8c02-4580-912f-a4e69c209df1', '흑석역', '흑석역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3d643f6b-3dbb-480f-9d37-49ef423cd888', '대모산', '대모산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3d704308-fa5d-4fc9-a176-962b773bf1a0', '남망산', '남망산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3d733d80-5fb5-4029-99ea-1bbbcc1dbdb3', '내변산', '내변산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3d881831-f190-4fe7-92f8-e6f3fc922991', '태전역', '태전역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3d8e26d4-5826-457c-b45d-ff81427af970', '위례산', '위례산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3d9d8667-8ffd-4a20-b87f-ae2720e5e45a', '월출산', '월출산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3da3500b-1533-43ec-8645-ee082df70c6c', '쌍촌역', '쌍촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3dc3826f-ad24-4116-b0e4-13d106051137', '도심역', '도심역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3dda8ce1-18c6-446a-8b5a-25be572b849b', '안동역', '안동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3df12118-7619-4bde-a109-e97698069198', '경수산', '경수산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3e038cfb-f906-41a9-9f1d-356a2ea3d396', '서리산', '서리산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3e0f38ab-7d35-4596-a649-25b4b25f2db6', '갈전산', '갈전산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3e3fff62-ad09-4e5b-a8a4-077468a64280', '수덕산', '수덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3ebcb7db-161f-4b3e-9f5b-7b950e364fb9', '팔달시장역', '팔달시장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3ec8c5fe-33b3-426b-937b-c19de8fa42eb', '연천역', '연천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3ed22f6b-5367-405f-a85b-113e28d59b0a', '덕갈산', '덕갈산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3f05b79b-57dc-4511-ac40-75a164a9aa57', '석병산', '석병산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3f116048-6276-48eb-8957-b419a7040044', '개포동역', '개포동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3f5446fd-4a09-497e-956a-e892faffaefc', '인천터미널역', '인천터미널역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3f54bf4f-5d39-4e2a-8bed-a0d5ad762965', '체육공원역', '체육공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3f60ad0d-1923-43c6-9d42-94c068aadbd9', '굴봉산역', '굴봉산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3f7f3297-a964-407c-80b1-38877255e8cf', '금단산', '금단산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3f8781b8-3ae9-4649-b676-b9b0f6d76f1f', '강변역', '강변역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3fd32d9d-b813-486a-a65c-eec7ac29553e', '접산', '접산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('3fe8a9f4-e730-49e6-a795-8bc245af8f57', '계산역', '계산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('400035c5-7f76-4603-8588-58e7d611ac01', '대명역', '대명역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('404fda18-d691-43a2-a197-5843ecfc2aca', '행당역', '행당역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('405134ea-5d8a-4a83-af32-28c314cbc764', '부개역', '부개역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('40808c01-7d28-4895-b5f8-440d4d9c4414', '부전역', '부전역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('40a25e90-06de-4fea-8762-6e0399446b94', '항공종합서비스KAL리무진', '항공종합서비스KAL리무진을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('40ba92e7-422f-47ea-a29b-a851c85a98e1', '신림역', '신림역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('40f61927-062c-4ea8-ba37-4fd7f6d2e74f', '대부산', '대부산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('40f922b8-51db-451a-b3fd-ad352e36c142', '마들역', '마들역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('410765bb-6d40-436f-8059-eb304166f346', '미사역', '미사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('411e9338-7153-4afb-b1aa-c1e3ee5e288b', '덕룡산', '덕룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('41439f44-d857-4f7e-890b-7bce022de82b', '동춘역', '동춘역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('414e6fe1-62e2-4963-9f28-b956b0d355ed', '천택산', '천택산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('416730a3-44de-47f9-86e7-8bcc990b6a84', '남포역', '남포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('416a454b-c013-41ec-bab1-43767c734c22', '입암산', '입암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4189a038-c1d9-4da8-ad40-5ccf0669e613', '순천역', '순천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('41d8fa2a-f0f1-49fc-96f5-793e0df217fb', '어린이세상역', '어린이세상역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('41db0192-2937-43d0-b9f9-84c8c87383d3', '평내호평역', '평내호평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('42009b73-388d-4432-8c87-3bf3664dbe39', '걸포북변역', '걸포북변역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('420b38ad-cdea-454c-be1c-e42a7ff3e51a', '강매역', '강매역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('42218dba-bd7b-4275-8e90-6fa2a527e3f3', '윗반송역', '윗반송역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('42488393-3ae1-4070-bc03-09ee809290ff', '호포역', '호포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('426a6f29-340d-4524-81f6-7e011531482e', '미석산', '미석산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('429c79a1-4655-4b9d-be72-e4dc9f329f16', '북성산', '북성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('42abd708-5354-4384-9914-34dfabc515f3', '구만산', '구만산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('42d7f43b-89c6-414b-85f3-d1f0be437f9e', '반월산', '반월산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('42e8647c-a867-4365-bc7c-28792c454df8', '명륜역', '명륜역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('42eafecf-71db-4374-a949-361692222bb6', '박물관역', '박물관역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('42ed6673-8568-4f2b-a759-9f69e3756b99', '노추산', '노추산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('43623353-c25f-4c13-9582-99c08a1f2348', '동작역', '동작역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('43a0b7ee-64aa-42ad-85d1-5ca5a5c8a7c3', '월여산', '월여산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('43a82d19-a3f1-4237-8194-338d82d53ff0', '충정로역', '충정로역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('43bd999a-4db5-4c0d-89ff-f1a7fe497817', '금정산', '금정산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('43e0629c-4db7-4404-afb6-ba3c4d1e102e', '서울대입구역', '서울대입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('444879a6-f6f3-4b3b-8aeb-acbb99aeb1c0', '북암산', '북암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4464986a-254e-43d3-a15b-e123438065ab', '원흥역', '원흥역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('44981f6b-5364-427b-9d9c-a6f57a68991f', '영주역', '영주역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('44b506f8-240e-4f6a-be37-93edcc56ab34', '계룡역', '계룡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('44cc79e2-98aa-4a72-af69-41679d980781', '칠장산', '칠장산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('44cedacb-8b01-414e-af9f-ed1d93c9cb2d', '장락산', '장락산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('452fdd46-9f65-427e-88e8-f3347212a69f', '지억산', '지억산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('45559105-7cf6-4355-a04c-20c915b2403e', '송파역 8호선', '송파역 8호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('456d61b8-7f9e-4892-b3ed-b8e1e8b749e3', '일광산', '일광산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('456e0591-cc29-4760-9ff5-a406b037eef9', '군자역', '군자역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('457f9760-a3ff-4a3e-b5ed-eb2550ef8c36', '상봉역', '상봉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('45c1a0ec-34be-4c1d-8f18-c91dc9ece593', '매봉산', '매봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('45ef7d5f-365b-469d-aac7-20bb3b618336', '일광역', '일광역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('45fc5a7a-6fa1-4616-a796-701820b092f2', '청우산', '청우산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('46087791-cd8e-4f21-8ca7-8e508c5ea560', '인천논현역', '인천논현역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4637fb60-a26d-4180-b4c8-2f3a4edecf63', '고촌역', '고촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4668c694-b447-4ad7-bb1e-d14bc83b521c', '관음산', '관음산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4669b528-f23e-4974-bad3-bdde0c05a8e9', '가지산', '가지산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4681bcfd-ff14-4e9b-b92e-2b298218156c', '비슬산', '비슬산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('46bbfa4c-0bee-45bb-94bf-01db2b6f305d', '효자역', '효자역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('46bd555e-92ee-4cc9-8329-95c3d075e6d1', '매곡산', '매곡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('46d9de0b-3a58-44a9-94e0-0cfb7df0bd8c', '잠실새내역', '잠실새내역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('46e32d9c-8665-4144-870a-3b9dac0b7f1b', '함각산', '함각산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('470f004d-3da5-4f07-a9a5-1639aa55d043', '무학산', '무학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('47169b56-7c25-41d6-b0f2-192b2fb1c1dc', '미궐산', '미궐산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('474f8be8-63e2-42fc-811c-afe037e6e677', '솔샘역', '솔샘역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('475a26ae-39c6-4d78-a911-407383ccd042', '경찰병원역', '경찰병원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('47ad8ea2-51b5-4e57-952b-fb388326f67d', '비봉산', '비봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('47cd8307-cd50-4f49-83b2-458ae989e208', '오수역', '오수역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('481b52c3-5034-461f-b471-c5cf8ee7c36a', '가재울역', '가재울역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4820d69a-45be-479e-8544-9c779fbd8fb0', '팔음산', '팔음산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4863f4a4-42c0-4c1a-b6d2-78d380a95bf1', '화개산', '화개산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('48d90d19-ea5d-47b6-b270-6bce80ce5172', '금사역', '금사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('48f8e4ae-2385-4028-9d4c-3a77179e58d0', '백양산', '백양산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('490b9cb3-c837-4308-91c0-7978ed1c635c', '신사역', '신사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('49534770-5a0b-4c6e-9087-aba2c7fb1e72', '선달산', '선달산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('49cdfc54-cf90-4ac9-98c5-7d405b75036a', '달월역', '달월역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('49d3d5f4-4988-4318-a36b-23fb0eb661b2', '선도산', '선도산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('49f16243-5280-4e6a-8bf0-00bdaeee8761', '좌천역', '좌천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('49fdd562-6857-4907-b179-d1ac65e37de9', '구두산', '구두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4a3d1c4d-73c2-4c08-a0cc-762581d33e95', '구암역', '구암역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4a75d1f0-1ee7-4576-9239-4419f266c20d', '행신역', '행신역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4a9d10e3-bcc0-4cdd-8a5b-590da8343359', '배방산', '배방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4ac59184-19c2-4838-8ad9-0af6af87b652', '인하대역', '인하대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4acac0ac-35f4-4efa-b709-90ec0fbb5f3a', '진천역', '진천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4b13ac30-8eea-4cf9-b045-ca3a28b72726', '신내역', '신내역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4b57624b-d6aa-4abd-925b-8568c75b5c9c', '통방산', '통방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4b8a8741-1017-4e62-8aa7-15108b45326c', '별내별가람역', '별내별가람역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4ba6fde2-3541-4074-aa2e-eeed3c77b29d', '동천역', '동천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4c2eab9e-0ba7-48c9-903f-223b3ced3302', '내당역', '내당역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4c3a1ca3-9802-4efe-a9fd-402e9e7b4436', '테크노파크역', '테크노파크역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4c8a43c8-e16d-42c6-b83e-26651ddfc261', '남산역', '남산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4c954b9a-40cb-46f5-8ce1-cbcdab6449f4', '창원중앙역', '창원중앙역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4cc2eb13-9c3f-4fe7-8dd1-832eef92db60', '지산역', '지산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4d1217dd-b494-4d7c-a55b-ef1bd79c63f0', '구리역', '구리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4d2ef31e-52b3-4c72-836a-e2b93e89ea03', '상계역', '상계역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4da6b7d2-fe87-4458-b540-a5d2dd7eda57', '매화산', '매화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4dc06e1b-0255-48d8-8332-b6d2177256f2', '무악재역', '무악재역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4ddcfa3a-9a68-4fbb-98f7-d06827278acd', '마포구청역', '마포구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4de1826f-6461-4fcd-b228-92fadc2dbc63', '남원역', '남원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4ded8b21-a726-41ef-bfd0-59abfc53d9c4', '덕천역', '덕천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4e250d07-a129-4606-9b4f-958c4c20c1ee', '명일역', '명일역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4e5b4f1b-559d-45af-9e15-6d46f78d0f78', '천지갑산', '천지갑산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4ea714ad-4db1-4f34-958b-3864ff64522b', '사리역', '사리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4eb72115-d8f5-4d21-8dc9-b7ec657dff90', '주흘산', '주흘산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4ee3a730-902e-4b9c-9216-b502e1574922', '월곶역', '월곶역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4ee8a769-5794-441a-bb1d-cfedbdfbd82d', '은적산', '은적산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4f031c77-0c5f-441f-97c7-f177d0bff18e', '양정역', '양정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4f36dd27-c805-4c0f-90f4-ad7ecdeb6e49', '고성산', '고성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4f3782bd-17b4-4368-8e4d-024ad7100b59', '문산역', '문산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4f765746-93da-4f65-a744-87abf7a5b306', '발왕산', '발왕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4f936b91-d5b6-4bf8-b815-1471d271b79d', '덕대산', '덕대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4fb338b6-ad5f-4e62-8e38-5fbcb27b9bf6', '당산역', '당산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4fd8ce0f-1531-4b2b-b30b-d86401b3944c', '운문산', '운문산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('4fe4a4f7-ffa2-4fca-b708-6f5a68171bad', '호암산', '호암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('501f7de6-79f3-462c-9598-56b99c86a795', '천태산', '천태산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('50504d2d-470f-4cbd-81fe-d5dff8db31f0', '주산', '주산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5064c653-4ecb-4a20-b029-4247a73696b8', '야탑역', '야탑역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('50a33d85-d517-4d87-be9e-aa9c1b18b195', '오류동역', '오류동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('50b6d70e-641b-47d7-8c7f-8297245fb64d', '민락역', '민락역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('511664aa-1395-478a-870e-66bb96894cfc', '이구산', '이구산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('51427ca7-673d-4c26-9376-27bd283365af', '월곡역', '월곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5164df3b-43f6-437b-b5b4-e8314f155a92', '장태산', '장태산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('517b12bd-b91c-4042-b512-6fbeee47b2ea', '물금역', '물금역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('519bd8f5-009f-4718-81e8-749510c63030', '송정공원역', '송정공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('519f6147-81b6-4ca5-9648-37624e0188d0', '월드컵경기장역', '월드컵경기장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('51bf879b-d5da-451d-92a0-bad4910f9e59', '장학산', '장학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('51e77199-3835-4d79-ae96-b5ba94356e24', '북바위산', '북바위산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('51f34528-cfbd-4914-a7c8-8e5c812a7f3e', '태화강역', '태화강역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('51f486b1-df98-497d-b41f-d9d9786ec743', '집현산', '집현산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('522d2087-87f2-4be4-9983-cbbef664fcf4', '부주산', '부주산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('525f4961-7c7d-468b-aca2-ea122ed7b889', '임학역', '임학역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5272ace7-30ad-467b-b4e4-347de2a5d94e', '해안역', '해안역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('527fea77-d8c6-48b4-bb66-2a04c01efa88', '평촌역', '평촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('52d003ca-9c00-427b-bdc7-6fd9fd27a95c', '금전산', '금전산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('532286c2-63cd-4ae4-82ec-77a8422007ef', '평창역', '평창역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('532665a6-17c3-492d-a06f-5fa716c6ce20', '삼랑진역', '삼랑진역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('537ae578-51d4-4f71-871e-94c6d63f44ca', '오성산', '오성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('53a92143-6e71-4ee8-a78f-093ff15b2960', '장령산', '장령산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('54075b1c-e3f9-4097-8b53-1d6649edac28', '쉰움산', '쉰움산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('542b16de-0dba-4d12-96fd-830108f23d1a', '한대앞역', '한대앞역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('54395393-b463-4986-950d-e848ed8d0001', '문수산', '문수산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('54aab658-712e-498e-8e9f-e53324855e37', '창원역', '창원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('54b635bf-4f9c-4173-81da-407f5ccd9cbe', '잠원역', '잠원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('54f158b0-9c1c-444f-9ad2-c5ad2d2a62c8', '지각산', '지각산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('551276c9-c62e-4c95-96e6-844be084f782', '부암산', '부암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('55aa1bd8-e89a-4fd6-802b-99c8b8cfcfad', '청구역', '청구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('55c53348-c186-44e8-85ae-484b0bc657b7', '남태령역', '남태령역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('55eb4693-ca04-4d4e-86ce-4aa49b696256', '천성산', '천성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('560a6310-24e0-4218-b287-22058a6779b2', '금촌역', '금촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('56350360-434d-4f42-a69a-1cce2b36f12f', '구천산', '구천산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('563e75a1-8c24-40be-9069-051ba8cfcd16', '동백역', '동백역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('56548862-6d0b-40af-b4d0-ea0a752f4f2c', '장림역', '장림역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('56629732-6a26-422b-be6d-bcdd809a8ae8', '도장산', '도장산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5680c1fe-fdd4-4f81-bcc7-1bbb091b0379', '인왕산', '인왕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('56ae43e6-909a-4483-8a48-a3b48260e1ec', '금정역', '금정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('56b02bcd-17b7-4616-8d11-4899b23512fb', '숙대입구역', '숙대입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('56ca2ad8-e662-4b91-92a0-d50b5709b8a5', '남산역', '남산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('56d11247-3d43-4b97-8adc-54d1d9c15102', '운흥산', '운흥산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('57173881-3b54-433e-b036-58dd2092a4db', '두류역', '두류역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5750d4f0-b7be-4b60-877d-40aeccb51a83', '안산', '안산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('576b7ea9-1f7d-48a3-809a-d548c5e1348a', '공항시장역', '공항시장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('577ee1ac-4e60-49b4-8230-82e0932a8142', '구의역', '구의역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('57d0c3d9-427d-434c-a868-75a7c29b37e0', '개인산', '개인산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('57d32aef-bb8f-44ac-b1a1-92afead8821f', '황학산', '황학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('57dfa91c-655f-42d0-89da-7470efd8c694', '만덕역', '만덕역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('57e6d227-a635-4897-b377-a1b79e77ebf4', '가령산', '가령산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('584030bf-d3ab-4b40-9cbe-eefee8b9d1b6', '석촌역(한솔병원)2번출구', '석촌역(한솔병원)2번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('587674e1-9556-4af2-8b06-13f3cf66ec86', '구성산', '구성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('58959700-20f1-4cfd-97fa-535bf17a203b', '신길역', '신길역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('589cd3a2-f3fe-4019-abdd-23ae0087fc92', '재송역', '재송역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('58ef9186-8ddc-430a-89b3-6a62e475ccba', '효창공원앞역', '효창공원앞역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('58efdd0c-6490-483d-bf31-6277fc0ebe3d', '두륜산', '두륜산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('59067564-0d3e-4399-91dd-89d8c51c2531', '시흥능곡역', '시흥능곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('592c5d0a-d299-410a-9da8-edaaab6fd287', '신흥역', '신흥역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('59a87cbe-232a-4966-adae-d7d80f0a3cd0', '중계역', '중계역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('59ab1aa3-6a67-4600-a538-e8572b7ddde7', '아현역', '아현역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('59bf432e-cba2-4985-a187-7e2dc1239d98', '월드컵경기장역', '월드컵경기장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5a3c0a5f-dd78-4226-8340-783559cbcce6', '춘의역', '춘의역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5a3ea40d-f74f-4b56-92b3-58aca5f54e95', '금학산', '금학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5aa5c3bc-af69-4ac7-8aff-22eaa9e43de8', '냉산', '냉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5aba65b3-a368-4ac1-bd4d-99d3e5e0706e', '성거산', '성거산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5af1a733-abb8-449e-bc96-20ee873ea1e8', '운정역', '운정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5b30ce1f-a48f-4e31-a76f-7e951c70ab02', '치마산', '치마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5b4574a5-f923-426d-b987-8b19e9140a6d', '학산', '학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5b45e2a6-0b88-453d-9184-e8790ca02717', '금병산', '금병산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5ba1bf0d-bc52-4fbe-a628-8efd1b51091a', '비산', '비산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5be17d5a-17d2-42ee-9ef9-cce62734ead8', '옹성산', '옹성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5c0ec72c-f310-4701-8eb2-33f9dea5544f', '까치산역', '까치산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5c23f163-7f77-45c6-9cd6-6bfa0e72236b', '학가산', '학가산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5c53043f-aea3-4a4f-9494-19ebb436e16f', '고래산', '고래산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5c7ff50b-8e52-453b-8321-81aedcaeb8b7', '광나루역', '광나루역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5ca977d1-1b2b-4a51-890b-88bb442f743d', '덕두산', '덕두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5cd7a6ae-9162-40d9-8c2b-7e5ed34c938d', '봉수산', '봉수산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5cf77a8b-227b-400b-9b62-8d5875751cef', '한성백제역', '한성백제역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5d09e8ec-871d-431d-bceb-fa4cdb7413f2', '중왕산', '중왕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5d357d31-b694-4b8d-8a50-6c0f81655aa2', '점촌역', '점촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5d492b6d-6fc0-4d8e-8868-4ca1ba363788', '남산', '남산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5d55283c-2165-4214-b362-debbc5fd602e', '주월산', '주월산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5d7ca197-fef0-41c6-aedd-206cc0647847', '거여역', '거여역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5d8dfe40-5ffb-40bc-bf02-80fe5c92c644', '오봉산', '오봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5de6a32c-ec4b-4122-b4a7-c1f397ac37bb', '명장역', '명장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5dec7b98-e230-4e27-afe3-de39c5420468', '조봉산', '조봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5dfc93e8-0b70-46e4-80d9-5a2c9b2d4691', '보정역', '보정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5e3ead04-f0b2-4046-bbfc-f6c8bc614d7e', '괘방산', '괘방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5e498d95-fdbc-49a2-bb63-a41b58cf3588', '만뢰산', '만뢰산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5e8fe878-8c24-488b-a8d2-926648cefb30', '하설산', '하설산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5e9fd139-58bd-4771-9be7-0c23eb260b67', '오갑산', '오갑산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5ec64d50-0602-4fab-85b8-c602ae69945a', '삼가역', '삼가역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5ed9a0c6-3fa0-4b81-b7d5-09660284ba67', '부평시장역', '부평시장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5f2ccd55-bed3-4b25-bb74-175a3380b7c3', '석대산', '석대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5f333abc-5866-48c6-bc34-0be9d5c5e977', '곡성역', '곡성역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5f867125-3a2c-4fce-b148-a2911d0d5a4f', '안수산', '안수산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5fe10e0a-cb82-4309-a7e7-d5c20601b091', '백마역', '백마역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('5fe87a12-a27a-49d9-8980-9730c6783182', '가오리역', '가오리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('600000b9-16a1-4f3a-8242-7a62b82ffac9', '온수역', '온수역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('60094db0-6ee9-4f92-a385-1c77ceac4e29', '시랑산', '시랑산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6028a902-5e7d-4d24-95dd-d2708a0f3b99', '둔전역', '둔전역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('60431086-da6f-48c9-8717-ee0579daed67', '오리역', '오리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6066f25f-bae4-4796-a927-9e261655667d', '광명사거리역', '광명사거리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('606d99bb-2c79-4453-bbe3-704eb9cb1e72', '율리역', '율리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('60a74f4f-406e-4c4c-90f0-ce2e48a81aff', '완정역', '완정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('60facc90-c460-43c1-9196-e1e7b6f1c68e', '성수역(무신사)1번출구', '성수역(무신사)1번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('611753fe-1e1a-4fca-a7b0-a18dd22e009c', '눌의산', '눌의산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('612d80b2-f8de-4a1c-990e-3e8eff821014', '고대산', '고대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('61428dc5-eb25-4483-b08f-4289105d38fc', '서초역', '서초역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('616f5790-325e-4f7e-9737-2e40c88428a7', '화왕산', '화왕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('61746224-7b3f-4189-bbcd-2736f3fe997f', '환희산', '환희산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('61abb633-0df3-48c7-b6f0-e8733ca59140', '신해운대역', '신해운대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('61d30199-e534-49fd-a282-7ddd06b94f63', '덕두역', '덕두역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('61f2c66d-ece9-426f-b6a5-69c2ae444cf8', '옹강산', '옹강산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('621b1e8f-7178-4f59-8056-ac3e8311a6d1', '두악산', '두악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('622e52cd-a5ff-4338-93de-17583882c2e6', '천안역', '천안역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('62543795-f582-4ed1-a387-351fb72f7e18', '보라매병원역', '보라매병원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('62afcee9-a8f5-44bd-840f-57c029a4156d', '군산', '군산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('62fd13fe-be69-40d3-8cea-5da0de8cfea1', '탄현역', '탄현역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('63097b6a-ba94-44c6-b8d8-64dc0030e96e', '금학산', '금학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('634cdb09-137f-4e5d-b04f-0d9b79f297ed', '육백산', '육백산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6355560f-db1e-419d-a747-d00db7a3f287', '운주산', '운주산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('63583b23-99d0-445d-839a-03ff98be37fd', '수락산역', '수락산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('635ef5d9-82aa-4318-afe9-bf68174f5a8a', '봉대산', '봉대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('63c49322-211f-42af-bcad-2e2f799399b7', '수성구청역', '수성구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('63f18907-6945-43ca-b600-92586ce824ab', '동해역', '동해역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('63f260b1-2b2f-4f01-8d4f-fb6d2f440190', '포암산', '포암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('64173c5d-64ff-4058-a16c-c62817b4e4ae', '송학산', '송학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6423cdcf-3eb9-4d88-b06f-752ccd42fab8', '서생역', '서생역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6434db21-c9c2-4c01-b46f-fb29b156225e', '오룡역', '오룡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('643c34a2-105a-4182-991e-af4f3b056e8d', '종남산', '종남산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('64505784-304c-4e04-bd74-88c08b9cfcc4', '망마산', '망마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('64831823-657a-4880-8d53-27f0ff0580e5', '춘천역', '춘천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('64af6085-1403-4f39-8361-1eb81891fbee', '대미산', '대미산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('64d9e247-3ab6-4991-8e4b-833e01e3f8e7', '양원역', '양원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('64f00ba7-8b44-41cc-866f-a36f34e4d25f', '용암산', '용암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6529a57b-7329-4277-b5b7-99a55b8c4f04', '의정부중앙역', '의정부중앙역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('65891864-dc2d-45ae-a505-bffea883826d', '지룡산', '지룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('659d24eb-2e3b-491c-977d-b7d593fb6e8e', '보련산', '보련산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('65d9456f-f12f-494d-b7cf-a652a02ddb33', '경운산', '경운산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('660e5ad7-a33f-419b-8119-128fb4f024de', '모악산', '모악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('66113fa2-d403-404f-aa2f-e60d79dacec3', '접성산', '접성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('661705ea-eb68-4244-bd13-be3adb18427b', '범내골역', '범내골역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('662d94bf-76b5-4ca9-895e-2f7a2922c593', '월악산', '월악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('663f4141-0b99-4824-8518-7b0daf02a462', '가야산', '가야산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('66434e2f-7c08-498e-aee9-96a9e4ddf198', '상수역', '상수역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('666a486b-4f73-4071-936b-9a5f5471007e', '정광산', '정광산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('66d29caf-4adc-4dbb-9e29-1bacab2d1f17', '영천역', '영천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('66d640ed-d906-431d-9cc9-8c0413505890', '성수산', '성수산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('66d75650-e910-43b5-a781-6c0913b8e329', '백화산', '백화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('67c85dcf-cc95-4a77-8cb8-b792f0b6e47d', '센트럴파크역', '센트럴파크역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('68075c2f-5da0-40d8-86d1-6d495959cbaf', '초록산', '초록산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('681d9e53-572c-4de1-a142-c6f1ac1e5cdc', '선부역', '선부역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('682134e4-a31f-4e0f-b2aa-e7b86146ba12', '중동역', '중동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('684b354d-3c55-4f58-95ad-e8abb4e38de3', '대방산', '대방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('68524f8b-8134-475e-96dd-e9225b4ba8e7', '다사역', '다사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('686827de-cfd6-479d-b540-443704f193fb', '소구니산', '소구니산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('68739841-0dab-4a65-bdf7-0d46cb88c5fe', '적석산', '적석산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('68b08cf3-bf12-4089-b5ff-d3bd16fe495e', '단양역', '단양역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('68c4eeda-d0ea-4efb-8b19-991c34d9a97d', '뱀산', '뱀산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('69010d70-b28a-46a7-9600-9da01988aa05', '신기역', '신기역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('69215c2b-4474-4b08-9662-247e1cbf42c8', '당산', '당산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('697fcbd2-1080-45e6-901b-908f0f794170', '세마역', '세마역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6982128e-60aa-4c9a-a820-001ee711b39c', '성서산업단지역', '성서산업단지역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6996c80a-e726-4294-92df-6d05ce2f1da8', '무이산', '무이산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('69ad852f-791c-4f7a-b4a3-2244fdf9d544', '개화산역', '개화산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('69b24d79-0efd-453a-bb53-07aa4b9b817b', '하서산', '하서산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('69bab70e-6b1f-4dd0-9ee7-9a7d6d95c576', '킨텍스역', '킨텍스역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6a1848c4-419d-4715-b273-de9677d18143', '수원역', '수원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6a4d9c01-734a-4808-85f2-12c2af9960e1', '중앙로역', '중앙로역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6a4e79d9-8370-4181-8f48-4804c36d429b', '논현역', '논현역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6a59a216-8936-4278-b1e0-4f7522eac722', '광안역', '광안역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6a5abc69-51ad-4e27-bab6-f02785f4d859', '여계산', '여계산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6a778263-8b00-41f8-bc87-09bacc12aa6d', '월대산', '월대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6a7b03f9-7a38-4811-bf57-afb2be96523b', '사평역', '사평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6abb3692-8ad7-43ab-9f61-9f9f7b4fe267', '신당역', '신당역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6ad53b01-193e-4f50-8468-e9057c67daaf', '사향산', '사향산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6ae13ef6-b5cc-43bc-b9a9-b5931a33017e', '동대문역', '동대문역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6ae766bd-defb-4210-bffb-3c54b1580520', '화원역', '화원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6af9fac5-d9c1-49e5-8df0-dba21254688f', '등촌역', '등촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6b10e428-2d13-4c15-a948-dda419760fec', '대사역', '대사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6b15b0d8-c79a-42fb-9cf5-b56af62c1fae', '용문역', '용문역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6b3314e5-0737-49c9-a172-9312c442a573', '전곡역', '전곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6b46a0ab-d6bf-430b-85e6-e50ab5b5e616', '목령산', '목령산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6b59b837-67b3-4827-b3d6-b35ec38aad44', '곡달산', '곡달산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6b6e360d-0268-4808-afb5-aac2a6a6a2a0', '정암산', '정암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6b8e9484-1f19-47e4-bd74-d67732662958', '백석역', '백석역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6b993be6-bb43-4b41-b330-37c526073314', '장전역', '장전역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6ba7bddd-ba03-4e71-b686-06c8cd5f2707', '하남풍산역', '하남풍산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6bc8cff1-6106-4010-89f2-020cce236d74', '운정중앙역', '운정중앙역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6c062264-ff7c-480a-8ead-2f3efa097221', '대곡산', '대곡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6c06c7bc-fb37-4c76-9f41-48ded5167b3a', '신목동역', '신목동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6c43dc08-e061-4549-aea4-2cc74acaed5f', '백석산', '백석산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6c4e7219-091b-483e-a130-532b34a0ca39', '중동역', '중동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6c5a3597-afb9-465e-bdac-95f7c9c30c90', '마복산', '마복산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6c8fda95-daa5-45e8-ad84-a257c985c1d6', '마두역', '마두역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6cbbb71c-4c11-46f7-bb93-04eace7bba4a', '사릉역', '사릉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6ce1b192-ab79-4e75-ad14-b4c5a2e1bf88', '독바위역', '독바위역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6cf36405-00b8-4a72-bea2-72cc4ad08ad3', '보광산', '보광산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6cfc31f4-8c52-4913-b138-73798a9a6b4a', '안심산', '안심산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6d144edf-9e61-4d7d-bd0f-464a917423dd', '봉화산', '봉화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6d27d2c4-a3e3-4d19-b776-962de0639175', '수정역', '수정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6d5087b9-07a5-482c-81f0-669d7b6324e6', '단봉산', '단봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6d54787b-1ce4-46dd-aef4-7707886fdf44', '까치절산', '까치절산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6d60c901-d060-4bda-8e28-c2b8a193c742', '덕암산', '덕암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6d62af95-209a-4fb1-ba88-2e3c954c2c4d', '적상산', '적상산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6d649152-ad15-4cf7-8350-fcfe3302522f', '황정산', '황정산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6d754168-5bf0-4e2d-b791-30d3504a961b', '나래산', '나래산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6d781593-0660-412b-8544-a31f7150a2a8', '점봉산', '점봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6d813c34-9704-4813-a429-82a829f02359', '매탄권선역', '매탄권선역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6d8b8aae-ed0d-4e73-9785-b89e8843da35', '석촌역 8호선', '석촌역 8호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6da291a3-78c0-44d9-89c8-2ea3f57612dd', '지축역', '지축역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6dbce94c-bab8-4cc0-8344-5656c9175418', '반포역', '반포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6de6570d-e4c6-46d7-84fd-c99639305667', '신용산역', '신용산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6e0de38b-93f3-47f7-9741-b2a38df009fb', '오시리아역', '오시리아역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6e2368d2-332d-454b-a024-843fb8a33754', '칠봉산', '칠봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6e3e17c3-9b23-402d-8455-7ca5b1b07ab1', '남영역', '남영역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6e65809a-19e9-4fe1-9d12-7eef0e6b99d0', '절개산', '절개산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6e67c849-ca08-472b-a09c-8421df5c2902', '운제산', '운제산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6e6f2720-6263-4e84-a360-19ed5843afd1', '무지개산', '무지개산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6e9b9684-9085-42bf-8dc4-fcac1565c0fb', '왕산', '왕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6ecc9ea2-7fe1-4dd3-bc8f-f8be52acb24e', '덕고산', '덕고산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6f25ac6e-9c5d-4405-9aad-21b72c44ace4', '현충로역', '현충로역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6f266746-2439-47da-b256-07cb9c085cf2', '동암역', '동암역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6f77f4b9-09ed-422f-b28d-6d0a2a78a442', '팔공산', '팔공산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6f90db2e-a89a-4000-a1f4-70744f410257', '방이역', '방이역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6fc28ba0-b1d0-413c-9de2-255c56d0d407', '영통역', '영통역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('6fe67c2f-e1be-44ca-adc3-529f4db6fdff', '허굴산', '허굴산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('703c5464-3d09-40d5-b728-5476b821a62b', '운서역', '운서역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('704dbf10-b931-4e85-b7ef-7db96ecdae29', '어천역', '어천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('70698188-2879-46ee-beb2-c05663020b3f', '보평산', '보평산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('70a71f79-ee63-4846-85e4-53d1b6800721', '마니산', '마니산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('70ac4ed1-105a-43bb-a992-0f059017359d', '홍대입구역', '홍대입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('70bd69e8-73bd-48e7-8451-c7109ff8d28f', '몽촌토성역', '몽촌토성역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('70de43b5-5e01-4fca-876b-54ad490724bd', '수리산역', '수리산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('70e2845f-b6d1-4b2c-8f46-9c482460fceb', '운봉산', '운봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('70f50f11-db31-409e-b523-dead27820eb9', '정부과천청사역', '정부과천청사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7106fad3-9f74-40f6-a780-4049263f9575', '천을산', '천을산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('71cb77e5-a0fc-461d-a866-f3076fa8b984', '굴암산', '굴암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('71e74b53-2823-4ba7-9ece-52a704a943c3', '강천산', '강천산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7206f2f7-3419-43e5-b9d7-1e23da9bbb08', '상록수역', '상록수역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('722cf96f-0f0b-4c97-acd4-d0a0fa41b588', '전대·에버랜드역', '전대·에버랜드역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('722fdde9-e402-4f53-bd14-58c1ea330f28', '지곡산', '지곡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('72918854-523b-4eee-a4da-feefcf93bf78', '망경산', '망경산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('72a90cd6-6678-4c5c-aae4-ff388a9c5b45', '솔밭공원역', '솔밭공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('72b696df-991b-46ec-b83a-85c065cf2c34', '매천시장역', '매천시장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7312392a-fabf-4b66-a398-cff103845e5f', '개천산', '개천산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('73164b4c-d32f-4987-875e-3a83fe45f982', '도봉역', '도봉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('73604c09-df89-49e1-acdc-94035babbc90', '개운포역', '개운포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('736fd25c-2a7e-4770-a22a-f4def614cdc6', '능걸산', '능걸산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('73bca396-b3a4-444c-8a39-3a589ee49bd3', '서문시장역', '서문시장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('73e73d89-717e-446d-8d58-98edc1aa25c5', '돌곶이역', '돌곶이역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7452cc9b-c817-4c87-bf61-08842301d358', '진주역', '진주역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7479c40c-0470-4422-8a79-ac7fedf8c440', '신풍역', '신풍역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('747e5749-3fc0-48d2-aa97-8aa698494d92', '부천종합운동장역', '부천종합운동장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7488ec2e-36fd-478e-baec-75084f3e1afd', '다락산', '다락산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('748a11a8-57ba-4897-836b-362aba9dc0e1', '좌이산', '좌이산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7499b98b-2038-4b16-bedc-d0ae92a83b84', '임호산', '임호산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('74d5fa79-9d8f-4e18-92a6-4bc9570e7d95', '대공원역', '대공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('75803e46-e611-457d-8497-8abce4b78c75', '시흥대야역', '시흥대야역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('75856949-a987-48ae-beca-b6854eeacf8a', '거제역', '거제역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('758d9ae8-4735-461c-961a-4cd98f99e9b7', '용화산', '용화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7593006b-e504-498b-860e-ef63a3bdab1a', '상왕십리역', '상왕십리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('75a7d8a3-20a8-487a-887c-b13e9719b52f', '양재시민의숲역', '양재시민의숲역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('75c56237-58f9-40b7-9dcf-6da4713a2bf0', '냉정역', '냉정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7602ba06-2258-4c10-af14-4d1af3a47853', '자갈치역', '자갈치역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7644a4d9-5f14-471b-9cd2-fd45c6e34750', '굴포천역', '굴포천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('764bd917-040e-4574-b6cf-b71f487a2e62', '능곡산', '능곡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('764c1934-d769-440c-bd82-7f7715805f4a', '마곡역', '마곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('766a507c-6138-45cf-90f5-5cb40fd52413', '삼성중앙역', '삼성중앙역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('766b277f-6ec3-4bb0-84af-4c99027659cd', '무갑산', '무갑산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('767b9eba-04ba-4900-a9b5-7c9db2963864', '낙화산', '낙화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('769fbbb2-b826-44c6-b223-33fe71eed53c', '달음산', '달음산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('76d44521-dac5-41f7-be95-0244c4d16b55', '괘방산', '괘방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('76ed1eb6-5e7a-4ce1-ac2a-f95667fc63c2', '마포역', '마포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('774a9748-d00c-4ea3-b7b2-4dab9ccb424c', '여의나루역', '여의나루역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('776be278-b5c7-4987-a716-aa684ea39d82', '낫개역', '낫개역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('77a8a431-7f7e-4c36-8d6b-a69fa2de1c13', '천마산역', '천마산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('77cb85b2-3e57-48fe-ae1b-29a909de53d1', '마대산', '마대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('77d4222e-8e73-4e83-8dc4-05d1680fd539', '둔촌오륜역', '둔촌오륜역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('780783f5-cbd7-4fdd-b1a6-f9aa16b3b811', '안산', '안산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('783f3589-4a47-44ce-a20b-5899d840b5d1', '미숭산', '미숭산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('78609436-bbc8-4181-8c86-cdff98113396', '신천역', '신천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('78a4c3e1-fef2-4cbd-b97e-126fb2d321c2', '대성산', '대성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('78c6eae7-5f78-454b-b669-58b855938334', '주봉산', '주봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7908b1a2-1c6d-4791-a8cd-4917ee5ef110', '중화역', '중화역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('794e07bf-e3f9-48c9-b113-31a02ec946a6', '설화명곡역', '설화명곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('798f4273-859e-4d72-8e9b-7b0b77732f86', '광흥창역', '광흥창역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7997ebe5-fc35-4deb-b800-84bd9206a11e', '하동역', '하동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7a0afa4e-0811-41ec-95d8-fdf96c87462e', '성남역', '성남역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7a280fda-a447-4288-9d50-b4adb5d4341a', '해명산', '해명산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7a324e93-db3a-4758-be9c-2cd3de1fb8bd', '녹양역', '녹양역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7a4107e7-a036-4e11-83ad-90336fcf0e7b', '가리산', '가리산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7a5c019c-7673-4aee-9677-5235944a1bfe', '추화산', '추화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7a61d173-8e2c-403c-8183-2d796f87d2f1', '한강진역', '한강진역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7a65664a-a0d3-4d98-a642-e6f15883b1e1', '소뿔산', '소뿔산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7a760bcc-1c74-4f6c-9b8d-34b6df21b099', '광운대역', '광운대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7acc0015-85ef-42d0-9e10-fb8b032f7003', '예봉산', '예봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7ad049c6-c3a4-465a-a6df-ca18dc25c427', '독실산', '독실산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7b1e688f-3154-4d06-a4dd-5c819869e3ed', '중원산', '중원산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7bce96ed-910b-48b9-8680-5cc583b29398', '오산역', '오산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7c0fd3e4-87c9-4956-893f-630567c7ec3b', '공항역', '공항역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7c3e7f80-6ea0-4829-b7ba-9017e72f17f8', '감전역', '감전역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7c3f98a5-d0f4-4a12-a263-583d6edc6958', '윤산', '윤산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7c4516c7-5a08-443b-b9cf-7105135f22a9', '운달산', '운달산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7c54ea71-0d8e-4d44-994f-1b8eee0e6bed', '발곡역', '발곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7c661953-5a68-4fa2-92be-5260178193a7', '자양역 7호선', '자양역 7호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7c8ccfd1-8186-4966-b23c-e2ed96c6272c', '어등산', '어등산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7c9d95c5-9df5-40b3-827e-2106cb32abf3', '군포역', '군포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7ca6be24-2a85-4902-831f-b9f8692a0292', '운길산', '운길산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7cea8edc-574c-4649-80ed-5ee018e42015', '함백산', '함백산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7d347dc7-5c21-473f-be56-78f8defd74eb', '기룡산', '기룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7d40a4b2-2a4e-44c7-9f0f-493a05b9d10f', '보두산', '보두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7d6340d2-bc3d-4739-9461-8565cb76b483', '범골역', '범골역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7d6b3437-9612-4fe1-a9a2-5147ca3da49c', '아홉산', '아홉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7d6cecf1-386d-4a45-b4d8-4d7a18df515b', '성치산', '성치산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7d79bf41-5aed-4680-98fe-bab426de56b9', '양주역', '양주역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7d7ec5f5-ce40-4dc0-ade2-a69d94ca809d', '월명산', '월명산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7da69581-29e2-4662-aef5-4aeb2acb602e', '호명산', '호명산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7daab6b6-865f-498e-9780-451c2d27c2bb', '개화역', '개화역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7db8f06c-f421-42b6-b71a-13a65daabaae', '대동역', '대동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7dba6651-4f9d-4d4f-8ef1-368d04e936cb', '중앙로역', '중앙로역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7dc6bcf8-0e5a-4f3c-9705-aada12a832c7', '용두산', '용두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7dca929b-076c-4ff9-93cb-c44a3459e5dd', '종로3가역 1호선', '종로3가역 1호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7df82997-8d08-45bc-adaa-2ed7ee743315', '종자산', '종자산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7e144b02-d8ff-45f8-89b0-20f44ccbc6bd', '내장산', '내장산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7e2f4470-8010-46a7-a5d2-c7106d53ba90', '창안산', '창안산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7e31631a-87a8-4ca7-a67d-4e97a00c1307', '망모산', '망모산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7e41d368-87c1-4747-b706-60b2b1b08e07', '계족산', '계족산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7e513d80-bb10-485e-9c51-b3338f101036', '정발산역', '정발산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7e561746-0d8d-47c9-917e-4eb3b63575a6', '오룡산', '오룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7e5cc534-2b34-4c38-bcf1-afc279e15236', '삼태산', '삼태산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7ea21cef-391b-4866-9130-0d5a424dd407', '구미역', '구미역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7ea9ecf0-08fe-4f22-a045-3031155397ba', '구파발역', '구파발역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7efba7ae-e45d-4742-8198-4eb905f65389', '방태산', '방태산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7f1f4931-a659-4f0b-afa6-e2505e2a996b', '우암산', '우암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7f448fcf-08d5-4abd-9302-2deafe00b33d', '상일동역', '상일동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7f7ea408-8cc8-43e5-951a-01b2f1265caf', '인천공항1터미널역', '인천공항1터미널역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7f9e16b0-e15d-4e03-a3ce-f821cb082929', '시청역', '시청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7fa6fb95-a90b-4c57-8ccc-f3029f67c899', '고려산', '고려산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7fac7dcf-b223-42c0-bc85-d3f813e02949', '한우산', '한우산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('7fe43719-0db2-46e1-becc-4c7490b0dfa7', '노은역', '노은역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('80281acb-3d55-477b-ba71-734f3550e591', '여귀산', '여귀산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('804de64e-d52a-4952-bc2b-c995f8165e6c', '남창역', '남창역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8056a617-2bba-4f8e-8764-4776e8270f00', '남한산성입구역', '남한산성입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('80a2d0e3-618d-4c5a-8aa8-6dbdb39c2ecf', '조령산', '조령산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('80a5c9db-27ce-4647-b116-cdf4383a7686', '천호역', '천호역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('80aca3dc-d319-450c-8900-d1b734ed08e3', '설산', '설산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('80bebecf-1062-4de6-a588-4b788b6b9096', '봉명역', '봉명역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('80c30a19-58cb-4426-8322-681d47f47496', '언주역', '언주역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('80e4a52e-d607-45a4-97cc-c92b251c30f2', '채죽산', '채죽산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('80f94e68-61e7-4aea-a3f4-f6f00208c0ac', '칠곡운암역', '칠곡운암역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8106541d-425c-4c33-a886-58e9112ed0fd', '미아역', '미아역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8170fc49-78d1-4f55-b624-7c543ec8c81b', '검바위역', '검바위역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('817eddf0-cf05-4f80-b4a9-f796d31896ce', '어래산', '어래산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('81a2e01b-3653-472b-99b7-8c710b5f67ac', '이명산', '이명산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('81a725df-2b4c-4fb1-8cc9-ebf9c0f560cc', '노량진역', '노량진역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('81d8b759-2920-406f-bdd6-ceceeba72113', '을지로입구역(하나은행)1번출구', '을지로입구역(하나은행)1번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('81e6a14c-4ac6-4b5d-b9c3-45bcbd60af6e', '고촌역', '고촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8222e923-422a-458e-ac05-c4c9ad6a82cf', '달마산', '달마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('82812a51-fcc1-422c-addc-40e16362fbb9', '곡산역', '곡산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('828ba928-eb01-4fc2-9df3-8b63068f28b2', '영등포역', '영등포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('82cd2795-36b3-4755-83d8-3588ba3ba03f', '도곡역', '도곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('82e8627a-7a37-4fdf-90de-ea1f11b8c7ef', '도드람산', '도드람산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8310fb9f-9a3c-4a23-ada5-8a6142effe96', '안지랑역', '안지랑역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('83117c84-a6bd-49ea-84a7-a257cb3e70c4', '한국항공대역', '한국항공대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('831d0c4a-6f9d-4ab6-88c0-a4621c862f0a', '남성역', '남성역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('83224206-68ef-494a-a961-e97817e54a31', '길음역', '길음역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('832a8e2f-d4d3-43b4-93c1-906b10e9f36f', '망진산', '망진산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('832f53e7-03eb-496c-896a-8ed50b5e2406', '김량장역', '김량장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8381f155-5f34-4f34-8929-34420bb228b3', '선바위산', '선바위산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('83822d1b-c546-4d34-8abd-13f8c5577798', '청명산', '청명산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('83af9866-b838-4a3d-857c-ff3d0df14839', '덕성산', '덕성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('83b5e541-259d-4cfa-83bd-21890e9f5202', '왜관역', '왜관역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('83b71b6e-e867-407e-9d0c-0ae51486ee29', '계룡산', '계룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('83b7de44-0c1e-4299-a6c2-5b622a3bf330', '태기산', '태기산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('83c63dda-b487-4235-aa35-fe9b687c5414', '용봉산', '용봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('83cb0dbb-3079-4b1f-8f02-a43c193ebf0e', '월촌역', '월촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('83d424c2-29d7-492d-a077-da494cbc025e', '흑성산', '흑성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8400c6d4-e58e-4ec7-a98c-4f6f76affe98', '해협산', '해협산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8432b989-4d77-4a3d-94ad-6b9e86f1b3a8', '흑석산', '흑석산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('844837c9-7298-47e0-8b38-9ea4f2480b88', '학동역', '학동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('84a7098f-02cc-4eda-8d4c-d27bc0727462', '북한산', '북한산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('85181e74-cf48-4d66-b8b4-2c4150de7ae0', '대연역', '대연역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('851ea0c7-635b-483a-a5d1-042d7ec20ff5', '제천역', '제천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8530cd66-8ee3-4dd0-ab90-8f80698f391b', '망원역', '망원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('857b0622-762d-4837-9451-02471fe1a547', '석촌역(한솔병원)1번출구', '석촌역(한솔병원)1번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('85cb1b9c-4bf0-4b39-ad9b-8fcece829ec3', '덕지산', '덕지산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('85f0d87d-dfd2-4804-9c57-cf97fc8003c6', '각희산', '각희산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('86001e6d-11e3-46a5-91b2-6e81f9dd98bc', '천안아산역', '천안아산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8644a23e-7dd6-4f29-a550-18818b609fe7', '신불산', '신불산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('86539011-87d3-45d2-ade4-1c4869f8703b', '선유도역', '선유도역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('86766d95-9ed2-48c4-8d94-b9732387caf2', '망우역', '망우역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('86853964-fcf4-4a90-a2a5-219ce27fe021', '원인재역', '원인재역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('86877692-c4b4-42f4-a15f-0f0eb5d4309e', '금호역', '금호역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('868cb107-8387-461a-a84a-168b8966ad43', '고산역', '고산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('86d4bd7f-c285-4bbe-bd14-0620c5d1dd41', '희리산', '희리산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('87344308-21d6-4cd3-bdb4-609282b83d73', '시청역', '시청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8745a5af-8620-4a6f-ad9e-83aa9dcce236', '가은산', '가은산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8776a41f-6dbd-46d5-a33e-68756ac4654e', '고령산', '고령산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8786fcf7-9bb4-4233-90fc-e4ee6673eaaa', '과천역', '과천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8793c751-98a9-4915-a810-82ec0a89dadb', '우두산', '우두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('87e24c80-ce40-4227-8384-272249df1ee4', '신평역', '신평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('87fb8928-a412-49dd-8981-54c865bdfeea', '어린이대공원역', '어린이대공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('882b1c4a-c622-42f9-ac77-58bc8ea77dc3', '사당역', '사당역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8838ce2c-5d0b-460f-bc87-ed05f94e499a', '금남로4가역', '금남로4가역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('88915419-9688-4820-9826-fce3f825ec29', '마천산', '마천산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8896f20a-927b-4d86-8e92-c8ff01c9db38', '진접역', '진접역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('88beb2c5-7ddb-42b2-84ce-469cf9951ec1', '동래역', '동래역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('88e479c0-38db-4149-93b4-5efca49606e1', '자굴산', '자굴산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('88ff4c7d-0f6b-4f29-a796-076c61f3d1e6', '숭의역', '숭의역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('89654416-2d5c-401d-8e90-983cbbff88a8', '구래역', '구래역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('89b0dfb3-6bde-4a6d-8484-7c1eaf4d9efe', '한양대역', '한양대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('89d30cb4-4a1e-4474-8e1e-86aeced27c0d', '입화산', '입화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('89d55012-c1c6-4823-9ff4-4f3e91317031', '천봉산', '천봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8a22f0e3-593d-4d7d-a857-a51d54d9e34e', '보개산', '보개산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8a55ec37-a2c8-4a01-9534-17a1b9b0c2d7', '장산', '장산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8a63709f-294f-4506-b886-0c5d7e154fa4', '전주역', '전주역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8a85ff1b-0e6c-4eed-8ffe-77ad2a71c3ee', '월평역', '월평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8a87609d-11da-4f19-af3d-eef125eb0ba3', '백암산', '백암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8abc57cc-3cd8-4242-814a-e48b35ba21a2', '연인산', '연인산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8ad60e2d-56a6-4481-a324-0b6bf0db6882', '기양산', '기양산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8b07d0e6-337d-47a6-a1a1-6b18142b119c', '복계산', '복계산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8b283f6f-11be-4b8f-bdca-a6f2139f3bcf', '영대산', '영대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8b40ffc7-3855-4f2f-b110-9224ef0f18b7', '샛강역', '샛강역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8b8fd214-4997-48a3-a1de-328d31ad5c57', '대학산', '대학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8b90e4cc-c512-45f2-beca-9a02107eb382', '의왕역', '의왕역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8c0ea117-cfa4-474a-84be-39e17a95bd19', '창신역', '창신역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8c3bb638-ef42-423e-8327-0e0442e01228', '남천역', '남천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8c5a06f0-9c91-425f-85bc-ced2bcdb7a20', '단월산', '단월산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8ca6833e-a1bc-4b4d-8684-25b78cfe7b8b', '성환역', '성환역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8cac33da-0332-4214-8fd7-ac041f101d99', '송도달빛축제공원역', '송도달빛축제공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8d1e508b-d3c9-489d-9ac2-3d208fb7b2b8', '수성못역', '수성못역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8d92efcd-b459-42d0-9a0e-f38a8df30cd0', '반석역', '반석역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8da0ed68-c9f5-4a37-9d33-ef2256f40e86', '보평역', '보평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8dd844fd-c91f-4787-9e80-6abb63e253e6', '한성대입구역 4호선', '한성대입구역 4호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8dede5dc-2704-412b-b777-553757e6a4d5', '팔암산', '팔암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8e608971-f83a-4a86-a9e2-9f7d63f4542e', '불갑산', '불갑산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8e912e22-a428-4297-9e5d-6daff18762b5', '반월당역', '반월당역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8eacad53-fca5-4752-8bc6-33e745ab7709', '동오역', '동오역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8f248806-49e0-4c4a-af68-ec1c6294fe25', '동의대역', '동의대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8f3d4f0b-9c69-4566-9e23-2a83c60b1d8d', '산곡역', '산곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8f66a1ad-e7e4-456e-8702-4398bb390325', '통고산', '통고산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8fe1a49f-e807-4819-9e10-61645be7a879', '단산', '단산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8fe44ee4-25b1-4496-b1f1-b04c1e802334', '서울숲역(에스엠타운)5번출구', '서울숲역(에스엠타운)5번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('8fe490c1-7b7d-484c-a0db-f31bb2614c5e', '철산역', '철산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9003f682-60dc-491a-89f4-c45ed67fc877', '상무역', '상무역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9027b8d0-6a02-4094-8609-cbd5ce8f88ba', '안심역', '안심역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('902aae9f-64c5-48f7-92d3-431a4793d9c3', '석룡산', '석룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('904f572f-3cc8-4f31-96fd-2f18466ae09e', '금물산', '금물산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('90eb32b2-5133-4411-abf0-11fe7f7d4567', '백화산', '백화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('90ecafde-2187-49e6-b94e-a782b5289f97', '산성산', '산성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('90fc2a99-6ef8-49f1-b2f5-9fe4cbdef84d', '숭실대입구역', '숭실대입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('910565ce-bd7a-472f-bde5-d4be5a946e05', '수지구청역', '수지구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('911f0f77-30ff-457e-9827-049910f28117', '물만골역', '물만골역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9120fc85-9d9d-4ee7-a7cf-b6b83373d9c3', '팔각산', '팔각산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9164dd97-6833-4ebd-a6e0-fcca436989a2', '서울숲역(에스엠타운)4번출구', '서울숲역(에스엠타운)4번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9168eb25-06d9-4d0e-83b1-12da0fa01c02', '검마산', '검마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('91b077f2-0ac3-460d-8a81-57b3335a40c0', '갈매역', '갈매역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('91c49da4-b508-4d5a-953f-8e2ac4429691', '뾰족산', '뾰족산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('91e15918-9bbc-4986-b7c2-2d1f486f412d', '연지공원역', '연지공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('91f594b3-c1b7-4391-9b80-50f60e6c9564', '수성시장역', '수성시장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('92365557-45b5-42e2-b5f7-5de0c41c6251', '보은산', '보은산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('925b1f52-e868-4d65-bac3-009c940bba6c', '거문산', '거문산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9285cfc4-c81a-44c3-9b5d-905bb3efdbe1', '마천역', '마천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('929c1f48-2f5e-41b2-95fe-9abd0c48c1bc', '광덕산', '광덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('92a80a5c-9ee9-440a-90c5-be124161779a', '승달산', '승달산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('92c626cf-a161-441f-a205-11e597397d27', '태화산', '태화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('92c7343a-673a-4230-afaa-9a881005f2af', '사랑산', '사랑산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('92f551d3-22b1-48d7-8550-7142d9a98c41', '고헌산', '고헌산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('92fda312-dd0c-48c4-87b9-1c2f3ddf64df', '문현역', '문현역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('931261a1-ee2c-4755-9605-0d361dcf39a1', '강서구청역', '강서구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('932e5175-1b1e-4dd4-a82c-97e5f555f96b', '중앙보훈병원역', '중앙보훈병원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9349c79c-2f2f-4ece-8261-297be911dc2e', '삼악산', '삼악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9360a372-14dc-41ef-8cf9-cf824e847408', '동탄역', '동탄역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9361e790-b4af-4c25-879b-2a091cacdf9d', '갑천역', '갑천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('93ce1d81-c930-4398-8d55-934f97711c84', '성수역(무신사)3번출구', '성수역(무신사)3번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('93d781b7-2bb8-42ef-a305-ebc26187e91c', '남암산', '남암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('93e8ebfb-b649-4839-8878-c39dd95ecff4', '등구역', '등구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('94059e00-f6f6-4729-8328-66730fdfd655', '신정네거리역', '신정네거리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9454a0cc-d3d3-442c-ab8e-2942fdb34e32', '의룡산', '의룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('946bb972-e7b5-4460-aedf-057ceac50309', '서울숲역 수인분당선', '서울숲역 수인분당선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('94706cb9-a1f0-443e-8594-cadca025aebf', '영산대역', '영산대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9477bf2a-4918-4f02-a692-7ba3c0053a93', '서동탄역', '서동탄역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('94956023-6f20-44f0-b965-60649ae1220f', '감악산', '감악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('94e79da5-c064-4086-ab2f-070a99c7dc91', '벽방산', '벽방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('94f4711c-51e7-4c62-8015-7d6f3299b6f0', '면봉산', '면봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('95417100-2396-4cf1-9a46-3928d6d0a336', '황악산', '황악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('95467240-df7f-4a47-b339-c3b2e9ac049f', '사패산', '사패산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('954c40a4-d9a6-41f7-845a-ffd02cbe45d5', '금천구청역', '금천구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9570d395-a339-40f0-bd6c-d0b7a754aa1d', '풍산역', '풍산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('958529a6-d3b5-4cb3-8d06-3444d6603edb', '문안산', '문안산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('95ab83ff-06a6-4157-a120-d48ac5c572a4', '군자산', '군자산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('95cad1e0-d2c3-49fb-91ef-1883bf4839f4', '칠현산', '칠현산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('95f04d2a-114a-44e0-ad10-d8df47b22731', '인천시청역', '인천시청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('95f7d1db-0b80-40a6-a037-93fc1d7c9c48', '산성역', '산성역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('95fb6173-abe0-4486-a8c2-b70d66489bad', '서방산', '서방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('961eec20-9594-4b53-912f-e5e8df286806', '보현산', '보현산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('96204ae5-3bc4-43a4-9a6d-dbc71d887027', '당리역', '당리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('96581f9d-6dc2-479f-907b-8173f32ab661', '선암산', '선암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('96bd1c5d-82e1-41bb-ba52-064dfec813de', '아양교역', '아양교역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('96d578f5-b2b1-46a7-9cbc-759eee47a9cd', '주암산', '주암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('96f732ff-abcc-4c74-a6f4-c60d3b45ec19', '시흥시청역', '시흥시청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('96f8badb-a822-4b6e-a29c-3d6b86b9aa03', '장군산', '장군산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('96feeb80-42b2-4e2d-85fe-c93903b6d6ed', '샘봉산', '샘봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('970c013d-e38d-474e-9c2f-3983ddff50e5', '홍제역', '홍제역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('972464b3-c7c1-4151-9dfc-a1da94eacfea', '화순역', '화순역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('97498856-4ec4-4235-9242-4abd4e55203d', '북악산', '북악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('974c10d4-3778-4a8a-bc1b-8f3f71800bd2', '송공산', '송공산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9776b7cf-e917-48f7-a14b-9d3063937e48', '도농역', '도농역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('978ce1a3-aafd-4524-8082-db8d50b6ea3b', '질운산', '질운산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9797fcb0-5e15-408b-bf37-007cbd2f7c3d', '대티역', '대티역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('97b09952-e810-4442-86ad-4318eedd8507', '석화산', '석화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('97d42eb9-f1fe-40cf-8c42-a728ee989716', '계관산', '계관산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('980ce22a-1822-4b29-9bc4-137dfe3116df', '미녀산', '미녀산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('983ba248-e8f1-4b31-89fb-114425735432', '덕하역', '덕하역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9868b432-ec37-404d-a974-a772af4c23f5', '김해대학역', '김해대학역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('98818328-4316-4eb8-bfae-7530156b3043', '비룡산', '비룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('98a4f49a-140d-4180-b5fb-18d39db8defc', '임당역', '임당역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('98b50b8e-2e4a-4aeb-a060-91a3b357a8d5', '대림역', '대림역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('98b51d4b-22e1-44ef-8300-97045a5add42', '장령산', '장령산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('98d0e0c6-cff2-4a2f-8b6b-7fb96f57a7c0', '회기역', '회기역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('990dc706-2ba6-4b3a-8638-544c41a9ac66', '낙영산', '낙영산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('99baef1f-b9ab-4503-be0f-bd9036691dd3', '토곡산', '토곡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('99ed86ba-0d2b-4970-addc-551232208199', '보산역', '보산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('99fb833c-fae2-4e08-bb9c-7788b86008f5', '기장역', '기장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9a16f79d-ddaa-4541-86dd-bced9aebc894', '광양역', '광양역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9a2623d9-bb6c-4c13-b970-55804909ddb0', '오두산', '오두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9a349844-d97c-45f9-9f5b-e016f59de6e1', '지족역', '지족역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9a39bdc1-3339-497a-8555-85d3ad10ad92', '애오개역', '애오개역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9a5bac1f-5a43-4163-a93a-0d4f90338c44', '풍악산', '풍악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9a6af789-82f5-4336-a44d-426204b1f35c', '탑석역', '탑석역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9a71fe06-5515-4bb4-8d1f-db04eff8ffd1', '이방산', '이방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9a75dea7-f261-49de-855a-3d7c40f34240', '월방산', '월방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9a8f7bac-05d4-4f71-8ff5-a6b0723435d1', '구절산', '구절산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9ae5c212-bd76-4d28-92e5-03e814efbacf', '일원역', '일원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9b10c756-40cc-4577-a62b-a566a9f51519', '뇌정산', '뇌정산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9b17c019-ec68-4b6d-884f-1da511977e26', '동두천역', '동두천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9b646a04-d153-46af-a9e4-4b40797975bb', '용문역', '용문역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9bda6a67-8f59-4c56-a401-234aba183296', '신중동역', '신중동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9bf8ad3b-a2e9-4462-bc9a-56cd9ddc4ec7', '조계산', '조계산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9c0c0fac-fbb7-497d-b80a-34df2c32ef82', '구암역', '구암역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9c14d61e-8c08-4e65-9832-ba62b9506b9e', '광명역', '광명역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9c3aeec5-f740-4633-814e-9baacb05dddb', '금릉역', '금릉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9c7265ad-280b-4004-8f8b-6039d5cc290a', '소미산', '소미산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9c7b7b8e-0bad-4655-a76b-cf1d66217c5b', '불태산', '불태산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9c902c1d-b13d-4d2e-bc35-86844f82c064', '월계역', '월계역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9c9ca171-f068-49d6-9adb-68e1f1271d68', '고진역', '고진역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9cb6a9c1-cbc3-4ea5-8c25-7e81271f9c34', '대모산입구역', '대모산입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9cba304c-87dd-4e9c-a8a7-a15b175ff0bd', '신매역', '신매역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9cc50efa-72e4-4cfd-974b-f547e2d1b2ec', '치악산', '치악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9cd5e7eb-00b4-49cf-9996-8d04c453c310', '성수역(무신사)4번출구', '성수역(무신사)4번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9cfc9dfd-7c7f-47af-b9ed-fba5d88a98ed', '천보산', '천보산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9d3a4684-de7f-4a6b-80c4-91aa50615808', '감삼역', '감삼역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9d7262fe-a9e7-4d19-9329-456d7522a882', '성미산', '성미산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9d76cc89-fa82-4f78-a8aa-a765ac87cc07', '농성역', '농성역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9d90c677-5bba-4eaa-a19e-d6e5e0dd1596', '강일역', '강일역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9d96fa20-8940-42c5-a6c9-7128d0783c74', '구룡역', '구룡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9d9b8266-023a-4db3-adc0-8d38f57391e8', '정족산', '정족산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9dd03e1c-bd45-4d41-b5e9-86983dee2b90', '백두산', '백두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9dd26946-a84d-4b5c-aee0-c41564aa74f7', '백운산', '백운산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9df6d5a6-44c3-4701-acee-514f15ea8b46', '오대산', '오대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9e1edb20-0948-440c-ad89-0c8b6e7ddd68', '남병산', '남병산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9e3aaff7-e855-4d72-8302-0ee510975511', '삼방산', '삼방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9e48ba60-e939-43a5-b4c5-0d9e692a52f7', '만행산', '만행산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9e59529b-d30f-4088-a8a6-7dc30a7aeb05', '응복산', '응복산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9e7563be-a4a7-4e60-9119-c78909667850', '월내역', '월내역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9ea4e1b0-7bdc-4df4-b8eb-f2a4824fec94', '구서역', '구서역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9ee576d5-b00e-4a89-be38-0968dc94624c', '백마산', '백마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9efd2fd2-c1e4-478b-a1a2-c6528f740c51', '도림천역', '도림천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9f29e8c8-315e-433d-ad80-473e4226a28e', '단산', '단산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9f3daa22-0c6d-44c9-ad2a-cc231350fc9b', '부원역', '부원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9f839eab-65fb-4570-9836-6d6e67f162a3', '수리산', '수리산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9f8ac982-d5ed-42b7-a129-a7dbc6b9b13c', '작성산', '작성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9f982c3c-8c5e-4fa8-a065-186b6767d175', '오금역', '오금역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('9fe75416-a6ac-4982-b94d-2ee26f4eb080', '서면역', '서면역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a004c5bc-e719-4a45-aa09-5db5fd62d9d6', '석촌고분역', '석촌고분역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a00638de-28e2-4c05-8764-bda2c32cdf40', '용문산', '용문산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a026b065-e7a2-4124-9246-8dfd308941be', '마금산', '마금산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a080b656-6f26-4158-96b9-c689acb15fba', '금주산', '금주산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a0858c77-ddf1-49d5-8a9b-2c67806b7e9f', '단대오거리역', '단대오거리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a093a94f-dcc0-4f45-8086-63b4536a3abd', '중앙역', '중앙역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a09ce3c2-1aea-4f68-8a6f-ee1b743eb434', '간월산', '간월산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a0d681cb-c193-4c9d-945a-4274cab3853f', '파주역', '파주역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a17d1aab-0d1b-41de-b0f5-3ce214a76bba', '인천대공원역', '인천대공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a187e59f-55fa-4ced-bb78-6c17b977c80c', '서부정류장역', '서부정류장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a1bacc73-c464-4bc9-bce4-37dd778761ac', '신길온천역', '신길온천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a1c03127-ecb8-4fb8-aa43-3d3af75e8418', '국제업무지구역', '국제업무지구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a1d74445-9da6-4d8b-b261-92df8e3545be', '완택산', '완택산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a1ff214a-770d-48b3-b09d-3b991eae1a57', '도갑산', '도갑산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a2617f59-3cf9-4e40-88fa-d2354e1543ee', '만수산', '만수산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a26d0c41-ef8a-49a3-970a-9e101bdd4ec9', '풍락산', '풍락산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a2750f6f-247d-46ba-a6d9-2e02daa85e5a', '편전산', '편전산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a27cace2-4ebe-4e4d-8d91-8c9c29fe80b9', '부산진역', '부산진역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a28391e2-0a62-4426-9a4f-abc7fef8cfde', '금남로5가역', '금남로5가역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a28fbdb9-6d5b-40d7-990b-adea48c27d1c', '마명산', '마명산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a29b52b5-a78c-4763-87b8-44e953284a03', '옥마산', '옥마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a30798ed-c4d2-499c-b5c9-724846610f6f', '약수역', '약수역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a35c4056-56fa-45a9-bfbf-d5b59ba0443b', '앞산', '앞산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a367a48a-fece-4590-a1fa-3dcb1233dd66', '수영역', '수영역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a36f012e-ea18-4294-93d1-0652946821d0', '명성산', '명성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a37b24ca-e201-49e2-a61c-521b164e4c11', '노목산', '노목산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a38104ef-a53a-4413-9302-a717a152144c', '진영역', '진영역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a3d1542f-9558-4f2c-9435-106dd7514c6f', '안양역', '안양역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a3f8dd3b-aa8a-43cc-9596-33ec42066b7d', '신천역', '신천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a41faa91-2435-480a-aee8-afe085679dee', '가천대역', '가천대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a42a6843-f7c6-4da7-a5e0-0db2976ef2b8', '달봉산', '달봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a4918a76-516d-412d-b232-39cb9def157b', '을지로입구역(하나은행)2번출구', '을지로입구역(하나은행)2번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a4e4a136-9bc2-4155-966a-66fb9afac569', '상갈역', '상갈역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a507ecf0-e694-4b8e-9b7f-870d917fe5b1', '올림픽공원역', '올림픽공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a5083e84-3f1a-4d2a-9727-200aaba74c62', '현충원역', '현충원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a576698d-2d5d-48b8-9161-f7df9bc4e88c', '신대방삼거리역', '신대방삼거리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a5a6b29c-1c5c-4594-ac3a-711db100d439', '용계역', '용계역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a5cd5bab-8b87-4f7d-85d3-d2fcaabde87b', '작대산', '작대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a5f12693-6ba1-4be0-a616-404a47173bbd', '양각산', '양각산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a629c6b4-06b1-45b1-ae5e-95faac77353d', '흥선역', '흥선역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a62afb76-19ea-455b-869b-18d34cf6041f', '화계역', '화계역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a66f3072-a49f-4a14-b5cf-58fe4cd36c02', '도산역', '도산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a70221ca-bf26-4bd6-a1c8-98889884d686', '방장산', '방장산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a753e56a-ca13-4959-bc78-98cecad502e8', '무릉산', '무릉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a76bb90c-fdc9-411a-82d3-f37c011c00ad', '다대포해수욕장역', '다대포해수욕장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a784f9fb-4bc7-4d8c-a827-a281fc1223bf', '신이문역', '신이문역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a796accd-2a85-45ad-91c9-0c1ba0a2a76d', '중봉산', '중봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a7f68fdf-246a-4bf6-bddf-448cf974c557', '금당산', '금당산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a7fae0d8-91c5-4c6a-9ccb-09690d9d5e0a', '두승산', '두승산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a8a8b8aa-d831-4048-8e76-b5fcc120148d', '매봉역', '매봉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a8b80898-24b6-4a7f-957b-a3b9dcf5aea8', '견두산', '견두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a8bffe5f-8d70-450c-860b-9543e586d375', '개롱역', '개롱역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a8cb8b20-bbd8-41d7-9215-0ea7b37f4240', '남동구청역', '남동구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a8cdd189-a2aa-42d8-b655-f2713e9e4b8f', '직산역', '직산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a8d476fa-0326-4860-8d0c-a3ab5af7bcd0', '명덕역', '명덕역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a9031fdf-5630-4c65-ab79-53ae6a8eba94', '노포역', '노포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a9126325-574e-4568-af90-62f604b41f03', '신설동역', '신설동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a92177d9-5ed2-4afc-a106-3d31a678eff3', '용마산', '용마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a92a7373-5669-422d-8f9c-370c7f432881', '유성온천역', '유성온천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('a94e72cd-9a81-4f71-86d1-19a08f117e61', '국회의사당역', '국회의사당역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('aa105730-8b1b-4e36-9eda-a0fba8ae88b3', '어림산', '어림산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('aa265ead-d082-4607-ad81-080dff08fb7b', '방촌역', '방촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('aa323250-3e7a-4a99-8f11-62be8622febf', '신정역', '신정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('aa51af51-2df7-4424-b9c0-dfbad395a771', '연신내역', '연신내역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('aa858ba1-5481-4470-bb0c-da2ea84a923e', '구현산', '구현산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('aa867d62-df3e-4d7e-a0f0-dac01508dc9b', '북한산보국문역', '북한산보국문역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('aab3a347-9308-4433-9df6-bb0d3d8c0795', '망경대산', '망경대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('aad29b88-24f5-43e4-acb6-9a3a0d777621', '탄항산', '탄항산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('aada46a7-c27e-46f1-bb5d-8ac4cc0b4a12', '오산대역', '오산대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('aaec1a33-fbee-43af-813b-788f7de1a8ac', '삼정산', '삼정산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ab210e6d-306c-4e5f-9a5f-6a05df1d6e28', '대야산', '대야산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ab2deec3-d6be-473e-baa0-9759d27b642d', '상도역', '상도역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ab5218ca-4057-439f-a9d6-d56e5bf6eb88', '장기역', '장기역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ab8e3439-05e8-4826-a45b-8b08204dba8b', '당곡역', '당곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ab9f46be-a1a3-4e8c-b715-341c13c564a0', '공덕역', '공덕역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('abc8b7bf-bf1f-474c-8935-0f3cd5dda6fe', '하계역', '하계역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('abfb691f-812e-423a-b80f-b9dc943872ef', '덕계역', '덕계역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ac125999-6133-48a9-b5fb-3fc510ffe282', '승무산', '승무산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ac2047d9-6983-4d9e-bb13-55ad841d7922', '센텀시티역', '센텀시티역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ac5349a0-1944-4a6a-90b7-4edd99604e19', '영종역', '영종역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ac65c783-c835-4fa0-86a1-af9fa2b38ee7', '목포역', '목포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ac766463-673d-4737-b913-7135d9c674dc', '화서역', '화서역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('acb91ee5-8a15-4f84-a6d1-beebcf276bbb', '부평구청역', '부평구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('acba0675-9f7b-4366-b33f-ef7a33b6cd78', '가좌역', '가좌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ad3b92dd-cbe8-4cdf-8bdd-142aadad9568', '환성산', '환성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ad952600-4b37-452e-80ba-a91fb1af00c7', '정각산', '정각산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ada4215c-9f77-4a2a-bebb-512eeb03acc5', '배산역', '배산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('add4edbe-50e1-4593-9010-3c129839be47', '상산', '상산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ae2cd2a9-8278-423e-b004-e7ee612bfdd3', '을지로입구역 2호선', '을지로입구역 2호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ae95c57e-3034-4291-92b7-47805cc61c71', '망우산', '망우산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('aeb6e4fa-1825-427a-a1aa-466dfc723c4f', '북병산', '북병산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('aeb7846c-1ee8-4c00-bce5-9455eb056497', '김대중컨벤션센터역', '김대중컨벤션센터역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('af3d0ba1-cf5f-47c8-8523-41bfbc27682c', '팔공산', '팔공산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('af45541a-3896-40aa-82d2-42eae5e419e3', '증산역', '증산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('afa20238-c486-4fd0-894f-483d458a580c', '죽전역', '죽전역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('afaa0726-88ad-4474-a554-8695ed66c5d2', '월배역', '월배역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('afae86c1-59e1-4a32-b7de-539a2568671f', '여천역', '여천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('afb0d0c4-3bc1-4b0a-8234-a4c42da7c467', '금산', '금산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('afcbcdfa-76bd-4b8e-820d-82b39aabb851', '상월곡역', '상월곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('afd701a4-33fc-4be4-8c47-871e14b88d9a', '부용산', '부용산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('afee4376-136e-4d9d-81b9-c6e376ca4d3c', '위봉산', '위봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('aff5c598-4edd-44ec-ad05-59486a2fa06a', '남부터미널역', '남부터미널역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b003e0a9-4d38-4f9a-881d-871395efc590', '돌고개역', '돌고개역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b018ba57-c350-43ee-8f4f-2e5b0c3539a1', '도명산', '도명산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b0284bd2-3bac-44c8-9a11-e299327d35c9', '궁산', '궁산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b071ce7f-b420-43fe-8f30-f0c3dc2bf12b', '수태산', '수태산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b0761f8f-a131-43cf-b518-bfd693b4d9ec', '각화산', '각화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b0787d89-927c-4bdf-b8c3-b0187a058b7e', '종합운동장역', '종합운동장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b094aec2-cb84-4244-bb00-9211f1b92c7d', '우장산역', '우장산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b0b39f24-51dd-4d1a-96ea-bb3076c72335', '구남역', '구남역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b0cb6aa0-886d-4364-a6b2-dda0a7ceab85', '지리산', '지리산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b0ee9db5-9f65-4ab0-bf29-6068c69d9c44', '청계산', '청계산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b12ecb26-6df4-4180-a2ea-dedfb7b379c1', '고봉산', '고봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b12fdab7-d7b5-4c9b-890f-bb01f388b3b3', '정평역', '정평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b163ea04-73c3-46fe-aff2-e1eb2c3f16d5', '안산역', '안산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b1892f5a-b567-4b64-97f9-060a48e34410', '미륵산', '미륵산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b19962e0-25a8-470a-8207-1eed8656454e', '노성산', '노성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b1aa363d-df3c-473b-bc51-983688557fd7', '망양역', '망양역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b1abafec-6245-4ecc-9edd-74fa76ab8cfc', '나각산', '나각산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b1d741a8-d801-4fe7-8632-cfec0ca33acf', '노고산', '노고산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b1dac9c4-dad0-43ab-91fc-f5d5574ac75b', '금당산', '금당산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b22567e8-2c46-45ff-af73-93536c073501', '검단오류역', '검단오류역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b231e854-bd49-4b7b-91f4-58b65b81377d', '오서산', '오서산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b2598787-73c6-4929-a1de-b430e9dc48c1', '벽화산', '벽화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b2748844-54ac-4a8a-a6d2-4c3536cab053', '망포역', '망포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b27e3fef-d53d-4252-9b0e-9cdaa0d4915f', '거마산', '거마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b284a80d-36c1-4272-9afa-f424f62a07dd', '낙가산', '낙가산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b29a5acd-242e-427e-a2b5-b77fefe248a8', '제석산', '제석산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b2a0b98a-7223-4e53-9f2b-f09713e20984', '청도역', '청도역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b2a38d69-06ed-4997-88b8-3f89ccc86690', '구포역', '구포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b30cb223-8bd8-44c0-aa41-4db7269ba304', '고두산', '고두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b31661d3-446e-4b2b-a461-5667fc8e6bb8', '용림산', '용림산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b370d826-4301-43f1-9074-049e1e760e7f', '명지산', '명지산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b37d4ccf-32f9-4fe9-ad96-3e845301ba9c', '만촌역', '만촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b37d673a-72d5-4399-b9ba-89be6a3ee4dd', '가야산', '가야산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b387d475-245e-483e-b372-251147a7ada5', '둔철산', '둔철산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b3a5c4ad-d480-4686-9c10-25a7720a503c', '속리산', '속리산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b3b03d8c-b836-4d0c-b392-b967a2e4f086', '황석산', '황석산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b3b4aa58-cf7f-42b1-96f0-f94b3fa4cdf7', '불광역', '불광역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b3c4e5b2-5fa6-42d0-9578-f22ae6a820be', '장한평역', '장한평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b40a683e-8c83-4bed-be0e-91fcb57077f4', '갈기산', '갈기산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b40f3527-bae5-4c24-a361-e6340a7efad9', '덕절산', '덕절산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b442fd23-e055-4eb0-85ba-b0d0e948a733', '장성역', '장성역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b4a5a7c4-6aa9-4e19-b363-caf5faac3c83', '수원시청역', '수원시청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b4b79a88-2d5e-4866-a1cf-2819ec377ad5', '공항역', '공항역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b5248c51-68cd-4e95-a469-4971776a4c80', '범일역', '범일역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b527c967-5b9f-403e-afae-cf5e3baff9b9', '운암산', '운암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b53b0cc6-98a8-45e3-905e-59e0031e2fd3', '강동구청역', '강동구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b551986f-224d-4539-92f8-3495a5a1cd40', '서대신역', '서대신역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b55a482e-4a1e-43f0-805d-5b46a0da7a68', '토성역', '토성역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b55c418f-1f32-45af-aa22-4446509d7157', '경성대·부경대역', '경성대·부경대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b57cec38-0a92-469f-8402-a3caacadd56a', '종로3가역 5호선', '종로3가역 5호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b58a5b27-0ea2-4c11-8a6d-28a15b7e2f05', '동대신역', '동대신역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b59c8d0f-2d18-47e0-abfc-f72ae7d6eeec', '광교중앙역', '광교중앙역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b5aad89c-10da-431b-b2b7-911a2112e04d', '아시아드경기장역', '아시아드경기장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b5c4a076-8c69-4766-9f53-84d23dad13a3', '민둥산', '민둥산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b5d8493f-35a6-4148-8373-8e463a1de658', '대청역', '대청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b600ed06-0a74-4060-b8c8-36458854bcec', '강창역', '강창역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b617325e-a64a-4830-8d99-ddad5a114618', '운교산', '운교산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b61a4dfd-626f-4d36-bdc4-09a25ade6f85', '고덕역', '고덕역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b61babfd-444b-48a6-8dd3-d414b841bc8e', '한라산', '한라산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b6482063-5648-45c0-87a0-c96f183eef6e', '성인봉', '성인봉을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b65a7b18-5067-48a7-8266-858391b9e255', '여항산', '여항산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b66415f5-34af-4c12-96d3-fe6eb572ecee', '조항산', '조항산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b66d751a-2903-463c-85a4-fce47ce378d6', '강남대역', '강남대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b67ba6c5-9089-4c3e-b81a-ac6d233ae160', '인천대입구역', '인천대입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b68417c4-736d-4a24-8295-34d9816af107', '사자산', '사자산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b6e6bc67-2e51-4d1d-9b85-6e46a18937dc', '청량리역', '청량리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b6ec0e32-5447-4997-9f2a-d1c0c923d056', '삼문산', '삼문산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b723ebea-a73d-44d3-940f-816cfb2ed66b', '수인산', '수인산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b730c89b-39da-429d-abe6-bbfbf4ba4580', '곤방산', '곤방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b7830f6e-fe66-465f-bb21-7dc64631abb5', '청옥산', '청옥산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b78c132a-1a34-474a-89c1-a9316d56b2fc', '바랑산', '바랑산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b7986870-6be8-41d0-9670-50f81184ba52', '버티고개역', '버티고개역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b7c606d4-65c4-4dc0-998f-f15a7e578172', '앵무산', '앵무산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b8172312-16d0-4c80-859f-72980061af94', '상아산', '상아산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b828f55b-d988-4d93-98df-a36750fcd275', '정족산', '정족산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b89aa3d1-28a4-4211-bc99-1a4900611c9d', '가평역', '가평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b89b0c97-04bc-4110-87d8-ff3a2c9ba872', '벌교역', '벌교역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b8f7b6da-269e-4a22-9f89-2dea9b75662f', '정읍역', '정읍역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b8fe6afa-c40a-4986-8b57-e0b0055baa70', '신금호역', '신금호역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b9389ba6-d0e4-4133-bf12-fd638c51611c', '삼양사거리역', '삼양사거리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b9a2fcaf-4ba0-40fb-afb9-0ccad725e338', '철마산', '철마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b9bdc1f9-1c1c-4d02-af61-62fbf4d7f2d0', '청태산', '청태산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b9c0c43b-0ccc-4f81-b469-ff13aafce6b4', '삼각지역', '삼각지역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b9cb3e08-d1a8-492b-9095-0811762ec7c1', '통명산', '통명산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('b9fc901b-1391-45c0-befc-c522939d5546', '주산', '주산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ba15cf78-118a-4d4c-9254-833fa011307e', '명봉산', '명봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ba1d25ab-8cec-4fc7-acd2-825709698308', '관악역', '관악역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ba1e9d4c-e7bb-49b7-b048-e5b86ee9b825', '송현역', '송현역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ba6932ca-21b5-4392-9c6c-98689846b58f', '대흥역', '대흥역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ba757eda-c5ab-4ddd-ab99-d92d88ebf9d7', '병풍산', '병풍산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ba8e3ff1-3bcb-4e6e-8fa0-18653478abea', '증미역', '증미역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ba911a87-fc6e-4630-a86f-326a31b2e0f8', '감방산', '감방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('baa13755-e5eb-4223-936b-e50e78f0c6e0', '풍무역', '풍무역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('babc0695-6a6e-4d72-aa93-27196575eb7f', '벽암산', '벽암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bac4ae70-b034-45eb-8733-b192e4e12736', '야목역', '야목역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bae851d9-a922-4760-8519-f96cf15dff80', '약산', '약산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bb4b0524-4e6b-47a0-84d4-7565478ea795', '석대역', '석대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bbf6d078-3641-437e-bd4b-3155889b4a26', '양산역', '양산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bbfc797f-c98a-4767-81fc-c11bd33bb394', '석수역', '석수역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bc20dbb2-06a1-4b8a-a3c1-f9c3ce8b94d6', '백적산', '백적산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bc388e5e-5209-474b-89c2-837497fd1d6b', '의정부역', '의정부역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bcb7c5e8-a5e1-4802-85c6-f4a008d64994', '간석역', '간석역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bcc81f78-5c99-408f-bad4-ffbf24fd205e', '봉황산', '봉황산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bcde69cc-94ad-444c-864b-599f93ddfd31', '청옥산', '청옥산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bd54226b-3549-481b-af6a-add69d609629', '고동산', '고동산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bd58dbcb-1b54-41c1-adcb-91caa390bf8c', '능동산', '능동산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bd6afcd7-b76a-4190-acc5-aeb18d80ad64', '배방역', '배방역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bda69890-b429-4333-89c3-dfe3d236da67', '검암역', '검암역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bdc6e1c0-664f-4ac0-9cdd-089f6a18aead', '둔촌동역', '둔촌동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bdf0886a-b9eb-473d-8f5b-d0d8d995c0d8', '문수산', '문수산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bdf4cef6-dd34-4503-a65d-3c1621baf8db', '달성공원역', '달성공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('be06e8bd-ae82-4722-a562-16c6b394193d', '두류산', '두류산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('be1660f8-05d6-4d62-a527-232f1ce314ba', '동악산', '동악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('be19c2c0-9537-42be-af08-1e93468a62d3', '쫓비산', '쫓비산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('be1c03ba-a2e2-4bde-a98d-c22699003fdc', '캠퍼스타운역', '캠퍼스타운역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('be34e0b5-b8e6-42ff-a854-5e240249fa8b', '새절역', '새절역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('be472de8-ca5a-4432-afc3-e7884d0d323e', '상봉산', '상봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('be48ab84-386c-44fa-a3cc-1d1f45e552a5', '신장림역', '신장림역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('be74a55e-0138-46cc-9f6d-612390b197f4', '선학역', '선학역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('beee5657-a922-4d7e-8ea5-24d82b6bd96a', '암사역사공원역', '암사역사공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bf1e9bfb-97de-4f84-b403-264b0d69e816', '삼양역', '삼양역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bf48cdf9-b2a9-4de5-838e-36c7915feae9', '대금산', '대금산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bf6b8f96-3d36-4a6b-bb21-08ffafd1a9ca', '불암역', '불암역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bfb25b68-c339-4e11-8e5e-b8e1d84c0f36', '대봉교역', '대봉교역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bfbba12e-d0ff-4263-8428-cfaa78e5d497', '인천가좌역', '인천가좌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('bfe5d881-713c-4845-ab3e-902fde01ac15', '남구로역', '남구로역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c02c006c-c6c9-4516-b038-7231b3e58c56', '마니산', '마니산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c03f4655-f677-4b26-acc3-ae7d87b256e4', '벡스코역', '벡스코역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c06b76e2-3ca6-4888-949b-dfadd8e2a91e', '녹동역', '녹동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c075227f-f8f9-4570-a3da-bca177a7e3c2', '압구정역', '압구정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c0dc62b4-63a5-40fb-8821-1bebda1bdf11', '마산역', '마산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c0eb7488-8669-4ec5-a74c-3e0ee75ddb4f', '비계산', '비계산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c0f9b1c3-83ba-47b6-8d48-9c69c529cf11', '양동시장역', '양동시장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c11cd9ae-a07f-4578-8a28-f5ca1dccaf3e', '역삼역', '역삼역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c13fd6fa-f46f-42fe-92dd-f879a3fdbdd8', '모덕역', '모덕역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c159ab4a-9354-4a35-a971-cfcee1ba1c30', '구봉산', '구봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c1f77a5f-c1e2-4c8b-981d-c6fa53873f12', '주금산', '주금산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c1fc28f3-e136-406a-a3c5-14fbc10fc8f9', '신방화역', '신방화역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c1ff1b87-4e50-43e0-bc2e-5fba8206804b', '청산역', '청산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c214b4d3-6a68-456a-910a-71206bf5d597', '천비산', '천비산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c2158178-3bd4-4400-9386-1430ea2da9c0', '용각산', '용각산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c2551179-e179-4e49-9bd8-a3196ec1e55c', '방배역', '방배역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c2572048-e316-4ac0-a6cb-b85d3ba4d985', '고속터미널역', '고속터미널역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c2985f17-68c5-4002-8c26-9e5c68eef0cf', '태릉입구역', '태릉입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c2ad4298-bc73-4f2b-a2d2-df02cc00e6cd', '동신어산', '동신어산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c2ddcf88-7aad-4da7-919b-2cf329411267', '우두산', '우두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c30fcb8e-7ecb-46ad-90ea-b225c929b6e1', '미남역', '미남역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c349e04e-42d3-4fc1-904c-7d530db73ecb', '초암산', '초암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c35a244a-1ff5-44c3-8198-567c27742cec', '부귀산', '부귀산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c369dac2-e2c0-4491-87ee-6b8d1e3df61a', '인덕원역', '인덕원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c387a13c-1fd5-4665-b3ee-91e1282eac4a', '장암산', '장암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c3a419fa-d479-406c-b1bc-bb994e5bbcfd', '두봉산', '두봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c3d6f2c8-ca6f-4b01-ab82-882249f3e997', '감암산', '감암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c410e68d-ebf2-4baa-a180-28f7878d0236', '잠실역중앙정류소', '잠실역중앙정류소를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c4257933-2c00-47f2-8114-4d6b74b50935', '갓산', '갓산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c45f7d77-1ae9-4496-ae07-100780ef022b', '검각산', '검각산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c47dffe3-2699-4e9f-9cf7-3bbc21678d92', '무량산', '무량산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c4a96096-4ea4-4bc6-9fb1-ee47157e07f6', '신도림역', '신도림역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c4d152a1-67b4-4898-a75a-2885e6310899', '청평역', '청평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c4e41312-aa5f-47e2-bb08-4c6b6700c9cc', '감악산', '감악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c5151f87-8bf9-4fe1-adea-5ecfd9c80dc5', '성신여대입구역', '성신여대입구역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c51cbd09-a4d5-48db-892b-f70a2a8d24c4', '아기산', '아기산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c5213cc7-d2a9-4caa-9d34-726dc6436a39', '함평역', '함평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c55e3c47-2635-4899-b958-6c8e661362af', '운장산', '운장산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c570a28f-2c0c-46df-864c-9613e0a81f50', '개금역', '개금역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c598f1c7-7296-4495-9a65-12d0fa63678b', '서강대역', '서강대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c5d61dfe-ed55-441f-a067-7eeef29ac3be', '교룡산', '교룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c6064f35-6e06-4cab-8de9-e9125ca100d7', '북구청역', '북구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c686730b-ab34-4b26-a3f7-b63ed691b1ff', '중곡역', '중곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c6cd150a-5288-455d-955d-bba1f22913ca', '아산역', '아산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c6d83964-dc4d-4a99-865d-e7d276fbd1c3', '승학산', '승학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c6ddeeae-bf17-4fc8-b471-eb74b9399509', '사하역', '사하역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c6f220cb-bad6-44b5-93b0-38bafcc0396a', '신촌역', '신촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c6fd3e37-1c3d-4a3d-b8ef-646145daceef', '장산역', '장산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c70d95fe-1f16-486d-813f-acd00cadd5fe', '부천시청역', '부천시청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c71d5897-648e-4f11-a480-d190b3d5e6f0', '반고개역', '반고개역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c7427213-b453-4bda-b630-96ce90361896', '선정릉역', '선정릉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c7624f54-2080-426e-bafa-5a4e4649045f', '대금산', '대금산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c789f125-f445-4b12-9a71-24c9a5d7826c', '송산역', '송산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c7d00114-6daf-437b-8f2c-d1fb2fc27547', '약수산', '약수산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c84993c5-b2f7-4b3b-bf52-f16ae01c1417', '잠실역정류소', '잠실역정류소를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c857c3d3-26a8-4a4c-bb3c-115d83257603', '광덕산', '광덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c87638d3-28e1-413c-a0f4-02d87d404dae', '바라산', '바라산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c888bb0a-899f-434b-9854-4817348f582c', '덕태산', '덕태산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c8a37ad1-87d2-4190-8b06-f23bf0c539ef', '숲뒤산', '숲뒤산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c8f3c774-aa23-4833-940c-9977b6678606', '예성산', '예성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c90f52a4-5f4c-4bd7-aece-ed68e68e9638', '어비산', '어비산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c9325df0-2a16-4045-8896-441fe1817259', '남동인더스파크역', '남동인더스파크역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c941c1e5-fa63-45bc-be2f-12318e1430ba', '광교역', '광교역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c9c8e3b0-0f28-42e4-9f5d-748f8cb696ea', '연엽산', '연엽산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('c9ccd1b0-100a-4a33-ab1b-abba035b288c', '제암산', '제암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ca2b4329-32e4-45cc-a604-3f6e8fbb193a', '도비산', '도비산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ca3add7b-538c-4e2d-97bf-90712a103292', '내연산', '내연산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ca503839-92bb-4eeb-8f1c-1523a843c183', '신창역', '신창역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ca59e9d9-fa97-459f-a8f6-27fdc48aff26', '피래산', '피래산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ca724612-5cd7-41da-a9a1-58c6a9dba9cb', '덕우산', '덕우산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ca7ac0f9-0fb3-4808-b105-0eb17a68cc91', '송정역', '송정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ca92d806-0245-4999-b408-698bcb6083be', '선자산', '선자산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cac10564-b8cc-4bbc-879a-dfc7e1534cbf', '송파나루역', '송파나루역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cac309a4-7142-4844-9ce3-63bd26029894', '상현역', '상현역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cad27d3a-67d6-47c8-b6e4-dce45f9f7fc2', '변산', '변산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cad5ffb6-7f92-43cc-a464-f05f5ddf55ee', '발산역', '발산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('caeb37f1-9303-4dc1-8105-720c91e96e66', '청라언덕역', '청라언덕역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('caedead2-8a67-480c-bdaa-37fbdef718f0', '동백역', '동백역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cb39e1a4-d05d-454a-8bc4-4b5da2c72bfb', '석촌역(한솔병원)7번출구', '석촌역(한솔병원)7번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cb4aa6df-cc7e-4c33-9517-381387fd5be8', '구덕산', '구덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cb600700-5945-4582-b311-e3acfda0d6e4', '진부역', '진부역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cb7109d0-de9e-4795-9371-559e800981ab', '월봉산', '월봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cb7e00ba-f51a-4715-a54f-e7434e56a973', '수레의산', '수레의산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cbb64910-82d6-4e50-8817-0600086f7fbc', '구명역', '구명역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cbc0535a-85f8-41a7-bef5-47fb41ff16b1', '김포공항역', '김포공항역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cbfa046e-d3aa-4cb6-97b7-85cf42bf38d1', '논산역', '논산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cc2937a4-54b0-4c19-8614-59f2f9b663ba', '서해구청역', '서해구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cc4cc7f4-1171-4efe-af18-86120d9da0c6', '정자역', '정자역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cc51dde7-c295-4d00-afac-4dec826c29c7', '동대문역사문화공원역', '동대문역사문화공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cca7abdb-85a4-4358-bade-5dfbbeb239c2', '서원주역', '서원주역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ccc3d9fc-6566-4e05-9282-8924833d391f', '백련산', '백련산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ccc3ff56-1e10-4e0e-b93a-df00831be305', '왕방산', '왕방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ccd03db9-9e31-4623-a1f1-9733a356c0ae', '운무산', '운무산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ccf85392-d227-490d-8a27-9d6222359684', '염창역', '염창역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ccf904b8-e1eb-489e-89fb-343e44856c3d', '뚝섬역4번출구', '뚝섬역4번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cd04f89f-e4f2-466e-bc58-6bebc8fe78e1', '지석역', '지석역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cd086390-e5f3-4533-8303-26ab265a0674', '풍기역', '풍기역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cd178967-5284-419a-9dc7-03023bb68e73', '수서역', '수서역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cd272cb6-2195-4c72-8b58-aadd6fbae81e', '대둔산', '대둔산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cd2f5317-afca-4e2a-8878-36bd5eac62b7', '성주산', '성주산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cd4d7f01-2b42-40f0-abd0-22ba4331ae8f', '이태원역', '이태원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cd64fda1-cb6b-47c2-b622-87d942e8ced9', '장자호수공원역', '장자호수공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cd72a6bc-69f1-4b8b-aa9d-e1b6dc9a9aec', '매천역', '매천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cd932d96-db0e-4f8e-9410-0c2755155eba', '국통산', '국통산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cd9acdb5-ca02-48d9-b7de-814e01b13b3d', '호룡곡산', '호룡곡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cda4e591-95f0-4dc2-b797-f52b1ec97187', '산본역', '산본역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cdcd2fe3-08fc-43ab-b87f-1c41e72b5643', '회현역', '회현역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cdce084a-00d2-4871-ac22-9d8ef5fc88fc', '일산역', '일산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cdcff0d2-3b42-42c9-bf57-9297c37211f6', '구반포역', '구반포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cdf34d73-6f34-4109-85d9-89147b21802c', '양자산', '양자산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ce3238e2-ef9f-480c-9514-5e744dbdf3c8', '무성산', '무성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ce522685-a58b-41de-84d7-8dab2d381cbd', '대방역', '대방역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ce5c3bef-8282-46cb-b4d5-75f9640aeb9a', '최정산', '최정산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ce772395-61f2-42d2-acd6-c903f67ac0c7', '괴정역', '괴정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ceba0fe8-25dd-4181-9599-b34ad8ed488c', '감악산', '감악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ceddc080-0cb5-42b0-ac75-cd9dcb8c6883', '대왕산', '대왕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cf056820-ebde-4bd4-b8fc-790c4268b941', '왕의산', '왕의산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cf29e08b-5f4f-48ad-8aa5-e1b10e889a18', '목동역', '목동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cf29e1c4-fe3e-44cf-b1e7-a676ac259fcc', '유학산', '유학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cf3a8dfe-102a-473e-a886-066b289d7f7a', '청화산', '청화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cf594fcc-fff4-407b-abf8-bc912cfb040c', '경각산', '경각산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cf5ae89d-6392-4ef4-ac4e-869b9094ba01', '오남역', '오남역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cf9782e2-ba3c-4006-b966-f75205f3ef19', '지게골역', '지게골역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cfae2fb2-c315-4766-8d62-ef13686e8657', '보문산', '보문산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cfb84a61-8d59-4860-b121-f9c17db773f9', '두정역', '두정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cfc089e0-7f7e-444e-8513-3ceb8bb5a673', '좌구산', '좌구산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cfecdc1a-ad77-42fd-b428-79c748b77074', '성복역', '성복역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('cff0e1cd-678b-49d3-85fd-1f792cc13b05', '가야역', '가야역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d016b5af-3cd5-4d72-a7d5-8731e6b4c4b4', '남춘천역', '남춘천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d057f746-5830-4831-a2a0-2ac4abe11cce', '자양역2번출구', '자양역2번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d0686500-ea85-413b-b9af-781e98c03d37', '독정역', '독정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d07bdd9c-b0a6-42ef-9e07-c084aa18b98d', '큰산', '큰산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d0b24e20-238d-4b12-a3a5-73e9347f553b', '염포산', '염포산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d0cad5bb-561b-4257-b253-bdf81095b4d8', '남군자산', '남군자산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d0d669d8-5944-4378-994f-66b97e2f2955', '추월산', '추월산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d0f87489-0749-45f7-b9ad-2b1c7a200d4a', '종로3가역 3호선', '종로3가역 3호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d1074005-3032-4bb1-bf82-96bf9e670885', '응봉산', '응봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d13c4059-8e68-497d-aaa7-a8bc92d57943', '덕가산', '덕가산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d13e7d7e-5feb-435a-a9ac-dbcb04b0f87b', '율하역', '율하역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d152b2c6-3af5-4f1c-9323-f95bcf47bba1', '정부청사역', '정부청사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d15b67f0-6f62-43d8-8de1-24032c020a7c', '지식정보단지역', '지식정보단지역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d16c14a8-bc54-4e0f-ae3d-8539127ff537', '이대역', '이대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d17c36cd-ca50-464b-b308-3832536c5fb4', '백이산', '백이산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d17d7392-7a99-4633-93ad-af1720442d4a', '수선산', '수선산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d1de8b55-e526-4186-a85e-13ca28b5411c', '서빙고역', '서빙고역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d2032b15-1254-4904-9a62-1dd30347505f', '향로산', '향로산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d20413e5-2293-4baf-81b0-6ba99cb7f580', '대덕산', '대덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d2172b0f-fba6-4b9c-9024-f81eb7393343', '소금강산', '소금강산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d22b7fe2-c442-42ca-9060-8cd4580630a2', '잠실역(송파구청)8번출구', '잠실역(송파구청)8번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d2379718-cbec-499d-ae09-894d632609d0', '부암역', '부암역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d24352b3-b247-46e9-8a60-02c11ada590a', '구봉대산', '구봉대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d257d86b-c284-4267-951a-312abd70e768', '구산역', '구산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d26afb80-8163-4a47-b569-7f51a845680d', '녹천역', '녹천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d26c25bc-c9a0-4f24-a9e1-698432674b14', '용두산', '용두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d2910ace-e85d-43d6-a0ad-7b8d9046e43a', '것대산', '것대산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d297832f-fe2a-4387-aa51-3955319927fb', '불화산', '불화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d29fc5ce-47d2-4ef5-869e-f8411d04b21d', '양재역', '양재역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d2a76572-d994-4442-bb3d-cd875559d724', '기백산', '기백산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d2b27fec-690d-4a57-8802-431dfde24988', '천주산', '천주산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d2d3d6bf-365a-46c7-8172-fdaeb9e5edad', '답십리역 5호선', '답십리역 5호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d2db2b8b-2d33-49fb-b799-044c1fc73374', '세류역', '세류역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d2ef2b7f-43ec-471f-874e-c94c278fc508', '열왕산', '열왕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d2fe7f54-32f4-420f-b15c-0e152f5ccecd', '가학산', '가학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d31d78ee-4788-4094-aace-4d397e929845', '태평역', '태평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d334ef77-7b59-42a3-8f73-a9b2ecae62d3', '문학경기장역', '문학경기장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d34e4e78-c95c-49eb-a400-b0022dcefafd', '담티역', '담티역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d36b57bc-dde3-44a3-95a7-5c4c7ef8598e', '두개비산', '두개비산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d3aebdfa-d5e7-4a33-a244-97e501c5f9db', '삼성역', '삼성역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d3da4da1-a195-4603-b7c0-9101d9210f1e', '구일역', '구일역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d4072374-6216-4a32-a20e-dda3eda54591', '두타산', '두타산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d469ae87-22c5-4015-9c67-44fd4d0ea901', '당정역', '당정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d47bce11-4290-4113-83df-42dcfab57ed8', '덕정역', '덕정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d4c2a637-7ae1-47cb-a8ff-a981e3d8fd5f', '김해시청역', '김해시청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d4d5de39-6a31-4b47-afe7-b2e4e355274c', '센텀역', '센텀역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d4d9de9b-85e2-4218-80f2-3777f5ea1df7', '목우산', '목우산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d4e98305-9d75-4818-8aa9-b850f68502a8', '다산역', '다산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d5014b72-5bb5-49bc-9a9b-493b570036c9', '고고산', '고고산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d52e3bb2-34c0-4a02-bd78-dbddfb7e605b', '제물포역', '제물포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d54347ec-a125-4875-af87-b58ce8ea7799', '주례역', '주례역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d55d0ff2-84c6-4af2-8c4a-4e129821bf3f', '관악산', '관악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d577eb38-7af0-4ecf-931c-4299360c3604', '교대역', '교대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d5cb9aa6-9716-4b0d-af7c-50eaae3ef8c4', '삼봉산', '삼봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d62896e5-624f-4d56-9c7c-51917558bc9d', '비봉산', '비봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d66b3f89-e29d-4861-8128-0b34911cab21', '평택역', '평택역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d69a71d8-1199-4b86-92c9-6ddb0368556f', '주엽역', '주엽역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d6a9b5fe-9e96-4fa1-be96-1113817deb98', '덕항산', '덕항산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d6bf8158-1f08-42af-8658-6e107fcac5e4', '함박산', '함박산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d6e2ae45-b643-4051-8e58-c17ab05be937', '미아사거리역', '미아사거리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d729098d-987b-4a2a-a22c-a2bda13be553', '백악산', '백악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d72ba4b5-2eba-4706-801a-5cc91e696884', '안국역', '안국역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d73e1cb4-1d52-4c98-a6a5-cd7a5869eb37', '청량산', '청량산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d770402c-ce40-4c32-bb2a-565805ae4136', '관룡산', '관룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d7c9f1e7-203a-4176-ba0b-9bcb0cdf416e', '망월사역', '망월사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d7dbf54b-9a93-4c55-903b-8147c5fcf3c3', '은석산', '은석산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d7f7f815-2705-43cf-9332-1d44ded111c4', '어룡산', '어룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d7f8a6e3-ae24-4a10-b1a5-1ef65a3df726', '만평역', '만평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d8050338-7f76-405f-8033-63908fda03df', '수락산', '수락산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d80c72c0-af45-4769-9445-b731fd32dec6', '박달산', '박달산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d83c7636-0b93-4591-8f34-fc4a83911084', '모락산', '모락산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d878b6ee-a9ba-4f2a-9ec4-1900c08cd15c', '굽은다리역', '굽은다리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d8aad97b-be34-44e5-8513-2c63f657f08f', '동수역', '동수역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d8b89a98-b2bb-46a9-b3f0-c78d236a7e83', '야당역', '야당역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d8d3d9b7-d183-4dd5-a779-5032809498c3', '이성산', '이성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d916eeef-0e25-4b34-9316-a5bd92d29e32', '을지로입구역(하나은행)8번출구', '을지로입구역(하나은행)8번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d94c4a19-4627-4a2f-8a34-4a76478f43ac', '예술회관역', '예술회관역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d95c64d6-2bd0-4e6a-abb0-b11595307b45', '대화역', '대화역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d96b8341-0493-433e-9d39-cc22c30dfa37', '중랑역', '중랑역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d96c96cf-c30a-48a1-a1e7-6393d2e5312b', '오도산', '오도산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d96f2a00-1e5d-41d0-9734-f2ca950e377f', '잠실롯데월드(직통)정류장', '잠실롯데월드(직통)정류장을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d9a178d6-372b-4371-a103-4ca169dd75b7', '용기원산', '용기원산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d9afbc4c-2d0a-4476-8e43-b141a13ef929', '구성역', '구성역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('d9feadcf-f4d5-4493-888f-eb9b65ee7708', '수도산', '수도산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('da285bb1-3745-48ef-876a-64de5b928a85', '계룡산', '계룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('da3520b1-4e75-44c4-9e9e-597c316d55e5', '고덕산', '고덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('da47bd6c-9a1b-461a-927c-32423d72e3c4', '여분산', '여분산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('da481570-78ac-4d62-8cdc-ba646d1030b4', '봉명산', '봉명산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('da6b9948-e33b-41f7-b00b-61c702329f78', '능곡역', '능곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('da9bf23b-7590-49cc-8336-c4b2494b6aa0', '종로3가역(탑골공원)4번출구', '종로3가역(탑골공원)4번출구를 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('db10e96b-7645-4b48-8e1f-92c8c2a144d7', '월각산', '월각산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('db69a8ed-7110-4c1f-a2f6-91d3d4c47c03', '잠실나루역', '잠실나루역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('db6f24c5-c383-4c6f-9940-f5d0a990267f', '상운산', '상운산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('db82bdba-004d-4e9e-b807-9b2025997a0d', '교대역', '교대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('db932e03-8e8a-4510-bf7a-570744e00529', '각산역', '각산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dbbb5e8f-c155-4b5d-927b-9e020fa2deab', '화야산', '화야산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dbcb3ec4-042f-4d2d-bfa8-18f37eeff4ff', '구병산', '구병산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dbe193db-9631-441e-ac61-ac39a7321a06', '동막역', '동막역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dc0e28b0-1d02-4187-8582-2150d3469af9', '문양역', '문양역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dc1bef61-ef64-46ec-b6e5-b33fc8282862', '금수산', '금수산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dc2d4828-8d94-4460-89c6-347a243b5426', '상인역', '상인역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dc4c14b5-80fb-45ec-bb3a-c161bdb3b256', '복정역', '복정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dc6fa01a-a3e3-4411-ad8a-7971b204b8d5', '가현산', '가현산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dc7f6e32-c82d-46eb-9651-8816a39da817', '사금산', '사금산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dc856b15-af6b-4b91-aa55-23bf63e57d58', '팔달역', '팔달역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dc9371f5-9e3c-4e9f-999b-2afe5e6d1099', '승봉산', '승봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dcad8b95-c7f9-4e8e-ad04-8cb2b857a293', '대전역', '대전역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dcb5d48e-6b5d-451f-ac3f-534f71febc04', '개좌산', '개좌산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dcc635b6-07cb-4f22-8dd3-02091e75c321', '김유정역', '김유정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dd0e0b30-b9d0-4a4b-99d5-e6b6d077066e', '평강역', '평강역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dd281068-7bc1-4609-ae5d-9fcf046da626', '도덕산', '도덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dd6453ef-936a-4e9d-a218-abf7efeb1540', '경대병원역', '경대병원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dd738518-4dd1-499d-ace4-d556bd2b3ebc', '팔봉산', '팔봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dd9015e2-06b7-4862-8eee-3e0dd2660b0c', '밀양역', '밀양역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dd9bcdf4-9ed6-44d3-bb4a-65d11d04c55d', '아차산역', '아차산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dd9bec64-f5f8-4ef5-97f0-5733141ce3cd', '대실역', '대실역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dde2bcc2-db3f-43e9-9020-c6eaa816ea34', '가락시장역', '가락시장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('de113d4b-dc1e-4df6-805f-526134a9d882', '대곡역', '대곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('de344e98-d084-4b16-ba00-ff9f5592ca08', '제왕산', '제왕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('de37b429-56c3-4935-bc9a-9f7cb1554628', '깃대봉', '깃대봉을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('de571b97-0aa9-449c-ab96-5cd2d92c1709', '민주지산', '민주지산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('de7bc7f6-49bc-4032-bf56-6ccad9c0b544', '미타산', '미타산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('de7d6cf4-5cb7-4c65-adf3-7e3f852c58b1', '운주산', '운주산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dec34f35-0d02-48d3-88d3-72f4d8c12bc7', '송악산', '송악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dec67564-f1f2-4935-a554-e229638f8098', '원덕역', '원덕역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('df29ee17-20cb-43a7-bc34-b3fde25107fe', '범물역', '범물역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('df5caf52-7a00-4c3d-918e-cbb5bf45eb05', '명학역', '명학역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('df83db5f-0779-48e0-b9d0-65c36b47064d', '갈마역', '갈마역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('dfd5d2be-bc1c-4a29-9c34-e7897b73533b', '칠갑산', '칠갑산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e00fd3ab-785e-40c3-b1ae-70f53667e644', '도고산', '도고산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e04fb9bf-846c-4378-88eb-0fa2de1c08a4', '문래역', '문래역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e0583e65-edfe-45f1-882e-bbdbbdbdb10d', '고색역', '고색역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e05e17bf-b96e-4fee-b6a9-af2299d3276b', '증산역', '증산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e0905834-f8a2-4de6-b960-34195f67b733', '설봉산', '설봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e0b8e374-9e07-4002-9814-ef35217179f5', '강남구청역', '강남구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e0bef93c-6bbf-433b-b037-0eae9826438f', '면목역', '면목역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e0ddc8f8-9b45-49e9-8891-8b55fab320e7', '오목천역', '오목천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e0f8b357-9cad-4969-a8e6-009fdb1ff7ff', '보납산', '보납산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e135016d-39ac-4a1a-8d97-44ba49b77e10', '작은동산', '작은동산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e13ab665-0d19-4a46-ba69-9114cebcc4ff', '일월산', '일월산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e14ff6c6-8a49-4734-9b07-fba59852a941', '보라매공원역', '보라매공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e18b20f4-4e88-4beb-b8df-6aa3258b0aa4', '대치역', '대치역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e1e29c58-48a0-4cb3-9f83-72191b2bbf85', '다대포항역', '다대포항역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e1f49709-2f5e-4c56-b967-290e207df5ed', '백덕산', '백덕산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e2396178-1941-4b45-80f6-412d2a163fe2', '문화전당역', '문화전당역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e23f77db-ae24-4690-92ca-e0b0b1dcac61', '미금역', '미금역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e26c0d0f-cae1-40f3-958f-adf3c2726de9', '노들역', '노들역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e276f993-e9d3-4d3e-9f2a-ce55fbfa33a2', '강릉역', '강릉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e29cc9a5-23b2-42f6-a6f1-4d8ac95fee17', '외대앞역', '외대앞역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e300d4ec-d39f-4eea-bcb4-226638f54ff6', '가야대역', '가야대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e308873a-4fd0-471d-ae97-b5bac3920fb1', '성치산', '성치산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e315699b-2f75-4ca4-a699-478c6454efa5', '고락산', '고락산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e3202781-5792-475a-b53f-d5cc5b0c40a4', '흰대미산', '흰대미산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e38903c8-303e-4353-8790-e767177d3080', '계족산', '계족산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e3a38b40-2069-44ae-b9ba-87129188052a', '통내산', '통내산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e3a9928c-6551-48a4-8a17-7e7ee4956c77', '청라국제도시역', '청라국제도시역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e3c66f98-6078-4666-a08e-839eb2bee9ff', '운양역', '운양역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e3df0b46-1ac3-4def-9ba6-7f7abe344953', '거문산', '거문산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e489e17e-63a7-4c92-ac76-2241863675e4', '설악산', '설악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e49fe3e1-e7c1-484b-8b3d-c13d54920c39', '망운산', '망운산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e4d1b5a3-d894-440a-8ec7-73644c20585f', '와룡산', '와룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e4d745bc-eea0-48d4-93f0-e7364fa7d8ad', '백월산', '백월산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e4f2c0a4-ee47-49ee-954f-9759058f2d84', '두실역', '두실역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e4fa425d-1ff7-4905-9c78-eb5fc9c4a660', '남양산역', '남양산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e506e645-1db0-4425-a4a7-1b9b1dc6e6da', '황학산', '황학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e527088e-5c2f-4d79-83e8-052d23667a2b', '총신대입구(이수)역', '총신대입구(이수)역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e559f38c-6901-41b8-a56d-9efa64e5135b', '가리산', '가리산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e55c517c-0fc9-4278-a347-50b9421e4fd2', '선릉역', '선릉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e5b1870f-7462-49b1-ba76-381cf56902bf', '간석오거리역', '간석오거리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e5b23ba7-26b7-4c4f-9acf-df65607d52a4', '팔영산', '팔영산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e5b387c4-30a5-4f36-b6e1-39e07a428a4e', '개화산', '개화산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e5b4d134-eb41-4531-b02f-ad224999dbf2', '황매산', '황매산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e5e5841d-03ac-436f-9e4e-f0a9600247cf', '신답역 2호선', '신답역 2호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e5ed1487-79a8-4219-adf8-93afd5fe9f24', '서울역', '서울역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e60f7fbc-c5c6-4a6d-83dc-75fdea025d28', '호음산', '호음산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e66039f5-3113-43ed-9276-7e06eac0ab7b', '종로5가역', '종로5가역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e680844c-61ab-4ede-85b5-19f352759154', '일락산', '일락산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e6837584-366c-4225-a9e6-bd228c2d7462', '장암산', '장암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e6ac9781-0a1b-45c6-8c06-7225aa4f4e92', '만연산', '만연산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e6b4ea05-de97-4239-a780-ae4e0f535813', '경마공원역', '경마공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e6f45d36-0160-410f-a067-179a4c6aff50', '서대전역', '서대전역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e7249338-531c-4b12-9c11-45bc397733d7', '백자산', '백자산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e750b4f7-e5df-4864-b73a-ac408f005726', '봉래산', '봉래산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e75c8752-1908-4c65-9ddf-9cb42a47e563', '구로디지털단지역', '구로디지털단지역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e7603390-175f-41a9-99d2-5ca04a3945ea', '시청역', '시청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e7754a39-3ade-4dc0-967a-12a8da596a9b', '팔용산', '팔용산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e77da2a1-9506-4fcb-9fc5-7db8351e9709', '기우산', '기우산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e78f1a2b-425c-4b98-9781-135c5c6702fc', '백족산', '백족산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e7a81226-423c-4caa-8af0-432e94630a68', '시민공원역', '시민공원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e7ae12de-3a7a-4f77-afae-d6246000807b', '탕정역', '탕정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e7b8bd15-e892-4145-9cd0-c683fa57d8de', '금오산', '금오산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e7c95182-34d8-401b-a913-6a70e428e2f1', '절산', '절산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e7edae03-3a32-446f-bdb5-63dc06acb89b', '운길산역', '운길산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e822b191-4be4-49fd-8271-e2faa74ff23c', '모라역', '모라역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e86ce981-b02a-4bfc-9acc-bcb94c2be6da', '먹골역', '먹골역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e881c5f6-e061-478e-afe0-b72cbf9beed6', '달미역', '달미역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e8ea03cb-190a-435f-ae9c-1b186c85e520', '유방산', '유방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e8ed683f-db74-43f8-93a9-4be539d890a7', '광주송정역', '광주송정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e9585c17-95ce-47c2-9c2e-c0b7a39e4526', '월롱역', '월롱역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e96bbdcd-426e-40de-95f2-a54a74b0e44d', '식산', '식산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e97d74bd-89ae-407f-9de1-1b590174125a', '양성산', '양성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e9dd03b0-c9c4-40ab-a254-172cfd03aef1', '장지역', '장지역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('e9dff682-0f1e-4d6e-adfe-ef2efb672c04', '성황산', '성황산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ea0e0ae7-5116-48e1-946e-5f588f85dd38', '백운역', '백운역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ea18ed2b-7d53-421b-8b82-5d37b4c2fddd', '정병산', '정병산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ea2b102e-77ba-4879-89aa-fa1cc06dbe66', '함안역', '함안역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ea60e02d-d42d-4c37-a6a9-6af5b55bfc4a', '노원역', '노원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ea8f0900-eef1-4e73-82e6-a68797ee9905', '봉두산', '봉두산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ea8f4c27-96a6-42b9-ab55-afa038b642cb', '국망산', '국망산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ea96a6f4-99cb-498b-98f4-80b939f5c965', '대암산', '대암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('eaadb35e-4f7e-48ed-a73c-ab59fb174aa2', '서운산', '서운산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ead52753-0983-4525-b0b0-d25a6f74b862', '망미역', '망미역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('eb1e8581-6cfc-4e11-9fe0-6b4ba3e28f2b', '양천향교역', '양천향교역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('eb367e0c-b3c9-4dbb-91c1-df4c7ab8d6ea', '여의도역', '여의도역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('eb49bea7-9460-4f32-a509-d981d3afc709', '채계산', '채계산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('eb7a71b8-c165-4c07-aba6-23fefca44f3d', '부산대양산캠퍼스역', '부산대양산캠퍼스역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('eb7b7f29-df93-4c69-bf8a-999627514a2d', '딸각산', '딸각산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('eba86f1a-98e8-4141-b22e-6ee8e3b4618e', '불모산', '불모산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('eba91b01-7708-4a1a-b91f-fc9691414b40', '강남역', '강남역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ebb14fc3-ecbe-4197-a0e5-05b91b2a9e39', '승학산', '승학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ebb36ae9-f6d4-4775-96a1-a6da01d83924', '석바위시장역', '석바위시장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ebbd0eda-3042-40d8-aa09-8617c4cfa5f0', '동두천중앙역', '동두천중앙역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ebbd460c-ec63-44c5-bed3-6f44184d323c', '백학산', '백학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ebf6a9e0-2983-4fcc-9f7a-4d18cc3862e9', '복주산', '복주산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ec196147-bdb4-4de3-817c-21fbe761b8a9', '낙민역', '낙민역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ec24531c-bcf4-4123-9b70-9a2dbf877b32', '용두역', '용두역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ec4033f1-d5cb-433c-b244-764178857f4a', '적라산', '적라산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ec5869ed-fe5d-405d-bd23-dca9241fac65', '까치산', '까치산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ec698ac3-e049-4757-bfe0-f7e8a6c1c42d', '독산역', '독산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ec79c8a7-64d7-4b9a-a6cd-4b708f97159c', '왕길역', '왕길역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ec7b56d0-fa3b-4345-a6af-d5d163721415', '구녀산', '구녀산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ec7dcc17-2c3b-4abb-bf28-69983ba72afa', '구봉산', '구봉산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ec83afb8-3e4d-4068-b29c-27fe3bd83b1b', '서동역', '서동역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ec8fa99c-dd5d-4cd6-961a-036a7f550c3c', '덕소역', '덕소역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ecac4576-bb88-41dd-91f8-aa7441f5f5cf', '백하산', '백하산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ecf0e6f4-ddfa-4d32-97d8-52bacb822c5e', '의정부시청역', '의정부시청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ecf24ee5-8c4a-4767-aa46-6aa71143b492', '신포역', '신포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ed3bb965-d419-47f7-be60-b375758ba7c2', '동림산', '동림산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('edb99cd4-1ed5-4c88-8600-2dbef4117c18', '구룡산', '구룡산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('edd1b4b5-834a-4d88-9967-622d5c5e7c8b', '초당역', '초당역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ede47fba-7c4e-49bb-bfa6-fbcb13d77634', '장복산', '장복산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ede62567-e7c6-463c-bdbf-3f69d65b8e40', '불암산', '불암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ee14190d-e880-4f1f-a9a3-2d504e674125', '괘일산', '괘일산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ee36af22-85c4-400f-b41b-7f305de67aa6', '익산역', '익산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ee591d9f-b938-4eff-b68a-c82874ed4724', '나주역', '나주역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ef0ccde7-b271-46e7-bb4b-2b2786e75b56', '중구청역', '중구청역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ef134a8c-f7c8-4abf-93f8-4faedd106ae5', '왕치산', '왕치산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ef2eb651-1ad5-47d8-8ebc-e02b3ed8af9c', '지행역', '지행역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ef3c39f7-c7ef-4994-82f8-b84ced3fd6f8', '사월역', '사월역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ef513c61-3718-4fbd-9b1b-e9ed6f6d9679', '백아산', '백아산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ef5d855a-8a6c-4c63-8a85-a641e9b7645f', '장암역', '장암역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ef86f784-1149-420d-917a-cc11303c852f', '임실역', '임실역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ef9b120b-f848-487c-81f9-092131a5294c', '성주산', '성주산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('efa2087f-f6e6-46f2-8139-3b203f04d80e', '화악산', '화악산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('efc8d793-47d5-49d4-8724-b83bc8fd4744', '귤현역', '귤현역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('efd66c28-7afc-430b-b1ad-287338647173', '삼산체육관역', '삼산체육관역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('eff3c4e4-11d8-42bb-8ea1-435bf7e22b57', '종현산', '종현산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f002a5d2-cb61-4e54-bc42-bc119b0295a4', '토함산', '토함산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f041141a-8a4e-447f-8b6e-8a003e90186a', '용답역', '용답역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f097f013-eaba-4022-a765-2c0e8a78072a', '설흘산', '설흘산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f0ffb912-7c69-414a-b61d-541ceb6d090b', '수성구민운동장역', '수성구민운동장역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f127df35-31dc-4eff-9bd0-3e3c15342abc', '흥정산', '흥정산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f1453e44-af6f-404d-aa54-1f6c24cadc6c', '마전역', '마전역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f1458d84-dce2-4327-97ff-81640d518c1d', '팔거역', '팔거역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f15257d6-7d71-4abc-ac01-a458375d6ccf', '봉천역', '봉천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f16f8ccc-5d55-4276-8bbc-6740afabd9d9', '중미산', '중미산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f17e8a75-8301-4a05-aef1-df57e56a3a31', '유명산', '유명산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f19870ec-5a39-43d2-a79a-af1ef852a272', '소백산', '소백산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f1a00b2a-6802-4baa-ac61-c7ce391a88ef', '보성역', '보성역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f1bd48d9-8346-4c23-af56-9f4cb5d457a7', '고잔역', '고잔역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f1e64f09-e059-4004-ac1a-9ba0e4467fde', '주안역', '주안역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f21a31e3-9d8f-4aeb-b01a-5fef47062128', '수진역', '수진역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f2222402-4eca-4da3-853d-cfe031deb5d5', '인내산', '인내산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f240415d-6584-4fdb-9407-045eb591a8f4', '사우역', '사우역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f25e678b-acdf-42ee-972b-dd91261a83ee', '문형산', '문형산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f26d5c2a-3119-4284-b611-22241422806a', '낙성대역', '낙성대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f26e669d-9a2e-47b6-b5a6-be790b368250', '서원산', '서원산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f2840b98-0a47-43fa-b087-227dd33cf401', '매교역', '매교역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f28fd3ee-a294-4b49-98df-6c8318a32c0d', '부소산', '부소산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f295445e-3e73-498c-9419-f10a0824aa6a', '신갈역', '신갈역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f2b38c1e-4a51-4dd8-a1f8-dd458bc5ebf6', '단석산', '단석산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f3072f1d-acef-410c-bd2f-45d52876eb83', '성균관대역', '성균관대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f3233afe-0ad1-4853-b858-828ee34e2743', '판교역', '판교역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f3553c61-2835-46ef-8698-a690419731f8', '초량역', '초량역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f35919f1-2e0d-44f9-8617-014c4fac192e', '북한산우이역', '북한산우이역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f3752aea-b329-4d01-a676-bb698cb8b18a', '문학산', '문학산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f376fb62-132e-4491-a201-19ef84c114a5', '갈기산', '갈기산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f38dcdc2-27c4-4a08-9ff0-0b74e2a40785', '칠보산', '칠보산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f38ee081-4767-46e7-a78d-536163d5c461', '온양온천역', '온양온천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f3bf4204-f9ab-413b-89a0-2af58f6824ed', '학정역', '학정역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f419e7e1-f3e0-4766-a4c1-af5e9dfc69c4', '아미산', '아미산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f41c1a48-03b2-43f2-9672-280aa3519a13', '칠곡경대병원역', '칠곡경대병원역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f436ce33-2d38-48d6-9f95-983cf4ebe7b2', '석촌역 9호선', '석촌역 9호선을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f43a063f-0eb5-4445-877b-ac8c7e932f2c', '군유산', '군유산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f5b05f1f-8b95-49f5-9578-5fb76e5dc4de', '신논현역', '신논현역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f5c0cd20-4b26-438f-a23a-13ee3f6d310e', '천태산', '천태산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f5d113a0-f47f-40f7-a41f-1129394ece03', '박촌역', '박촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f5e72b3c-b6b6-46f2-b6e6-079806b08181', '고려대역', '고려대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f5ee41eb-17c2-4570-98b9-a886f95e8739', '수내역', '수내역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f5f9d9b3-9cda-4e72-a73f-73b4566ff142', '원대역', '원대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f6075b2c-df35-4e93-9714-680bd35930f5', '소사역', '소사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f60edb3b-4bf6-41f8-847b-3cc0658fe929', '안양산', '안양산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f611373d-2bf9-4fc4-9396-fe444507df76', '좌방산', '좌방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f644ffb5-862c-4dd6-ba98-57cb7961898a', '을지로3가역', '을지로3가역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f6d9656f-6bb2-4fc3-986b-d8679ab53f73', '백마산', '백마산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f6ffcf0a-2a0e-4b0d-9a07-2fc2cb2301b3', '황병산', '황병산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f719be92-e645-42b2-9144-be4e88e0a576', '거망산', '거망산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f7377f62-f39a-468e-8b7c-20bced82c757', '양수역', '양수역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f77effde-025f-4bf2-bd68-935c6b1fb12f', '충무로역', '충무로역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f7917e14-6bfb-458e-a10a-d5f9a139c0b2', '산방산', '산방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f797c864-34fd-45f8-8739-6e974203b7e4', '사상역', '사상역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f7a40d39-f039-4399-b5ee-897e11c54024', '지등산', '지등산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f7f1349e-e6d3-4e9a-8777-a73f834b5d06', '산방산', '산방산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f8570d5c-e592-42cf-9cb4-5e5f2119225d', '평택지제역', '평택지제역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f873cd16-bf52-42c5-9173-ed0364e83436', '연엽산', '연엽산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f8c94d24-6ea1-49da-8b6e-db54728d1ba6', '범어사역', '범어사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f8f28fea-b70d-4387-9657-2b2591cd6d34', '부평역', '부평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f9000f40-d9e4-4b52-b822-65896910eadd', '명지대역', '명지대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f90a8c80-1100-44f3-bf9a-5d2fac8df194', '소요산역', '소요산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f94a8ec8-d8ba-4747-938f-27b95670dce0', '보리산', '보리산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f952c008-2537-47e5-baba-40b63fa8fc8e', '된불데기산', '된불데기산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('f9ae72a9-f7b8-4eeb-afc8-ae68afd3fe82', '응봉역', '응봉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fa57e4d5-6f8e-415d-a8f8-d131bee6b822', '수유역', '수유역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fab33d26-6991-4f2f-a8c6-a8be99875837', '계명대역', '계명대역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fab4dcea-9826-4f99-9a1f-f022940aee2b', '송도역', '송도역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fad21ba2-0417-4b23-8f2b-4d9620a9a7ff', '의성역', '의성역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fae94a38-81e4-4e02-b788-756c327a0b90', '문암산', '문암산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('faeccd46-53c3-4e81-a5de-f1910bd36c09', '역곡역', '역곡역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('faf2bc99-6744-4aa5-ade8-324f687b2961', '갑장산', '갑장산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fb07d267-4954-4086-a76c-9bd580d8bfd7', '강촌역', '강촌역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fb17cde8-b89c-44e6-815b-79d6921e9044', '운천역', '운천역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fb2e58c0-f97c-4535-a18f-7382947dc7f8', '원종역', '원종역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fb74ad95-637d-4105-9db3-0f384051cd7a', '범어역', '범어역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fb7d0eee-3d7a-4611-9e1a-7f56b46d468a', '원주역', '원주역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fb818540-91d3-43a4-ae9b-bb6b8317fa23', '대야미역', '대야미역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fc0a76b9-4d21-4613-a1af-6c20ea434f6b', '앵산', '앵산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fc4fbcf5-2efe-43bc-b551-64e4e55f9970', '수월산', '수월산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fcfcf800-56ae-42db-a3f3-3e09aad4e2d9', '오음산', '오음산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fd10e412-3ed4-4643-995a-2cf4fe5c6ea1', '선바위역', '선바위역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fd19b5c4-243a-422b-a954-42a2214417dd', '청명역', '청명역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fd1d4c1e-1df5-4e34-b0fe-5693a0dcfa36', '녹사평역', '녹사평역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fd44cefd-abe9-4bc6-89a7-3bd5bf8ef283', '태양산', '태양산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fd6ed497-0d3b-423c-a857-65138a8427e4', '정릉역', '정릉역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fd8a8b9b-4c04-430c-a3fb-04c253a959a0', '가산디지털단지역', '가산디지털단지역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fd9139f3-3c83-4087-a5ac-19eb83722a7d', '봉화산역', '봉화산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fe7a97be-249c-4ada-97b0-2e2b25f88c38', '덕포역', '덕포역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fe7b903c-54b4-4f9a-ba46-5a8828e4b30d', '공항화물청사역', '공항화물청사역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fe7ee4ea-5d44-4702-9bc3-7e6bf62e9a03', '청담역', '청담역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fed776ac-c526-4fbd-aafd-055f8e1fdd6f', '정왕역', '정왕역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fee0013d-0afe-4331-b5f3-781d0dc23766', '산성산', '산성산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fee3444a-e290-4d07-8840-9b20153f4b29', '포항역', '포항역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('fee901ba-f80e-4f04-9121-700dad564afd', '부산역', '부산역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ff569dde-0cf6-4f46-9e0e-f637e90f6429', '검단사거리역', '검단사거리역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ff94d7aa-9c66-4749-9e2a-974e74207eb8', '옥수역', '옥수역을 지나갔습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false),
  ('ffd31e60-8508-4e8c-a6b8-b2f09c88a288', '무척산', '무척산을 올랐습니다', 'poi', 'common', '/badges/poi/anyway_star.png', '{}', false);

-- poi.linked_badge_id 연결
UPDATE public.poi SET linked_badge_id = '8a87609d-11da-4f19-af3d-eef125eb0ba3' WHERE id = '000f8d44-078c-44bf-bbe6-13e91596c275';
UPDATE public.poi SET linked_badge_id = 'c387a13c-1fd5-4665-b3ee-91e1282eac4a' WHERE id = '001fb838-591f-4a76-a943-029025dd7834';
UPDATE public.poi SET linked_badge_id = 'f6ffcf0a-2a0e-4b0d-9a07-2fc2cb2301b3' WHERE id = '0021a8ca-10bc-4fe3-ba68-b32aefd55bff';
UPDATE public.poi SET linked_badge_id = 'e276f993-e9d3-4d3e-9f2a-ce55fbfa33a2' WHERE id = '008dd3d2-82a1-4b47-bd86-2e7033c58702';
UPDATE public.poi SET linked_badge_id = 'e0ddc8f8-9b45-49e9-8891-8b55fab320e7' WHERE id = '00a9fb76-bd1d-4bc6-a80b-97ea37122f79';
UPDATE public.poi SET linked_badge_id = '6fc28ba0-b1d0-413c-9de2-255c56d0d407' WHERE id = '00b88adb-1f36-4d78-8944-f82a350b57bf';
UPDATE public.poi SET linked_badge_id = '3a582905-ea1f-4c0b-b537-b20a515fa2b7' WHERE id = '00f1f05f-970f-44ff-9081-2af022134f6f';
UPDATE public.poi SET linked_badge_id = '490b9cb3-c837-4308-91c0-7978ed1c635c' WHERE id = '00ff115f-56ef-41d3-99f0-0f20fa027179';
UPDATE public.poi SET linked_badge_id = '21c26840-0b47-4956-b24b-6643be4f081b' WHERE id = '0101021a-7dc0-4b72-8e4a-61347fed2a35';
UPDATE public.poi SET linked_badge_id = '38fb59b8-187c-4ca2-b8e5-4cada2a8ba89' WHERE id = '0107dc42-fc75-440a-97c8-07b097936729';
UPDATE public.poi SET linked_badge_id = 'd26c25bc-c9a0-4f24-a9e1-698432674b14' WHERE id = '0119f163-ee9f-4b57-bb95-6ebcd825ec39';
UPDATE public.poi SET linked_badge_id = '634cdb09-137f-4e5d-b04f-0d9b79f297ed' WHERE id = '013d2fa5-61ac-4b6d-80d0-c50feac5ea4a';
UPDATE public.poi SET linked_badge_id = '7bce96ed-910b-48b9-8680-5cc583b29398' WHERE id = '014517c4-3de1-4acb-b9b6-015b730ad06f';
UPDATE public.poi SET linked_badge_id = 'e66039f5-3113-43ed-9276-7e06eac0ab7b' WHERE id = '014e3573-3f98-4c36-ae5e-002cd9f28075';
UPDATE public.poi SET linked_badge_id = 'b53b0cc6-98a8-45e3-905e-59e0031e2fd3' WHERE id = '01578911-62fb-4a0c-8dfa-9330f50b4fd0';
UPDATE public.poi SET linked_badge_id = 'b9cb3e08-d1a8-492b-9095-0811762ec7c1' WHERE id = '0158fe2c-fb44-42e8-a0a8-3285e7a4bd32';
UPDATE public.poi SET linked_badge_id = 'be06e8bd-ae82-4722-a562-16c6b394193d' WHERE id = '01b9ac7c-92b7-4cf7-a218-0656e8c681bc';
UPDATE public.poi SET linked_badge_id = 'c686730b-ab34-4b26-a3f7-b63ed691b1ff' WHERE id = '01e1b5af-43a5-4029-85ae-b293fd8afe8d';
UPDATE public.poi SET linked_badge_id = '86001e6d-11e3-46a5-91b2-6e81f9dd98bc' WHERE id = '02164539-eadd-468f-919e-d2a1c0adcee7';
UPDATE public.poi SET linked_badge_id = '47ad8ea2-51b5-4e57-952b-fb388326f67d' WHERE id = '02ce2331-2e19-4210-9cf5-291590eb845a';
UPDATE public.poi SET linked_badge_id = 'db10e96b-7645-4b48-8e1f-92c8c2a144d7' WHERE id = '02ebb538-3f9e-45ca-bfdc-d7e0ad03255f';
UPDATE public.poi SET linked_badge_id = '8c3bb638-ef42-423e-8327-0e0442e01228' WHERE id = '03352186-6c1a-41db-9c7c-816a67c026fb';
UPDATE public.poi SET linked_badge_id = '75a7d8a3-20a8-487a-887c-b13e9719b52f' WHERE id = '0373445d-39d0-4ded-a1a0-6f27f2154659';
UPDATE public.poi SET linked_badge_id = '6ce1b192-ab79-4e75-ad14-b4c5a2e1bf88' WHERE id = '03dcfee2-5c91-4cb0-8e42-3b21895950b9';
UPDATE public.poi SET linked_badge_id = 'c7d00114-6daf-437b-8f2c-d1fb2fc27547' WHERE id = '03de619d-f270-46cb-95ac-cdddd8f0a19c';
UPDATE public.poi SET linked_badge_id = '23dea50a-bc02-4ea7-9a81-1a3b31ad426f' WHERE id = '03e5fbb3-6f7d-4a01-b331-a5d37e147199';
UPDATE public.poi SET linked_badge_id = '6f77f4b9-09ed-422f-b28d-6d0a2a78a442' WHERE id = '03eb7840-cdf6-4c6b-a7bc-d11e081b946f';
UPDATE public.poi SET linked_badge_id = '635ef5d9-82aa-4318-afe9-bf68174f5a8a' WHERE id = '03f6f96e-67cd-409e-b362-b1c860ed7773';
UPDATE public.poi SET linked_badge_id = '6e0de38b-93f3-47f7-9741-b2a38df009fb' WHERE id = '0412f362-bb33-476c-a925-af58431a8233';
UPDATE public.poi SET linked_badge_id = 'ba1d25ab-8cec-4fc7-acd2-825709698308' WHERE id = '0448cd9e-33f9-4a7a-af1c-3d319338ab46';
UPDATE public.poi SET linked_badge_id = '331b32d6-ae3e-4702-9b17-72e92a02f615' WHERE id = '04646b32-4232-4ff5-8433-dcfaef295538';
UPDATE public.poi SET linked_badge_id = 'cd72a6bc-69f1-4b8b-aa9d-e1b6dc9a9aec' WHERE id = '04841b02-8c7f-42e8-a8c8-f19cb1df646c';
UPDATE public.poi SET linked_badge_id = '7c3f98a5-d0f4-4a12-a263-583d6edc6958' WHERE id = '0494d425-6154-4641-a7c6-624d08a33898';
UPDATE public.poi SET linked_badge_id = '9454a0cc-d3d3-442c-ab8e-2942fdb34e32' WHERE id = '04a6937d-0994-4d56-bccb-c0743876b717';
UPDATE public.poi SET linked_badge_id = 'dde2bcc2-db3f-43e9-9020-c6eaa816ea34' WHERE id = '04f659fb-5cf0-440a-8eb1-5a88aa9ce6d4';
UPDATE public.poi SET linked_badge_id = 'cd9acdb5-ca02-48d9-b7de-814e01b13b3d' WHERE id = '04fc667d-0fe7-4b41-aff1-866eaf725d99';
UPDATE public.poi SET linked_badge_id = '80a5c9db-27ce-4647-b116-cdf4383a7686' WHERE id = '04fd01d0-b175-4258-8ce1-f5820414f92e';
UPDATE public.poi SET linked_badge_id = 'e0583e65-edfe-45f1-882e-bbdbbdbdb10d' WHERE id = '05477eef-c4bc-45e6-a766-5bedc8ed436a';
UPDATE public.poi SET linked_badge_id = '14f87cc1-fe70-442d-a621-c4df584db980' WHERE id = '0547c640-351f-4fb4-97ec-ae4e36af1886';
UPDATE public.poi SET linked_badge_id = 'bdc6e1c0-664f-4ac0-9cdd-089f6a18aead' WHERE id = '054d596d-8214-4fa2-8208-faf2fb78e73e';
UPDATE public.poi SET linked_badge_id = '7a61d173-8e2c-403c-8183-2d796f87d2f1' WHERE id = '0550c0c5-97a2-43d6-972b-abec9b616103';
UPDATE public.poi SET linked_badge_id = '6b993be6-bb43-4b41-b330-37c526073314' WHERE id = '05778452-ddb4-4b88-a95b-38d12a6b3f1e';
UPDATE public.poi SET linked_badge_id = '74d5fa79-9d8f-4e18-92a6-4bc9570e7d95' WHERE id = '058f92d8-766b-4824-9beb-7d7b51bed075';
UPDATE public.poi SET linked_badge_id = '75c56237-58f9-40b7-9dcf-6da4713a2bf0' WHERE id = '05c2ff9b-cc31-4b64-a693-51a393a9027d';
UPDATE public.poi SET linked_badge_id = '9c0c0fac-fbb7-497d-b80a-34df2c32ef82' WHERE id = '05fff522-7c5a-4117-b25e-cf64b0ab3954';
UPDATE public.poi SET linked_badge_id = '27be807b-c3c3-4db8-9164-ce349d150308' WHERE id = '06325797-467f-4a23-9cfd-9cf439ebb813';
UPDATE public.poi SET linked_badge_id = 'ead52753-0983-4525-b0b0-d25a6f74b862' WHERE id = '0659d8b7-0a52-4189-b090-dcf9dc7ca20c';
UPDATE public.poi SET linked_badge_id = 'a8d476fa-0326-4860-8d0c-a3ab5af7bcd0' WHERE id = '066daa50-b36f-4223-a964-49af4189e654';
UPDATE public.poi SET linked_badge_id = 'f8570d5c-e592-42cf-9cb4-5e5f2119225d' WHERE id = '06a955eb-e233-4e5d-98e3-1261393bf00e';
UPDATE public.poi SET linked_badge_id = '83b5e541-259d-4cfa-83bd-21890e9f5202' WHERE id = '07135bfe-59d8-403c-b495-0ae418156078';
UPDATE public.poi SET linked_badge_id = '9df6d5a6-44c3-4701-acee-514f15ea8b46' WHERE id = '07289526-0b5d-4b4b-954e-19936e51e689';
UPDATE public.poi SET linked_badge_id = 'd729098d-987b-4a2a-a22c-a2bda13be553' WHERE id = '0741fc29-d6e9-46dc-a55a-c17816902e27';
UPDATE public.poi SET linked_badge_id = '5c23f163-7f77-45c6-9cd6-6bfa0e72236b' WHERE id = '07e024fb-4509-4df3-be49-58ae62472c95';
UPDATE public.poi SET linked_badge_id = '9a16f79d-ddaa-4541-86dd-bced9aebc894' WHERE id = '07ef9f70-b58c-4190-a7d2-60d83a25db28';
UPDATE public.poi SET linked_badge_id = '3ca52343-cabe-4a83-b94e-8f4ebf7a8649' WHERE id = '07fcacff-6581-4097-abf9-3247ccfadba0';
UPDATE public.poi SET linked_badge_id = 'cb39e1a4-d05d-454a-8bc4-4b5da2c72bfb' WHERE id = '084db9cb-7c7c-40eb-b8a8-e18a65b72560';
UPDATE public.poi SET linked_badge_id = 'dd9015e2-06b7-4862-8eee-3e0dd2660b0c' WHERE id = '0851073c-7b6c-4803-91a7-330570148dc3';
UPDATE public.poi SET linked_badge_id = '87e24c80-ce40-4227-8384-272249df1ee4' WHERE id = '085d74e2-a048-45ab-ae70-88bd96490c3f';
UPDATE public.poi SET linked_badge_id = '0560499a-28dc-4545-ac53-0d106eab06ab' WHERE id = '089081cb-6606-4f35-8213-6358d2bbc836';
UPDATE public.poi SET linked_badge_id = 'f002a5d2-cb61-4e54-bc42-bc119b0295a4' WHERE id = '089fb18a-e43b-49ef-94c5-feed2d43b817';
UPDATE public.poi SET linked_badge_id = '7d6b3437-9612-4fe1-a9a2-5147ca3da49c' WHERE id = '08d045bb-23f9-4c52-a85f-e934cde7978d';
UPDATE public.poi SET linked_badge_id = '2df9072d-03af-4b40-9dcd-155dcb1ed241' WHERE id = '08dbf1db-639a-4565-b75a-0723eef763e5';
UPDATE public.poi SET linked_badge_id = '8e608971-f83a-4a86-a9e2-9f7d63f4542e' WHERE id = '08f8a3ac-a73a-4858-8b5d-2186f92ebd7b';
UPDATE public.poi SET linked_badge_id = 'bdf0886a-b9eb-473d-8f5b-d0d8d995c0d8' WHERE id = '092b340c-8b80-4513-9a49-67caa8b1ff50';
UPDATE public.poi SET linked_badge_id = 'b284a80d-36c1-4272-9afa-f424f62a07dd' WHERE id = '098d0da6-c711-430a-861e-554a1dd86e43';
UPDATE public.poi SET linked_badge_id = 'edd1b4b5-834a-4d88-9967-622d5c5e7c8b' WHERE id = '098f3613-1349-4a57-95f3-adca25c33876';
UPDATE public.poi SET linked_badge_id = 'e0bef93c-6bbf-433b-b037-0eae9826438f' WHERE id = '099ae0f4-cbd8-4218-a553-68743d5cd84a';
UPDATE public.poi SET linked_badge_id = 'de37b429-56c3-4935-bc9a-9f7cb1554628' WHERE id = '099c125b-2c88-47fb-9050-ccbb4e813e8f';
UPDATE public.poi SET linked_badge_id = 'd916eeef-0e25-4b34-9316-a5bd92d29e32' WHERE id = '09bfebac-9131-4818-9329-012ca156a19a';
UPDATE public.poi SET linked_badge_id = 'eba91b01-7708-4a1a-b91f-fc9691414b40' WHERE id = '09d8374d-6f4a-445f-906f-6034ad27e877';
UPDATE public.poi SET linked_badge_id = '2a9f7abd-916c-4986-951a-76f86632f459' WHERE id = '0a031ea3-8148-46a4-a50c-fc52e96b2f1f';
UPDATE public.poi SET linked_badge_id = '44b506f8-240e-4f6a-be37-93edcc56ab34' WHERE id = '0a0af2ce-7c37-442f-b535-7661516d3f58';
UPDATE public.poi SET linked_badge_id = '8a85ff1b-0e6c-4eed-8ffe-77ad2a71c3ee' WHERE id = '0a0ecf1c-98b2-4381-af4b-ea0e636dcce8';
UPDATE public.poi SET linked_badge_id = '3ec8c5fe-33b3-426b-937b-c19de8fa42eb' WHERE id = '0a438e90-85d9-4141-a2f2-8629bff46819';
UPDATE public.poi SET linked_badge_id = 'c349e04e-42d3-4fc1-904c-7d530db73ecb' WHERE id = '0a470a82-ce6b-4f9e-a4c1-bc383d6c188c';
UPDATE public.poi SET linked_badge_id = 'e3c66f98-6078-4666-a08e-839eb2bee9ff' WHERE id = '0b0f5e7f-0910-4c76-a67b-1cc22b2ab92b';
UPDATE public.poi SET linked_badge_id = '3516a730-b7d0-46cb-9ac5-8296432d2846' WHERE id = '0b20a2d8-7944-4154-a3ed-f633974e8852';
UPDATE public.poi SET linked_badge_id = '0eea93ea-564a-492d-86ec-8f85458cd830' WHERE id = '0b2ec70c-e7a0-4f05-a573-0cebd1f737c7';
UPDATE public.poi SET linked_badge_id = '64831823-657a-4880-8d53-27f0ff0580e5' WHERE id = '0b9ea384-af2d-4a76-8b1e-9aa697768b94';
UPDATE public.poi SET linked_badge_id = '7a760bcc-1c74-4f6c-9b8d-34b6df21b099' WHERE id = '0bb45263-4a83-4e9f-96c3-003fe638942e';
UPDATE public.poi SET linked_badge_id = '2684c7c6-6887-49dc-9a0e-770096c6764b' WHERE id = '0beb6bed-2e4e-444e-b502-6ad47a557b02';
UPDATE public.poi SET linked_badge_id = 'cd178967-5284-419a-9dc7-03023bb68e73' WHERE id = '0c0e4144-9ae8-4bc7-9970-cd7fa0dc9033';
UPDATE public.poi SET linked_badge_id = 'd13e7d7e-5feb-435a-a9ac-dbcb04b0f87b' WHERE id = '0c184e3f-7842-4825-9aae-cc904933c970';
UPDATE public.poi SET linked_badge_id = 'a62afb76-19ea-455b-869b-18d34cf6041f' WHERE id = '0c329add-45ea-4731-9e6a-5ee4a1ce40c0';
UPDATE public.poi SET linked_badge_id = 'be48ab84-386c-44fa-a3cc-1d1f45e552a5' WHERE id = '0c3e8f4f-3199-4b54-b7c2-2007704805d1';
UPDATE public.poi SET linked_badge_id = '213e017b-44e3-4be7-8206-09294e2d71c1' WHERE id = '0c42ab68-be11-48c2-9e57-f73c706fd0c7';
UPDATE public.poi SET linked_badge_id = 'd95c64d6-2bd0-4e6a-abb0-b11595307b45' WHERE id = '0c506a41-f4db-4be0-8dda-e0709c0c5f8f';
UPDATE public.poi SET linked_badge_id = 'e5ed1487-79a8-4219-adf8-93afd5fe9f24' WHERE id = '0ca6066a-d3a6-447c-86cd-360596de2d85';
UPDATE public.poi SET linked_badge_id = '12b2cd83-4735-4fd9-a5f8-aea44ba3814f' WHERE id = '0cd5811d-bec8-4b17-b92b-7aa17c58bc5e';
UPDATE public.poi SET linked_badge_id = '0794e02b-0452-41bb-a281-d4cd2c37b5cc' WHERE id = '0cd9ea06-9c7a-4e11-8129-a377728194c4';
UPDATE public.poi SET linked_badge_id = '47cd8307-cd50-4f49-83b2-458ae989e208' WHERE id = '0ce5df78-070c-4c7c-a4e7-39223e8e14ba';
UPDATE public.poi SET linked_badge_id = '0c06ace2-3ea8-422f-ab6b-027fc308e074' WHERE id = '0cee2bf5-4d0b-46ba-8b7c-e92beeddc243';
UPDATE public.poi SET linked_badge_id = 'd878b6ee-a9ba-4f2a-9ec4-1900c08cd15c' WHERE id = '0cf89c18-83e6-4363-83fd-85aa1fbcea6f';
UPDATE public.poi SET linked_badge_id = 'f21a31e3-9d8f-4aeb-b01a-5fef47062128' WHERE id = '0d0d3a71-67e4-4c72-b646-ba883e1d2b12';
UPDATE public.poi SET linked_badge_id = '6ad53b01-193e-4f50-8468-e9057c67daaf' WHERE id = '0d20efe5-a4cc-46ad-9d76-f71127776b11';
UPDATE public.poi SET linked_badge_id = '88ff4c7d-0f6b-4f29-a796-076c61f3d1e6' WHERE id = '0d42cc76-ef42-4697-8d74-d10fa310c6f6';
UPDATE public.poi SET linked_badge_id = 'eb367e0c-b3c9-4dbb-91c1-df4c7ab8d6ea' WHERE id = '0d639266-d526-40e3-aa9b-ef105c18174d';
UPDATE public.poi SET linked_badge_id = '7ea21cef-391b-4866-9130-0d5a424dd407' WHERE id = '0da6a66a-554a-4416-8f02-ec6df786de94';
UPDATE public.poi SET linked_badge_id = '8896f20a-927b-4d86-8e92-c8ff01c9db38' WHERE id = '0db5a10e-172d-40fa-9557-b73ccebb736f';
UPDATE public.poi SET linked_badge_id = 'd577eb38-7af0-4ecf-931c-4299360c3604' WHERE id = '0dba057a-5727-486d-b53c-1747062db208';
UPDATE public.poi SET linked_badge_id = 'de344e98-d084-4b16-ba00-ff9f5592ca08' WHERE id = '0dc08b86-b834-491e-9704-5120c343c13f';
UPDATE public.poi SET linked_badge_id = '42488393-3ae1-4070-bc03-09ee809290ff' WHERE id = '0dcb5706-8ad8-423d-b0c0-77f972163c4c';
UPDATE public.poi SET linked_badge_id = '17489d12-99ed-4b40-97d0-3e70051596ab' WHERE id = '0df1bcc9-2ca5-4623-b63d-1ef6b2eecc0b';
UPDATE public.poi SET linked_badge_id = 'bfbba12e-d0ff-4263-8428-cfaa78e5d497' WHERE id = '0e017117-8cae-4c80-9c4e-09be6b8053bc';
UPDATE public.poi SET linked_badge_id = '9003f682-60dc-491a-89f4-c45ed67fc877' WHERE id = '0e11942e-c70a-4044-bb58-4bfbe9ef73c3';
UPDATE public.poi SET linked_badge_id = '9a2623d9-bb6c-4c13-b970-55804909ddb0' WHERE id = '0e1a872d-180b-43ed-b57a-fb4c9ad66725';
UPDATE public.poi SET linked_badge_id = '69ad852f-791c-4f7a-b4a3-2244fdf9d544' WHERE id = '0e1c35df-c757-40ae-9525-396ed195f99a';
UPDATE public.poi SET linked_badge_id = '1c33813f-4487-4d4f-9377-09c5011b1ef3' WHERE id = '0e446d88-7a52-4006-a511-824ddba59545';
UPDATE public.poi SET linked_badge_id = 'a5083e84-3f1a-4d2a-9727-200aaba74c62' WHERE id = '0e4b9965-9022-49c6-b24a-2165cfc37d16';
UPDATE public.poi SET linked_badge_id = 'd96f2a00-1e5d-41d0-9734-f2ca950e377f' WHERE id = '0e4e17aa-38c6-41ee-8300-b6a9a1492c8b';
UPDATE public.poi SET linked_badge_id = '06d16be5-526f-46e6-afff-0e4a12f6c2fe' WHERE id = '0e649249-2ef2-457d-83ee-f25f47f82e85';
UPDATE public.poi SET linked_badge_id = 'a27cace2-4ebe-4e4d-8d91-8c9c29fe80b9' WHERE id = '0e907a81-c459-4845-8f3e-c2a83164fffa';
UPDATE public.poi SET linked_badge_id = 'e822b191-4be4-49fd-8271-e2faa74ff23c' WHERE id = '0ea5ca1c-62da-4c32-8639-1b3d0d2ca332';
UPDATE public.poi SET linked_badge_id = 'e26c0d0f-cae1-40f3-958f-adf3c2726de9' WHERE id = '0eb01cdc-4996-467c-be33-cf2ac3a7e7d1';
UPDATE public.poi SET linked_badge_id = '1125707b-63cc-4551-b194-8a35ddd99b83' WHERE id = '0eb0dacb-2d47-429f-837d-4f8749176851';
UPDATE public.poi SET linked_badge_id = 'b600ed06-0a74-4060-b8c8-36458854bcec' WHERE id = '0ebae890-f7e2-4e10-ac75-9c78b2c66678';
UPDATE public.poi SET linked_badge_id = 'f097f013-eaba-4022-a765-2c0e8a78072a' WHERE id = '0eeef598-1a33-4595-9147-63dea1595547';
UPDATE public.poi SET linked_badge_id = '75803e46-e611-457d-8497-8abce4b78c75' WHERE id = '0f1c37e1-22c4-4ef0-b3d9-3efdda5e3d90';
UPDATE public.poi SET linked_badge_id = 'e04fb9bf-846c-4378-88eb-0fa2de1c08a4' WHERE id = '0fa6f01e-517b-4d66-aba4-a381e656b65b';
UPDATE public.poi SET linked_badge_id = 'e86ce981-b02a-4bfc-9acc-bcb94c2be6da' WHERE id = '0faa8ed9-c6b8-47a6-bbb1-7602c0f54fad';
UPDATE public.poi SET linked_badge_id = 'ea8f0900-eef1-4e73-82e6-a68797ee9905' WHERE id = '0fd8d6f7-0c09-4aa7-ba27-756aa5e6e325';
UPDATE public.poi SET linked_badge_id = 'f952c008-2537-47e5-baba-40b63fa8fc8e' WHERE id = '0fdaf909-253e-4d2c-abff-5f39f75db9e6';
UPDATE public.poi SET linked_badge_id = 'd0686500-ea85-413b-b9af-781e98c03d37' WHERE id = '0fecb137-8879-4483-b802-ab048a17b668';
UPDATE public.poi SET linked_badge_id = '3b9754d2-6f71-4b5c-9b62-ff973847da28' WHERE id = '100fb6bf-b622-428c-975b-2ecf70ac16de';
UPDATE public.poi SET linked_badge_id = '49d3d5f4-4988-4318-a36b-23fb0eb661b2' WHERE id = '1041414e-25bb-426f-a83c-3b8986ccb6df';
UPDATE public.poi SET linked_badge_id = '140ee80d-0f96-44d5-b3ad-468b2bc75fde' WHERE id = '10456b0b-62b6-4d91-8ec9-c9e69dc12da2';
UPDATE public.poi SET linked_badge_id = '7106fad3-9f74-40f6-a780-4049263f9575' WHERE id = '108ffbe3-00a6-47cd-bc7e-68e74a22c176';
UPDATE public.poi SET linked_badge_id = 'c55e3c47-2635-4899-b958-6c8e661362af' WHERE id = '10a87c6e-b412-4c8a-a16a-bb5c08109935';
UPDATE public.poi SET linked_badge_id = '24947cb3-7e86-4eb8-a92d-c21ded212fb4' WHERE id = '10d7705d-040f-4230-914b-d769f0036d73';
UPDATE public.poi SET linked_badge_id = 'dc9371f5-9e3c-4e9f-999b-2afe5e6d1099' WHERE id = '10e5a01e-099d-40ad-8a2d-8ce71fce2cbc';
UPDATE public.poi SET linked_badge_id = 'fb74ad95-637d-4105-9db3-0f384051cd7a' WHERE id = '110544a2-6230-4888-9824-d3d0219b18e2';
UPDATE public.poi SET linked_badge_id = '70ac4ed1-105a-43bb-a992-0f059017359d' WHERE id = '1172ccac-7772-436a-8a65-31a5205e1e3c';
UPDATE public.poi SET linked_badge_id = '63f260b1-2b2f-4f01-8d4f-fb6d2f440190' WHERE id = '117f40de-5c66-45e1-bea5-b1016fad248d';
UPDATE public.poi SET linked_badge_id = 'c5151f87-8bf9-4fe1-adea-5ecfd9c80dc5' WHERE id = '1180c3bb-241c-40cc-8cd1-2a918136fef4';
UPDATE public.poi SET linked_badge_id = 'a37b24ca-e201-49e2-a61c-521b164e4c11' WHERE id = '119c1f1d-417c-497c-a318-8969aa1272a2';
UPDATE public.poi SET linked_badge_id = '69215c2b-4474-4b08-9662-247e1cbf42c8' WHERE id = '11a551fe-619d-439b-b71f-e3c33d50bff7';
UPDATE public.poi SET linked_badge_id = 'e750b4f7-e5df-4864-b73a-ac408f005726' WHERE id = '122d43ec-631b-4b79-b68d-bbaedc29b74f';
UPDATE public.poi SET linked_badge_id = '85f0d87d-dfd2-4804-9c57-cf97fc8003c6' WHERE id = '124361e3-4b8a-407a-a884-ad2a32935c3a';
UPDATE public.poi SET linked_badge_id = '01e0a717-1479-49cf-81db-b4197ca91915' WHERE id = '125290ae-123d-465a-bbce-fa4db703d784';
UPDATE public.poi SET linked_badge_id = 'a187e59f-55fa-4ced-bb78-6c17b977c80c' WHERE id = '12672fc5-00f8-40ed-bc0d-4b04169221c2';
UPDATE public.poi SET linked_badge_id = '9efd2fd2-c1e4-478b-a1a2-c6528f740c51' WHERE id = '12c5af11-2827-4570-bf19-485ade08cba2';
UPDATE public.poi SET linked_badge_id = '766a507c-6138-45cf-90f5-5cb40fd52413' WHERE id = '12de44bc-c303-44f1-8b1b-0ae3794eb741';
UPDATE public.poi SET linked_badge_id = '3a68d640-c430-4741-bce9-d9d8e70390a4' WHERE id = '1309d884-17f9-451a-8ad3-fa1fb12aa728';
UPDATE public.poi SET linked_badge_id = '7644a4d9-5f14-471b-9cd2-fd45c6e34750' WHERE id = '135c63a0-47ee-49b2-a89d-07cfc75fb3f3';
UPDATE public.poi SET linked_badge_id = '7a324e93-db3a-4758-be9c-2cd3de1fb8bd' WHERE id = '13762055-0432-4b79-b4c0-23eed179dc27';
UPDATE public.poi SET linked_badge_id = '62afcee9-a8f5-44bd-840f-57c029a4156d' WHERE id = '13c3ffc9-1dc5-42af-852b-62cbf220cce3';
UPDATE public.poi SET linked_badge_id = '10d5e6a0-9314-4499-831d-8f5a4e0070ea' WHERE id = '13df03f1-f498-4c2e-ae97-239d65d8b761';
UPDATE public.poi SET linked_badge_id = 'aab3a347-9308-4433-9df6-bb0d3d8c0795' WHERE id = '13f1633f-91b1-4661-9494-a1b9ecd2bc38';
UPDATE public.poi SET linked_badge_id = '663f4141-0b99-4824-8518-7b0daf02a462' WHERE id = '140bd5ed-26d0-42f0-8008-7a491bec9097';
UPDATE public.poi SET linked_badge_id = '80a2d0e3-618d-4c5a-8aa8-6dbdb39c2ecf' WHERE id = '14114c44-9645-4de4-aa17-6da7ff653d7d';
UPDATE public.poi SET linked_badge_id = '0806103a-9cfe-4492-bee2-85fd3c32c13e' WHERE id = '144862ce-11c4-439e-9b71-e0d079cac5f1';
UPDATE public.poi SET linked_badge_id = 'cac10564-b8cc-4bbc-879a-dfc7e1534cbf' WHERE id = '145776df-ff4f-4bfa-9906-33936ca86bd5';
UPDATE public.poi SET linked_badge_id = 'df29ee17-20cb-43a7-bc34-b3fde25107fe' WHERE id = '1481c8b9-ed11-4d69-9773-6bb5aaf02ba5';
UPDATE public.poi SET linked_badge_id = '6a4d9c01-734a-4808-85f2-12c2af9960e1' WHERE id = '14a4d7b0-2f78-48a3-8074-702cb7274d3e';
UPDATE public.poi SET linked_badge_id = '4b13ac30-8eea-4cf9-b045-ca3a28b72726' WHERE id = '14af6c88-8f70-4d2e-81e1-df5ef2ef515e';
UPDATE public.poi SET linked_badge_id = '5750d4f0-b7be-4b60-877d-40aeccb51a83' WHERE id = '14dbe78f-17f4-4e5a-9ef4-95af8ca9c976';
UPDATE public.poi SET linked_badge_id = '05c1c232-667d-40bd-b0a1-216c2c61bbd6' WHERE id = '1542a7e2-e61d-48b3-88f3-884b424b2888';
UPDATE public.poi SET linked_badge_id = 'e7249338-531c-4b12-9c11-45bc397733d7' WHERE id = '15f7f444-e853-4e16-87c8-8e21d217b72f';
UPDATE public.poi SET linked_badge_id = 'b828f55b-d988-4d93-98df-a36750fcd275' WHERE id = '160ec511-6890-4ae5-b102-cb48615edee2';
UPDATE public.poi SET linked_badge_id = '92fda312-dd0c-48c4-87b9-1c2f3ddf64df' WHERE id = '1636b538-40e2-42af-a218-25ee16d7db71';
UPDATE public.poi SET linked_badge_id = 'afd701a4-33fc-4be4-8c47-871e14b88d9a' WHERE id = '1658911a-1399-46bc-99a5-727d5a3f8159';
UPDATE public.poi SET linked_badge_id = '6cbbb71c-4c11-46f7-bb93-04eace7bba4a' WHERE id = '169fd2aa-2ac3-4797-a37c-d4881a824dba';
UPDATE public.poi SET linked_badge_id = 'cd2f5317-afca-4e2a-8878-36bd5eac62b7' WHERE id = '16a144ee-c131-47f2-9595-37c0e2dbcecf';
UPDATE public.poi SET linked_badge_id = '4a75d1f0-1ee7-4576-9239-4419f266c20d' WHERE id = '1701b5ff-fe15-4698-b669-dbdefdf13930';
UPDATE public.poi SET linked_badge_id = '65d9456f-f12f-494d-b7cf-a652a02ddb33' WHERE id = '174cc756-6814-4b16-8826-6d4a47410133';
UPDATE public.poi SET linked_badge_id = '9f3daa22-0c6d-44c9-ad2a-cc231350fc9b' WHERE id = '1764c955-5944-4c4b-91ce-2363b0369b3a';
UPDATE public.poi SET linked_badge_id = '659d24eb-2e3b-491c-977d-b7d593fb6e8e' WHERE id = '178f532a-17ca-45fd-b7da-e47a06ef549f';
UPDATE public.poi SET linked_badge_id = '49f16243-5280-4e6a-8bf0-00bdaeee8761' WHERE id = '17dda9f8-30e6-42e7-b4ab-3e96c907f591';
UPDATE public.poi SET linked_badge_id = 'e308873a-4fd0-471d-ae97-b5bac3920fb1' WHERE id = '17f1de48-703f-4325-bbcb-63bcff5b5208';
UPDATE public.poi SET linked_badge_id = '39571f4a-751e-4d50-ad7f-11d69047469f' WHERE id = '17f60c4e-c887-4b8a-87c0-86d50c3509eb';
UPDATE public.poi SET linked_badge_id = 'ef86f784-1149-420d-917a-cc11303c852f' WHERE id = '180669fe-d1ca-4679-9049-415ba6b68eb5';
UPDATE public.poi SET linked_badge_id = '027ac145-ffc6-487b-a4a8-c866f85139f7' WHERE id = '182ea04a-9602-45fa-a42a-581fc868e49a';
UPDATE public.poi SET linked_badge_id = '3df12118-7619-4bde-a109-e97698069198' WHERE id = '184f4e54-79f0-4fe7-8bec-50e3e297afde';
UPDATE public.poi SET linked_badge_id = 'd8aad97b-be34-44e5-8513-2c63f657f08f' WHERE id = '18885df2-2a42-4b44-8633-cbfa22bf7859';
UPDATE public.poi SET linked_badge_id = 'fc4fbcf5-2efe-43bc-b551-64e4e55f9970' WHERE id = '1898e2cf-5de0-418e-a49d-7cebfdb217e5';
UPDATE public.poi SET linked_badge_id = 'd057f746-5830-4831-a2a0-2ac4abe11cce' WHERE id = '18e14c0a-60c9-4cd7-ba90-e36dd1ccb98f';
UPDATE public.poi SET linked_badge_id = '662d94bf-76b5-4ca9-895e-2f7a2922c593' WHERE id = '18e722b0-1e27-461c-811d-46de0d90a2a7';
UPDATE public.poi SET linked_badge_id = '7e561746-0d8d-47c9-917e-4eb3b63575a6' WHERE id = '192ce6a4-59a7-4cd4-9bc9-c9664f75804d';
UPDATE public.poi SET linked_badge_id = '1be3e7db-9d03-431b-a1de-7e27c59abc6c' WHERE id = '1933e269-ba2e-4fe6-b822-7f0481488f8b';
UPDATE public.poi SET linked_badge_id = '07537ef5-1624-4645-992c-6fff9ccd69a7' WHERE id = '19559241-f280-4139-99ae-8f069a777b85';
UPDATE public.poi SET linked_badge_id = 'f9ae72a9-f7b8-4eeb-afc8-ae68afd3fe82' WHERE id = '19588f4f-ac96-44bf-8dc1-eede2e4bea01';
UPDATE public.poi SET linked_badge_id = '9c7265ad-280b-4004-8f8b-6039d5cc290a' WHERE id = '1985f976-4d3f-46c1-bbf9-520967d15bbe';
UPDATE public.poi SET linked_badge_id = 'b59c8d0f-2d18-47e0-abfc-f72ae7d6eeec' WHERE id = '19a8c6dc-0e98-4911-8d86-f5cb1224436e';
UPDATE public.poi SET linked_badge_id = '83224206-68ef-494a-a961-e97817e54a31' WHERE id = '1a0f56d5-c7a1-400a-a1a4-67ed470693f5';
UPDATE public.poi SET linked_badge_id = 'c1fc28f3-e136-406a-a3c5-14fbc10fc8f9' WHERE id = '1ab7bbe1-617b-450a-89d7-3aa55fee4504';
UPDATE public.poi SET linked_badge_id = 'd80c72c0-af45-4769-9445-b731fd32dec6' WHERE id = '1b0e8f85-4dfd-4b52-8b16-44209e9941f5';
UPDATE public.poi SET linked_badge_id = 'ecf0e6f4-ddfa-4d32-97d8-52bacb822c5e' WHERE id = '1b36afa0-e6a1-4b2e-91d2-a65359e5b81b';
UPDATE public.poi SET linked_badge_id = '9e7563be-a4a7-4e60-9119-c78909667850' WHERE id = '1b4bf311-6529-4ffc-bc3d-7c92e8203410';
UPDATE public.poi SET linked_badge_id = 'd1de8b55-e526-4186-a85e-13ca28b5411c' WHERE id = '1b624b5b-cc0b-401f-a7d0-3442fafee8d3';
UPDATE public.poi SET linked_badge_id = '54b635bf-4f9c-4173-81da-407f5ccd9cbe' WHERE id = '1b647899-76ef-4ad3-94e1-4c025a1d548f';
UPDATE public.poi SET linked_badge_id = 'ee36af22-85c4-400f-b41b-7f305de67aa6' WHERE id = '1b73c9ae-6387-42fc-99c9-1b2b7aa4c9b6';
UPDATE public.poi SET linked_badge_id = 'b37d673a-72d5-4399-b9ba-89be6a3ee4dd' WHERE id = '1b80f593-646d-4f44-b6f3-3685b7912194';
UPDATE public.poi SET linked_badge_id = 'd2ef2b7f-43ec-471f-874e-c94c278fc508' WHERE id = '1bad5747-25c6-487f-a9b0-4ff6e2df41c7';
UPDATE public.poi SET linked_badge_id = '000988f7-64e4-4941-8b48-4c7ae7186f59' WHERE id = '1bbd469b-7364-45ae-abc2-3623af7a9e3b';
UPDATE public.poi SET linked_badge_id = '4fe4a4f7-ffa2-4fca-b708-6f5a68171bad' WHERE id = '1bf6ec5f-90b0-457d-ab58-750d4632170c';
UPDATE public.poi SET linked_badge_id = '2f870cc2-9380-4484-8215-9d8c871e0e69' WHERE id = '1bf7410a-9148-473e-8374-9f3ad89ec959';
UPDATE public.poi SET linked_badge_id = '474f8be8-63e2-42fc-811c-afe037e6e677' WHERE id = '1c1dd2fb-5c08-4705-9ac8-705ea21deaf8';
UPDATE public.poi SET linked_badge_id = 'e9dd03b0-c9c4-40ab-a254-172cfd03aef1' WHERE id = '1c4ce1cb-6e80-4e25-be72-47227217f898';
UPDATE public.poi SET linked_badge_id = '6de6570d-e4c6-46d7-84fd-c99639305667' WHERE id = '1c7a1a00-9acb-4425-9969-ecaf93b4405d';
UPDATE public.poi SET linked_badge_id = 'd770402c-ce40-4c32-bb2a-565805ae4136' WHERE id = '1ca19b3d-120c-4624-9252-fe28468b1f00';
UPDATE public.poi SET linked_badge_id = 'a576698d-2d5d-48b8-9161-f7df9bc4e88c' WHERE id = '1cb339e5-bdd5-4c46-89d0-619dfcb7805a';
UPDATE public.poi SET linked_badge_id = 'd24352b3-b247-46e9-8a60-02c11ada590a' WHERE id = '1cb63bea-0338-44eb-be0f-454809af96b9';
UPDATE public.poi SET linked_badge_id = '86877692-c4b4-42f4-a15f-0f0eb5d4309e' WHERE id = '1cfc8c42-724f-42ff-a36b-5f646cc661fa';
UPDATE public.poi SET linked_badge_id = '04d82046-7dd8-4f40-87be-aab304776ee0' WHERE id = '1d12aa9d-f0d5-4b97-95dc-c6916ce740af';
UPDATE public.poi SET linked_badge_id = '6996c80a-e726-4294-92df-6d05ce2f1da8' WHERE id = '1d2e8dfc-6abc-4a26-afe6-1a0a550c8ca9';
UPDATE public.poi SET linked_badge_id = '7ad049c6-c3a4-465a-a6df-ca18dc25c427' WHERE id = '1dadb1ec-068c-487c-8463-bbfb9948a2b9';
UPDATE public.poi SET linked_badge_id = '96204ae5-3bc4-43a4-9a6d-dbc71d887027' WHERE id = '1dc38f8f-a090-47ac-9ce5-cb762b546294';
UPDATE public.poi SET linked_badge_id = '42218dba-bd7b-4275-8e90-6fa2a527e3f3' WHERE id = '1dca8df0-3e8d-4500-9c0e-9c69aece3caf';
UPDATE public.poi SET linked_badge_id = 'cf056820-ebde-4bd4-b8fc-790c4268b941' WHERE id = '1df70b62-f05e-43c2-99a4-4696081802f6';
UPDATE public.poi SET linked_badge_id = 'afb0d0c4-3bc1-4b0a-8234-a4c42da7c467' WHERE id = '1e94a101-b943-48a0-8f1f-0c53b32bad61';
UPDATE public.poi SET linked_badge_id = '3245def9-45bb-40e8-b8aa-e7770e2d2c0f' WHERE id = '1ea30564-c77b-4ce2-99c5-c5b8e71af7a4';
UPDATE public.poi SET linked_badge_id = '88e479c0-38db-4149-93b4-5efca49606e1' WHERE id = '1ea38a4d-ba73-4631-967b-e52d54917ee2';
UPDATE public.poi SET linked_badge_id = 'd7c9f1e7-203a-4176-ba0b-9bcb0cdf416e' WHERE id = '1edf0871-5870-4e64-bc5f-16acbe96e742';
UPDATE public.poi SET linked_badge_id = 'c6f220cb-bad6-44b5-93b0-38bafcc0396a' WHERE id = '1ef9f472-00b8-4e96-abd1-4c5679e39518';
UPDATE public.poi SET linked_badge_id = '2dd6c464-e05f-4b2d-b073-3c3f5596c1bb' WHERE id = '1efcf466-cab1-4d74-b653-ee43ccda565b';
UPDATE public.poi SET linked_badge_id = '2fe825ab-46be-4ff9-916a-4b5eac678eb3' WHERE id = '1f458848-55ba-4869-8592-a4e771e7df06';
UPDATE public.poi SET linked_badge_id = 'e5b4d134-eb41-4531-b02f-ad224999dbf2' WHERE id = '1f5f2cd8-e5d3-4570-94fd-74ee464585ee';
UPDATE public.poi SET linked_badge_id = '071a0ce9-f473-48d2-986e-b0e648f121c8' WHERE id = '1f741ede-bb30-4484-88d6-0b241a9031db';
UPDATE public.poi SET linked_badge_id = '3a05a9b1-b85f-46fa-96c0-6bb93f3a428c' WHERE id = '1f8791c5-ba7d-45f3-81e0-f04e08c2e009';
UPDATE public.poi SET linked_badge_id = '1b53a5e1-b79a-4b4a-89a3-d3d0fff5e33e' WHERE id = '1f9704b4-916c-4787-891f-bf2c7e931331';
UPDATE public.poi SET linked_badge_id = '37da0bf9-7cf3-45fd-89ae-4c93c1e34489' WHERE id = '1fe4fd87-0f17-4ad8-9df1-af8e9ca6f4e2';
UPDATE public.poi SET linked_badge_id = 'c2ddcf88-7aad-4da7-919b-2cf329411267' WHERE id = '1ff6852a-60ff-4b16-b9b6-fdad21e5408c';
UPDATE public.poi SET linked_badge_id = '48f8e4ae-2385-4028-9d4c-3a77179e58d0' WHERE id = '2001564b-1065-4cda-972b-28688efbef22';
UPDATE public.poi SET linked_badge_id = 'ec4033f1-d5cb-433c-b244-764178857f4a' WHERE id = '2028c355-ed89-4289-878e-4efd3eebeea9';
UPDATE public.poi SET linked_badge_id = '4c954b9a-40cb-46f5-8ce1-cbcdab6449f4' WHERE id = '203d192d-9efa-4934-8aad-70ddf36b3172';
UPDATE public.poi SET linked_badge_id = '24d02ed3-40c7-4e31-b23e-97bff8024cfc' WHERE id = '204fe1b7-6891-4a63-baf4-628153e05eb5';
UPDATE public.poi SET linked_badge_id = '161ccf8d-9227-493c-beef-350d0978d800' WHERE id = '20c299af-dcfa-48f9-90d4-b3cc347e9899';
UPDATE public.poi SET linked_badge_id = '9f29e8c8-315e-433d-ad80-473e4226a28e' WHERE id = '20f7fe08-373b-49fd-870f-9e607e8fcbf5';
UPDATE public.poi SET linked_badge_id = '0daa6fb6-9b49-4e8a-bc81-cc4aa06b8fd6' WHERE id = '211a5d27-1eff-402b-a218-7b95c474560a';
UPDATE public.poi SET linked_badge_id = '98b51d4b-22e1-44ef-8300-97045a5add42' WHERE id = '2134ccfc-1c35-4557-9efd-563a6e2f3231';
UPDATE public.poi SET linked_badge_id = 'c410e68d-ebf2-4baa-a180-28f7878d0236' WHERE id = '21783bc7-cc69-4a2c-9992-aee15112115c';
UPDATE public.poi SET linked_badge_id = 'd2db2b8b-2d33-49fb-b799-044c1fc73374' WHERE id = '2199fd6f-c1a4-48a2-9a50-9eee350aa1fd';
UPDATE public.poi SET linked_badge_id = 'ac125999-6133-48a9-b5fb-3fc510ffe282' WHERE id = '21d03f68-71fb-42e5-ac28-c45f3d621af0';
UPDATE public.poi SET linked_badge_id = 'af3d0ba1-cf5f-47c8-8523-41bfbc27682c' WHERE id = '2217e882-0342-424f-93e3-11c81e749eed';
UPDATE public.poi SET linked_badge_id = '404fda18-d691-43a2-a197-5843ecfc2aca' WHERE id = '22604a0d-4a7d-4b72-8473-3100f62d3ac1';
UPDATE public.poi SET linked_badge_id = '1e47135e-944e-4226-b729-5e991366b6cf' WHERE id = '2267f679-53ed-4042-bd00-768acd33e634';
UPDATE public.poi SET linked_badge_id = '22a09124-f39c-4ec7-a793-3c7cf8f38d96' WHERE id = '22d3754f-dc5b-4cbe-bb18-fa4975e1dc87';
UPDATE public.poi SET linked_badge_id = 'ef5d855a-8a6c-4c63-8a85-a641e9b7645f' WHERE id = '22df6459-f001-4b64-8ebf-4eb3c41ba372';
UPDATE public.poi SET linked_badge_id = '774a9748-d00c-4ea3-b7b2-4dab9ccb424c' WHERE id = '23011f57-2cbe-480a-bba8-bab431de8f5a';
UPDATE public.poi SET linked_badge_id = '46e32d9c-8665-4144-870a-3b9dac0b7f1b' WHERE id = '235ae18c-d7bc-4373-a0e9-2f52f6d685b0';
UPDATE public.poi SET linked_badge_id = 'a1ff214a-770d-48b3-b09d-3b991eae1a57' WHERE id = '245d86d9-d6a0-4feb-a019-21285a6ea77d';
UPDATE public.poi SET linked_badge_id = '8dede5dc-2704-412b-b777-553757e6a4d5' WHERE id = '24908809-4c17-4e59-b248-26cf43ff7ace';
UPDATE public.poi SET linked_badge_id = 'c4a96096-4ea4-4bc6-9fb1-ee47157e07f6' WHERE id = '24acca4c-c1a0-439d-b7c1-6d04945f8ddb';
UPDATE public.poi SET linked_badge_id = '1f28ed67-b698-41ea-a565-a93bb22aa79c' WHERE id = '2551ead9-69c8-4d31-adad-e67b62690f89';
UPDATE public.poi SET linked_badge_id = 'da6b9948-e33b-41f7-b00b-61c702329f78' WHERE id = '259c3262-3910-4fa9-9203-1ebfeb9fc9b6';
UPDATE public.poi SET linked_badge_id = 'e77da2a1-9506-4fcb-9fc5-7db8351e9709' WHERE id = '25b12b9b-f944-428d-b427-affa74de4e91';
UPDATE public.poi SET linked_badge_id = '98a4f49a-140d-4180-b5fb-18d39db8defc' WHERE id = '25eb4444-364d-48d9-86e7-81d86f980c9a';
UPDATE public.poi SET linked_badge_id = '1012cd7c-6603-44c9-ac7a-9d93174cb6e8' WHERE id = '260ea1a0-fa57-4faa-ab46-5bea5b672a6a';
UPDATE public.poi SET linked_badge_id = '61428dc5-eb25-4483-b08f-4289105d38fc' WHERE id = '26351461-c671-4e4d-a77a-49a3eb568773';
UPDATE public.poi SET linked_badge_id = 'b40f3527-bae5-4c24-a361-e6340a7efad9' WHERE id = '26a11068-f1ac-46f3-b12a-cede621e8aab';
UPDATE public.poi SET linked_badge_id = 'e00fd3ab-785e-40c3-b1ae-70f53667e644' WHERE id = '26c2bbb4-e43d-4b69-b581-8e523d664c6f';
UPDATE public.poi SET linked_badge_id = 'a5a6b29c-1c5c-4594-ac3a-711db100d439' WHERE id = '26fb9977-64fb-44de-b77c-17ee1a94b370';
UPDATE public.poi SET linked_badge_id = '80aca3dc-d319-450c-8900-d1b734ed08e3' WHERE id = '26fbdd6f-f0b1-4934-93c7-c62efcfb8e61';
UPDATE public.poi SET linked_badge_id = 'fb818540-91d3-43a4-ae9b-bb6b8317fa23' WHERE id = '271f7c47-1077-4430-85a0-972fab8b90ee';
UPDATE public.poi SET linked_badge_id = '519f6147-81b6-4ca5-9648-37624e0188d0' WHERE id = '2731fe09-79eb-4948-b7b9-e18b280b6bcf';
UPDATE public.poi SET linked_badge_id = '007bae4c-eb1b-4297-b4be-329664012c57' WHERE id = '2747c0f5-b22b-49f2-9cee-8e3c0b6cfd26';
UPDATE public.poi SET linked_badge_id = '4f3782bd-17b4-4368-8e4d-024ad7100b59' WHERE id = '275c1f28-2869-43ab-9588-e6216d37d3ac';
UPDATE public.poi SET linked_badge_id = '6ba7bddd-ba03-4e71-b686-06c8cd5f2707' WHERE id = '276bc7ad-e109-447d-8045-b132ad82c44b';
UPDATE public.poi SET linked_badge_id = 'aa105730-8b1b-4e36-9eda-a0fba8ae88b3' WHERE id = '278fe4c7-ffff-41be-8d23-73a39703c5aa';
UPDATE public.poi SET linked_badge_id = '90fc2a99-6ef8-49f1-b2f5-9fe4cbdef84d' WHERE id = '27ba4abd-d29d-4600-b601-70fd5d38066e';
UPDATE public.poi SET linked_badge_id = 'b9389ba6-d0e4-4133-bf12-fd638c51611c' WHERE id = '27ce1767-d1a7-4378-ad9e-7bda290253ce';
UPDATE public.poi SET linked_badge_id = 'cad5ffb6-7f92-43cc-a464-f05f5ddf55ee' WHERE id = '27cf3457-89fb-4981-8655-7e86010203cc';
UPDATE public.poi SET linked_badge_id = '85181e74-cf48-4d66-b8b4-2c4150de7ae0' WHERE id = '27daa0f5-8677-4b33-aaa9-b9656461ce4d';
UPDATE public.poi SET linked_badge_id = 'bfb25b68-c339-4e11-8e5e-b8e1d84c0f36' WHERE id = '27ea920e-7888-4678-8916-985cf24208c2';
UPDATE public.poi SET linked_badge_id = '577ee1ac-4e60-49b4-8230-82e0932a8142' WHERE id = '283c021c-02f2-4165-936d-da63938dd532';
UPDATE public.poi SET linked_badge_id = 'f611373d-2bf9-4fc4-9396-fe444507df76' WHERE id = '288087f2-1236-412a-a9b1-1d41c45ea5c7';
UPDATE public.poi SET linked_badge_id = '9a349844-d97c-45f9-9f5b-e016f59de6e1' WHERE id = '288e50a8-7d8e-46c0-86fb-c9760acffb1e';
UPDATE public.poi SET linked_badge_id = '1f760e9a-f635-41a1-8def-5d3d1f3ebd0d' WHERE id = '28ab88ac-d748-4cb5-a629-7e91093b4718';
UPDATE public.poi SET linked_badge_id = 'ef513c61-3718-4fbd-9b1b-e9ed6f6d9679' WHERE id = '28bcf7cb-8eaa-41f3-9a8c-6c57fb27f629';
UPDATE public.poi SET linked_badge_id = '0b85d07a-6f55-4d80-94a4-3460ba225769' WHERE id = '290ca463-cac5-4ecc-a9bf-82068eb32f1d';
UPDATE public.poi SET linked_badge_id = '697fcbd2-1080-45e6-901b-908f0f794170' WHERE id = '292b7060-c2cd-47a9-876c-95b5acba0ac9';
UPDATE public.poi SET linked_badge_id = 'ca724612-5cd7-41da-a9a1-58c6a9dba9cb' WHERE id = '292f2473-73ec-40fd-a757-41698eb15cda';
UPDATE public.poi SET linked_badge_id = '105882eb-d857-482d-87c4-f545b18358f1' WHERE id = '293aa761-a8ae-4fcb-87cf-9f4eabad1c7a';
UPDATE public.poi SET linked_badge_id = '9027b8d0-6a02-4094-8609-cbd5ce8f88ba' WHERE id = '2968dce6-4382-4f2f-9e14-363331e5410b';
UPDATE public.poi SET linked_badge_id = '56350360-434d-4f42-a69a-1cce2b36f12f' WHERE id = '29d4dd44-a803-4ace-af09-f7eaa816ca16';
UPDATE public.poi SET linked_badge_id = 'e13ab665-0d19-4a46-ba69-9114cebcc4ff' WHERE id = '2a070382-51bc-4376-93b0-744eb5af7760';
UPDATE public.poi SET linked_badge_id = '3a3e06af-95f5-465f-a6ea-4e00d37c99f3' WHERE id = '2a0e98d6-a731-4094-9495-c6303cd9cae3';
UPDATE public.poi SET linked_badge_id = 'fed776ac-c526-4fbd-aafd-055f8e1fdd6f' WHERE id = '2a40a436-f8d5-40a2-a110-8de932a37040';
UPDATE public.poi SET linked_badge_id = 'd4e98305-9d75-4818-8aa9-b850f68502a8' WHERE id = '2a430b08-85a3-499b-a0e4-ae4eecd84e3a';
UPDATE public.poi SET linked_badge_id = '832f53e7-03eb-496c-896a-8ed50b5e2406' WHERE id = '2a462951-b131-481a-bd60-4b630cb2802a';
UPDATE public.poi SET linked_badge_id = '5d09e8ec-871d-431d-bceb-fa4cdb7413f2' WHERE id = '2a4e2133-ede4-477e-ad16-7e15592a5242';
UPDATE public.poi SET linked_badge_id = '77cb85b2-3e57-48fe-ae1b-29a909de53d1' WHERE id = '2a950389-e437-4496-86f1-8d10272cd40d';
UPDATE public.poi SET linked_badge_id = '51427ca7-673d-4c26-9376-27bd283365af' WHERE id = '2aa8f0a0-6e7b-4ce0-b4bb-202e2c3e6577';
UPDATE public.poi SET linked_badge_id = '152bf417-360c-4f53-96e8-7edf3e4769f9' WHERE id = '2aa95b91-b4ff-4330-b108-6b5e9379544b';
UPDATE public.poi SET linked_badge_id = '414e6fe1-62e2-4963-9f28-b956b0d355ed' WHERE id = '2ad5eaa6-ddb7-469c-9d7d-71422a266308';
UPDATE public.poi SET linked_badge_id = 'b3b4aa58-cf7f-42b1-96f0-f94b3fa4cdf7' WHERE id = '2ad644a3-2c1c-49fd-80c7-8a77beeca205';
UPDATE public.poi SET linked_badge_id = 'f28fd3ee-a294-4b49-98df-6c8318a32c0d' WHERE id = '2aeb52a4-c86e-4eda-8f52-255cae22bb09';
UPDATE public.poi SET linked_badge_id = '747e5749-3fc0-48d2-aa97-8aa698494d92' WHERE id = '2b52d7d3-c459-495d-8f3f-b376c127afe4';
UPDATE public.poi SET linked_badge_id = '285da55f-ecf8-4fe5-bcd1-17aa0ec1fd1c' WHERE id = '2b7b5ab1-636e-48bd-be24-80de926ba73e';
UPDATE public.poi SET linked_badge_id = '0c27ad39-77bb-4333-985f-2d19b1fb9cbc' WHERE id = '2b7f42c8-5ae2-4d0c-b663-10582cdf38e4';
UPDATE public.poi SET linked_badge_id = 'aeb7846c-1ee8-4c00-bce5-9455eb056497' WHERE id = '2babb920-cbc0-4d6b-98b3-75b91c174d3c';
UPDATE public.poi SET linked_badge_id = 'd297832f-fe2a-4387-aa51-3955319927fb' WHERE id = '2bdfec51-26d8-46a7-b7d6-7e3201ff8f88';
UPDATE public.poi SET linked_badge_id = '7dca929b-076c-4ff9-93cb-c44a3459e5dd' WHERE id = '2be77042-4a07-4b81-ac2d-68af5996f4ad';
UPDATE public.poi SET linked_badge_id = 'be1660f8-05d6-4d62-a527-232f1ce314ba' WHERE id = '2bea236e-bc8a-4425-b18f-61bd7d15ca5e';
UPDATE public.poi SET linked_badge_id = 'e3a38b40-2069-44ae-b9ba-87129188052a' WHERE id = '2c08c22c-be71-43aa-8d6f-c77233495f16';
UPDATE public.poi SET linked_badge_id = 'a00638de-28e2-4c05-8764-bda2c32cdf40' WHERE id = '2c205f1a-a678-4e46-9ff2-a4a77a53b548';
UPDATE public.poi SET linked_badge_id = 'f7a40d39-f039-4399-b5ee-897e11c54024' WHERE id = '2c21a0a8-3592-4efa-a750-f65eb9aeb609';
UPDATE public.poi SET linked_badge_id = '4668c694-b447-4ad7-bb1e-d14bc83b521c' WHERE id = '2c292fd2-e119-4665-89b9-b1dd28dd539b';
UPDATE public.poi SET linked_badge_id = 'd13c4059-8e68-497d-aaa7-a8bc92d57943' WHERE id = '2c544667-d043-4c02-8350-08907b9dfc18';
UPDATE public.poi SET linked_badge_id = '7a4107e7-a036-4e11-83ad-90336fcf0e7b' WHERE id = '2c5bc972-d138-422b-b498-af34d0125673';
UPDATE public.poi SET linked_badge_id = '50b6d70e-641b-47d7-8c7f-8297245fb64d' WHERE id = '2c844d49-8a0f-4083-bbff-efa66088b54b';
UPDATE public.poi SET linked_badge_id = '94f4711c-51e7-4c62-8015-7d6f3299b6f0' WHERE id = '2cb6ee98-545f-40e6-bdca-3c06bf8a61a6';
UPDATE public.poi SET linked_badge_id = 'a753e56a-ca13-4959-bc78-98cecad502e8' WHERE id = '2cc6bd8f-1145-4861-adcc-eeca1ee8a4c9';
UPDATE public.poi SET linked_badge_id = '1c166f2b-5353-46f6-b3e5-fda81f966c4e' WHERE id = '2cc86576-ad3a-4dad-a8ac-e4e2b15e8d17';
UPDATE public.poi SET linked_badge_id = 'd0cad5bb-561b-4257-b253-bdf81095b4d8' WHERE id = '2ccab7cb-7653-45d4-8413-700ea123b2f7';
UPDATE public.poi SET linked_badge_id = '21fe9a66-e5fd-421d-89ef-3a872d768b70' WHERE id = '2cdfe798-05d2-4e80-9448-94f26def5bef';
UPDATE public.poi SET linked_badge_id = 'e6b4ea05-de97-4239-a780-ae4e0f535813' WHERE id = '2d061023-9a6e-4a8e-bf1a-c042c8420cc7';
UPDATE public.poi SET linked_badge_id = 'f797c864-34fd-45f8-8739-6e974203b7e4' WHERE id = '2d392949-bf19-403b-af17-aa4c46647877';
UPDATE public.poi SET linked_badge_id = '2aeebbb1-5122-4ca0-9570-fc96363192c8' WHERE id = '2d3ca1d5-83b5-407b-9e99-00db2f304212';
UPDATE public.poi SET linked_badge_id = '5a3ea40d-f74f-4b56-92b3-58aca5f54e95' WHERE id = '2d3ead95-f1d6-4657-af0b-875fef28f375';
UPDATE public.poi SET linked_badge_id = '61746224-7b3f-4189-bbcd-2736f3fe997f' WHERE id = '2d461320-4e2a-4f9a-b119-40bc776a7783';
UPDATE public.poi SET linked_badge_id = 'dd9bcdf4-9ed6-44d3-bb4a-65d11d04c55d' WHERE id = '2d79501f-8055-4d5f-9371-6a7b67cc2e6f';
UPDATE public.poi SET linked_badge_id = '36e79c00-2012-46fa-b759-b2ceed469178' WHERE id = '2dbebe2f-125f-4354-8438-1f8f8036696b';
UPDATE public.poi SET linked_badge_id = 'a17d1aab-0d1b-41de-b0f5-3ce214a76bba' WHERE id = '2dd5f51b-dfad-493c-9ddd-f41e486acb34';
UPDATE public.poi SET linked_badge_id = '25f1983b-bbd3-43ff-8662-9886217bfa0c' WHERE id = '2e02f406-54c0-4f8c-9630-df5140393b27';
UPDATE public.poi SET linked_badge_id = '3e038cfb-f906-41a9-9f1d-356a2ea3d396' WHERE id = '2e1b44bf-4433-42ce-8dd1-1d608d4bb76c';
UPDATE public.poi SET linked_badge_id = '27272239-63c3-4d48-a64e-226ccb5d8800' WHERE id = '2e24c602-870f-49f8-a55e-e2faf4cd4c08';
UPDATE public.poi SET linked_badge_id = '83822d1b-c546-4d34-8abd-13f8c5577798' WHERE id = '2e470ad1-327e-4754-9981-bb27d088fe86';
UPDATE public.poi SET linked_badge_id = 'e7c95182-34d8-401b-a913-6a70e428e2f1' WHERE id = '2e5b2d01-511d-44b4-b4ac-a4339e7e5ba0';
UPDATE public.poi SET linked_badge_id = 'bac4ae70-b034-45eb-8733-b192e4e12736' WHERE id = '2eadda7a-0639-496f-a29c-46e2e6a275f0';
UPDATE public.poi SET linked_badge_id = '21c607cf-8950-4635-8039-29780cbc9946' WHERE id = '2ee48f24-b432-4e71-96c0-8942b3f36142';
UPDATE public.poi SET linked_badge_id = 'd4d9de9b-85e2-4218-80f2-3777f5ea1df7' WHERE id = '2f1b8f75-d02a-4392-b879-38644b2d8f99';
UPDATE public.poi SET linked_badge_id = '882b1c4a-c622-42f9-ac77-58bc8ea77dc3' WHERE id = '2f44f2ce-e87a-4347-9eaf-923762583b4e';
UPDATE public.poi SET linked_badge_id = 'b617325e-a64a-4830-8d99-ddad5a114618' WHERE id = '2f65b714-67b5-4866-b45b-874a1d07c8e9';
UPDATE public.poi SET linked_badge_id = '7206f2f7-3419-43e5-b9d7-1e23da9bbb08' WHERE id = '2fc7ecf7-3198-4299-ab4b-d6d9ccf4ce87';
UPDATE public.poi SET linked_badge_id = '6e3e17c3-9b23-402d-8455-7ca5b1b07ab1' WHERE id = '30144d01-3ee2-4512-9899-44ad65b78728';
UPDATE public.poi SET linked_badge_id = 'ba8e3ff1-3bcb-4e6e-8fa0-18653478abea' WHERE id = '304cb8ae-9b20-4b55-95b3-5b736e46df0c';
UPDATE public.poi SET linked_badge_id = 'c9ccd1b0-100a-4a33-ab1b-abba035b288c' WHERE id = '30b4770b-08be-4a28-bb65-9bb595a78618';
UPDATE public.poi SET linked_badge_id = '1a795de6-d7bf-44eb-8298-7afd71c467f4' WHERE id = '30c20f8f-1c1f-4072-9b09-0e15beec8433';
UPDATE public.poi SET linked_badge_id = 'ecac4576-bb88-41dd-91f8-aa7441f5f5cf' WHERE id = '30c36586-14b6-4e05-a798-67a829d37540';
UPDATE public.poi SET linked_badge_id = '22820c46-3304-441c-9058-93e6bcffba51' WHERE id = '3125bc82-1b61-4429-a46e-a0ea9715fa9d';
UPDATE public.poi SET linked_badge_id = 'ef2eb651-1ad5-47d8-8ebc-e02b3ed8af9c' WHERE id = '314e7986-fdd8-4ccb-9738-c342fd20b820';
UPDATE public.poi SET linked_badge_id = '83af9866-b838-4a3d-857c-ff3d0df14839' WHERE id = '31b91229-8bb6-4391-acac-b8442bf01976';
UPDATE public.poi SET linked_badge_id = '7479c40c-0470-4422-8a79-ac7fedf8c440' WHERE id = '31c767a0-6f68-473f-8f59-39c49204a36c';
UPDATE public.poi SET linked_badge_id = '08b165fc-5cd8-4c6f-948a-e5aaaeaec4c6' WHERE id = '31fe246b-bd0d-4ea9-af17-9d38907fd433';
UPDATE public.poi SET linked_badge_id = '175b20b0-1cc7-4781-896f-f466d91892a7' WHERE id = '3200c346-1e62-489e-9864-71448da5acb8';
UPDATE public.poi SET linked_badge_id = '40f61927-062c-4ea8-ba37-4fd7f6d2e74f' WHERE id = '324697e5-cacd-4721-b128-d6a4225a6819';
UPDATE public.poi SET linked_badge_id = '7a0afa4e-0811-41ec-95d8-fdf96c87462e' WHERE id = '3253a233-cdc2-417a-a98c-9facb4f53e88';
UPDATE public.poi SET linked_badge_id = '24824c59-9701-4530-9aad-a942fe964678' WHERE id = '327c2796-20a2-475b-a850-bfd5d949475e';
UPDATE public.poi SET linked_badge_id = 'a76bb90c-fdc9-411a-82d3-f37c011c00ad' WHERE id = '3296cca6-c799-4875-8362-2169008df992';
UPDATE public.poi SET linked_badge_id = '31e4bcdd-a034-4058-9e51-f52000b8a1c1' WHERE id = '32d07d10-b6a0-45bb-a27f-cbe93792af89';
UPDATE public.poi SET linked_badge_id = '5d8dfe40-5ffb-40bc-bf02-80fe5c92c644' WHERE id = '331551b3-a8a2-40c5-b446-1a2739963cc9';
UPDATE public.poi SET linked_badge_id = 'c6064f35-6e06-4cab-8de9-e9125ca100d7' WHERE id = '331cd417-2c46-4151-9ffc-6bb18eb60e69';
UPDATE public.poi SET linked_badge_id = 'b2598787-73c6-4929-a1de-b430e9dc48c1' WHERE id = '332b8ea6-b03c-4a5f-af9f-3f5492256f87';
UPDATE public.poi SET linked_badge_id = '35980af3-c86d-4e42-a611-46890a029162' WHERE id = '33af6f10-437b-4512-974a-5eb5b76c5dfd';
UPDATE public.poi SET linked_badge_id = 'a8b80898-24b6-4a7f-957b-a3b9dcf5aea8' WHERE id = '33c6f1eb-4786-4647-b4a4-a52898d8ed59';
UPDATE public.poi SET linked_badge_id = '71cb77e5-a0fc-461d-a866-f3076fa8b984' WHERE id = '33de8052-efd2-43f4-993d-7d5ca8283b09';
UPDATE public.poi SET linked_badge_id = 'ae2cd2a9-8278-423e-b004-e7ee612bfdd3' WHERE id = '340bb201-b2cc-453e-b17b-47436ac6a0d1';
UPDATE public.poi SET linked_badge_id = 'cff0e1cd-678b-49d3-85fd-1f792cc13b05' WHERE id = '341773be-b838-4835-9694-45574c1d569d';
UPDATE public.poi SET linked_badge_id = '250f0296-358f-4307-a59f-6c72c877fe8f' WHERE id = '34371d9a-99ee-432d-a2b2-1fb0bb9ba19b';
UPDATE public.poi SET linked_badge_id = 'e0905834-f8a2-4de6-b960-34195f67b733' WHERE id = '344fa41e-1926-4ae1-9e22-e3c178027f94';
UPDATE public.poi SET linked_badge_id = 'c5d61dfe-ed55-441f-a067-7eeef29ac3be' WHERE id = '3484a9e5-174a-4cc3-8366-b1eedd440741';
UPDATE public.poi SET linked_badge_id = 'c857c3d3-26a8-4a4c-bb3c-115d83257603' WHERE id = '34b9be0e-66c1-49e0-aee4-fe93196d3d94';
UPDATE public.poi SET linked_badge_id = '990dc706-2ba6-4b3a-8638-544c41a9ac66' WHERE id = '34c16c8d-4955-457c-8b2e-d1b71c83467d';
UPDATE public.poi SET linked_badge_id = 'b22567e8-2c46-45ff-af73-93536c073501' WHERE id = '34fedc1d-d25b-45b2-bdae-d716d5dfc06c';
UPDATE public.poi SET linked_badge_id = '45ef7d5f-365b-469d-aac7-20bb3b618336' WHERE id = '35042f73-9afe-4a59-b090-5c84f778153f';
UPDATE public.poi SET linked_badge_id = '49cdfc54-cf90-4ac9-98c5-7d405b75036a' WHERE id = '351e76eb-5279-49b3-8f56-33c5bb49fb03';
UPDATE public.poi SET linked_badge_id = 'f77effde-025f-4bf2-bd68-935c6b1fb12f' WHERE id = '3581de37-3699-4ae6-aa45-7eee955c6506';
UPDATE public.poi SET linked_badge_id = '4dc06e1b-0255-48d8-8332-b6d2177256f2' WHERE id = '358e8001-d206-4438-ad08-843d321e9cb5';
UPDATE public.poi SET linked_badge_id = '9797fcb0-5e15-408b-bf37-007cbd2f7c3d' WHERE id = '35cf9266-d2c7-4dbf-8f0f-ea94275bbc98';
UPDATE public.poi SET linked_badge_id = '7a65664a-a0d3-4d98-a642-e6f15883b1e1' WHERE id = '35eb7c15-327c-4344-bf1a-9e1c13a8b5ef';
UPDATE public.poi SET linked_badge_id = 'a35c4056-56fa-45a9-bfbf-d5b59ba0443b' WHERE id = '35f40e36-28be-4339-b886-a1bbb868f6b2';
UPDATE public.poi SET linked_badge_id = '1ff74c99-9c32-4400-82a9-528d2cd61b74' WHERE id = '35fdb2e1-71f4-405b-b7d2-75744daf0b0b';
UPDATE public.poi SET linked_badge_id = '1b5baed0-b9cd-41d1-8085-1b0252039571' WHERE id = '360c6d42-f262-4257-bcf3-df2bf67915ba';
UPDATE public.poi SET linked_badge_id = '2e4bd770-0a6e-4398-9c07-423715b41a5d' WHERE id = '3615d355-421b-44fe-9311-1cda04196b21';
UPDATE public.poi SET linked_badge_id = 'b551986f-224d-4539-92f8-3495a5a1cd40' WHERE id = '361e01d5-9be8-4ced-9fd2-d85b63be4d19';
UPDATE public.poi SET linked_badge_id = 'ae95c57e-3034-4291-92b7-47805cc61c71' WHERE id = '367620b6-6ef0-4a53-9d0a-f2ca502b2a61';
UPDATE public.poi SET linked_badge_id = '8745a5af-8620-4a6f-ad9e-83aa9dcce236' WHERE id = '36fecd87-e82c-4686-aa60-2cdfdd0689b7';
UPDATE public.poi SET linked_badge_id = 'c1f77a5f-c1e2-4c8b-981d-c6fa53873f12' WHERE id = '3753e679-a5fc-4530-80b6-0e6e55bb264b';
UPDATE public.poi SET linked_badge_id = 'afcbcdfa-76bd-4b8e-820d-82b39aabb851' WHERE id = '376b083a-6355-4029-b356-547cdefb8173';
UPDATE public.poi SET linked_badge_id = 'b78c132a-1a34-474a-89c1-a9316d56b2fc' WHERE id = '37debb2d-3e9c-4889-bc8b-4898d89b8f89';
UPDATE public.poi SET linked_badge_id = 'f1a00b2a-6802-4baa-ac61-c7ce391a88ef' WHERE id = '384bad26-d1f6-4d73-bdaa-b4afa243283a';
UPDATE public.poi SET linked_badge_id = '078c2df7-d231-47b1-848a-f209f23e3ded' WHERE id = '387f0e03-1620-4d03-acf0-ea2d9a6209d9';
UPDATE public.poi SET linked_badge_id = '2a2efbad-78eb-4504-a466-7e3a30d76665' WHERE id = '389f1be7-6db9-44b2-af0c-bb8a9b51bde6';
UPDATE public.poi SET linked_badge_id = 'f26d5c2a-3119-4284-b611-22241422806a' WHERE id = '38c09baf-56ac-45e6-83bc-9120384c16e7';
UPDATE public.poi SET linked_badge_id = 'de7d6cf4-5cb7-4c65-adf3-7e3f852c58b1' WHERE id = '38d5c477-0e99-4ad2-a2f3-e7aeb35da834';
UPDATE public.poi SET linked_badge_id = '6a4e79d9-8370-4181-8f48-4804c36d429b' WHERE id = '38de8ec0-0bfa-436d-ae99-2d1d7dca45e4';
UPDATE public.poi SET linked_badge_id = 'a38104ef-a53a-4413-9302-a717a152144c' WHERE id = '3902478b-0047-43aa-8eae-6f4555cc6cd4';
UPDATE public.poi SET linked_badge_id = '5680c1fe-fdd4-4f81-bcc7-1bbb091b0379' WHERE id = '3920b618-ab12-4851-b1c0-8be35eddeef1';
UPDATE public.poi SET linked_badge_id = 'e7b8bd15-e892-4145-9cd0-c683fa57d8de' WHERE id = '3942cd33-1b52-4a57-b613-f10bc2affe21';
UPDATE public.poi SET linked_badge_id = 'aaec1a33-fbee-43af-813b-788f7de1a8ac' WHERE id = '395a1c8f-6609-4864-88c9-92ef9a30b8f6';
UPDATE public.poi SET linked_badge_id = '3ed22f6b-5367-405f-a85b-113e28d59b0a' WHERE id = '395fa22a-8dc4-45e4-b125-57124f8f4706';
UPDATE public.poi SET linked_badge_id = 'eaadb35e-4f7e-48ed-a73c-ab59fb174aa2' WHERE id = '39a364dc-b0fe-42a9-95cc-596d245eddec';
UPDATE public.poi SET linked_badge_id = '40ba92e7-422f-47ea-a29b-a851c85a98e1' WHERE id = '39d33f9e-9b51-4b4d-8b66-0148d2ccd180';
UPDATE public.poi SET linked_badge_id = '804de64e-d52a-4952-bc2b-c995f8165e6c' WHERE id = '39d6fedc-fa3e-45be-8a29-06bd81e99b4f';
UPDATE public.poi SET linked_badge_id = 'bd6afcd7-b76a-4190-acc5-aeb18d80ad64' WHERE id = '39d78488-0e2b-4815-92da-9ff4b5c39ebd';
UPDATE public.poi SET linked_badge_id = '73e73d89-717e-446d-8d58-98edc1aa25c5' WHERE id = '39f2737c-4c0d-423b-939b-f62a8eefa9af';
UPDATE public.poi SET linked_badge_id = 'a30798ed-c4d2-499c-b5c9-724846610f6f' WHERE id = '39f72cec-da36-4dc7-8701-30eb80da3ab0';
UPDATE public.poi SET linked_badge_id = 'dbe193db-9631-441e-ac61-ac39a7321a06' WHERE id = '39fc2b14-cefc-40bb-a41f-165892402f1f';
UPDATE public.poi SET linked_badge_id = '08fe331f-f82e-4d6d-a63b-8417f44c95cd' WHERE id = '3a047f72-31eb-48ba-a88c-3c0a863d2255';
UPDATE public.poi SET linked_badge_id = 'fad21ba2-0417-4b23-8f2b-4d9620a9a7ff' WHERE id = '3a0e9d09-8439-4eb4-b1b9-5b5bd55863bc';
UPDATE public.poi SET linked_badge_id = '18f56b0f-7e19-4a92-8c46-1feb7a84908e' WHERE id = '3a222044-8328-42bb-a2e8-8dfb796123a1';
UPDATE public.poi SET linked_badge_id = '08fcaaf8-d511-481e-9506-6ae03876c72c' WHERE id = '3a51fcac-e7b8-4239-83e2-2cfc288eb670';
UPDATE public.poi SET linked_badge_id = '686827de-cfd6-479d-b540-443704f193fb' WHERE id = '3a931d39-0e40-42d5-9edf-24165fa25bd6';
UPDATE public.poi SET linked_badge_id = '6cfc31f4-8c52-4913-b138-73798a9a6b4a' WHERE id = '3a97c9df-f3e7-4a1a-91a6-be8deb9b8d7d';
UPDATE public.poi SET linked_badge_id = 'c6cd150a-5288-455d-955d-bba1f22913ca' WHERE id = '3aa82d16-9ad0-4063-a6a2-f43574352293';
UPDATE public.poi SET linked_badge_id = 'cfb84a61-8d59-4860-b121-f9c17db773f9' WHERE id = '3aca0f5d-c523-4a74-9a75-1e3b266e1b04';
UPDATE public.poi SET linked_badge_id = '1e6aba0d-24e8-4e3c-b116-b35198081ceb' WHERE id = '3b016c2f-ab0d-40b0-a3a5-b7bd2b4063c4';
UPDATE public.poi SET linked_badge_id = '029326c8-e547-4241-a956-1e61e9e10049' WHERE id = '3b186945-8759-4863-8c41-fd1bc0a765ed';
UPDATE public.poi SET linked_badge_id = '138943ae-ab63-4c6c-bd7f-85675aea06f2' WHERE id = '3b30b6ca-8015-48dd-ad05-d87f04d79fc1';
UPDATE public.poi SET linked_badge_id = '6e2368d2-332d-454b-a024-843fb8a33754' WHERE id = '3b32de2d-e28d-46f6-a81a-7626ae2d8ee9';
UPDATE public.poi SET linked_badge_id = '410765bb-6d40-436f-8059-eb304166f346' WHERE id = '3b4130ef-404c-4068-a713-274049e64763';
UPDATE public.poi SET linked_badge_id = '1a907667-4d43-4a74-82f6-9e471567da47' WHERE id = '3b5c7dc3-e28c-4285-88ed-9d33203f01d4';
UPDATE public.poi SET linked_badge_id = '3d28de0b-29c6-4cc6-8109-378e1da378f5' WHERE id = '3b6803ad-aef9-41aa-bc39-d7a3610d2a40';
UPDATE public.poi SET linked_badge_id = '77a8a431-7f7e-4c36-8d6b-a69fa2de1c13' WHERE id = '3b89fc1a-289e-4e42-a3bd-75fbb3a277ff';
UPDATE public.poi SET linked_badge_id = '8a63709f-294f-4506-b886-0c5d7e154fa4' WHERE id = '3b932376-2535-4183-b646-ca2301e473e7';
UPDATE public.poi SET linked_badge_id = '07c736cb-737a-4cb0-bdba-1320bc7560dd' WHERE id = '3ba89d04-fe76-40b3-b886-7c6ffb5608c4';
UPDATE public.poi SET linked_badge_id = 'ce772395-61f2-42d2-acd6-c903f67ac0c7' WHERE id = '3bafdc76-6c84-45ca-b3f1-882522dde2c4';
UPDATE public.poi SET linked_badge_id = 'acb91ee5-8a15-4f84-a6d1-beebcf276bbb' WHERE id = '3c2a7ab2-88a4-4b7e-812c-eba709b86854';
UPDATE public.poi SET linked_badge_id = '5e3ead04-f0b2-4046-bbfc-f6c8bc614d7e' WHERE id = '3c4cca56-ccdd-4b87-a63f-8f2cb15e275b';
UPDATE public.poi SET linked_badge_id = 'd47bce11-4290-4113-83df-42dcfab57ed8' WHERE id = '3c6d59c6-fb54-4af6-939b-918461e48c28';
UPDATE public.poi SET linked_badge_id = '769fbbb2-b826-44c6-b223-33fe71eed53c' WHERE id = '3c72dc3b-7054-4a94-8ce5-b0e84081f947';
UPDATE public.poi SET linked_badge_id = '129eb8e5-d2e6-4e95-aaea-c257562e7540' WHERE id = '3c7f4e2b-3015-4ce8-8c2c-62a4b3be88b5';
UPDATE public.poi SET linked_badge_id = 'c9325df0-2a16-4045-8896-441fe1817259' WHERE id = '3d0cf78f-2421-4ad1-95c2-16de140ccc34';
UPDATE public.poi SET linked_badge_id = '082b2edb-ca5f-4adc-9621-61f6612dfa3a' WHERE id = '3d121f7b-628e-48f0-a266-083dcc516cdd';
UPDATE public.poi SET linked_badge_id = 'd2fe7f54-32f4-420f-b15c-0e152f5ccecd' WHERE id = '3d5589d5-8555-45ac-87a3-1721e3d5f718';
UPDATE public.poi SET linked_badge_id = '2c078fee-1b72-4a67-92c2-94eda451718a' WHERE id = '3d5e0cb4-bb2d-4953-8510-bcf7ece04998';
UPDATE public.poi SET linked_badge_id = '88beb2c5-7ddb-42b2-84ce-469cf9951ec1' WHERE id = '3d6ee827-9c7c-44e8-bd3f-883d988508fe';
UPDATE public.poi SET linked_badge_id = '3d881831-f190-4fe7-92f8-e6f3fc922991' WHERE id = '3d883ee8-3c05-40ff-837f-fddd0bab86c3';
UPDATE public.poi SET linked_badge_id = '46d9de0b-3a58-44a9-94e0-0cfb7df0bd8c' WHERE id = '3dd30826-dc75-4f72-a60e-376d932874ea';
UPDATE public.poi SET linked_badge_id = '330b12f5-73c4-4658-8acd-7356543544c7' WHERE id = '3dd56b94-320e-403f-8cb7-c0b15990176c';
UPDATE public.poi SET linked_badge_id = 'c570a28f-2c0c-46df-864c-9613e0a81f50' WHERE id = '3dde960a-99b9-49f8-9e62-7f64e66b9049';
UPDATE public.poi SET linked_badge_id = 'e7edae03-3a32-446f-bdb5-63dc06acb89b' WHERE id = '3e12ea6c-1740-46aa-b5a3-4fcd613ba78c';
UPDATE public.poi SET linked_badge_id = 'e49fe3e1-e7c1-484b-8b3d-c13d54920c39' WHERE id = '3e17df31-86e5-4117-805d-280a089abbd3';
UPDATE public.poi SET linked_badge_id = '2bb994bc-e44c-400d-9da6-705aeb7f7255' WHERE id = '3e75fbc6-69ba-475c-91be-ce6722f04940';
UPDATE public.poi SET linked_badge_id = '63097b6a-ba94-44c6-b8d8-64dc0030e96e' WHERE id = '3e84ff40-b13b-4ca4-9cdf-2f738fd6d32e';
UPDATE public.poi SET linked_badge_id = '90eb32b2-5133-4411-abf0-11fe7f7d4567' WHERE id = '3e8bb997-971d-4b56-bcb3-b711051b2678';
UPDATE public.poi SET linked_badge_id = '416a454b-c013-41ec-bab1-43767c734c22' WHERE id = '3ee58c67-07ea-49df-81ed-66f4a1c70554';
UPDATE public.poi SET linked_badge_id = 'c70d95fe-1f16-486d-813f-acd00cadd5fe' WHERE id = '3ee7d149-0087-4428-83db-28eeb4694967';
UPDATE public.poi SET linked_badge_id = 'c4e41312-aa5f-47e2-bb08-4c6b6700c9cc' WHERE id = '3ee8596f-579c-4a44-a99e-afdd518a4faa';
UPDATE public.poi SET linked_badge_id = 'dec67564-f1f2-4935-a554-e229638f8098' WHERE id = '3ef36290-26a6-4efd-ae9a-b8125c40d421';
UPDATE public.poi SET linked_badge_id = 'e7603390-175f-41a9-99d2-5ca04a3945ea' WHERE id = '3ef85344-c3c6-4c40-bb90-ce902da7db5b';
UPDATE public.poi SET linked_badge_id = 'fd19b5c4-243a-422b-a954-42a2214417dd' WHERE id = '3ef8e98c-716e-4003-b62e-fead28dac059';
UPDATE public.poi SET linked_badge_id = '02cdfad7-3c54-4c8a-9b3c-528c604223d2' WHERE id = '3ef9d9e1-c22c-4fd7-95fb-eeef2c97b6af';
UPDATE public.poi SET linked_badge_id = '7d347dc7-5c21-473f-be56-78f8defd74eb' WHERE id = '3efc56d7-d18c-4ba9-9dd7-852398c19236';
UPDATE public.poi SET linked_badge_id = '38049dfe-c0bb-41d2-ba42-37746021b74e' WHERE id = '3f1cf3c5-7f36-453b-80c8-6385d0f4f6fd';
UPDATE public.poi SET linked_badge_id = 'ef134a8c-f7c8-4abf-93f8-4faedd106ae5' WHERE id = '3f4e6965-b9da-4c9f-80e7-25e4c9026740';
UPDATE public.poi SET linked_badge_id = '0b4440fb-02ea-4332-a2ba-a90c7cfcbf88' WHERE id = '3f51a03a-910c-4783-b3db-3060dc102cdb';
UPDATE public.poi SET linked_badge_id = '9dd03e1c-bd45-4d41-b5e9-86983dee2b90' WHERE id = '3f61149e-1ff3-4f28-9660-084364595964';
UPDATE public.poi SET linked_badge_id = 'fab33d26-6991-4f2f-a8c6-a8be99875837' WHERE id = '3f63826f-7e82-4d24-b505-e5e74e314a95';
UPDATE public.poi SET linked_badge_id = '612d80b2-f8de-4a1c-990e-3e8eff821014' WHERE id = '3f85dad6-04d1-4570-be8d-cf9ab1e51f39';
UPDATE public.poi SET linked_badge_id = 'a92177d9-5ed2-4afc-a106-3d31a678eff3' WHERE id = '3f940f4b-2ddb-47ae-9cfc-e6433e871db0';
UPDATE public.poi SET linked_badge_id = '1feb2cf2-d232-45ea-a606-ec1e67cf6a42' WHERE id = '3fcee86a-e6aa-4e15-bb8b-9eea1d8f4cf4';
UPDATE public.poi SET linked_badge_id = '15ddd13f-be78-4cf0-9c11-d4cabfc3f676' WHERE id = '401a481b-f4c8-4ae8-a282-595345038df1';
UPDATE public.poi SET linked_badge_id = '00f2029b-0a74-4f71-805a-52aa2be73c1f' WHERE id = '4022833a-58a2-4645-aee2-c3f2e6091505';
UPDATE public.poi SET linked_badge_id = '56548862-6d0b-40af-b4d0-ea0a752f4f2c' WHERE id = '4026f519-6037-4775-80f6-b8281443ee96';
UPDATE public.poi SET linked_badge_id = 'b40a683e-8c83-4bed-be0e-91fcb57077f4' WHERE id = '4066f37c-80d1-4a48-b7ef-0d5e500c6959';
UPDATE public.poi SET linked_badge_id = '060f2567-79fa-4ead-a77f-08f1a6fd1fb1' WHERE id = '4082388d-e191-4e87-9a87-cea8b09368cf';
UPDATE public.poi SET linked_badge_id = '9e3aaff7-e855-4d72-8302-0ee510975511' WHERE id = '4087dcbd-e1a7-40a9-a2b1-362e4db108a1';
UPDATE public.poi SET linked_badge_id = '767b9eba-04ba-4900-a9b5-7c9db2963864' WHERE id = '40a11df9-e64a-44bd-8dcb-741d52d4e79e';
UPDATE public.poi SET linked_badge_id = '59bf432e-cba2-4985-a187-7e2dc1239d98' WHERE id = '40c7d20e-dd16-484f-9844-bb2907c60f9d';
UPDATE public.poi SET linked_badge_id = 'a3d1542f-9558-4f2c-9435-106dd7514c6f' WHERE id = '40d9191e-e8b0-4a88-9e78-774476dc2cae';
UPDATE public.poi SET linked_badge_id = '6c5a3597-afb9-465e-bdac-95f7c9c30c90' WHERE id = '40e7de42-1d53-4df2-9d23-457196e82c2e';
UPDATE public.poi SET linked_badge_id = '07f6be9d-cc70-418f-b640-ee8a1dc55152' WHERE id = '4120be2f-5ea5-4e92-8fbe-41cc1313db76';
UPDATE public.poi SET linked_badge_id = '8da0ed68-c9f5-4a37-9d33-ef2256f40e86' WHERE id = '4124b610-9899-426c-bc13-b2c85deff293';
UPDATE public.poi SET linked_badge_id = 'a093a94f-dcc0-4f45-8086-63b4536a3abd' WHERE id = '4137c459-a22e-47d4-bdb7-c64c188170d2';
UPDATE public.poi SET linked_badge_id = '5dec7b98-e230-4e27-afe3-de39c5420468' WHERE id = '4186ae53-e99a-4a72-84d0-4533f8599ec5';
UPDATE public.poi SET linked_badge_id = 'b003e0a9-4d38-4f9a-881d-871395efc590' WHERE id = '41f801cd-4b29-4eee-93e5-3db629d05653';
UPDATE public.poi SET linked_badge_id = 'c5213cc7-d2a9-4caa-9d34-726dc6436a39' WHERE id = '424d035d-1f51-43e3-88cb-ccb239b73bbc';
UPDATE public.poi SET linked_badge_id = 'e38903c8-303e-4353-8790-e767177d3080' WHERE id = '4271bce1-49fd-4a4f-a45e-edd50cfb395c';
UPDATE public.poi SET linked_badge_id = 'bf1e9bfb-97de-4f84-b403-264b0d69e816' WHERE id = '42b9754e-6038-4b95-bda3-d401a0604eb3';
UPDATE public.poi SET linked_badge_id = '256f7fab-e711-4ae8-b7d1-03694c0fe7ac' WHERE id = '42ce1caf-2857-4a17-afca-b8590f6b00d7';
UPDATE public.poi SET linked_badge_id = 'ec196147-bdb4-4de3-817c-21fbe761b8a9' WHERE id = '430707f5-dbe8-4166-a092-a43dad062b5b';
UPDATE public.poi SET linked_badge_id = '0c7c57f2-2d9e-460e-a6e5-a0f3c720c52c' WHERE id = '431130d7-b475-4e46-982f-83f781e042d1';
UPDATE public.poi SET linked_badge_id = '57dfa91c-655f-42d0-89da-7470efd8c694' WHERE id = '43303d56-4dc7-43af-b0ad-d07dcfb7f360';
UPDATE public.poi SET linked_badge_id = 'b5d8493f-35a6-4148-8373-8e463a1de658' WHERE id = '43872dc6-00f8-4f8e-b4a9-928b8b366968';
UPDATE public.poi SET linked_badge_id = '58959700-20f1-4cfd-97fa-535bf17a203b' WHERE id = '4388bbbc-24ff-458f-a3df-dd0b09a9acc2';
UPDATE public.poi SET linked_badge_id = '6423cdcf-3eb9-4d88-b06f-752ccd42fab8' WHERE id = '43aa7e6c-2746-4a45-8f8d-a77fcec2dccc';
UPDATE public.poi SET linked_badge_id = '2e091777-eb2d-4e07-9a02-64ff9d02848a' WHERE id = '43bc68bd-8245-4db4-bd30-940958c05469';
UPDATE public.poi SET linked_badge_id = '80f94e68-61e7-4aea-a3f4-f6f00208c0ac' WHERE id = '444cafdd-4ae2-412e-ad65-5c2a59721998';
UPDATE public.poi SET linked_badge_id = 'e300d4ec-d39f-4eea-bcb4-226638f54ff6' WHERE id = '447cde86-098b-4335-8bd0-83cb39be0af2';
UPDATE public.poi SET linked_badge_id = '3592b248-8000-475b-8b50-2086f80a839c' WHERE id = '449f0908-138e-4082-9165-18699502aec5';
UPDATE public.poi SET linked_badge_id = '3345374c-45d7-432f-a983-08c639fade6b' WHERE id = '44e8690b-68a9-454d-b4c1-d6b5f2b37127';
UPDATE public.poi SET linked_badge_id = '6c43dc08-e061-4549-aea4-2cc74acaed5f' WHERE id = '4513c87f-8a24-4063-90d3-93c35e95134f';
UPDATE public.poi SET linked_badge_id = 'fd6ed497-0d3b-423c-a857-65138a8427e4' WHERE id = '455a6193-2137-406e-b7a7-95a5aa602412';
UPDATE public.poi SET linked_badge_id = '0c79704b-8c6c-46ab-b45e-ec21536c22d7' WHERE id = '45604f6d-f3cc-40b5-abef-3ebb583ca126';
UPDATE public.poi SET linked_badge_id = '9a39bdc1-3339-497a-8555-85d3ad10ad92' WHERE id = '4560e59c-c9b9-43bf-b0aa-111d81799dc7';
UPDATE public.poi SET linked_badge_id = '3a9e5a1f-0ebe-4ee6-a819-9c05e1eca688' WHERE id = '458b0a71-22dd-4f78-a808-6dcc0163a1f0';
UPDATE public.poi SET linked_badge_id = 'fb7d0eee-3d7a-4611-9e1a-7f56b46d468a' WHERE id = '45bb1772-192e-4c1d-b728-cb5452b58806';
UPDATE public.poi SET linked_badge_id = '9570d395-a339-40f0-bd6c-d0b7a754aa1d' WHERE id = '45e9bf17-d27a-49d7-88f5-7a348ffbffb3';
UPDATE public.poi SET linked_badge_id = 'cb600700-5945-4582-b311-e3acfda0d6e4' WHERE id = '461aed5f-84a5-4302-857f-0a091a191ddd';
UPDATE public.poi SET linked_badge_id = '411e9338-7153-4afb-b1aa-c1e3ee5e288b' WHERE id = '4627f73e-94a1-4031-9df2-273ad04d9469';
UPDATE public.poi SET linked_badge_id = '10a65aca-24d2-40d1-ae55-a68f9cfccba5' WHERE id = '463b96e5-b0ed-4291-8b11-659e622791d5';
UPDATE public.poi SET linked_badge_id = 'a4e4a136-9bc2-4155-966a-66fb9afac569' WHERE id = '464a676e-77b9-4b5c-8473-9575407e73fc';
UPDATE public.poi SET linked_badge_id = '80e4a52e-d607-45a4-97cc-c92b251c30f2' WHERE id = '464bbdc2-ae8a-4077-8d27-2899e2577d95';
UPDATE public.poi SET linked_badge_id = '22cdbe85-4a83-458a-88bb-5ae798d9d8f0' WHERE id = '464f39db-170b-44a0-b524-b5818643a3c6';
UPDATE public.poi SET linked_badge_id = 'ec7b56d0-fa3b-4345-a6af-d5d163721415' WHERE id = '467d8cd0-101b-4c9d-a4eb-93ba51a537f6';
UPDATE public.poi SET linked_badge_id = 'd2910ace-e85d-43d6-a0ad-7b8d9046e43a' WHERE id = '4683c1c4-4a33-43a7-a1f3-d496b984488b';
UPDATE public.poi SET linked_badge_id = 'f16f8ccc-5d55-4276-8bbc-6740afabd9d9' WHERE id = '46d280c0-1812-49ea-806f-683b315d486f';
UPDATE public.poi SET linked_badge_id = 'aada46a7-c27e-46f1-bb5d-8ac4cc0b4a12' WHERE id = '47156916-4c67-4fea-970e-2994ab93e2ee';
UPDATE public.poi SET linked_badge_id = 'c2551179-e179-4e49-9bd8-a3196ec1e55c' WHERE id = '471d20b6-83b0-4c48-88d2-9252719bdf25';
UPDATE public.poi SET linked_badge_id = '4e250d07-a129-4606-9b4f-958c4c20c1ee' WHERE id = '4727ec5a-e491-479d-a54f-06b7903abee6';
UPDATE public.poi SET linked_badge_id = '283bf74c-cf94-4657-955b-715b86329a77' WHERE id = '47543b05-3339-45d7-82c8-32ad5a5c5e00';
UPDATE public.poi SET linked_badge_id = '57d32aef-bb8f-44ac-b1a1-92afead8821f' WHERE id = '4757ebb0-dd10-460c-bbda-ec25be9a4a48';
UPDATE public.poi SET linked_badge_id = 'b89aa3d1-28a4-4211-bc99-1a4900611c9d' WHERE id = '47c07598-2395-4833-96be-66565058dc7c';
UPDATE public.poi SET linked_badge_id = 'ea18ed2b-7d53-421b-8b82-5d37b4c2fddd' WHERE id = '48456c34-2021-4f81-94ca-c80e88ffa8ea';
UPDATE public.poi SET linked_badge_id = 'b231e854-bd49-4b7b-91f4-58b65b81377d' WHERE id = '486d1700-14af-4c5f-ae58-d5a76be61f82';
UPDATE public.poi SET linked_badge_id = 'ca59e9d9-fa97-459f-a8f6-27fdc48aff26' WHERE id = '48781294-e1c1-496a-8aa6-ed31ee4a9f0b';
UPDATE public.poi SET linked_badge_id = '47169b56-7c25-41d6-b0f2-192b2fb1c1dc' WHERE id = '48d45e81-ee60-4fcd-9614-9d7f7f23ba21';
UPDATE public.poi SET linked_badge_id = '1756848c-97c3-4355-aaf3-5dc307ca8f97' WHERE id = '494c237b-e6ff-4b11-b344-b75092656317';
UPDATE public.poi SET linked_badge_id = '2139cb8e-0c1a-4a31-a6fa-e466f1cae4fb' WHERE id = '49af05b6-8cda-431b-b180-0f70f766c5be';
UPDATE public.poi SET linked_badge_id = '3d58212d-8c02-4580-912f-a4e69c209df1' WHERE id = '49bd3549-7f7c-4ee7-bed9-078b595e1cee';
UPDATE public.poi SET linked_badge_id = '681d9e53-572c-4de1-a142-c6f1ac1e5cdc' WHERE id = '4a432742-8608-44a9-a394-c8ae54fa794a';
UPDATE public.poi SET linked_badge_id = 'b387d475-245e-483e-b372-251147a7ada5' WHERE id = '4a9ef836-dcf7-4ec3-a152-f6aadce3ad33';
UPDATE public.poi SET linked_badge_id = '0fdd2eac-7e09-47e7-b6fc-48356cf1e97f' WHERE id = '4ae5f9fe-8d6c-409e-a3ee-89c903152e82';
UPDATE public.poi SET linked_badge_id = '910565ce-bd7a-472f-bde5-d4be5a946e05' WHERE id = '4af13e1e-637d-41d1-8e04-1a01d61444af';
UPDATE public.poi SET linked_badge_id = '6c8fda95-daa5-45e8-ad84-a257c985c1d6' WHERE id = '4b5abf2f-41ba-410f-a77b-db2326cc9e10';
UPDATE public.poi SET linked_badge_id = '142b530b-085a-4dff-b6dc-54c65af061c8' WHERE id = '4bb1286e-c2ec-49bb-8112-07f26c29d961';
UPDATE public.poi SET linked_badge_id = '91c49da4-b508-4d5a-953f-8e2ac4429691' WHERE id = '4bc65819-24c6-43ab-a128-d4875c6cc7bc';
UPDATE public.poi SET linked_badge_id = 'd5cb9aa6-9716-4b0d-af7c-50eaae3ef8c4' WHERE id = '4be85f9e-b7fd-483c-9605-bba384219a8f';
UPDATE public.poi SET linked_badge_id = 'b4b79a88-2d5e-4866-a1cf-2819ec377ad5' WHERE id = '4bf30a7b-3d81-472d-b4b0-529c66d786ad';
UPDATE public.poi SET linked_badge_id = 'c2158178-3bd4-4400-9386-1430ea2da9c0' WHERE id = '4bf92334-4e51-40fc-be82-16824edb53b2';
UPDATE public.poi SET linked_badge_id = '470f004d-3da5-4f07-a9a5-1639aa55d043' WHERE id = '4bfc6c86-5b88-425f-a600-7507e4dd4973';
UPDATE public.poi SET linked_badge_id = '9a5bac1f-5a43-4163-a93a-0d4f90338c44' WHERE id = '4c6c721f-49f7-4a0e-ad9d-42336702aa65';
UPDATE public.poi SET linked_badge_id = 'f19870ec-5a39-43d2-a79a-af1ef852a272' WHERE id = '4c6de18d-1430-4137-bf9d-15bc5555be6f';
UPDATE public.poi SET linked_badge_id = 'bbfc797f-c98a-4767-81fc-c11bd33bb394' WHERE id = '4c727394-af89-41b4-b0a9-d1408e32ed93';
UPDATE public.poi SET linked_badge_id = 'aad29b88-24f5-43e4-acb6-9a3a0d777621' WHERE id = '4c8c131b-a20a-43c9-98cf-2ce9f437f58f';
UPDATE public.poi SET linked_badge_id = '5c0ec72c-f310-4701-8eb2-33f9dea5544f' WHERE id = '4c937c36-9333-4498-ad3a-266e17a99c96';
UPDATE public.poi SET linked_badge_id = '3da3500b-1533-43ec-8645-ee082df70c6c' WHERE id = '4cb8c0ea-314b-4599-a861-b1ffdf57199b';
UPDATE public.poi SET linked_badge_id = '162f3fa4-8115-41e1-91d4-734f1081644e' WHERE id = '4ccd46ba-10b6-42f4-b80a-56f9a70589c7';
UPDATE public.poi SET linked_badge_id = '2e752b36-ee97-4174-9195-5e3ddeb04c78' WHERE id = '4ce51311-c06e-4808-b408-c2ad42fa031e';
UPDATE public.poi SET linked_badge_id = '1830a5bc-142c-4a9b-bc0f-519459c28439' WHERE id = '4d06ce0b-3338-414b-b531-ae5003bd0926';
UPDATE public.poi SET linked_badge_id = 'ce3238e2-ef9f-480c-9514-5e744dbdf3c8' WHERE id = '4d54155d-8215-4359-a9e7-4101e30c5efc';
UPDATE public.poi SET linked_badge_id = '6b15b0d8-c79a-42fb-9cf5-b56af62c1fae' WHERE id = '4d914b50-6890-4a5f-bf03-b7acdab89c63';
UPDATE public.poi SET linked_badge_id = '81a2e01b-3653-472b-99b7-8c710b5f67ac' WHERE id = '4d99fbbf-7858-44df-8115-1cddaadd4863';
UPDATE public.poi SET linked_badge_id = '57173881-3b54-433e-b036-58dd2092a4db' WHERE id = '4d9d6dd3-5cb7-4804-beb0-08c5d3409bc7';
UPDATE public.poi SET linked_badge_id = '3ca40975-43eb-4793-b26f-a8fca4e69597' WHERE id = '4db31dbc-3d2f-4f9f-964f-728a611aa867';
UPDATE public.poi SET linked_badge_id = '6f266746-2439-47da-b256-07cb9c085cf2' WHERE id = '4dd3fd1c-4fca-4031-940e-9882edd0c5de';
UPDATE public.poi SET linked_badge_id = '8eacad53-fca5-4752-8bc6-33e745ab7709' WHERE id = '4dd57c67-75d3-430b-85ab-27a8894bf963';
UPDATE public.poi SET linked_badge_id = '3d8e26d4-5826-457c-b45d-ff81427af970' WHERE id = '4e224c62-a54b-4857-8b89-e5ec41c11fa1';
UPDATE public.poi SET linked_badge_id = 'fd1d4c1e-1df5-4e34-b0fe-5693a0dcfa36' WHERE id = '4e242a24-ee5d-4f31-b9da-aa99385748d2';
UPDATE public.poi SET linked_badge_id = '9285cfc4-c81a-44c3-9b5d-905bb3efdbe1' WHERE id = '4e2c42fb-7238-4bea-922b-cb18bd437b88';
UPDATE public.poi SET linked_badge_id = '18b9ca82-7804-40ab-b1cb-7f1227814f5e' WHERE id = '4e39eee2-62af-4734-b14a-630147aac903';
UPDATE public.poi SET linked_badge_id = 'f90a8c80-1100-44f3-bf9a-5d2fac8df194' WHERE id = '4e435ecb-b8fc-4f4a-8e20-151140d49d93';
UPDATE public.poi SET linked_badge_id = 'bda69890-b429-4333-89c3-dfe3d236da67' WHERE id = '4e95d6a6-734b-4476-9916-63c3357b2c7d';
UPDATE public.poi SET linked_badge_id = '9e1edb20-0948-440c-ad89-0c8b6e7ddd68' WHERE id = '4e9aa419-ca26-4c73-b9c7-b8bf0614a8fe';
UPDATE public.poi SET linked_badge_id = '9f982c3c-8c5e-4fa8-a065-186b6767d175' WHERE id = '4eb79822-cb37-4a72-ac87-cea7be8ea081';
UPDATE public.poi SET linked_badge_id = '6b46a0ab-d6bf-430b-85e6-e50ab5b5e616' WHERE id = '4eec3dea-7dbe-4966-997d-041d3bd092a6';
UPDATE public.poi SET linked_badge_id = 'f5f9d9b3-9cda-4e72-a73f-73b4566ff142' WHERE id = '4f07c921-3b29-4adb-942d-de8aa37c7cc4';
UPDATE public.poi SET linked_badge_id = '96f8badb-a822-4b6e-a29c-3d6b86b9aa03' WHERE id = '4f0efa6e-29cc-41c7-8062-fcae4d769e79';
UPDATE public.poi SET linked_badge_id = 'd83c7636-0b93-4591-8f34-fc4a83911084' WHERE id = '4f191838-457a-4731-8111-47638f7f574c';
UPDATE public.poi SET linked_badge_id = '8c0ea117-cfa4-474a-84be-39e17a95bd19' WHERE id = '4f36fdb8-09b7-4842-b9e9-555b7c264ce4';
UPDATE public.poi SET linked_badge_id = 'c0dc62b4-63a5-40fb-8821-1bebda1bdf11' WHERE id = '4f3ed287-fb30-41e1-aa5d-cdb3f3954cd3';
UPDATE public.poi SET linked_badge_id = '606d99bb-2c79-4453-bbe3-704eb9cb1e72' WHERE id = '4f425f3c-82c1-4b3a-a27a-05c9a8f2e438';
UPDATE public.poi SET linked_badge_id = '36b45a4d-09f1-4d9d-873f-31eeab6ce2c6' WHERE id = '4f70c77a-944a-4371-a2fd-ded89ce80cd1';
UPDATE public.poi SET linked_badge_id = '4ee8a769-5794-441a-bb1d-cfedbdfbd82d' WHERE id = '4f81d048-402d-4c66-a088-940017048263';
UPDATE public.poi SET linked_badge_id = 'c2572048-e316-4ac0-a6cb-b85d3ba4d985' WHERE id = '4faad87c-9ffa-413a-907e-410a377c395a';
UPDATE public.poi SET linked_badge_id = 'b58a5b27-0ea2-4c11-8a6d-28a15b7e2f05' WHERE id = '50220443-7bfa-4071-b931-c0bdc82a0ca1';
UPDATE public.poi SET linked_badge_id = '01593492-fb45-4386-8925-0720cb70353a' WHERE id = '502b5c79-2d52-4e0b-a353-ccc527ef63b8';
UPDATE public.poi SET linked_badge_id = 'be74a55e-0138-46cc-9f6d-612390b197f4' WHERE id = '503947fd-a3a5-46ea-9fc1-0ee42f5d6880';
UPDATE public.poi SET linked_badge_id = '66113fa2-d403-404f-aa2f-e60d79dacec3' WHERE id = '503cd24a-9606-4653-974a-1aabfb52fd82';
UPDATE public.poi SET linked_badge_id = 'f3752aea-b329-4d01-a676-bb698cb8b18a' WHERE id = '50499155-cbce-4bc1-8424-db771dd83f3e';
UPDATE public.poi SET linked_badge_id = '1e41a55e-3862-4407-891c-8e16513f7ff4' WHERE id = '505caace-1516-4ec2-a34d-2d3c852e88cc';
UPDATE public.poi SET linked_badge_id = '23748521-d854-4a36-b366-33c4d00f6a70' WHERE id = '5062a952-a6d4-4a85-b375-f66b4146a7f9';
UPDATE public.poi SET linked_badge_id = '5ba1bf0d-bc52-4fbe-a628-8efd1b51091a' WHERE id = '508afd98-57a5-4786-b363-5b935d5b36bc';
UPDATE public.poi SET linked_badge_id = '9bf8ad3b-a2e9-4462-bc9a-56cd9ddc4ec7' WHERE id = '50960fd4-be69-435d-8182-27c6b94f4e08';
UPDATE public.poi SET linked_badge_id = 'dc1bef61-ef64-46ec-b6e5-b33fc8282862' WHERE id = '50f4640f-ecee-4c69-b05b-7051916b523d';
UPDATE public.poi SET linked_badge_id = 'dbbb5e8f-c155-4b5d-927b-9e020fa2deab' WHERE id = '51117e6c-a521-4e4e-a6f3-5ffd63d716cd';
UPDATE public.poi SET linked_badge_id = 'f436ce33-2d38-48d6-9f95-983cf4ebe7b2' WHERE id = '51165a9d-db0b-4574-88ef-61161a416f6e';
UPDATE public.poi SET linked_badge_id = 'ac65c783-c835-4fa0-86a1-af9fa2b38ee7' WHERE id = '51290776-74b3-41ac-938b-b2460200d87b';
UPDATE public.poi SET linked_badge_id = 'c0eb7488-8669-4ec5-a74c-3e0ee75ddb4f' WHERE id = '51306654-9d5b-4709-adef-ee1bdc480525';
UPDATE public.poi SET linked_badge_id = '970c013d-e38d-474e-9c2f-3983ddff50e5' WHERE id = '5139e10c-a029-4ff3-a9a1-dcf0da06d6be';
UPDATE public.poi SET linked_badge_id = 'b527c967-5b9f-403e-afae-cf5e3baff9b9' WHERE id = '5142912e-7737-4e0e-91e3-404fda4a032d';
UPDATE public.poi SET linked_badge_id = '764c1934-d769-440c-bd82-7f7715805f4a' WHERE id = '516884dd-bfae-400b-80d5-45c19667b405';
UPDATE public.poi SET linked_badge_id = 'ec698ac3-e049-4757-bfe0-f7e8a6c1c42d' WHERE id = '516ce15a-4ef5-45cd-bc45-c8796ce72dd6';
UPDATE public.poi SET linked_badge_id = '5c7ff50b-8e52-453b-8321-81aedcaeb8b7' WHERE id = '51740079-cf1e-494f-a998-05d15faea850';
UPDATE public.poi SET linked_badge_id = '81d8b759-2920-406f-bdd6-ceceeba72113' WHERE id = '517c5268-731e-4eab-b516-b20345e6d789';
UPDATE public.poi SET linked_badge_id = '6b59b837-67b3-4827-b3d6-b35ec38aad44' WHERE id = '518b6bd3-df40-4d5d-8ac6-e2ce2c56d2ab';
UPDATE public.poi SET linked_badge_id = '3c424930-bdc3-4211-b8c7-d61c479b0ca4' WHERE id = '519293b4-ef76-4271-a116-c55aefa2bb25';
UPDATE public.poi SET linked_badge_id = '64d9e247-3ab6-4991-8e4b-833e01e3f8e7' WHERE id = '51af0a71-94d6-4ce1-8bc9-848a40f0e886';
UPDATE public.poi SET linked_badge_id = 'e135016d-39ac-4a1a-8d97-44ba49b77e10' WHERE id = '51e0d6d8-58d4-46c9-ab52-a749cb894c98';
UPDATE public.poi SET linked_badge_id = '42009b73-388d-4432-8c87-3bf3664dbe39' WHERE id = '52191d2b-db27-4ec3-879d-f868773d36da';
UPDATE public.poi SET linked_badge_id = 'cb4aa6df-cc7e-4c33-9517-381387fd5be8' WHERE id = '521aafee-d05b-47a4-b0f9-f7e8ee4f417e';
UPDATE public.poi SET linked_badge_id = '7f9e16b0-e15d-4e03-a3ce-f821cb082929' WHERE id = '525696ef-b3e4-4e21-9c34-ba698ddc17d8';
UPDATE public.poi SET linked_badge_id = 'b0ee9db5-9f65-4ab0-bf29-6068c69d9c44' WHERE id = '52a94052-67b3-45d0-8439-a6ba7740cb3f';
UPDATE public.poi SET linked_badge_id = '0af75580-bc77-4166-9534-f5183a47d692' WHERE id = '52ae5049-7716-4a79-b568-da40de7a7c14';
UPDATE public.poi SET linked_badge_id = '0105fc65-f014-4b75-9ba9-73f164d7a19c' WHERE id = '52b5b471-b56d-4af0-81ba-7b1ffaf8358a';
UPDATE public.poi SET linked_badge_id = '5f2ccd55-bed3-4b25-bb74-175a3380b7c3' WHERE id = '52de9538-073d-4f80-be6f-94a3ec9552a0';
UPDATE public.poi SET linked_badge_id = '26a31f10-75d6-431d-bdb8-3746f6f18f67' WHERE id = '52e9c85c-6a7b-4ce0-8f96-ecd25c6faf0f';
UPDATE public.poi SET linked_badge_id = '41db0192-2937-43d0-b9f9-84c8c87383d3' WHERE id = '530781db-6d12-4d48-a8c6-29d3b5b2a81c';
UPDATE public.poi SET linked_badge_id = '45559105-7cf6-4355-a04c-20c915b2403e' WHERE id = '532383df-e919-437e-bce3-ab9edb2e29ff';
UPDATE public.poi SET linked_badge_id = '5e8fe878-8c24-488b-a8d2-926648cefb30' WHERE id = '53277592-5a04-4b72-9c7f-b35a0a7eb574';
UPDATE public.poi SET linked_badge_id = '4189a038-c1d9-4da8-ad40-5ccf0669e613' WHERE id = '533fdee7-dc97-4a35-a201-f72077841b5e';
UPDATE public.poi SET linked_badge_id = 'f9000f40-d9e4-4b52-b822-65896910eadd' WHERE id = '534a3e8a-b830-4c07-bc05-85fb974f2ba8';
UPDATE public.poi SET linked_badge_id = '37e97cad-4d5d-472a-a00e-dffa9c748456' WHERE id = '5361da5d-16c0-4cc8-9786-d52b16479e7d';
UPDATE public.poi SET linked_badge_id = '309d3c4d-319f-4fe7-a9e6-bdf7451e1757' WHERE id = '539d0f20-b18e-44ed-b3ca-535fcfc459ef';
UPDATE public.poi SET linked_badge_id = 'c3d6f2c8-ca6f-4b01-ab82-882249f3e997' WHERE id = '53dd166f-65c5-42e8-a4e3-82c57ab17724';
UPDATE public.poi SET linked_badge_id = '09fbbd3f-4767-472f-aac5-2035bb4c67e1' WHERE id = '53ef2b47-f0c7-4839-9f6f-c440878a581f';
UPDATE public.poi SET linked_badge_id = '954c40a4-d9a6-41f7-845a-ffd02cbe45d5' WHERE id = '53fe8e2d-4475-45d5-9582-5ce48a0e864f';
UPDATE public.poi SET linked_badge_id = '8381f155-5f34-4f34-8929-34420bb228b3' WHERE id = '540c658d-5d7d-4bd9-9969-fc19cd4520da';
UPDATE public.poi SET linked_badge_id = '3fe8a9f4-e730-49e6-a795-8bc245af8f57' WHERE id = '5420a6d5-4d0d-41fb-b7f6-23d407e79f80';
UPDATE public.poi SET linked_badge_id = '267bafb3-22ac-42d4-87f3-50f71c6af78e' WHERE id = '542ee4df-aa0e-4066-bc66-56f857b853e8';
UPDATE public.poi SET linked_badge_id = 'b55a482e-4a1e-43f0-805d-5b46a0da7a68' WHERE id = '544e21be-3978-4306-805b-9b7d59b3050b';
UPDATE public.poi SET linked_badge_id = 'ca2b4329-32e4-45cc-a604-3f6e8fbb193a' WHERE id = '544fd3ed-6b53-4d5e-8f4b-e06b84d9fed0';
UPDATE public.poi SET linked_badge_id = '6b6e360d-0268-4808-afb5-aac2a6a6a2a0' WHERE id = '5458f279-0bfc-46fd-88a6-2c9eea6da3eb';
UPDATE public.poi SET linked_badge_id = '6028a902-5e7d-4d24-95dd-d2708a0f3b99' WHERE id = '5471e324-53ec-4285-b143-3b9f52e2891d';
UPDATE public.poi SET linked_badge_id = '6d54787b-1ce4-46dd-aef4-7707886fdf44' WHERE id = '5489fec1-3ef7-4830-90ff-e65a03044780';
UPDATE public.poi SET linked_badge_id = '5d55283c-2165-4214-b362-debbc5fd602e' WHERE id = '54ea3f6e-5948-4eed-b734-760f2e3a0643';
UPDATE public.poi SET linked_badge_id = '022ee11e-8c83-4244-ad4b-5058fd14c325' WHERE id = '550b2009-b5e8-40b6-b72f-22a422f77d96';
UPDATE public.poi SET linked_badge_id = 'c0f9b1c3-83ba-47b6-8d48-9c69c529cf11' WHERE id = '55289bef-40d2-4af7-8f88-4db27a9cb57f';
UPDATE public.poi SET linked_badge_id = '89654416-2d5c-401d-8e90-983cbbff88a8' WHERE id = '55967dd7-8639-4096-88db-16d6e6532267';
UPDATE public.poi SET linked_badge_id = '2e9b21e0-bd47-4ff2-93ba-755ee4b7630d' WHERE id = '55cecdb3-0202-4594-ac01-87bbd38e5b7e';
UPDATE public.poi SET linked_badge_id = 'dc2d4828-8d94-4460-89c6-347a243b5426' WHERE id = '55f6818a-daf2-4318-9135-f883c127dad6';
UPDATE public.poi SET linked_badge_id = 'b27e3fef-d53d-4252-9b0e-9cdaa0d4915f' WHERE id = '562145e9-f28c-4476-afe2-cc19052a7c74';
UPDATE public.poi SET linked_badge_id = '527fea77-d8c6-48b4-bb66-2a04c01efa88' WHERE id = '566f0727-c893-4b5e-b318-c9b2f2163d89';
UPDATE public.poi SET linked_badge_id = '00b7b9df-28b5-4e71-9736-a34751987248' WHERE id = '5674c401-7dec-46df-a6e5-72d36f130032';
UPDATE public.poi SET linked_badge_id = 'fee0013d-0afe-4331-b5f3-781d0dc23766' WHERE id = '5681068e-e173-4a97-ad01-222063c85fb1';
UPDATE public.poi SET linked_badge_id = 'd469ae87-22c5-4015-9c67-44fd4d0ea901' WHERE id = '569056c9-d584-466f-8f1e-690104c5f9d4';
UPDATE public.poi SET linked_badge_id = '1f8987d5-7df1-4ff1-9f93-5b591f75e515' WHERE id = '569aefb5-e7fa-4913-b8c4-71a30ec19a4e';
UPDATE public.poi SET linked_badge_id = 'dd9bec64-f5f8-4ef5-97f0-5733141ce3cd' WHERE id = '56e69ac3-246b-4b17-89b3-fa476000b87c';
UPDATE public.poi SET linked_badge_id = 'd9afbc4c-2d0a-4476-8e43-b141a13ef929' WHERE id = '56e8b4f8-d7d1-4b66-a4ec-72fe53d03f74';
UPDATE public.poi SET linked_badge_id = '82cd2795-36b3-4755-83d8-3588ba3ba03f' WHERE id = '577e0bf0-863f-4d53-90dc-410a2041ab3e';
UPDATE public.poi SET linked_badge_id = '7dba6651-4f9d-4d4f-8ef1-368d04e936cb' WHERE id = '57a90dc9-ac45-4a45-866d-57d2a4d69420';
UPDATE public.poi SET linked_badge_id = '3e3fff62-ad09-4e5b-a8a4-077468a64280' WHERE id = '57f11682-15f5-4941-b82f-deadf30a747c';
UPDATE public.poi SET linked_badge_id = '1faf19a9-41e4-4e8d-911d-7a1ab148c285' WHERE id = '57f7240f-a977-4658-a175-10fff4efd062';
UPDATE public.poi SET linked_badge_id = '2253c620-e277-4ccc-83ad-fdd25eac3993' WHERE id = '57fe71a2-1aab-461b-bde4-1bc28e0357df';
UPDATE public.poi SET linked_badge_id = '4ded8b21-a726-41ef-bfd0-59abfc53d9c4' WHERE id = '580a7037-a0ef-4f8b-b169-239e66bc85b6';
UPDATE public.poi SET linked_badge_id = '6d5087b9-07a5-482c-81f0-669d7b6324e6' WHERE id = '5826a4a7-833f-4565-bcfc-9681ffd2c552';
UPDATE public.poi SET linked_badge_id = '9fe75416-a6ac-4982-b94d-2ee26f4eb080' WHERE id = '582d5a3f-c24b-4aa5-81c6-8d3005024067';
UPDATE public.poi SET linked_badge_id = '4ea714ad-4db1-4f34-958b-3864ff64522b' WHERE id = '584b287c-40ff-4539-9aa7-5d3ae17ce2c5';
UPDATE public.poi SET linked_badge_id = '925b1f52-e868-4d65-bac3-009c940bba6c' WHERE id = '58583e88-9e4a-4d9f-b3a1-994f3b86989d';
UPDATE public.poi SET linked_badge_id = '794e07bf-e3f9-48c9-b113-31a02ec946a6' WHERE id = '5863113b-3086-4289-8b1f-e63ecaa4a6b5';
UPDATE public.poi SET linked_badge_id = 'ea2b102e-77ba-4879-89aa-fa1cc06dbe66' WHERE id = '58651a53-7d89-4bc1-aae6-c1a3fd31391c';
UPDATE public.poi SET linked_badge_id = '0e31c0b2-4d33-4c35-9da4-190dcd264350' WHERE id = '58b81e7b-1671-4968-a8c8-a6a8bd08fd58';
UPDATE public.poi SET linked_badge_id = '55c53348-c186-44e8-85ae-484b0bc657b7' WHERE id = '58be0715-cddd-4604-90e9-63f578805b39';
UPDATE public.poi SET linked_badge_id = '95fb6173-abe0-4486-a8c2-b70d66489bad' WHERE id = '58c20b92-c0f9-4a81-afc2-7ddbcb9b348a';
UPDATE public.poi SET linked_badge_id = 'cd932d96-db0e-4f8e-9410-0c2755155eba' WHERE id = '58eae6bf-1c3f-4e7c-baf6-cb231188e3fd';
UPDATE public.poi SET linked_badge_id = 'f3233afe-0ad1-4853-b858-828ee34e2743' WHERE id = '591d2d2d-e392-4229-ae55-add81a050355';
UPDATE public.poi SET linked_badge_id = '9c902c1d-b13d-4d2e-bc35-86844f82c064' WHERE id = '592158c9-2441-4f17-96ed-bfdd25a28c33';
UPDATE public.poi SET linked_badge_id = 'd8b89a98-b2bb-46a9-b3f0-c78d236a7e83' WHERE id = '5926fd15-eba0-408c-9cfe-61c9c3e3daf9';
UPDATE public.poi SET linked_badge_id = 'b0b39f24-51dd-4d1a-96ea-bb3076c72335' WHERE id = '5939ba93-2b7b-4e7b-95c3-5a5d4510d04c';
UPDATE public.poi SET linked_badge_id = '9c9ca171-f068-49d6-9adb-68e1f1271d68' WHERE id = '593be646-0a62-4981-8962-4740a0ee721b';
UPDATE public.poi SET linked_badge_id = '2dcd8994-3ff2-41e6-b0da-6c9935e3f6f4' WHERE id = '5953d5de-0fca-4606-978c-e0aa80ab91a6';
UPDATE public.poi SET linked_badge_id = 'dc7f6e32-c82d-46eb-9651-8816a39da817' WHERE id = '599632e4-f94b-496a-be64-132357c34ece';
UPDATE public.poi SET linked_badge_id = '2d066e6f-791d-412e-8c00-56b7705c2160' WHERE id = '59b0817b-ae64-47b5-bf76-f9fd5ac6a39f';
UPDATE public.poi SET linked_badge_id = 'a4918a76-516d-412d-b232-39cb9def157b' WHERE id = '59b110fc-b25a-42f5-beb4-3cf46d426cc4';
UPDATE public.poi SET linked_badge_id = 'b370d826-4301-43f1-9074-049e1e760e7f' WHERE id = '59be03af-023b-451c-8366-616942392864';
UPDATE public.poi SET linked_badge_id = 'e2396178-1941-4b45-80f6-412d2a163fe2' WHERE id = '59d07aaf-dbb3-45cf-80b8-70498b08d85b';
UPDATE public.poi SET linked_badge_id = '8b8fd214-4997-48a3-a1de-328d31ad5c57' WHERE id = '5a2d03f6-dc38-4faa-9f96-1c0543efea3e';
UPDATE public.poi SET linked_badge_id = '93e8ebfb-b649-4839-8878-c39dd95ecff4' WHERE id = '5a39eca4-e51e-4dbc-9c63-95637ef72eee';
UPDATE public.poi SET linked_badge_id = 'd73e1cb4-1d52-4c98-a6a5-cd7a5869eb37' WHERE id = '5a4c49dd-613d-473d-ba3c-1036066a71b5';
UPDATE public.poi SET linked_badge_id = '6d781593-0660-412b-8544-a31f7150a2a8' WHERE id = '5a8dde19-630b-4aba-8321-8bb4bc653e4e';
UPDATE public.poi SET linked_badge_id = '011b2308-3bee-44b6-b1d8-288377b56b68' WHERE id = '5ac834b8-d273-4de9-bcd8-c65810dc1f99';
UPDATE public.poi SET linked_badge_id = '1da10fbc-27aa-4e03-a40a-2684543f8613' WHERE id = '5ad0b636-9e23-48cc-bf6f-03db1d1dc8a4';
UPDATE public.poi SET linked_badge_id = '26b845bf-1249-4e00-8137-ca2b8612eb21' WHERE id = '5b0bc342-a3f5-4cac-aa21-82d6dd98aa7d';
UPDATE public.poi SET linked_badge_id = 'cac309a4-7142-4844-9ce3-63bd26029894' WHERE id = '5b488643-a7b1-49a3-a10a-e95f09adf59d';
UPDATE public.poi SET linked_badge_id = 'd17c36cd-ca50-464b-b308-3832536c5fb4' WHERE id = '5b73b871-8f83-41f5-b07d-e3d3fda08762';
UPDATE public.poi SET linked_badge_id = 'ea60e02d-d42d-4c37-a6a9-6af5b55bfc4a' WHERE id = '5b9b0b22-484b-4711-afd2-7b255fd04485';
UPDATE public.poi SET linked_badge_id = 'c2ad4298-bc73-4f2b-a2d2-df02cc00e6cd' WHERE id = '5ba1dbd0-1b6f-4a77-81c7-98f768c34ada';
UPDATE public.poi SET linked_badge_id = 'f644ffb5-862c-4dd6-ba98-57cb7961898a' WHERE id = '5bd4b20b-f145-4a87-bfdf-24cf16e699cc';
UPDATE public.poi SET linked_badge_id = 'ec83afb8-3e4d-4068-b29c-27fe3bd83b1b' WHERE id = '5c50ff7a-76ed-4583-a771-e46242fc436b';
UPDATE public.poi SET linked_badge_id = 'd96b8341-0493-433e-9d39-cc22c30dfa37' WHERE id = '5cd5a7f0-b7d8-44ed-ba7e-b2ba9d40f2b4';
UPDATE public.poi SET linked_badge_id = '14acd0ca-f6ea-4c01-97c1-9ab8d61fdef5' WHERE id = '5cf0df0b-3877-4fd8-a68a-4e21c5e6dfb6';
UPDATE public.poi SET linked_badge_id = 'fe7b903c-54b4-4f9a-ba46-5a8828e4b30d' WHERE id = '5cf47064-f5ff-43a6-988f-39420929ac18';
UPDATE public.poi SET linked_badge_id = '5164df3b-43f6-437b-b5b4-e8314f155a92' WHERE id = '5d267b45-03b3-40a8-bc6a-623a49b8c58c';
UPDATE public.poi SET linked_badge_id = 'ef0ccde7-b271-46e7-bb4b-2b2786e75b56' WHERE id = '5d83fa72-d9c7-4854-ad31-e5e77a48ad63';
UPDATE public.poi SET linked_badge_id = '8d92efcd-b459-42d0-9a0e-f38a8df30cd0' WHERE id = '5db2df09-a2db-45aa-a488-a19c9f7f332a';
UPDATE public.poi SET linked_badge_id = 'bfe5d881-713c-4845-ab3e-902fde01ac15' WHERE id = '5df1e851-bf6b-42c4-b62a-1a194d629a2a';
UPDATE public.poi SET linked_badge_id = '16ba13ab-73aa-4b05-b332-0716d1796b7d' WHERE id = '5e0edb2c-c1a6-490b-ac2b-31b29be6f445';
UPDATE public.poi SET linked_badge_id = '37318d5e-7c55-4a69-b333-edf36c88cb47' WHERE id = '5e1cb598-fbe1-4db3-9366-8a6722b9e075';
UPDATE public.poi SET linked_badge_id = '481b52c3-5034-461f-b471-c5cf8ee7c36a' WHERE id = '5e4da720-3b88-4471-8007-21e1399c96f6';
UPDATE public.poi SET linked_badge_id = '7d6cecf1-386d-4a45-b4d8-4d7a18df515b' WHERE id = '5e4dcf44-3ef3-424a-9fb0-2e6262add5dc';
UPDATE public.poi SET linked_badge_id = '563e75a1-8c24-40be-9069-051ba8cfcd16' WHERE id = '5e678072-71f0-4632-a2df-0bf8b86e8c71';
UPDATE public.poi SET linked_badge_id = 'b89b0c97-04bc-4110-87d8-ff3a2c9ba872' WHERE id = '5e721fe2-cbc0-4ab2-b42e-430c98e73a98';
UPDATE public.poi SET linked_badge_id = '55eb4693-ca04-4d4e-86ce-4aa49b696256' WHERE id = '5e83c9b2-4977-43b1-b512-0a8a78dd2998';
UPDATE public.poi SET linked_badge_id = '1b1a8848-64c9-4ad5-a570-749e41436c66' WHERE id = '5ed9ac5e-f97c-49ca-b979-46766d783aac';
UPDATE public.poi SET linked_badge_id = '246152b7-bea4-4e5d-b4d0-ee6ff2ce2f5e' WHERE id = '5ee09679-276b-41d3-88fe-8cafe8c28a74';
UPDATE public.poi SET linked_badge_id = 'aa51af51-2df7-4424-b9c0-dfbad395a771' WHERE id = '5eec5576-1d1d-4cf0-9c8f-304f0bef5168';
UPDATE public.poi SET linked_badge_id = '8793c751-98a9-4915-a810-82ec0a89dadb' WHERE id = '5ef93e64-7319-40b5-90c6-8663aaa758ab';
UPDATE public.poi SET linked_badge_id = 'b5aad89c-10da-431b-b2b7-911a2112e04d' WHERE id = '5f1a61be-ca3e-490d-a98a-0bbd130c38c8';
UPDATE public.poi SET linked_badge_id = 'a0d681cb-c193-4c9d-945a-4274cab3853f' WHERE id = '5f4f9606-342d-4d22-945d-184a3687d881';
UPDATE public.poi SET linked_badge_id = 'ccd03db9-9e31-4623-a1f1-9733a356c0ae' WHERE id = '5fa73704-8c1a-4ed8-8c5a-4d174b675033';
UPDATE public.poi SET linked_badge_id = 'c941c1e5-fa63-45bc-be2f-12318e1430ba' WHERE id = '5fcc2092-2f25-44a7-b477-2b21f91011dc';
UPDATE public.poi SET linked_badge_id = '828ba928-eb01-4fc2-9df3-8b63068f28b2' WHERE id = '5fdf9c7a-e724-4080-8372-df2b13974bda';
UPDATE public.poi SET linked_badge_id = '584030bf-d3ab-4b40-9cbe-eefee8b9d1b6' WHERE id = '602f10ab-c104-412d-9a7e-32d32f905416';
UPDATE public.poi SET linked_badge_id = 'ebb36ae9-f6d4-4775-96a1-a6da01d83924' WHERE id = '604a757c-80f3-42fc-b690-cba61863ae83';
UPDATE public.poi SET linked_badge_id = '0fdb9fc6-7b26-4595-933b-cfe2e45fb87f' WHERE id = '60505ff2-545f-43a5-a427-a30ce94f1c2a';
UPDATE public.poi SET linked_badge_id = '611753fe-1e1a-4fca-a7b0-a18dd22e009c' WHERE id = '60543a18-bdbd-4cb2-97c4-37fe4bca80a5';
UPDATE public.poi SET linked_badge_id = '42eafecf-71db-4374-a949-361692222bb6' WHERE id = '60730b1f-d035-4b41-8b0a-59a24507d82b';
UPDATE public.poi SET linked_badge_id = 'a5cd5bab-8b87-4f7d-85d3-d2fcaabde87b' WHERE id = '6084a1ae-bb4e-4850-9307-2d3a89bb1fdf';
UPDATE public.poi SET linked_badge_id = '7efba7ae-e45d-4742-8198-4eb905f65389' WHERE id = '6090f420-0f34-470d-8fd0-68f423b8cf8c';
UPDATE public.poi SET linked_badge_id = '551276c9-c62e-4c95-96e6-844be084f782' WHERE id = '609b7ab7-8b10-4ba6-aa49-9c7b0d82dfb2';
UPDATE public.poi SET linked_badge_id = '039a4048-a72f-43bc-8a8e-5214d2376bad' WHERE id = '609f02d4-5be9-4d84-893e-92bfea84476f';
UPDATE public.poi SET linked_badge_id = '91e15918-9bbc-4986-b7c2-2d1f486f412d' WHERE id = '60b4a780-6508-4f03-b5b1-857111b8e5c4';
UPDATE public.poi SET linked_badge_id = '8e912e22-a428-4297-9e5d-6daff18762b5' WHERE id = '60b81c0a-a73f-4e9f-b4c1-4ecc05138bb6';
UPDATE public.poi SET linked_badge_id = '3f54bf4f-5d39-4e2a-8bed-a0d5ad762965' WHERE id = '60c5214e-a2a3-441a-ae28-8b3e0bb9f5e9';
UPDATE public.poi SET linked_badge_id = 'f240415d-6584-4fdb-9407-045eb591a8f4' WHERE id = '60da901e-cb6c-4687-8c23-a8321fbe7e98';
UPDATE public.poi SET linked_badge_id = 'b6482063-5648-45c0-87a0-c96f183eef6e' WHERE id = '60dda0e5-bd00-459d-b8d2-8fb5e17880ed';
UPDATE public.poi SET linked_badge_id = '7e41d368-87c1-4747-b706-60b2b1b08e07' WHERE id = '61068677-01f5-48c1-b0b4-e40499f33e50';
UPDATE public.poi SET linked_badge_id = '51bf879b-d5da-451d-92a0-bad4910f9e59' WHERE id = '610eab09-ed7e-4a26-b593-a30a0b537b03';
UPDATE public.poi SET linked_badge_id = '844837c9-7298-47e0-8b38-9ea4f2480b88' WHERE id = '61aacebe-75f3-4a5c-9b95-07f3cf243939';
UPDATE public.poi SET linked_badge_id = '7d7ec5f5-ce40-4dc0-ade2-a69d94ca809d' WHERE id = '61b1c066-93d8-41c1-94b2-b95665049920';
UPDATE public.poi SET linked_badge_id = '24d37b9b-de81-46e5-98a8-aec03586b20f' WHERE id = '61e6161b-0c1d-4119-aaa0-a79493162a43';
UPDATE public.poi SET linked_badge_id = '94706cb9-a1f0-443e-8594-cadca025aebf' WHERE id = '61f08859-a188-4707-ae6d-a847c5e84d5e';
UPDATE public.poi SET linked_badge_id = '04428494-9180-45ea-969e-18b9eb9b41ec' WHERE id = '61f21513-81c9-4cd6-beda-8b5a443371a3';
UPDATE public.poi SET linked_badge_id = 'cfc089e0-7f7e-444e-8513-3ceb8bb5a673' WHERE id = '620c11a8-b67a-4423-ae2b-5ccc8ba75ec5';
UPDATE public.poi SET linked_badge_id = 'b9bdc1f9-1c1c-4d02-af61-62fbf4d7f2d0' WHERE id = '62143d60-e378-402d-85ce-52d6b8865810';
UPDATE public.poi SET linked_badge_id = '69bab70e-6b1f-4dd0-9ee7-9a7d6d95c576' WHERE id = '622587e5-acee-44dc-a72e-bdab9e44ffb8';
UPDATE public.poi SET linked_badge_id = 'ee591d9f-b938-4eff-b68a-c82874ed4724' WHERE id = '6239fe31-6331-450a-a4a5-f6db439c3146';
UPDATE public.poi SET linked_badge_id = '97b09952-e810-4442-86ad-4318eedd8507' WHERE id = '62414214-0920-4ecd-b0b5-f1e2030ca089';
UPDATE public.poi SET linked_badge_id = '517b12bd-b91c-4042-b512-6fbeee47b2ea' WHERE id = '624c4a61-1ecc-4cf8-beb9-3db75008dc88';
UPDATE public.poi SET linked_badge_id = 'f26e669d-9a2e-47b6-b5a6-be790b368250' WHERE id = '625fca6a-69d5-4058-832c-0c03f425b72d';
UPDATE public.poi SET linked_badge_id = 'ab9f46be-a1a3-4e8c-b715-341c13c564a0' WHERE id = '6287ef61-aed8-4bca-bd98-7869b126fdeb';
UPDATE public.poi SET linked_badge_id = '9120fc85-9d9d-4ee7-a7cf-b6b83373d9c3' WHERE id = '629b542d-50ca-415b-96ce-97860c3fc754';
UPDATE public.poi SET linked_badge_id = '83cb0dbb-3079-4b1f-8f02-a43c193ebf0e' WHERE id = '62a06d47-3025-4df2-a885-a295efad6b6f';
UPDATE public.poi SET linked_badge_id = 'fd8a8b9b-4c04-430c-a3fb-04c253a959a0' WHERE id = '62b675b3-4000-4b21-8e9c-39220305a03b';
UPDATE public.poi SET linked_badge_id = 'a66f3072-a49f-4a14-b5cf-58fe4cd36c02' WHERE id = '62bb22e0-4579-4659-a01a-c359f0e3baa8';
UPDATE public.poi SET linked_badge_id = '703c5464-3d09-40d5-b728-5476b821a62b' WHERE id = '62c511ae-25fb-4ab1-bd03-b01a03f06c06';
UPDATE public.poi SET linked_badge_id = 'ff569dde-0cf6-4f46-9e0e-f637e90f6429' WHERE id = '62de2977-9ce7-45d7-9775-713ac98539ad';
UPDATE public.poi SET linked_badge_id = 'f1453e44-af6f-404d-aa54-1f6c24cadc6c' WHERE id = '62f4f9ab-0ba7-4968-9698-5ff25407a91d';
UPDATE public.poi SET linked_badge_id = '20b915f3-56cc-44ad-bece-cc85e2442092' WHERE id = '63014ec0-ce17-4ee1-be66-06feb35fdf5a';
UPDATE public.poi SET linked_badge_id = 'a2750f6f-247d-46ba-a6d9-2e02daa85e5a' WHERE id = '631533fd-bab6-4a6f-8ab4-3c4248c0daf5';
UPDATE public.poi SET linked_badge_id = 'b2a0b98a-7223-4e53-9f2b-f09713e20984' WHERE id = '637ec84a-7420-465a-b0fd-314a839d4bf0';
UPDATE public.poi SET linked_badge_id = '70a71f79-ee63-4846-85e4-53d1b6800721' WHERE id = '63bf196a-2503-4587-9d47-c4a50096fce2';
UPDATE public.poi SET linked_badge_id = 'eba86f1a-98e8-4141-b22e-6ee8e3b4618e' WHERE id = '63fd2b0f-159f-40f5-a5a1-877bf443f522';
UPDATE public.poi SET linked_badge_id = '1a178309-9724-4659-940d-e2a97258fcf6' WHERE id = '6408babf-bd9c-4d26-bd75-6c94aaae879f';
UPDATE public.poi SET linked_badge_id = '70bd69e8-73bd-48e7-8451-c7109ff8d28f' WHERE id = '644f115b-e0bd-4c28-92a0-c22e51cb8929';
UPDATE public.poi SET linked_badge_id = 'b7986870-6be8-41d0-9670-50f81184ba52' WHERE id = '645f7fe4-5963-4e0c-94a4-37e23f438343';
UPDATE public.poi SET linked_badge_id = 'f1e64f09-e059-4004-ac1a-9ba0e4467fde' WHERE id = '648835e3-7142-478e-9532-f97211196e74';
UPDATE public.poi SET linked_badge_id = '0388e7a2-979b-4d0b-becc-5a0e292b9f87' WHERE id = '64adc6a5-9985-4b3f-b510-9fed9f6adfbb';
UPDATE public.poi SET linked_badge_id = '095f57de-2c67-4bdf-a074-1138d8513a3e' WHERE id = '65550e60-2a94-4f37-b266-4efd539f95c7';
UPDATE public.poi SET linked_badge_id = 'efc8d793-47d5-49d4-8724-b83bc8fd4744' WHERE id = '655677f2-b3ee-4704-895e-e85ab411dfae';
UPDATE public.poi SET linked_badge_id = 'b6e6bc67-2e51-4d1d-9b85-6e46a18937dc' WHERE id = '6570ad24-327c-4848-9869-096650255672';
UPDATE public.poi SET linked_badge_id = 'cd64fda1-cb6b-47c2-b622-87d942e8ced9' WHERE id = '65b11b5e-03fd-45f5-b8a2-1206c3abe0b5';
UPDATE public.poi SET linked_badge_id = '13110547-f906-4636-90e2-40e3af945585' WHERE id = '65c747f3-cfd9-4a18-bba7-1a4662a5c30b';
UPDATE public.poi SET linked_badge_id = '44981f6b-5364-427b-9d9c-a6f57a68991f' WHERE id = '65d71825-79fc-4bab-96d1-7fd1352c295a';
UPDATE public.poi SET linked_badge_id = 'cd04f89f-e4f2-466e-bc58-6bebc8fe78e1' WHERE id = '65e617f0-9725-467c-a6d7-1771941d941b';
UPDATE public.poi SET linked_badge_id = 'ccc3d9fc-6566-4e05-9282-8924833d391f' WHERE id = '6623cc9b-d3c0-402f-8e2d-3d6b5304caa5';
UPDATE public.poi SET linked_badge_id = 'ff94d7aa-9c66-4749-9e2a-974e74207eb8' WHERE id = '663967bc-a954-420a-9593-396ccac3fe2b';
UPDATE public.poi SET linked_badge_id = 'b730c89b-39da-429d-abe6-bbfbf4ba4580' WHERE id = '663f162b-29da-4d6f-a007-a63daa2ccb0b';
UPDATE public.poi SET linked_badge_id = 'd15b67f0-6f62-43d8-8de1-24032c020a7c' WHERE id = '6648aa4a-c3e1-4699-9abc-b8eb005a9889';
UPDATE public.poi SET linked_badge_id = '7fac7dcf-b223-42c0-bc85-d3f813e02949' WHERE id = '667557f1-5dd1-43fb-aaff-deccfe2dc277';
UPDATE public.poi SET linked_badge_id = '4681bcfd-ff14-4e9b-b92e-2b298218156c' WHERE id = '668756a3-4716-4b15-bc10-a940c0e3a8c7';
UPDATE public.poi SET linked_badge_id = 'd96c96cf-c30a-48a1-a1e7-6393d2e5312b' WHERE id = '66898e24-583a-4dce-ab26-3af0366ac28c';
UPDATE public.poi SET linked_badge_id = '4ee3a730-902e-4b9c-9216-b502e1574922' WHERE id = '66a44b10-76e2-4692-9f31-372e0bc3112d';
UPDATE public.poi SET linked_badge_id = 'b55c418f-1f32-45af-aa22-4446509d7157' WHERE id = '6706bcb5-1fc1-44a8-89bf-d4b62a1a7d0f';
UPDATE public.poi SET linked_badge_id = '006b988a-aebf-4c7f-be32-b3d8a19c6219' WHERE id = '6749128d-95bc-48f9-9503-32f189c22059';
UPDATE public.poi SET linked_badge_id = '4fd8ce0f-1531-4b2b-b30b-d86401b3944c' WHERE id = '674c79ee-9698-47f4-a567-63b916cde7c4';
UPDATE public.poi SET linked_badge_id = '2f3c8803-7d34-4af4-b66f-ae773d4468c8' WHERE id = '674e42e0-af19-4260-aa7a-8c7469696e55';
UPDATE public.poi SET linked_badge_id = '51f486b1-df98-497d-b41f-d9d9786ec743' WHERE id = '67986a6e-ddf2-400c-894d-426421f88559';
UPDATE public.poi SET linked_badge_id = '17927ac0-411c-4928-a72f-c050a3589211' WHERE id = '67be01e4-a678-4640-b8ce-cac9a1527702';
UPDATE public.poi SET linked_badge_id = '87344308-21d6-4cd3-bdb4-609282b83d73' WHERE id = '680a89d8-69b3-43ac-b52c-9f7a7f780ef1';
UPDATE public.poi SET linked_badge_id = 'e1f49709-2f5e-4c56-b967-290e207df5ed' WHERE id = '6829ad72-de45-4b69-87d3-98bb4bc1e38a';
UPDATE public.poi SET linked_badge_id = '56b02bcd-17b7-4616-8d11-4899b23512fb' WHERE id = '683cf01c-fcde-49fc-b9bb-f2ba99e5ccca';
UPDATE public.poi SET linked_badge_id = '216c3d3b-05bf-43d9-a456-b2582fee1811' WHERE id = '685d63a1-9ed0-4562-abca-447a9109097f';
UPDATE public.poi SET linked_badge_id = '1a918ee5-ca28-44a0-b1ee-81e474b9a78c' WHERE id = '68782e9f-dd81-4ecf-bafd-7c5d1c116c6d';
UPDATE public.poi SET linked_badge_id = '83d424c2-29d7-492d-a077-da494cbc025e' WHERE id = '68970ae0-30a6-458d-b78f-c4fe7f02289d';
UPDATE public.poi SET linked_badge_id = '9cb6a9c1-cbc3-4ea5-8c25-7e81271f9c34' WHERE id = '68988861-3687-4073-92f1-5a403cad7b1c';
UPDATE public.poi SET linked_badge_id = 'c30fcb8e-7ecb-46ad-90ea-b225c929b6e1' WHERE id = '68a909e1-6831-4844-9b29-01226df3bf66';
UPDATE public.poi SET linked_badge_id = '6f90db2e-a89a-4000-a1f4-70744f410257' WHERE id = '691dd2a4-fb0a-4370-89bb-9370cdb84069';
UPDATE public.poi SET linked_badge_id = 'db6f24c5-c383-4c6f-9940-f5d0a990267f' WHERE id = '69458ce6-ecf3-438a-bac6-26d6c3dacb33';
UPDATE public.poi SET linked_badge_id = 'd6bf8158-1f08-42af-8658-6e107fcac5e4' WHERE id = '69498ed1-9e54-462e-aa69-cc1a8d783cb9';
UPDATE public.poi SET linked_badge_id = '324b852e-0003-4052-a0bd-8239ab790b41' WHERE id = '6956aa5a-e7df-40c4-a2f2-846243752cff';
UPDATE public.poi SET linked_badge_id = '68075c2f-5da0-40d8-86d1-6d495959cbaf' WHERE id = '6991dcb8-fc95-4507-b808-043363488c19';
UPDATE public.poi SET linked_badge_id = '6d62af95-209a-4fb1-ba88-2e3c954c2c4d' WHERE id = '69988c6c-a3be-42d6-b723-07f1f521db0e';
UPDATE public.poi SET linked_badge_id = '3f8781b8-3ae9-4649-b676-b9b0f6d76f1f' WHERE id = '69b51aa6-a63c-4f63-b779-5b7ef83c2b91';
UPDATE public.poi SET linked_badge_id = '6d754168-5bf0-4e2d-b791-30d3504a961b' WHERE id = '69e2f9b9-e8ad-46ce-bcb0-2f4e34d67fc7';
UPDATE public.poi SET linked_badge_id = 'bdf4cef6-dd34-4503-a65d-3c1621baf8db' WHERE id = '69fd2f4f-5ccf-4d20-b1c1-8c98af488b81';
UPDATE public.poi SET linked_badge_id = 'f60edb3b-4bf6-41f8-847b-3cc0658fe929' WHERE id = '6a006abf-08d9-48a8-9040-cf0c56101ba7';
UPDATE public.poi SET linked_badge_id = '1d75596a-97df-4a7f-a17f-09c8104d56d8' WHERE id = '6a073022-f4d0-4f63-9dd1-8c4b96e8e0c1';
UPDATE public.poi SET linked_badge_id = '14036d1f-f865-4a5a-8c70-591e8b256e25' WHERE id = '6a07af1e-874c-4e3e-93f3-8c5b436853f8';
UPDATE public.poi SET linked_badge_id = '3f5446fd-4a09-497e-956a-e892faffaefc' WHERE id = '6a0be205-debc-411b-b7d2-6ad80f18a448';
UPDATE public.poi SET linked_badge_id = '353429a8-1e91-4eb2-819d-d0bfa2b12f7b' WHERE id = '6a22597f-9aea-4591-9ff5-0068d6a119d5';
UPDATE public.poi SET linked_badge_id = 'e23f77db-ae24-4690-92ca-e0b0b1dcac61' WHERE id = '6a2d00d1-0a5b-4dc5-b540-e79040b70ce8';
UPDATE public.poi SET linked_badge_id = '7499b98b-2038-4b16-bedc-d0ae92a83b84' WHERE id = '6a9084bb-3738-4c36-a811-c67fee3c8dee';
UPDATE public.poi SET linked_badge_id = '042c63e4-0a13-4e69-b9ee-00cbf8ac6566' WHERE id = '6a95b676-68fd-4b61-8081-6eb95003dc25';
UPDATE public.poi SET linked_badge_id = 'be472de8-ca5a-4432-afc3-e7884d0d323e' WHERE id = '6ad8ca03-08df-46ad-ba08-913ec961f30d';
UPDATE public.poi SET linked_badge_id = '5f867125-3a2c-4fce-b148-a2911d0d5a4f' WHERE id = '6b24bfc7-127a-48c7-b744-32550de31fcd';
UPDATE public.poi SET linked_badge_id = 'a36f012e-ea18-4294-93d1-0652946821d0' WHERE id = '6b28a243-fc62-4d64-8b02-60ae5196f0bf';
UPDATE public.poi SET linked_badge_id = '211f8526-63a7-42c7-98cb-de6f0356fdb4' WHERE id = '6b427766-cedb-437a-b6de-cef7bacddf31';
UPDATE public.poi SET linked_badge_id = '60a74f4f-406e-4c4c-90f0-ce2e48a81aff' WHERE id = '6b502e9b-17ab-458b-a9bd-805c358e4af0';
UPDATE public.poi SET linked_badge_id = 'bae851d9-a922-4760-8519-f96cf15dff80' WHERE id = '6b7f4c5b-e1f3-45b7-8ba9-c8c9a3dd262d';
UPDATE public.poi SET linked_badge_id = '1279feaf-0a91-48b5-b02c-d6ddbad3745f' WHERE id = '6b84c139-be3a-48cc-b324-df911127e545';
UPDATE public.poi SET linked_badge_id = '50a33d85-d517-4d87-be9e-aa9c1b18b195' WHERE id = '6b8c78fb-5081-4a58-b687-4d82bcef2f3b';
UPDATE public.poi SET linked_badge_id = 'ebf6a9e0-2983-4fcc-9f7a-4d18cc3862e9' WHERE id = '6b913fe8-3283-4c63-872b-3faa5ade69e8';
UPDATE public.poi SET linked_badge_id = 'fc0a76b9-4d21-4613-a1af-6c20ea434f6b' WHERE id = '6ba18a51-a393-4df6-abf2-a97d5abd2cf0';
UPDATE public.poi SET linked_badge_id = '3690acbf-9d04-41d2-b331-c4d53b543e2a' WHERE id = '6baae3c9-5baf-4b10-b49b-2ab1cdac1d55';
UPDATE public.poi SET linked_badge_id = '12661761-2c8a-4e46-b168-b0eb4e85ec5a' WHERE id = '6bd10336-3119-431b-b26a-443dc342cd54';
UPDATE public.poi SET linked_badge_id = '9a6af789-82f5-4336-a44d-426204b1f35c' WHERE id = '6be78b19-abdc-4cab-84b5-28df3f41ce31';
UPDATE public.poi SET linked_badge_id = 'cf29e08b-5f4f-48ad-8aa5-e1b10e889a18' WHERE id = '6c1a4f29-82fb-4d71-bc41-92e92fb33a51';
UPDATE public.poi SET linked_badge_id = 'e0b8e374-9e07-4002-9814-ef35217179f5' WHERE id = '6c4d5f9e-19c4-4a60-9a19-fa6aa2801f98';
UPDATE public.poi SET linked_badge_id = '831d0c4a-6f9d-4ab6-88c0-a4621c862f0a' WHERE id = '6c642c99-fb17-47cb-85b9-094e9400715c';
UPDATE public.poi SET linked_badge_id = '0b72edf4-8118-4d3e-baff-2fc7081f2d93' WHERE id = '6c75a8cc-ce4c-4b82-964d-6e07c88cc49d';
UPDATE public.poi SET linked_badge_id = '7d6340d2-bc3d-4739-9461-8565cb76b483' WHERE id = '6c7fa0fe-244f-4fb0-b90e-34555e0802a0';
UPDATE public.poi SET linked_badge_id = 'f3072f1d-acef-410c-bd2f-45d52876eb83' WHERE id = '6cb46e32-9f11-4cda-9e3b-96ec87e2546a';
UPDATE public.poi SET linked_badge_id = '8776a41f-6dbd-46d5-a33e-68756ac4654e' WHERE id = '6cd81682-1b27-473a-8439-fd6b0c75766e';
UPDATE public.poi SET linked_badge_id = 'a367a48a-fece-4590-a1fa-3dcb1233dd66' WHERE id = '6cef40e2-f41d-4dcd-bd18-a8deb0285bda';
UPDATE public.poi SET linked_badge_id = '357e73b1-7622-41d8-a848-9051b0c335c2' WHERE id = '6d0e1c63-4b37-4cad-af09-7bf61b578d14';
UPDATE public.poi SET linked_badge_id = '3dc3826f-ad24-4116-b0e4-13d106051137' WHERE id = '6d1b3dd9-1162-41f3-863b-d47c06b9ea92';
UPDATE public.poi SET linked_badge_id = '27a1416c-cfdb-48bf-8527-cb0425fc55e8' WHERE id = '6d1dd99b-95c6-47f9-8f6c-63832309bc48';
UPDATE public.poi SET linked_badge_id = '37b3f225-70f4-41d7-b584-bc28832e9197' WHERE id = '6d270503-068a-4533-b612-afeec83a5959';
UPDATE public.poi SET linked_badge_id = '5a3c0a5f-dd78-4226-8340-783559cbcce6' WHERE id = '6d49216c-d5f3-4f00-a6d4-e32f58233371';
UPDATE public.poi SET linked_badge_id = '206d4820-692d-4825-871f-358da6519777' WHERE id = '6d4b385c-995c-4c14-8cd3-86daac534d7a';
UPDATE public.poi SET linked_badge_id = 'c06b76e2-3ca6-4888-949b-dfadd8e2a91e' WHERE id = '6d5d69f0-61aa-4815-ae57-b0ac96a5fb9f';
UPDATE public.poi SET linked_badge_id = '1508eab1-b240-4c55-a848-71a17307eb97' WHERE id = '6d65aab8-64b9-4b63-aad8-88edc4419a61';
UPDATE public.poi SET linked_badge_id = 'f1bd48d9-8346-4c23-af56-9f4cb5d457a7' WHERE id = '6e455c21-3941-4fcd-adf3-ae6a65bf6e65';
UPDATE public.poi SET linked_badge_id = 'd0b24e20-238d-4b12-a3a5-73e9347f553b' WHERE id = '6e74d90c-7302-4051-b117-296e20055968';
UPDATE public.poi SET linked_badge_id = 'a28fbdb9-6d5b-40d7-990b-adea48c27d1c' WHERE id = '6e8600aa-ea20-4f92-9566-f12f74f10cec';
UPDATE public.poi SET linked_badge_id = '0d84d513-9e01-449a-8801-879eb65d333e' WHERE id = '6ea57896-c8ce-4456-b54e-89417b1efab2';
UPDATE public.poi SET linked_badge_id = '9a71fe06-5515-4bb4-8d1f-db04eff8ffd1' WHERE id = '6f15741d-3232-48a9-9a91-58f0f5b9353b';
UPDATE public.poi SET linked_badge_id = 'afaa0726-88ad-4474-a554-8695ed66c5d2' WHERE id = '6f1e0a29-28e0-41a4-b8fe-1eb2cdb0e67f';
UPDATE public.poi SET linked_badge_id = '9c3aeec5-f740-4633-814e-9baacb05dddb' WHERE id = '6f4214ee-2b46-4c75-a275-2b12baa5fc90';
UPDATE public.poi SET linked_badge_id = 'f7377f62-f39a-468e-8b7c-20bced82c757' WHERE id = '6f4f81ad-bf1b-4ede-b6af-2fa6e1a30eb3';
UPDATE public.poi SET linked_badge_id = '7daab6b6-865f-498e-9780-451c2d27c2bb' WHERE id = '6f9434f2-85e7-4360-9f5b-3835f6af5faf';
UPDATE public.poi SET linked_badge_id = '452fdd46-9f65-427e-88e8-f3347212a69f' WHERE id = '70068830-9ffd-447d-8b4e-857e8cd549c6';
UPDATE public.poi SET linked_badge_id = '50504d2d-470f-4cbd-81fe-d5dff8db31f0' WHERE id = '701e3605-7618-4578-b87f-f00e2f4f6d76';
UPDATE public.poi SET linked_badge_id = '99ed86ba-0d2b-4970-addc-551232208199' WHERE id = '70672351-84f2-4dd8-8468-f835d08c9dc6';
UPDATE public.poi SET linked_badge_id = '10ce6652-1aad-4609-ba6e-33a50ce67a06' WHERE id = '707cfd98-5ea8-42fb-a4e3-d0893a7c4be7';
UPDATE public.poi SET linked_badge_id = '6066f25f-bae4-4796-a927-9e261655667d' WHERE id = '70a13285-28c7-47b2-8aa6-611961e8edaf';
UPDATE public.poi SET linked_badge_id = '5f333abc-5866-48c6-bc34-0be9d5c5e977' WHERE id = '70adb4da-164e-41a3-aea3-fc11e0b66a37';
UPDATE public.poi SET linked_badge_id = 'de7bc7f6-49bc-4032-bf56-6ccad9c0b544' WHERE id = '70ee2606-ec05-44aa-b816-4c90d6c57c2b';
UPDATE public.poi SET linked_badge_id = 'c6fd3e37-1c3d-4a3d-b8ef-646145daceef' WHERE id = '70fec074-2f95-440a-994e-ac338c3ec0d7';
UPDATE public.poi SET linked_badge_id = 'd17d7392-7a99-4633-93ad-af1720442d4a' WHERE id = '71516081-2fa6-4af9-aa0d-fa2fcc241340';
UPDATE public.poi SET linked_badge_id = '0915e99c-80cc-47bd-9ea5-460bf7785ace' WHERE id = '7181e678-25a1-4acb-858b-54222d2fabf8';
UPDATE public.poi SET linked_badge_id = 'de571b97-0aa9-449c-ab96-5cd2d92c1709' WHERE id = '71b51d1b-e232-4ce2-a8e5-2a97b2db0772';
UPDATE public.poi SET linked_badge_id = '4acac0ac-35f4-4efa-b709-90ec0fbb5f3a' WHERE id = '71b86bd9-ac2e-4ac2-8f37-4e17eb8afff1';
UPDATE public.poi SET linked_badge_id = '7c3e7f80-6ea0-4829-b7ba-9017e72f17f8' WHERE id = '71c889da-9639-41c9-b932-7595913dcf3f';
UPDATE public.poi SET linked_badge_id = 'b442fd23-e055-4eb0-85ba-b0d0e948a733' WHERE id = '71cd698b-320c-4842-9077-e54c61895f4e';
UPDATE public.poi SET linked_badge_id = 'b29a5acd-242e-427e-a2b5-b77fefe248a8' WHERE id = '71df25c9-fb35-46ea-91f2-97ee421aa4d5';
UPDATE public.poi SET linked_badge_id = '43a82d19-a3f1-4237-8194-338d82d53ff0' WHERE id = '71fefacc-8b9b-4330-80a6-a5378ba18697';
UPDATE public.poi SET linked_badge_id = 'ad3b92dd-cbe8-4cdf-8bdd-142aadad9568' WHERE id = '72391c82-135d-445e-b5e3-68d02ecd8334';
UPDATE public.poi SET linked_badge_id = '51e77199-3835-4d79-ae96-b5ba94356e24' WHERE id = '728c976d-f2a7-4d34-b250-552822c7b4ef';
UPDATE public.poi SET linked_badge_id = 'b2748844-54ac-4a8a-a6d2-4c3536cab053' WHERE id = '72b93b70-6736-4a42-8e23-fc3376bfccc6';
UPDATE public.poi SET linked_badge_id = '9a8f7bac-05d4-4f71-8ff5-a6b0723435d1' WHERE id = '72ca850e-da38-438b-9c0f-ff362b38b957';
UPDATE public.poi SET linked_badge_id = 'd6a9b5fe-9e96-4fa1-be96-1113817deb98' WHERE id = '72db8c11-5caf-45c0-9542-b448ac20ad17';
UPDATE public.poi SET linked_badge_id = 'add4edbe-50e1-4593-9010-3c129839be47' WHERE id = '732d09cc-4d3c-411a-bd2d-51c745d63fcc';
UPDATE public.poi SET linked_badge_id = '6ae13ef6-b5cc-43bc-b9a9-b5931a33017e' WHERE id = '73c92651-8ef1-4734-8466-f7d13cb6441f';
UPDATE public.poi SET linked_badge_id = 'c1ff1b87-4e50-43e0-bc2e-5fba8206804b' WHERE id = '73d20d02-6783-4f51-9164-6a93943b33b0';
UPDATE public.poi SET linked_badge_id = '027c0793-10b3-4dbd-b611-80299d38a83c' WHERE id = '7435ecb1-0f9a-4675-8824-ba8a73fcfe6c';
UPDATE public.poi SET linked_badge_id = 'b3c4e5b2-5fa6-42d0-9578-f22ae6a820be' WHERE id = '746e47e5-b08a-41f3-8960-85f0a6f34bf2';
UPDATE public.poi SET linked_badge_id = '36d495f1-756d-4a74-bba4-06d8459362de' WHERE id = '748e0712-18c7-4995-a3e9-cd2d47f60cb4';
UPDATE public.poi SET linked_badge_id = 'a796accd-2a85-45ad-91c9-0c1ba0a2a76d' WHERE id = '74b22c36-e396-483c-b169-17cfa094aa8d';
UPDATE public.poi SET linked_badge_id = '958529a6-d3b5-4cb3-8d06-3444d6603edb' WHERE id = '74d0e8bc-6ddf-47e8-995e-4ea30e319405';
UPDATE public.poi SET linked_badge_id = '0f54da5d-dd93-424b-bfaa-2b05d41cdbc4' WHERE id = '74eaa45f-8309-4b7e-bbf1-04896bb07f60';
UPDATE public.poi SET linked_badge_id = '15b70430-b91f-4266-b9fc-19f4684aad5f' WHERE id = '74ff9e88-b4e8-4439-8cbf-565a2366fe8a';
UPDATE public.poi SET linked_badge_id = '868cb107-8387-461a-a84a-168b8966ad43' WHERE id = '7515d26a-7ad1-4547-a50e-b8bc144073d5';
UPDATE public.poi SET linked_badge_id = '8a55ec37-a2c8-4a01-9534-17a1b9b0c2d7' WHERE id = '7530f660-6e83-47af-8ab3-68a1e2a06d8a';
UPDATE public.poi SET linked_badge_id = 'ebbd460c-ec63-44c5-bed3-6f44184d323c' WHERE id = '7534cf81-b710-416e-982f-393657e1936c';
UPDATE public.poi SET linked_badge_id = '5ec64d50-0602-4fab-85b8-c602ae69945a' WHERE id = '754aaff5-ff4e-4244-be25-c3f73607d298';
UPDATE public.poi SET linked_badge_id = 'ecf24ee5-8c4a-4767-aa46-6aa71143b492' WHERE id = '754de342-c259-4fe8-9d86-96913fc05cf2';
UPDATE public.poi SET linked_badge_id = 'ca7ac0f9-0fb3-4808-b105-0eb17a68cc91' WHERE id = '756cdf61-3157-4b9b-ad1a-700afb888f90';
UPDATE public.poi SET linked_badge_id = 'f127df35-31dc-4eff-9bd0-3e3c15342abc' WHERE id = '75923611-b3dc-4853-b1c7-82402d7f1a8f';
UPDATE public.poi SET linked_badge_id = 'a080b656-6f26-4158-96b9-c689acb15fba' WHERE id = '75f9104b-f42a-4ae7-918a-5d75df148afe';
UPDATE public.poi SET linked_badge_id = '5b4574a5-f923-426d-b987-8b19e9140a6d' WHERE id = '76174fb0-a3c8-40a0-8236-44c81aa9fdd6';
UPDATE public.poi SET linked_badge_id = 'b68417c4-736d-4a24-8295-34d9816af107' WHERE id = '765dfea8-4725-47c9-bc7f-7670671bb678';
UPDATE public.poi SET linked_badge_id = 'baa13755-e5eb-4223-936b-e50e78f0c6e0' WHERE id = '768d7c21-31c8-4198-81ed-5fa12f55b72b';
UPDATE public.poi SET linked_badge_id = '376483b4-251a-4f48-bb94-bf2b8bc9b2c2' WHERE id = '7697016a-8219-43f3-98c6-cefb81d172bf';
UPDATE public.poi SET linked_badge_id = '2faaefdd-93ee-4afc-907e-91f996d40720' WHERE id = '769d718e-6d71-4553-8bf3-38483e433b9a';
UPDATE public.poi SET linked_badge_id = '0b0f7d15-09f2-497c-ab74-9590ae43b2e7' WHERE id = '76b20831-4946-483c-8809-22c730adcbcd';
UPDATE public.poi SET linked_badge_id = '99baef1f-b9ab-4503-be0f-bd9036691dd3' WHERE id = '76b8dfe7-eb69-4e61-8c0d-24f7b59165f6';
UPDATE public.poi SET linked_badge_id = '660e5ad7-a33f-419b-8119-128fb4f024de' WHERE id = '76c6d966-8488-4f9c-83c4-acd346158d48';
UPDATE public.poi SET linked_badge_id = '0bd3b011-66e3-4639-8127-6dd4abf57fcc' WHERE id = '76cbcf59-5c4d-4187-8990-557c406a7f79';
UPDATE public.poi SET linked_badge_id = '0fb8856a-0bd7-4064-b5b4-abd3c0004e3d' WHERE id = '76da8cfd-5e1b-451f-9897-ea98fec7240e';
UPDATE public.poi SET linked_badge_id = '32a761fd-7f30-4964-bfaf-0eb4b1a37d2a' WHERE id = '76e66ddd-817a-4f00-9ef7-00f992a49458';
UPDATE public.poi SET linked_badge_id = 'a629c6b4-06b1-45b1-ae5e-95faac77353d' WHERE id = '76fe5d08-9033-4b55-a5b4-ac36d98e1532';
UPDATE public.poi SET linked_badge_id = '09d06f61-d4ed-4814-afee-8369ed13be23' WHERE id = '771b7a80-9c93-45f9-8017-fe9b3f1256ed';
UPDATE public.poi SET linked_badge_id = '090e705a-708c-4597-a55a-518b9d9f786c' WHERE id = '7789af06-40c7-48a8-afa4-7babf55c0cfb';
UPDATE public.poi SET linked_badge_id = 'eb7b7f29-df93-4c69-bf8a-999627514a2d' WHERE id = '77b8eb49-a8a2-4d8b-9ce9-b75548a76978';
UPDATE public.poi SET linked_badge_id = '7312392a-fabf-4b66-a398-cff103845e5f' WHERE id = '78110aab-932b-4146-9bbe-b21b7072fc8e';
UPDATE public.poi SET linked_badge_id = 'd55d0ff2-84c6-4af2-8c4a-4e129821bf3f' WHERE id = '781f9d5c-4697-478f-9acc-34359671a1bd';
UPDATE public.poi SET linked_badge_id = '15ac4249-be19-40fc-ae0d-0b0eb19338bb' WHERE id = '782fe00b-8189-49c2-9473-5ff2901135b1';
UPDATE public.poi SET linked_badge_id = 'f6075b2c-df35-4e93-9714-680bd35930f5' WHERE id = '7842fc1b-ab11-4fe5-a0e8-020dd9986e12';
UPDATE public.poi SET linked_badge_id = 'a8a8b8aa-d831-4048-8e76-b5fcc120148d' WHERE id = '78524ecd-f170-429b-9906-c4ff7ac19345';
UPDATE public.poi SET linked_badge_id = '6a1848c4-419d-4715-b273-de9677d18143' WHERE id = '787ddfad-208d-4c79-92d3-6fc44758ce92';
UPDATE public.poi SET linked_badge_id = 'f2b38c1e-4a51-4dd8-a1f8-dd458bc5ebf6' WHERE id = '7888560f-ed91-4170-8ee7-2e67578bd994';
UPDATE public.poi SET linked_badge_id = 'ac2047d9-6983-4d9e-bb13-55ad841d7922' WHERE id = '78adb7ce-8fa5-4227-8cdd-0772bc2df098';
UPDATE public.poi SET linked_badge_id = 'e5b23ba7-26b7-4c4f-9acf-df65607d52a4' WHERE id = '78cfc8ee-405e-4ffe-b027-d2281d9ff6c8';
UPDATE public.poi SET linked_badge_id = 'f8f28fea-b70d-4387-9657-2b2591cd6d34' WHERE id = '79323ec5-2e5e-4950-9ee9-6ca9022b931a';
UPDATE public.poi SET linked_badge_id = '24e309a1-d872-4b9a-bccc-6a6601b5dc06' WHERE id = '793e275d-4c64-440f-be22-939ea874d91b';
UPDATE public.poi SET linked_badge_id = '34a20e2e-e75f-4b84-aa6b-7b06487da0b5' WHERE id = '7949a2d8-0596-4235-bbae-756aa4251cf1';
UPDATE public.poi SET linked_badge_id = '13a5b3a8-a961-42f7-826b-877aff3ec780' WHERE id = '79828e85-a345-4a4b-9f48-2008c5873fde';
UPDATE public.poi SET linked_badge_id = '1f412eec-abc8-4965-af0d-55fa72198fed' WHERE id = '798a6438-20d7-4356-9fc9-b8fe2e86368a';
UPDATE public.poi SET linked_badge_id = '96bd1c5d-82e1-41bb-ba52-064dfec813de' WHERE id = '79bcd28f-3280-4bd0-a125-8befd061b01d';
UPDATE public.poi SET linked_badge_id = '70f50f11-db31-409e-b523-dead27820eb9' WHERE id = '79c354e3-f18b-4eb3-a577-4325640a86d2';
UPDATE public.poi SET linked_badge_id = '4c3a1ca3-9802-4efe-a9fd-402e9e7b4436' WHERE id = '79eca2a8-f75d-4ec1-8873-4ab81c88a069';
UPDATE public.poi SET linked_badge_id = '54f158b0-9c1c-444f-9ad2-c5ad2d2a62c8' WHERE id = '79fe5af7-dc18-4ba3-843a-f1f8222296db';
UPDATE public.poi SET linked_badge_id = 'a507ecf0-e694-4b8e-9b7f-870d917fe5b1' WHERE id = '7a27fdca-57f9-4198-afae-853443d7972f';
UPDATE public.poi SET linked_badge_id = '5064c653-4ecb-4a20-b029-4247a73696b8' WHERE id = '7a28756a-6b6a-4922-ad85-45efde5ca756';
UPDATE public.poi SET linked_badge_id = '3900584f-08e2-43cc-9cfa-c1e6c5a0f57f' WHERE id = '7a38d3c0-650e-419d-aefb-0bfc69052387';
UPDATE public.poi SET linked_badge_id = 'bd58dbcb-1b54-41c1-adcb-91caa390bf8c' WHERE id = '7a80cc6e-ca91-4271-8216-8e723dea7478';
UPDATE public.poi SET linked_badge_id = 'f6d9656f-6bb2-4fc3-986b-d8679ab53f73' WHERE id = '7a8d10e1-1a39-4645-b052-77c05c746198';
UPDATE public.poi SET linked_badge_id = 'd22b7fe2-c442-42ca-9060-8cd4580630a2' WHERE id = '7a8e6c38-9ebf-4862-9deb-4df6f14d0c3e';
UPDATE public.poi SET linked_badge_id = 'e7a81226-423c-4caa-8af0-432e94630a68' WHERE id = '7aa8e4fb-d5e7-4239-a221-990f45146ed2';
UPDATE public.poi SET linked_badge_id = '8dd844fd-c91f-4787-9e80-6abb63e253e6' WHERE id = '7ab03a05-3e77-423d-b629-d9256a9321db';
UPDATE public.poi SET linked_badge_id = '4de1826f-6461-4fcd-b228-92fadc2dbc63' WHERE id = '7b0a168f-5872-4ce0-ae6f-859db1d211d6';
UPDATE public.poi SET linked_badge_id = '9776b7cf-e917-48f7-a14b-9d3063937e48' WHERE id = '7b0a523a-08f7-4019-a7e0-07ab1125c0c2';
UPDATE public.poi SET linked_badge_id = 'b1d741a8-d801-4fe7-8632-cfec0ca33acf' WHERE id = '7b11a479-65c2-4303-9e7f-1859dc4ca1bb';
UPDATE public.poi SET linked_badge_id = '7fe43719-0db2-46e1-becc-4c7490b0dfa7' WHERE id = '7b3dfd4c-da76-4622-a29b-7b4b28ca5b1e';
UPDATE public.poi SET linked_badge_id = '2570a78c-f5e3-4424-a1d1-2f4bbc5f2953' WHERE id = '7b48daa6-0fe6-481a-b681-dda4b605624e';
UPDATE public.poi SET linked_badge_id = 'd34e4e78-c95c-49eb-a400-b0022dcefafd' WHERE id = '7b4c5d49-3c95-4ec1-b16a-1ccf4173c9b1';
UPDATE public.poi SET linked_badge_id = 'd2a76572-d994-4442-bb3d-cd875559d724' WHERE id = '7b852aed-c3d2-4225-9b29-2863e84d60d9';
UPDATE public.poi SET linked_badge_id = 'f3553c61-2835-46ef-8698-a690419731f8' WHERE id = '7bb13595-7a54-4c9a-b8c5-d51b9d21d88d';
UPDATE public.poi SET linked_badge_id = '6ae766bd-defb-4210-bffb-3c54b1580520' WHERE id = '7bc0550f-e52b-449c-8a64-d93e4c0b4ecc';
UPDATE public.poi SET linked_badge_id = 'f43a063f-0eb5-4445-877b-ac8c7e932f2c' WHERE id = '7beb2b34-0235-4308-a6bc-beec6eb652db';
UPDATE public.poi SET linked_badge_id = 'bcde69cc-94ad-444c-864b-599f93ddfd31' WHERE id = '7c158d48-7de8-4eb4-a461-90344339d4b3';
UPDATE public.poi SET linked_badge_id = 'a784f9fb-4bc7-4d8c-a827-a281fc1223bf' WHERE id = '7c1d5516-0ef8-4bf8-8e2c-8777d3aa73a8';
UPDATE public.poi SET linked_badge_id = '9d9b8266-023a-4db3-adc0-8d38f57391e8' WHERE id = '7c3e138c-3191-47d9-9c9c-79891baaa8b7';
UPDATE public.poi SET linked_badge_id = 'b9fc901b-1391-45c0-befc-c522939d5546' WHERE id = '7c56e3ce-d846-4787-b626-d942b84b0882';
UPDATE public.poi SET linked_badge_id = '1480c052-4bbc-415f-b7c0-67a197c7429b' WHERE id = '7cbeef70-70e8-4de4-aa55-acfd90440037';
UPDATE public.poi SET linked_badge_id = '7e144b02-d8ff-45f8-89b0-20f44ccbc6bd' WHERE id = '7cdba533-f991-4395-99e2-af27f142b93b';
UPDATE public.poi SET linked_badge_id = 'be1c03ba-a2e2-4bde-a98d-c22699003fdc' WHERE id = '7cff2f7b-7e14-410e-baf5-e6973c30af39';
UPDATE public.poi SET linked_badge_id = '4f031c77-0c5f-441f-97c7-f177d0bff18e' WHERE id = '7d0ccc29-f8eb-43a7-ac11-bf47297ddddc';
UPDATE public.poi SET linked_badge_id = '7f7ea408-8cc8-43e5-951a-01b2f1265caf' WHERE id = '7d4f68fb-8c5a-4261-9c57-b3e399e41e33';
UPDATE public.poi SET linked_badge_id = 'e527088e-5c2f-4d79-83e8-052d23667a2b' WHERE id = '7d5f4d33-f9b3-4164-a2fb-2fb0ccb619e5';
UPDATE public.poi SET linked_badge_id = '2941c98d-ee98-4b62-943c-3952499d1b57' WHERE id = '7d98f08d-05d7-493b-a826-fb4883a26aa8';
UPDATE public.poi SET linked_badge_id = '5de6a32c-ec4b-4122-b4a7-c1f397ac37bb' WHERE id = '7dc4a7b2-d92f-4b7b-916f-4b95f866f03c';
UPDATE public.poi SET linked_badge_id = '130861f0-0973-47ec-bce3-ba6632ea6cd3' WHERE id = '7dcbb9d6-7543-4c60-9fcb-45372d8251d9';
UPDATE public.poi SET linked_badge_id = 'c84993c5-b2f7-4b3b-bf52-f16ae01c1417' WHERE id = '7dcfc636-1c6c-45dc-ab08-b0f987899896';
UPDATE public.poi SET linked_badge_id = '542b16de-0dba-4d12-96fd-830108f23d1a' WHERE id = '7dd8f387-9bfc-4e86-a70c-b2f4f5146771';
UPDATE public.poi SET linked_badge_id = '5c53043f-aea3-4a4f-9494-19ebb436e16f' WHERE id = '7df60c4b-1470-49ab-8fb4-a22bb70e0c29';
UPDATE public.poi SET linked_badge_id = '0d4ae5aa-466e-4fde-ab72-6402f759c4ef' WHERE id = '7e39754d-a480-4a30-9ced-018976c0910c';
UPDATE public.poi SET linked_badge_id = '95f04d2a-114a-44e0-ad10-d8df47b22731' WHERE id = '7e64b3ac-71fb-407b-bfd8-ab45c23b330c';
UPDATE public.poi SET linked_badge_id = 'a5f12693-6ba1-4be0-a616-404a47173bbd' WHERE id = '7e6837d5-bb4d-4a8a-9e85-b5bc599395ce';
UPDATE public.poi SET linked_badge_id = 'd7f7f815-2705-43cf-9332-1d44ded111c4' WHERE id = '7e6a1cf4-d50d-4d36-babd-bb0c237793d3';
UPDATE public.poi SET linked_badge_id = '8644a23e-7dd6-4f29-a550-18818b609fe7' WHERE id = '7e7bb766-9d0e-42cb-aceb-b01be5fa2082';
UPDATE public.poi SET linked_badge_id = '8c5a06f0-9c91-425f-85bc-ced2bcdb7a20' WHERE id = '7ec0e422-3af5-4a42-bdcc-5fa03428cd5d';
UPDATE public.poi SET linked_badge_id = '61abb633-0df3-48c7-b6f0-e8733ca59140' WHERE id = '7eed3fb3-c00f-4a06-872f-6540ce11c895';
UPDATE public.poi SET linked_badge_id = 'b12fdab7-d7b5-4c9b-890f-bb01f388b3b3' WHERE id = '7f0ab22e-7c3b-433f-8a19-e608c3e35b79';
UPDATE public.poi SET linked_badge_id = '7e513d80-bb10-485e-9c51-b3338f101036' WHERE id = '7f28129b-df41-4f1b-befc-f84f8561b25c';
UPDATE public.poi SET linked_badge_id = '758d9ae8-4735-461c-961a-4cd98f99e9b7' WHERE id = '7f335a65-a90f-4ac5-986f-ad8b2b55017f';
UPDATE public.poi SET linked_badge_id = 'd29fc5ce-47d2-4ef5-869e-f8411d04b21d' WHERE id = '7f91ed25-0e7e-413f-a687-0390640c2ea3';
UPDATE public.poi SET linked_badge_id = 'e7754a39-3ade-4dc0-967a-12a8da596a9b' WHERE id = '801aba8f-0041-4070-84a1-8d0634151443';
UPDATE public.poi SET linked_badge_id = '5ca977d1-1b2b-4a51-890b-88bb442f743d' WHERE id = '802fa108-14e7-42a2-8ae3-45a5ec476b0f';
UPDATE public.poi SET linked_badge_id = 'df5caf52-7a00-4c3d-918e-cbb5bf45eb05' WHERE id = '80a130db-006b-484b-a65f-23df16cf101e';
UPDATE public.poi SET linked_badge_id = '8fe490c1-7b7d-484c-a0db-f31bb2614c5e' WHERE id = '80aef40f-ddc9-401e-9717-791906a52280';
UPDATE public.poi SET linked_badge_id = '3088886d-0d3b-409f-ad91-22a8f1f5b4f1' WHERE id = '80c39644-f4f2-4ef7-bcc8-7482d4d9f43e';
UPDATE public.poi SET linked_badge_id = '4b57624b-d6aa-4abd-925b-8568c75b5c9c' WHERE id = '811308f5-8f2e-4976-b7af-e7dc99fb629b';
UPDATE public.poi SET linked_badge_id = '56ca2ad8-e662-4b91-92a0-d50b5709b8a5' WHERE id = '81393858-0b7f-477b-a5fa-999ef359bd90';
UPDATE public.poi SET linked_badge_id = 'fd9139f3-3c83-4087-a5ac-19eb83722a7d' WHERE id = '81427ae6-9d13-4ef2-aa70-2f91c20a21aa';
UPDATE public.poi SET linked_badge_id = '616f5790-325e-4f7e-9737-2e40c88428a7' WHERE id = '81c074d9-5abd-4312-98dc-6f84076348e7';
UPDATE public.poi SET linked_badge_id = '532665a6-17c3-492d-a06f-5fa716c6ce20' WHERE id = '81ccbe86-6919-47f6-95d1-a5183f24bced';
UPDATE public.poi SET linked_badge_id = '5d7ca197-fef0-41c6-aedd-206cc0647847' WHERE id = '8222f953-04f1-4c4b-a601-d7bb06ccb5df';
UPDATE public.poi SET linked_badge_id = 'e4fa425d-1ff7-4905-9c78-eb5fc9c4a660' WHERE id = '827c251a-8b61-421c-b1cf-453cc8df0310';
UPDATE public.poi SET linked_badge_id = '5aa5c3bc-af69-4ac7-8aff-22eaa9e43de8' WHERE id = '82bad080-b759-4c33-9f8f-9f5af5762082';
UPDATE public.poi SET linked_badge_id = 'a1d74445-9da6-4d8b-b261-92df8e3545be' WHERE id = '82bf7efe-9cf9-491a-8ad1-0bea4c6b8241';
UPDATE public.poi SET linked_badge_id = 'db932e03-8e8a-4510-bf7a-570744e00529' WHERE id = '82c54cd3-347f-4151-b4d4-5543ac8e6bb0';
UPDATE public.poi SET linked_badge_id = 'da47bd6c-9a1b-461a-927c-32423d72e3c4' WHERE id = '82d0a4ce-f405-4de2-bb16-af086f0f6b9b';
UPDATE public.poi SET linked_badge_id = 'cc4cc7f4-1171-4efe-af18-86120d9da0c6' WHERE id = '8308843d-0b68-45ad-9b81-1171e126f4d9';
UPDATE public.poi SET linked_badge_id = '7997ebe5-fc35-4deb-b800-84bd9206a11e' WHERE id = '833cd6e8-21aa-4131-83d5-9b980a54b294';
UPDATE public.poi SET linked_badge_id = '16e85191-c30d-4346-91d0-23415a026ee1' WHERE id = '83610421-41d3-4225-a89e-ae13c993a721';
UPDATE public.poi SET linked_badge_id = 'd7f8a6e3-ae24-4a10-b1a5-1ef65a3df726' WHERE id = '83b43ffb-d422-406d-bab2-daea2c8e1d72';
UPDATE public.poi SET linked_badge_id = 'd07bdd9c-b0a6-42ef-9e07-c084aa18b98d' WHERE id = '83b7ce4e-011d-42d4-b4f5-44ca3cb8b826';
UPDATE public.poi SET linked_badge_id = '3d9d8667-8ffd-4a20-b87f-ae2720e5e45a' WHERE id = '83bb694e-ec64-4127-8b32-cd529060f75f';
UPDATE public.poi SET linked_badge_id = '6a778263-8b00-41f8-bc87-09bacc12aa6d' WHERE id = '8409a5bc-8f55-422e-9cef-5fa7ddc5cce4';
UPDATE public.poi SET linked_badge_id = '241cb52f-cbd4-449e-8866-f8eb44d58ea1' WHERE id = '8463913f-df3c-46d7-8b99-ea5004dee1b8';
UPDATE public.poi SET linked_badge_id = '8056a617-2bba-4f8e-8764-4776e8270f00' WHERE id = '8463af6b-a3a8-4541-a7c6-ed6f9020307f';
UPDATE public.poi SET linked_badge_id = '983ba248-e8f1-4b31-89fb-114425735432' WHERE id = '846af7e0-7016-4bec-820e-2d9423c47332';
UPDATE public.poi SET linked_badge_id = 'b9a2fcaf-4ba0-40fb-afb9-0ccad725e338' WHERE id = '8470e27d-7953-4508-a828-6b2226c93c4f';
UPDATE public.poi SET linked_badge_id = 'e3df0b46-1ac3-4def-9ba6-7f7abe344953' WHERE id = '8476bc3a-1eeb-43fa-a695-cab35771ad71';
UPDATE public.poi SET linked_badge_id = '522d2087-87f2-4be4-9983-cbbef664fcf4' WHERE id = '84cdffce-37c6-4cff-a6a5-1bd1ccb402a8';
UPDATE public.poi SET linked_badge_id = 'b1abafec-6245-4ecc-9edd-74fa76ab8cfc' WHERE id = '84ecb600-298d-4a59-b579-c3ced47cf596';
UPDATE public.poi SET linked_badge_id = '3c9659d5-298c-4fd5-9e92-a56f82af4e1f' WHERE id = '84f87ec7-5444-4aef-ab76-0b0ed52f8ff6';
UPDATE public.poi SET linked_badge_id = 'c4257933-2c00-47f2-8114-4d6b74b50935' WHERE id = '851cc714-29da-4b0b-b3ca-cc5113651e3e';
UPDATE public.poi SET linked_badge_id = 'd2b27fec-690d-4a57-8802-431dfde24988' WHERE id = '8562f146-6165-4a0b-bf5e-25e8ff68f87c';
UPDATE public.poi SET linked_badge_id = '9d90c677-5bba-4eaa-a19e-d6e5e0dd1596' WHERE id = '856e462c-3c2e-4dd1-b599-a6305429c699';
UPDATE public.poi SET linked_badge_id = 'e315699b-2f75-4ca4-a699-478c6454efa5' WHERE id = '85749cac-e19b-4b68-bd9e-762e04b4aa7b';
UPDATE public.poi SET linked_badge_id = '24aa2e12-e22f-4430-819b-0bea36bd002d' WHERE id = '857cb34c-0362-4452-a62f-3dfff13297e5';
UPDATE public.poi SET linked_badge_id = '37feb4c7-f0bd-49e7-9c3e-941f0d0a4bc2' WHERE id = '85c06fa6-2c10-4989-8973-2df6c195b295';
UPDATE public.poi SET linked_badge_id = '20c3ee33-31d3-4a8c-9f63-4630fe05fc33' WHERE id = '860e371b-7919-4fca-9449-8f6afadc2ed4';
UPDATE public.poi SET linked_badge_id = '0d945cf6-cf0c-4fe4-bef6-a1894dfbb793' WHERE id = '8662b5c6-0056-4b5f-8115-cd93c3b4c3d9';
UPDATE public.poi SET linked_badge_id = '92c7343a-673a-4230-afaa-9a881005f2af' WHERE id = '866f69a4-1d2c-47f9-bbe6-616736c5f229';
UPDATE public.poi SET linked_badge_id = '475a26ae-39c6-4d78-a911-407383ccd042' WHERE id = '867b3779-98fd-4814-b8e0-dae86d4554d3';
UPDATE public.poi SET linked_badge_id = 'cda4e591-95f0-4dc2-b797-f52b1ec97187' WHERE id = '86b08d0f-cf51-46ba-a690-9b6c1f2d67bf';
UPDATE public.poi SET linked_badge_id = '66d29caf-4adc-4dbb-9e29-1bacab2d1f17' WHERE id = '86dbf857-e718-41b7-b2fb-263ca143e3d1';
UPDATE public.poi SET linked_badge_id = 'b1dac9c4-dad0-43ab-91fc-f5d5574ac75b' WHERE id = '874be5e5-d79d-47c1-b3fe-1d9d20f0ac94';
UPDATE public.poi SET linked_badge_id = '54395393-b463-4986-950d-e848ed8d0001' WHERE id = '87d9c727-11ff-4b5f-8691-d8c079200f32';
UPDATE public.poi SET linked_badge_id = '63f18907-6945-43ca-b600-92586ce824ab' WHERE id = '87f15713-de59-409c-80ec-df2c5bf85da1';
UPDATE public.poi SET linked_badge_id = '519bd8f5-009f-4718-81e8-749510c63030' WHERE id = '881ec1a7-7f6a-4d5a-8f39-3f1028b8db12';
UPDATE public.poi SET linked_badge_id = 'ceba0fe8-25dd-4181-9599-b34ad8ed488c' WHERE id = '883e5170-7c06-4c51-aabd-b8df22f8bd9b';
UPDATE public.poi SET linked_badge_id = 'b163ea04-73c3-46fe-aff2-e1eb2c3f16d5' WHERE id = '887e7e43-4322-4eef-8fdd-32b27a0e70fa';
UPDATE public.poi SET linked_badge_id = 'a3f8dd3b-aa8a-43cc-9596-33ec42066b7d' WHERE id = '889dcc84-1da7-4989-bc4c-104e1be7a5d7';
UPDATE public.poi SET linked_badge_id = '9868b432-ec37-404d-a974-a772af4c23f5' WHERE id = '88aa7dd8-e2ba-4cf5-ab20-60508244e5e6';
UPDATE public.poi SET linked_badge_id = '81a725df-2b4c-4fb1-8cc9-ebf9c0f560cc' WHERE id = '88f4271f-5f1b-4f52-a4b5-d8078c17bad7';
UPDATE public.poi SET linked_badge_id = '34f61aa6-cab7-4d24-904f-e4f27e4c06e1' WHERE id = '88f546b8-af0c-451a-a777-35e32b558e1c';
UPDATE public.poi SET linked_badge_id = 'f8c94d24-6ea1-49da-8b6e-db54728d1ba6' WHERE id = '89013a3f-9428-4d7d-8273-fe04124cfde0';
UPDATE public.poi SET linked_badge_id = '72b696df-991b-46ec-b83a-85c065cf2c34' WHERE id = '89259638-a409-4505-bcc3-40d324fcf28e';
UPDATE public.poi SET linked_badge_id = '56629732-6a26-422b-be6d-bcdd809a8ae8' WHERE id = '8944151a-d95a-4d76-bdba-bfee8c2a959d';
UPDATE public.poi SET linked_badge_id = '11e96b1d-a561-4c32-85a2-76f61a76b515' WHERE id = '8947350e-c7f0-440b-9f32-2628351de7fb';
UPDATE public.poi SET linked_badge_id = 'dd738518-4dd1-499d-ace4-d556bd2b3ebc' WHERE id = '894f4f5b-6bb7-45b5-a7c5-b9ff943df0c1';
UPDATE public.poi SET linked_badge_id = 'cbb64910-82d6-4e50-8817-0600086f7fbc' WHERE id = '899d687d-f481-4ffd-850f-c16368b7ef52';
UPDATE public.poi SET linked_badge_id = '6e65809a-19e9-4fe1-9d12-7eef0e6b99d0' WHERE id = '89af2ad6-d4c5-4624-a00d-dbd41d2c7742';
UPDATE public.poi SET linked_badge_id = 'e4d1b5a3-d894-440a-8ec7-73644c20585f' WHERE id = '89c26b17-baea-42af-89c2-1f83e0a31a56';
UPDATE public.poi SET linked_badge_id = '3a72d00b-b1dd-45c0-8238-bbae533ec362' WHERE id = '8a0874e5-a3f4-4661-8a92-ce4d15ce9e11';
UPDATE public.poi SET linked_badge_id = '0b2def2b-abfa-4a2d-bd67-4481060a656a' WHERE id = '8a3caee0-a4d4-4aeb-8522-ae990d8a3907';
UPDATE public.poi SET linked_badge_id = 'f1458d84-dce2-4327-97ff-81640d518c1d' WHERE id = '8a6493ee-f626-41fa-ac6a-e622635f1959';
UPDATE public.poi SET linked_badge_id = 'd9a178d6-372b-4371-a103-4ca169dd75b7' WHERE id = '8a7835df-8b8e-47db-9781-d9f60b2f2b60';
UPDATE public.poi SET linked_badge_id = 'c35a244a-1ff5-44c3-8198-567c27742cec' WHERE id = '8aa3fd67-fe95-4287-bd87-36931ec69203';
UPDATE public.poi SET linked_badge_id = 'e4f2c0a4-ee47-49ee-954f-9759058f2d84' WHERE id = '8aab34cb-a812-48ca-92bb-769f12214c64';
UPDATE public.poi SET linked_badge_id = '2b253c99-7c64-4365-947a-e8488ae19311' WHERE id = '8ac95584-5969-40ae-a57a-e899bc4e7a54';
UPDATE public.poi SET linked_badge_id = 'b67ba6c5-9089-4c3e-b81a-ac6d233ae160' WHERE id = '8aca8d4e-a79a-400d-8052-62081440db34';
UPDATE public.poi SET linked_badge_id = '8786fcf7-9bb4-4233-90fc-e4ee6673eaaa' WHERE id = '8b05a292-b1ec-47b4-b8ea-0de0b9dfedad';
UPDATE public.poi SET linked_badge_id = 'f3bf4204-f9ab-413b-89a0-2af58f6824ed' WHERE id = '8b2e2d64-f12a-4071-b05d-f3ed32c8c82b';
UPDATE public.poi SET linked_badge_id = '704dbf10-b931-4e85-b7ef-7db96ecdae29' WHERE id = '8b6fd800-28cc-44aa-b03f-6ffb81350273';
UPDATE public.poi SET linked_badge_id = 'ccf85392-d227-490d-8a27-9d6222359684' WHERE id = '8b78f4fb-5219-464f-832e-7a21a31b3575';
UPDATE public.poi SET linked_badge_id = 'dcc635b6-07cb-4f22-8dd3-02091e75c321' WHERE id = '8bcb3ff8-aaf2-44a5-8284-5dc88c865c9a';
UPDATE public.poi SET linked_badge_id = '63c49322-211f-42af-bcad-2e2f799399b7' WHERE id = '8bf43627-a05f-4dc8-a64e-218ad20d0c78';
UPDATE public.poi SET linked_badge_id = 'b723ebea-a73d-44d3-940f-816cfb2ed66b' WHERE id = '8c37cc97-5197-4f6e-a943-031681a7001c';
UPDATE public.poi SET linked_badge_id = '456d61b8-7f9e-4892-b3ed-b8e1e8b749e3' WHERE id = '8c9b09f0-7981-4ebf-9745-ff3587b562c3';
UPDATE public.poi SET linked_badge_id = '73bca396-b3a4-444c-8a39-3a589ee49bd3' WHERE id = '8cb49c3c-ffb3-4e7d-90fc-747ee94b42b2';
UPDATE public.poi SET linked_badge_id = 'ebbd0eda-3042-40d8-aa09-8617c4cfa5f0' WHERE id = '8cdba6b4-e209-4eeb-b7c7-4f24d43026f9';
UPDATE public.poi SET linked_badge_id = '2e1be30b-a915-4744-bcb9-2494a474737f' WHERE id = '8ce554b2-c18f-43fa-bb6b-8c7fdb0e36c1';
UPDATE public.poi SET linked_badge_id = '9cc50efa-72e4-4cfd-974b-f547e2d1b2ec' WHERE id = '8d4e25d8-f21d-4797-8ae7-9950f811d20f';
UPDATE public.poi SET linked_badge_id = 'bcb7c5e8-a5e1-4802-85c6-f4a008d64994' WHERE id = '8d5517ae-e802-4219-b491-b5d48967abd6';
UPDATE public.poi SET linked_badge_id = '961eec20-9594-4b53-912f-e5e8df286806' WHERE id = '8d7b1137-f978-4dc0-8fb1-2f51b5235641';
UPDATE public.poi SET linked_badge_id = '6d813c34-9704-4813-a429-82a829f02359' WHERE id = '8d9905ca-cd51-46d7-a8a0-caa1e828e62c';
UPDATE public.poi SET linked_badge_id = '4e5b4f1b-559d-45af-9e15-6d46f78d0f78' WHERE id = '8da8f893-4af3-4f7e-ac86-61ca964058aa';
UPDATE public.poi SET linked_badge_id = '261c9778-6d39-4c0a-ae47-7fe6fccd0c23' WHERE id = '8db44134-58c6-44c6-a2fa-ff42b931bc51';
UPDATE public.poi SET linked_badge_id = 'cbc0535a-85f8-41a7-bef5-47fb41ff16b1' WHERE id = '8dbd9959-7587-4f15-88bc-3dc716ec3b48';
UPDATE public.poi SET linked_badge_id = '1c77be0e-1003-4f9c-a0a7-d680695bd6e2' WHERE id = '8de13ccf-0f4e-4f17-98c7-1721b70da02e';
UPDATE public.poi SET linked_badge_id = 'a42a6843-f7c6-4da7-a5e0-0db2976ef2b8' WHERE id = '8e0b2a4a-eeb6-49b3-b142-48760fdcaefd';
UPDATE public.poi SET linked_badge_id = 'cd4d7f01-2b42-40f0-abd0-22ba4331ae8f' WHERE id = '8e0f0ef1-611c-4170-8558-c2c87118a53f';
UPDATE public.poi SET linked_badge_id = '832a8e2f-d4d3-43b4-93c1-906b10e9f36f' WHERE id = '8e191bed-45bd-4403-b2aa-1529b4a2fcaa';
UPDATE public.poi SET linked_badge_id = 'dc856b15-af6b-4b91-aa55-23bf63e57d58' WHERE id = '8e3e21cf-7b29-4f7e-a9df-93c97c4f06de';
UPDATE public.poi SET linked_badge_id = 'e680844c-61ab-4ede-85b5-19f352759154' WHERE id = '8eaade3e-d857-49dd-b9a4-0cc44105aba6';
UPDATE public.poi SET linked_badge_id = 'a7fae0d8-91c5-4c6a-9ccb-09690d9d5e0a' WHERE id = '8eac8934-9a47-4813-87d6-9c86496f0917';
UPDATE public.poi SET linked_badge_id = '301a53e2-93cf-4e35-a814-64d49f4e5aea' WHERE id = '8f2cb447-a595-405a-9cda-1d773ffdc91b';
UPDATE public.poi SET linked_badge_id = '682134e4-a31f-4e0f-b2aa-e7b86146ba12' WHERE id = '8f43a5e3-6f7e-4356-9973-37063e1d5477';
UPDATE public.poi SET linked_badge_id = '44cc79e2-98aa-4a72-af69-41679d980781' WHERE id = '8f4ed5cb-a422-479c-9b75-54a8466debf6';
UPDATE public.poi SET linked_badge_id = '600000b9-16a1-4f3a-8242-7a62b82ffac9' WHERE id = '8f59b721-238d-4a0b-9005-f46ebee9694a';
UPDATE public.poi SET linked_badge_id = '0e00e7f8-ac25-4b06-a93b-de3a90713e7e' WHERE id = '8f6532a4-92de-41b3-80d0-6737ed929526';
UPDATE public.poi SET linked_badge_id = 'd66b3f89-e29d-4861-8128-0b34911cab21' WHERE id = '8f6b788b-5ac3-4d21-adc2-453f1183f33f';
UPDATE public.poi SET linked_badge_id = '95417100-2396-4cf1-9a46-3928d6d0a336' WHERE id = '8f7932ad-ed19-4f79-a7f2-a12326310268';
UPDATE public.poi SET linked_badge_id = 'f41c1a48-03b2-43f2-9672-280aa3519a13' WHERE id = '8f91017d-cba9-43c3-8466-92e356089753';
UPDATE public.poi SET linked_badge_id = '3751f60e-d612-4bef-a92d-3fa0d9dc491d' WHERE id = '8fb74fce-a2ba-4add-8af3-115f9bee9fbc';
UPDATE public.poi SET linked_badge_id = '8b90e4cc-c512-45f2-beca-9a02107eb382' WHERE id = '8fdf94be-807b-464b-887f-f4b0709408fb';
UPDATE public.poi SET linked_badge_id = '48d90d19-ea5d-47b6-b270-6bce80ce5172' WHERE id = '90331f48-bb28-494b-a980-a9bf9d20a71f';
UPDATE public.poi SET linked_badge_id = '7fa6fb95-a90b-4c57-8ccc-f3029f67c899' WHERE id = '9039204f-13dd-401c-8c64-e3cedb1ab3fd';
UPDATE public.poi SET linked_badge_id = 'e78f1a2b-425c-4b98-9781-135c5c6702fc' WHERE id = '9056e967-de16-4a8a-afd2-2eb95283d96d';
UPDATE public.poi SET linked_badge_id = '71e74b53-2823-4ba7-9ece-52a704a943c3' WHERE id = '906c8d13-182c-4bab-8c3d-047161806025';
UPDATE public.poi SET linked_badge_id = '03b5346e-50a1-4d76-923d-e548f98e432e' WHERE id = '9071e68c-ebef-4d66-a178-a2cf1befa0b9';
UPDATE public.poi SET linked_badge_id = 'db69a8ed-7110-4c1f-a2f6-91d3d4c47c03' WHERE id = '9075921e-d5c5-46d7-a5f9-bf3207343331';
UPDATE public.poi SET linked_badge_id = '4fb338b6-ad5f-4e62-8e38-5fbcb27b9bf6' WHERE id = '908e75f1-810c-4d6e-80e7-9a47a0dfec05';
UPDATE public.poi SET linked_badge_id = '2891c04b-536b-410d-949f-76ea4b10faa1' WHERE id = '9093b794-9438-4235-a028-a4518c8d818e';
UPDATE public.poi SET linked_badge_id = '39289505-bf9e-4bc5-bc24-5277997246a6' WHERE id = '90a8dec5-8fd1-44aa-88c2-5175abe0fd5c';
UPDATE public.poi SET linked_badge_id = 'c2985f17-68c5-4002-8c26-9e5c68eef0cf' WHERE id = '90dffc8b-03c4-4ea8-869f-fb8ba420a554';
UPDATE public.poi SET linked_badge_id = '80bebecf-1062-4de6-a588-4b788b6b9096' WHERE id = '90f7d398-64e8-450b-b352-7e87b890be3e';
UPDATE public.poi SET linked_badge_id = '9168eb25-06d9-4d0e-83b1-12da0fa01c02' WHERE id = '9114573f-0200-4076-9553-739c49b5c5e6';
UPDATE public.poi SET linked_badge_id = 'bc388e5e-5209-474b-89c2-837497fd1d6b' WHERE id = '9120708e-17d9-45b2-9000-b0a4cf8fc107';
UPDATE public.poi SET linked_badge_id = '7f1f4931-a659-4f0b-afa6-e2505e2a996b' WHERE id = '913a1604-e592-4826-b846-37052570934b';
UPDATE public.poi SET linked_badge_id = 'f7917e14-6bfb-458e-a10a-d5f9a139c0b2' WHERE id = '915cc8e8-4bfc-4d73-868e-b895bd149446';
UPDATE public.poi SET linked_badge_id = 'd3da4da1-a195-4603-b7c0-9101d9210f1e' WHERE id = '9199b224-3022-4e56-aca1-0dc5e4184b01';
UPDATE public.poi SET linked_badge_id = '9e48ba60-e939-43a5-b4c5-0d9e692a52f7' WHERE id = '919ed6c2-05c1-4cca-9d6a-2c66ed0e99f0';
UPDATE public.poi SET linked_badge_id = 'b5c4a076-8c69-4766-9f53-84d23dad13a3' WHERE id = '91a7cff4-c46e-4048-9445-79c2415b6078';
UPDATE public.poi SET linked_badge_id = 'd20413e5-2293-4baf-81b0-6ba99cb7f580' WHERE id = '91ddf537-9b12-416f-b6c4-9c7f5fb8013e';
UPDATE public.poi SET linked_badge_id = '587674e1-9556-4af2-8b06-13f3cf66ec86' WHERE id = '91e6e914-eed5-4504-a4fd-807c71d65cc0';
UPDATE public.poi SET linked_badge_id = '07608fcd-a1ed-4213-bbd0-d386d072b9e3' WHERE id = '92331a89-e652-45c3-80ce-9863753d16f9';
UPDATE public.poi SET linked_badge_id = 'f0ffb912-7c69-414a-b61d-541ceb6d090b' WHERE id = '92613d27-4516-4ba0-b86f-fd86f944b2f6';
UPDATE public.poi SET linked_badge_id = 'ec79c8a7-64d7-4b9a-a6cd-4b708f97159c' WHERE id = '926a5ee7-3568-4523-8a60-b58a7afbdeca';
UPDATE public.poi SET linked_badge_id = 'b65a7b18-5067-48a7-8266-858391b9e255' WHERE id = '926b9d3d-977e-4b3f-b6ce-979e34f33cdc';
UPDATE public.poi SET linked_badge_id = 'afee4376-136e-4d9d-81b9-c6e376ca4d3c' WHERE id = '9274e475-03e8-47cb-b4f4-86d2e8c8d612';
UPDATE public.poi SET linked_badge_id = '094735fe-4fd2-4e48-a9c3-56c4b847b6d4' WHERE id = '9283535a-c978-451c-a239-f5ac4191991b';
UPDATE public.poi SET linked_badge_id = 'bc20dbb2-06a1-4b8a-a3c1-f9c3ce8b94d6' WHERE id = '92917d03-7ec7-4a23-8c32-504b3f3be271';
UPDATE public.poi SET linked_badge_id = 'e489e17e-63a7-4c92-ac76-2241863675e4' WHERE id = '92c63824-283f-453d-ae89-63468b32ae7c';
UPDATE public.poi SET linked_badge_id = '010263c6-61dc-4d1f-9cb2-d5389bc8a397' WHERE id = '931d4a3c-8d65-4615-a460-91e4bcacfc61';
UPDATE public.poi SET linked_badge_id = '40a25e90-06de-4fea-8762-6e0399446b94' WHERE id = '9327cd41-253c-42db-8fc9-072a0f038c60';
UPDATE public.poi SET linked_badge_id = 'e5b1870f-7462-49b1-ba76-381cf56902bf' WHERE id = '934c302a-a99f-4c32-8056-d21199ace234';
UPDATE public.poi SET linked_badge_id = 'cbfa046e-d3aa-4cb6-97b7-85cf42bf38d1' WHERE id = '9357cb9c-ccd0-47ba-8361-c022befb2849';
UPDATE public.poi SET linked_badge_id = 'f295445e-3e73-498c-9419-f10a0824aa6a' WHERE id = '938f4496-f12c-4c37-a603-42fe5325ecab';
UPDATE public.poi SET linked_badge_id = '8530cd66-8ee3-4dd0-ab90-8f80698f391b' WHERE id = '93ef5e58-7151-47fc-b619-69318513ffe2';
UPDATE public.poi SET linked_badge_id = '66d75650-e910-43b5-a781-6c0913b8e329' WHERE id = '94507ab3-0a69-40b5-909f-8ff13e4b8910';
UPDATE public.poi SET linked_badge_id = '41439f44-d857-4f7e-890b-7bce022de82b' WHERE id = '947cc26e-02d7-4747-84c0-22cfe5065335';
UPDATE public.poi SET linked_badge_id = '974c10d4-3778-4a8a-bc1b-8f3f71800bd2' WHERE id = '9493d451-cd79-43c5-b40f-9df24d005003';
UPDATE public.poi SET linked_badge_id = '80c30a19-58cb-4426-8322-681d47f47496' WHERE id = '94d26abe-0a08-4c2e-936a-fe03ba902fa3';
UPDATE public.poi SET linked_badge_id = '43bd999a-4db5-4c0d-89ff-f1a7fe497817' WHERE id = '94de49cc-4219-421d-be16-980331438d06';
UPDATE public.poi SET linked_badge_id = '7df82997-8d08-45bc-adaa-2ed7ee743315' WHERE id = '94e325d3-a6d5-4dd0-8c28-c1517c529193';
UPDATE public.poi SET linked_badge_id = '3ab53a17-1903-4731-a076-cd4389818bd6' WHERE id = '9559f599-9a8a-491a-9a31-e46e468d1341';
UPDATE public.poi SET linked_badge_id = '64505784-304c-4e04-bd74-88c08b9cfcc4' WHERE id = '957947c5-1b97-4245-975b-739ff3031e26';
UPDATE public.poi SET linked_badge_id = 'f38ee081-4767-46e7-a78d-536163d5c461' WHERE id = '959800c4-ce87-4093-b82c-38223de8dce0';
UPDATE public.poi SET linked_badge_id = '298daa56-288f-43de-a674-22f5b32ac231' WHERE id = '95a335e2-8f91-41f1-b0f2-999583432d5b';
UPDATE public.poi SET linked_badge_id = '86d4bd7f-c285-4bbe-bd14-0620c5d1dd41' WHERE id = '95c063d6-a0be-4c38-811d-5df4d3a5a220';
UPDATE public.poi SET linked_badge_id = 'ede62567-e7c6-463c-bdbf-3f69d65b8e40' WHERE id = '95e4438c-d41c-4b0a-a0a1-346e4ef7fa41';
UPDATE public.poi SET linked_badge_id = 'dc0e28b0-1d02-4187-8582-2150d3469af9' WHERE id = '95fc6483-3940-48f1-8045-1f377684d81b';
UPDATE public.poi SET linked_badge_id = 'eb7a71b8-c165-4c07-aba6-23fefca44f3d' WHERE id = '96198505-d02a-4923-817e-5ff2243dd6b6';
UPDATE public.poi SET linked_badge_id = 'e8ea03cb-190a-435f-ae9c-1b186c85e520' WHERE id = '9638da7b-2637-4ab8-bfed-31dfd33765d3';
UPDATE public.poi SET linked_badge_id = 'ba1e9d4c-e7bb-49b7-b048-e5b86ee9b825' WHERE id = '967ae728-ad69-4bed-8019-f398747503e2';
UPDATE public.poi SET linked_badge_id = '2852fb1a-8e96-485a-85b7-8fabb1cf52c3' WHERE id = '96843dbb-9478-4f4e-a67e-27cd7f202343';
UPDATE public.poi SET linked_badge_id = '59ab1aa3-6a67-4600-a538-e8572b7ddde7' WHERE id = '968f13f8-b5ec-4939-992b-81ecb1ddd340';
UPDATE public.poi SET linked_badge_id = 'a1c03127-ecb8-4fb8-aa43-3d3af75e8418' WHERE id = '96b1f85d-b171-487d-bc3e-27229d2fe701';
UPDATE public.poi SET linked_badge_id = 'dcad8b95-c7f9-4e8e-ad04-8cb2b857a293' WHERE id = '96e0ee30-3a8a-4326-b0a9-012a0e9d59a9';
UPDATE public.poi SET linked_badge_id = '2170b7e1-8b2c-49cb-83c6-7ff71b35b616' WHERE id = '97035102-1957-48dd-9146-d410bbd34c35';
UPDATE public.poi SET linked_badge_id = '5b30ce1f-a48f-4e31-a76f-7e951c70ab02' WHERE id = '971c87e5-df1e-4e75-a8c7-0430b686ac50';
UPDATE public.poi SET linked_badge_id = 'e5e5841d-03ac-436f-9e4e-f0a9600247cf' WHERE id = '9733d66d-1ad4-4029-b947-4521b41691bb';
UPDATE public.poi SET linked_badge_id = '61d30199-e534-49fd-a282-7ddd06b94f63' WHERE id = '97792ed2-dc8e-4c32-9014-dce6f4e54982';
UPDATE public.poi SET linked_badge_id = '42e8647c-a867-4365-bc7c-28792c454df8' WHERE id = '978c400d-80a0-4820-afa5-25e55f474e3d';
UPDATE public.poi SET linked_badge_id = 'abc8b7bf-bf1f-474c-8935-0f3cd5dda6fe' WHERE id = '97923167-f915-4975-9bee-eab8c1038bfb';
UPDATE public.poi SET linked_badge_id = '62fd13fe-be69-40d3-8cea-5da0de8cfea1' WHERE id = '97dd757b-ed00-4260-a329-d3e39534de75';
UPDATE public.poi SET linked_badge_id = '100db122-fe85-47b3-a15c-7d36c42786cf' WHERE id = '97e2e5b3-e642-469d-8778-4e4e80ec5046';
UPDATE public.poi SET linked_badge_id = '26219af3-76b2-44f1-9791-3d33fc3823ef' WHERE id = '98006c1b-ca1e-423d-b1a4-f24573f6e73f';
UPDATE public.poi SET linked_badge_id = '7cea8edc-574c-4649-80ed-5ee018e42015' WHERE id = '9808b37b-59bd-430c-9621-2ff111b4e442';
UPDATE public.poi SET linked_badge_id = 'ac766463-673d-4737-b913-7135d9c674dc' WHERE id = '980dd279-d17e-491b-b0d8-59e30de3d0ce';
UPDATE public.poi SET linked_badge_id = '666a486b-4f73-4071-936b-9a5f5471007e' WHERE id = '981c5e48-6703-4f89-a406-b6c4743b9f5f';
UPDATE public.poi SET linked_badge_id = 'c45f7d77-1ae9-4496-ae07-100780ef022b' WHERE id = '98679960-5220-435f-9c33-c8680f7d78cd';
UPDATE public.poi SET linked_badge_id = 'e7ae12de-3a7a-4f77-afae-d6246000807b' WHERE id = '986de0dd-7366-4940-8652-88753fa06aa2';
UPDATE public.poi SET linked_badge_id = 'dc4c14b5-80fb-45ec-bb3a-c161bdb3b256' WHERE id = '98842086-14b5-43fc-a10c-36e5e2c62ece';
UPDATE public.poi SET linked_badge_id = 'ad952600-4b37-452e-80ba-a91fb1af00c7' WHERE id = '989d4cac-d3a2-42f6-8d1d-60253be78c42';
UPDATE public.poi SET linked_badge_id = '65891864-dc2d-45ae-a505-bffea883826d' WHERE id = '98ac2324-cb0a-4e04-9f95-c4640f339a81';
UPDATE public.poi SET linked_badge_id = 'dc6fa01a-a3e3-4411-ad8a-7971b204b8d5' WHERE id = '98d04656-cc37-4adc-9485-cec77a8128e2';
UPDATE public.poi SET linked_badge_id = 'b30cb223-8bd8-44c0-aa41-4db7269ba304' WHERE id = '98d6d184-1e71-4cb2-bb0c-ad4f92dbbc6b';
UPDATE public.poi SET linked_badge_id = '96f732ff-abcc-4c74-a6f4-c60d3b45ec19' WHERE id = '98f8913d-a904-404d-9c7f-5d6e644afa8e';
UPDATE public.poi SET linked_badge_id = 'f719be92-e645-42b2-9144-be4e88e0a576' WHERE id = '990a6d17-ff9e-40d1-86d9-5d618d1d38a1';
UPDATE public.poi SET linked_badge_id = '8f3d4f0b-9c69-4566-9e23-2a83c60b1d8d' WHERE id = '990de9b9-9761-4263-a38d-7679376b8d0b';
UPDATE public.poi SET linked_badge_id = 'cad27d3a-67d6-47c8-b6e4-dce45f9f7fc2' WHERE id = '992606ec-c23c-43e1-a864-902c67eca48c';
UPDATE public.poi SET linked_badge_id = '6ecc9ea2-7fe1-4dd3-bc8f-f8be52acb24e' WHERE id = '9937c4d1-e953-4242-86ba-f6bbffb658fc';
UPDATE public.poi SET linked_badge_id = '7e31631a-87a8-4ca7-a67d-4e97a00c1307' WHERE id = '9952cc3b-224b-4cbb-a5f2-64722676f854';
UPDATE public.poi SET linked_badge_id = 'f38dcdc2-27c4-4a08-9ff0-0b74e2a40785' WHERE id = '997c17fb-0588-4077-b6c3-57d7ee68cf90';
UPDATE public.poi SET linked_badge_id = '333e3a21-f1ec-4fc7-a7f2-f9cc10573b87' WHERE id = '99842890-465d-49a7-8287-eaa114cb5c87';
UPDATE public.poi SET linked_badge_id = '98d0e0c6-cff2-4a2f-8b6b-7fb96f57a7c0' WHERE id = '998e8351-2fc1-4301-a34c-ffa37ccaaef1';
UPDATE public.poi SET linked_badge_id = '0e7172c0-6d86-4fb3-b575-6a282c250c04' WHERE id = '99b0820a-1b64-42d4-a6b6-6a7156a63dd6';
UPDATE public.poi SET linked_badge_id = '2f71817d-fadd-43aa-b3ac-74dbed59d074' WHERE id = '99b4a7ef-5b03-4d63-92c5-a708169b013a';
UPDATE public.poi SET linked_badge_id = 'e8ed683f-db74-43f8-93a9-4be539d890a7' WHERE id = '99b935d3-5637-4e4f-bbf6-e745477ba47f';
UPDATE public.poi SET linked_badge_id = '929c1f48-2f5e-41b2-95fe-9abd0c48c1bc' WHERE id = '99bc628d-552a-45ae-9de3-c26e19e7e6dc';
UPDATE public.poi SET linked_badge_id = '7db8f06c-f421-42b6-b71a-13a65daabaae' WHERE id = '99c4a672-576a-4f38-b47a-c2d7141c556b';
UPDATE public.poi SET linked_badge_id = '6355560f-db1e-419d-a747-d00db7a3f287' WHERE id = '99d33fee-c2f0-4ad1-89f1-62073427cf66';
UPDATE public.poi SET linked_badge_id = '95ab83ff-06a6-4157-a120-d48ac5c572a4' WHERE id = '99ed6bd2-6eee-445a-b87f-1de5e2834c69';
UPDATE public.poi SET linked_badge_id = '46087791-cd8e-4f21-8ca7-8e508c5ea560' WHERE id = '9a067beb-692b-4ed2-a477-ac19cfd5320c';
UPDATE public.poi SET linked_badge_id = '07c1b853-eaba-47f9-aeee-321263cda61a' WHERE id = '9a18842e-7848-423e-8e46-d60cf8923161';
UPDATE public.poi SET linked_badge_id = '60431086-da6f-48c9-8717-ee0579daed67' WHERE id = '9a1a08cf-994d-417d-8459-5ad7e8d29877';
UPDATE public.poi SET linked_badge_id = '0407e035-1ff6-415e-8895-626b5872a4c9' WHERE id = '9a1d8b94-5bbb-4860-be44-3e2b96adae26';
UPDATE public.poi SET linked_badge_id = '0ed1c551-baf0-4b2c-91d2-b65f84d70a9e' WHERE id = '9a91eb68-ee57-4abe-92bc-89ce8a1eba48';
UPDATE public.poi SET linked_badge_id = '43a0b7ee-64aa-42ad-85d1-5ca5a5c8a7c3' WHERE id = '9ac96965-f133-4316-93b7-89b3ed975a80';
UPDATE public.poi SET linked_badge_id = 'acba0675-9f7b-4366-b33f-ef7a33b6cd78' WHERE id = '9aeb75dd-21c8-4d40-bee4-672503c68c3c';
UPDATE public.poi SET linked_badge_id = 'faeccd46-53c3-4e81-a5de-f1910bd36c09' WHERE id = '9aee489d-53f3-40b4-aa1e-2cfdd1fbafea';
UPDATE public.poi SET linked_badge_id = 'fb07d267-4954-4086-a76c-9bd580d8bfd7' WHERE id = '9af0af80-1391-4ebe-851a-2531e9a966db';
UPDATE public.poi SET linked_badge_id = 'efd66c28-7afc-430b-b1ad-287338647173' WHERE id = '9b0b236b-4c8e-42ba-8535-07d1b380937d';
UPDATE public.poi SET linked_badge_id = 'ee14190d-e880-4f1f-a9a3-2d504e674125' WHERE id = '9b1f9559-9b6e-4d9f-b73a-6ca4460af618';
UPDATE public.poi SET linked_badge_id = 'e18b20f4-4e88-4beb-b8df-6aa3258b0aa4' WHERE id = '9b2b740a-418f-435e-9040-d9800bd8779e';
UPDATE public.poi SET linked_badge_id = '07c38cd3-7150-49e2-beb5-380365c28242' WHERE id = '9b660b30-c990-4cd9-8274-3a18508f76c7';
UPDATE public.poi SET linked_badge_id = '8d1e508b-d3c9-489d-9ac2-3d208fb7b2b8' WHERE id = '9b69e056-8506-4da8-a850-8d875bf8da0b';
UPDATE public.poi SET linked_badge_id = 'b0cb6aa0-886d-4364-a6b2-dda0a7ceab85' WHERE id = '9b6fb8d1-43d1-456c-9508-c32333913c7c';
UPDATE public.poi SET linked_badge_id = 'b61a4dfd-626f-4d36-bdc4-09a25ade6f85' WHERE id = '9b829591-4b72-47e8-9b3b-877dd5becdbd';
UPDATE public.poi SET linked_badge_id = '93d781b7-2bb8-42ef-a305-ebc26187e91c' WHERE id = '9b8a1a01-016f-4d87-808b-8e7423d49aec';
UPDATE public.poi SET linked_badge_id = '64af6085-1403-4f39-8361-1eb81891fbee' WHERE id = '9b8a4dbf-8a7c-40b5-af03-3a47710abcdf';
UPDATE public.poi SET linked_badge_id = '5b45e2a6-0b88-453d-9184-e8790ca02717' WHERE id = '9b9e47f4-6db9-46d9-9b7f-2eeab0c9f469';
UPDATE public.poi SET linked_badge_id = '03f0f828-3311-492a-9376-d5974c615796' WHERE id = '9bcdf67d-6ebc-44d7-94fd-7bf0f7e834fd';
UPDATE public.poi SET linked_badge_id = '3cf188fe-3d11-49dd-bdd1-2ad6348611d3' WHERE id = '9c0776ad-8a22-4baf-a138-898ce5ded7c6';
UPDATE public.poi SET linked_badge_id = 'c02c006c-c6c9-4516-b038-7231b3e58c56' WHERE id = '9c133bd4-19ec-45b6-8bcf-8a14a2039fa3';
UPDATE public.poi SET linked_badge_id = '007bd2a4-4d49-4f2c-b1de-e52d1cdef8b0' WHERE id = '9c4f9ff2-c1c7-424e-981b-ac9112785c15';
UPDATE public.poi SET linked_badge_id = 'a29b52b5-a78c-4763-87b8-44e953284a03' WHERE id = '9c576aae-8cb5-40f6-99ec-88e27dedc0f2';
UPDATE public.poi SET linked_badge_id = 'e3202781-5792-475a-b53f-d5cc5b0c40a4' WHERE id = '9c5dfac4-9c82-42d7-a94a-56ccfd739027';
UPDATE public.poi SET linked_badge_id = 'a9126325-574e-4568-af90-62f604b41f03' WHERE id = '9c82bc3b-e3e6-457a-91c0-d77d1b92af3a';
UPDATE public.poi SET linked_badge_id = 'd2032b15-1254-4904-9a62-1dd30347505f' WHERE id = '9cbb1862-99b0-4759-91b6-365e39b5d559';
UPDATE public.poi SET linked_badge_id = 'aff5c598-4edd-44ec-ad05-59486a2fa06a' WHERE id = '9cf7c698-1c3a-4f5f-b07e-7166af90551c';
UPDATE public.poi SET linked_badge_id = '96d578f5-b2b1-46a7-9cbc-759eee47a9cd' WHERE id = '9cfe562a-6cdf-400a-af7b-6b0401257044';
UPDATE public.poi SET linked_badge_id = '6abb3692-8ad7-43ab-9f61-9f9f7b4fe267' WHERE id = '9d027094-7c69-4d88-9683-bf88b0791b92';
UPDATE public.poi SET linked_badge_id = '7c4516c7-5a08-443b-b9cf-7105135f22a9' WHERE id = '9d176e30-15aa-46a5-a403-a4942bccb481';
UPDATE public.poi SET linked_badge_id = '92365557-45b5-42e2-b5f7-5de0c41c6251' WHERE id = '9d91d580-522c-46fb-9c56-341a6494c874';
UPDATE public.poi SET linked_badge_id = '851ea0c7-635b-483a-a5d1-042d7ec20ff5' WHERE id = '9e02a498-a664-4548-a10e-fe267cb0cea3';
UPDATE public.poi SET linked_badge_id = '8cac33da-0332-4214-8fd7-ac041f101d99' WHERE id = '9e23110b-a1e0-4849-8e73-8010e938a2c9';
UPDATE public.poi SET linked_badge_id = 'e506e645-1db0-4425-a4a7-1b9b1dc6e6da' WHERE id = '9e2cd5cb-25be-4e9b-ba06-9e77ffda8ff1';
UPDATE public.poi SET linked_badge_id = '2f7b50e7-d304-4302-adec-581788ba7ff5' WHERE id = '9e63282c-0d28-4bcf-a2c8-509e4e71af7c';
UPDATE public.poi SET linked_badge_id = '22a70f51-7403-4436-a342-c6d0b1084aa8' WHERE id = '9eccf356-4c68-4625-b8f8-a5e6a3440139';
UPDATE public.poi SET linked_badge_id = 'e9dff682-0f1e-4d6e-adfe-ef2efb672c04' WHERE id = '9f047f2b-550e-409e-82fa-d1c8713bc381';
UPDATE public.poi SET linked_badge_id = '36114ebc-a67e-48b4-9721-179abef1c206' WHERE id = '9f247825-4262-442d-a2bc-dc9f2db2aead';
UPDATE public.poi SET linked_badge_id = '7c8ccfd1-8186-4966-b23c-e2ed96c6272c' WHERE id = '9f35c77a-f84f-4847-ae75-514e6383ef4a';
UPDATE public.poi SET linked_badge_id = 'c8f3c774-aa23-4833-940c-9977b6678606' WHERE id = '9f3a9467-8726-4f12-8ae1-8224ae9e91e9';
UPDATE public.poi SET linked_badge_id = '5e9fd139-58bd-4771-9be7-0c23eb260b67' WHERE id = '9f44070f-9452-439e-b5e0-cd447be365f5';
UPDATE public.poi SET linked_badge_id = '8170fc49-78d1-4f55-b624-7c543ec8c81b' WHERE id = '9f7f9b8b-04e2-469a-9b98-1cc4837270bb';
UPDATE public.poi SET linked_badge_id = '7602ba06-2258-4c10-af14-4d1af3a47853' WHERE id = '9fa7c7d1-2d59-462c-8e8b-1634512b8ed9';
UPDATE public.poi SET linked_badge_id = '2e31be62-26dd-43fb-93b0-ccfe6b7b0870' WHERE id = '9fac30ae-8260-440a-bf7d-d447d44414c1';
UPDATE public.poi SET linked_badge_id = 'a026b065-e7a2-4124-9246-8dfd308941be' WHERE id = '9ff9f60d-3de9-43dc-afe2-4132a07e9acc';
UPDATE public.poi SET linked_badge_id = '621b1e8f-7178-4f59-8056-ac3e8311a6d1' WHERE id = 'a0014e54-647f-4a6a-8fae-a4ad6421f25e';
UPDATE public.poi SET linked_badge_id = 'd69a71d8-1199-4b86-92c9-6ddb0368556f' WHERE id = 'a0024e62-241d-4431-adec-68bd7f468cea';
UPDATE public.poi SET linked_badge_id = '748a11a8-57ba-4897-836b-362aba9dc0e1' WHERE id = 'a0222bbc-8372-427b-969a-74da194b99f6';
UPDATE public.poi SET linked_badge_id = '444879a6-f6f3-4b3b-8aeb-acbb99aeb1c0' WHERE id = 'a057fffe-d800-46cf-9e5b-96d956a58173';
UPDATE public.poi SET linked_badge_id = 'dcb5d48e-6b5d-451f-ac3f-534f71febc04' WHERE id = 'a0dcbb00-e1b3-47f6-950f-e6db1201cb48';
UPDATE public.poi SET linked_badge_id = 'b9c0c43b-0ccc-4f81-b469-ff13aafce6b4' WHERE id = 'a0e5f999-8ce4-4eea-a260-5f34da56976c';
UPDATE public.poi SET linked_badge_id = 'fd10e412-3ed4-4643-995a-2cf4fe5c6ea1' WHERE id = 'a0f1c796-9204-4f2e-9641-1a42ab6779d6';
UPDATE public.poi SET linked_badge_id = '16591cba-86cc-4071-aef5-d3839c3b4292' WHERE id = 'a1036bba-37f5-404d-bba5-b0f11205bbb7';
UPDATE public.poi SET linked_badge_id = '9cfc9dfd-7c7f-47af-b9ed-fba5d88a98ed' WHERE id = 'a12ba8eb-b31a-4779-9e4f-0ee8faf85fce';
UPDATE public.poi SET linked_badge_id = '83b71b6e-e867-407e-9d0c-0ae51486ee29' WHERE id = 'a162f850-d13e-46dd-b824-3c2bf405afcb';
UPDATE public.poi SET linked_badge_id = '78609436-bbc8-4181-8c86-cdff98113396' WHERE id = 'a1c5362c-288c-4dac-9540-ef7677cc3d2d';
UPDATE public.poi SET linked_badge_id = '374610b8-68fa-4a1e-9fb1-ba3b5591996f' WHERE id = 'a1f9f657-37de-4a70-869d-7a51dfca8b05';
UPDATE public.poi SET linked_badge_id = '0ed4dd2e-430f-45bb-96cc-37fe396f4f75' WHERE id = 'a20943e9-aa7b-44a8-814d-3f53e3b2e29a';
UPDATE public.poi SET linked_badge_id = '643c34a2-105a-4182-991e-af4f3b056e8d' WHERE id = 'a22f0284-c3b3-4cf8-b1ce-b8397de686dc';
UPDATE public.poi SET linked_badge_id = 'f2222402-4eca-4da3-853d-cfe031deb5d5' WHERE id = 'a2336d47-6eac-4ce5-92a2-e0409b36d878';
UPDATE public.poi SET linked_badge_id = '1f2f76c0-a856-46ed-bbb4-a8094158e6d9' WHERE id = 'a255bad0-b555-4dfc-ae7b-d84204c030a8';
UPDATE public.poi SET linked_badge_id = 'ede47fba-7c4e-49bb-bfa6-fbcb13d77634' WHERE id = 'a25eb1d8-407b-45d2-b70f-5d4399255cb6';
UPDATE public.poi SET linked_badge_id = '8310fb9f-9a3c-4a23-ada5-8a6142effe96' WHERE id = 'a2634729-47d8-4e61-a6d2-a55162eef869';
UPDATE public.poi SET linked_badge_id = '9f8ac982-d5ed-42b7-a129-a7dbc6b9b13c' WHERE id = 'a26ad618-0c35-4a0a-bd90-96a916f849d5';
UPDATE public.poi SET linked_badge_id = 'ccc3ff56-1e10-4e0e-b93a-df00831be305' WHERE id = 'a278d399-a3c7-4826-a539-18fb336f5eb1';
UPDATE public.poi SET linked_badge_id = '416730a3-44de-47f9-86e7-8bcc990b6a84' WHERE id = 'a28b70c2-9d5a-462a-b078-3da0cc8da814';
UPDATE public.poi SET linked_badge_id = '122c3724-606c-4f47-9916-d2cfdf7ced3b' WHERE id = 'a2a48a17-919d-42bb-8466-9d0cb0e68709';
UPDATE public.poi SET linked_badge_id = 'ed3bb965-d419-47f7-be60-b375758ba7c2' WHERE id = 'a2ab6985-2e7b-4b18-b6d7-6fa7dbb4709b';
UPDATE public.poi SET linked_badge_id = '4a9d10e3-bcc0-4cdd-8a5b-590da8343359' WHERE id = 'a2acc156-5d1d-473a-9d37-556575920acf';
UPDATE public.poi SET linked_badge_id = '7d79bf41-5aed-4680-98fe-bab426de56b9' WHERE id = 'a2be9800-d7df-4f18-9bd0-449f61343b74';
UPDATE public.poi SET linked_badge_id = '4f765746-93da-4f65-a744-87abf7a5b306' WHERE id = 'a2c3182d-fb62-42e6-99dc-052367d31721';
UPDATE public.poi SET linked_badge_id = '72a90cd6-6678-4c5c-aae4-ff388a9c5b45' WHERE id = 'a2d86106-49f7-4bbe-9f2f-beb89499a980';
UPDATE public.poi SET linked_badge_id = 'e96bbdcd-426e-40de-95f2-a54a74b0e44d' WHERE id = 'a2da90c4-df23-436c-a01c-224b87d90504';
UPDATE public.poi SET linked_badge_id = 'd94c4a19-4627-4a2f-8a34-4a76478f43ac' WHERE id = 'a2e36337-0db2-4449-8cf0-95c88f4c7070';
UPDATE public.poi SET linked_badge_id = 'ca503839-92bb-4eeb-8f1c-1523a843c183' WHERE id = 'a311743f-6db4-406b-b5b1-1afed17e6a5c';
UPDATE public.poi SET linked_badge_id = 'abfb691f-812e-423a-b80f-b9dc943872ef' WHERE id = 'a3134fe0-8582-4f2a-b3f8-587c7f96b086';
UPDATE public.poi SET linked_badge_id = '73164b4c-d32f-4987-875e-3a83fe45f982' WHERE id = 'a33bccd3-138e-480d-91b2-fd1f4bd0601a';
UPDATE public.poi SET linked_badge_id = 'b57cec38-0a92-469f-8402-a3caacadd56a' WHERE id = 'a37b2b89-67be-42c9-b63c-5cf5ae28a66f';
UPDATE public.poi SET linked_badge_id = '7c0fd3e4-87c9-4956-893f-630567c7ec3b' WHERE id = 'a3dc09e0-9c73-4dfa-bd17-0e49bc05e6aa';
UPDATE public.poi SET linked_badge_id = '4b8a8741-1017-4e62-8aa7-15108b45326c' WHERE id = 'a3fd2886-1bbf-40c7-91be-6eb6b07b0343';
UPDATE public.poi SET linked_badge_id = 'd5014b72-5bb5-49bc-9a9b-493b570036c9' WHERE id = 'a41bcaf3-5672-4d97-bd3b-87dacada37dc';
UPDATE public.poi SET linked_badge_id = '911f0f77-30ff-457e-9827-049910f28117' WHERE id = 'a481daf7-d955-432d-a7e9-e1f1124024ac';
UPDATE public.poi SET linked_badge_id = '6d60c901-d060-4bda-8e28-c2b8a193c742' WHERE id = 'a48d25d3-96c7-4302-baa9-72e8547c6743';
UPDATE public.poi SET linked_badge_id = '92c626cf-a161-441f-a205-11e597397d27' WHERE id = 'a48dd0ff-0b38-4d7c-8a02-9564e4937552';
UPDATE public.poi SET linked_badge_id = '309d8611-9a16-4919-8c86-5c6df14954b4' WHERE id = 'a492ee2b-370f-42f2-af3a-a95d5f203383';
UPDATE public.poi SET linked_badge_id = 'cf29e1c4-fe3e-44cf-b1e7-a676ac259fcc' WHERE id = 'a4d56157-c530-4d9d-8957-521fc0272f3e';
UPDATE public.poi SET linked_badge_id = '3dda8ce1-18c6-446a-8b5a-25be572b849b' WHERE id = 'a50070e3-40dc-4b9d-86b5-2d5343baa672';
UPDATE public.poi SET linked_badge_id = 'a09ce3c2-1aea-4f68-8a6f-ee1b743eb434' WHERE id = 'a557526e-ce47-416b-81a1-a1aa257396c9';
UPDATE public.poi SET linked_badge_id = '57e6d227-a635-4897-b377-a1b79e77ebf4' WHERE id = 'a58dbfdf-0847-4c5b-9c70-1e4c520b7ced';
UPDATE public.poi SET linked_badge_id = '7a5c019c-7673-4aee-9677-5235944a1bfe' WHERE id = 'a59d8378-e17e-40c9-88da-cc184ddc8712';
UPDATE public.poi SET linked_badge_id = '457f9760-a3ff-4a3e-b5ed-eb2550ef8c36' WHERE id = 'a5a01d80-585f-4e1e-a219-1a21fedcee36';
UPDATE public.poi SET linked_badge_id = '66d640ed-d906-431d-9cc9-8c0413505890' WHERE id = 'a5cd4013-0eb4-49ef-851d-d47428f27dc2';
UPDATE public.poi SET linked_badge_id = '76d44521-dac5-41f7-be95-0244c4d16b55' WHERE id = 'a5cec718-8514-42aa-9de9-452d164dd21d';
UPDATE public.poi SET linked_badge_id = '46bd555e-92ee-4cc9-8329-95c3d075e6d1' WHERE id = 'a5d9c906-17fd-4c29-8105-1252f2dd9938';
UPDATE public.poi SET linked_badge_id = '776be278-b5c7-4987-a716-aa684ea39d82' WHERE id = 'a5ff55a5-1a70-4791-bf5a-04949149b805';
UPDATE public.poi SET linked_badge_id = '1b959400-064d-4106-b5b7-b5ec6022bce8' WHERE id = 'a627e56b-0226-42e4-bd99-97fbeb3fd95f';
UPDATE public.poi SET linked_badge_id = '0bbbbf5a-353b-416d-b944-c12677c83942' WHERE id = 'a6692bed-ace3-49c9-8a56-b7a471021b4d';
UPDATE public.poi SET linked_badge_id = '8432b989-4d77-4a3d-94ad-6b9e86f1b3a8' WHERE id = 'a66f9ba5-816b-4706-8c1c-bdcd19250be3';
UPDATE public.poi SET linked_badge_id = '68b08cf3-bf12-4089-b5ff-d3bd16fe495e' WHERE id = 'a6a2d645-ab29-4976-af39-5f35a5db8807';
UPDATE public.poi SET linked_badge_id = '783f3589-4a47-44ce-a20b-5899d840b5d1' WHERE id = 'a6a6a9d6-385f-49c7-9997-e7935b215394';
UPDATE public.poi SET linked_badge_id = 'c71d5897-648e-4f11-a480-d190b3d5e6f0' WHERE id = 'a6cfa67a-1276-4149-af08-12648a40b14a';
UPDATE public.poi SET linked_badge_id = 'ab210e6d-306c-4e5f-9a5f-6a05df1d6e28' WHERE id = 'a6d2106c-ad6a-4937-b2c9-f77e49890e88';
UPDATE public.poi SET linked_badge_id = 'a1bacc73-c464-4bc9-bce4-37dd778761ac' WHERE id = 'a6f094e3-62af-4e1e-8537-14252337c554';
UPDATE public.poi SET linked_badge_id = '9bda6a67-8f59-4c56-a401-234aba183296' WHERE id = 'a7044a1f-932f-4b56-8458-0675890d6cc9';
UPDATE public.poi SET linked_badge_id = '6982128e-60aa-4c9a-a820-001ee711b39c' WHERE id = 'a739fd52-ef2e-4375-b03f-960544c0777d';
UPDATE public.poi SET linked_badge_id = '3105a5e0-d2f4-4126-8808-7d0fd05ddc66' WHERE id = 'a77274f6-7321-4672-a2b7-72da17e897c6';
UPDATE public.poi SET linked_badge_id = '05e5635f-f4f5-4213-a864-64f57e434e98' WHERE id = 'a79f144c-9a85-450f-b74b-e658d92d9dd0';
UPDATE public.poi SET linked_badge_id = '400035c5-7f76-4603-8588-58e7d611ac01' WHERE id = 'a7d6f0dc-6345-4617-87f2-43d974bae4aa';
UPDATE public.poi SET linked_badge_id = 'ca92d806-0245-4999-b408-698bcb6083be' WHERE id = 'a80a295b-fab0-4243-9cf5-4f9488bcaad4';
UPDATE public.poi SET linked_badge_id = 'ce5c3bef-8282-46cb-b4d5-75f9640aeb9a' WHERE id = 'a843a9ef-e88e-4cb9-98ab-29f08f19e0cd';
UPDATE public.poi SET linked_badge_id = '40f922b8-51db-451a-b3fd-ad352e36c142' WHERE id = 'a9082842-97d3-4a1a-a3ee-177367a488f3';
UPDATE public.poi SET linked_badge_id = '9a75dea7-f261-49de-855a-3d7c40f34240' WHERE id = 'a91d840c-24ec-4b7a-8e88-e54b07987681';
UPDATE public.poi SET linked_badge_id = '6bc8cff1-6106-4010-89f2-020cce236d74' WHERE id = 'a942ec51-961b-4fdc-9700-836f926d4dda';
UPDATE public.poi SET linked_badge_id = '7dc6bcf8-0e5a-4f3c-9705-aada12a832c7' WHERE id = 'a9665c1b-c16f-402e-a225-8e4f95b432eb';
UPDATE public.poi SET linked_badge_id = 'c03f4655-f677-4b26-acc3-ae7d87b256e4' WHERE id = 'a9784e86-8179-409a-ba8f-cea742b4080c';
UPDATE public.poi SET linked_badge_id = '1d2cb9f7-1430-456e-b3bb-cdc29b649a7e' WHERE id = 'a99ddad2-0dcb-4505-a089-26c8fe692c60';
UPDATE public.poi SET linked_badge_id = '2485f774-e092-4140-8ea3-b50462e9d570' WHERE id = 'a9ebfd50-8600-4c9d-bf30-2a9fd2f13736';
UPDATE public.poi SET linked_badge_id = 'b3b03d8c-b836-4d0c-b392-b967a2e4f086' WHERE id = 'a9f8e15e-a149-4e3b-a9cd-195e8aa60e11';
UPDATE public.poi SET linked_badge_id = '9b646a04-d153-46af-a9e4-4b40797975bb' WHERE id = 'aa0f788c-f5b0-47e7-9b2e-f0a4a5c70da2';
UPDATE public.poi SET linked_badge_id = '56d11247-3d43-4b97-8adc-54d1d9c15102' WHERE id = 'aa459e67-7baf-47ca-8dcb-0cfe22846caa';
UPDATE public.poi SET linked_badge_id = '9360a372-14dc-41ef-8cf9-cf824e847408' WHERE id = 'aa70cb81-0fef-41af-bfc8-b0b77c842a2e';
UPDATE public.poi SET linked_badge_id = '6e9b9684-9085-42bf-8dc4-fcac1565c0fb' WHERE id = 'aa7b96e4-0edd-4655-8e9d-d335992c09e8';
UPDATE public.poi SET linked_badge_id = 'aa323250-3e7a-4a99-8f11-62be8622febf' WHERE id = 'aa928f78-f66e-4ad0-87aa-988074c150b8';
UPDATE public.poi SET linked_badge_id = 'ec8fa99c-dd5d-4cd6-961a-036a7f550c3c' WHERE id = 'aac19561-d82c-4463-b5b2-a47b2353e228';
UPDATE public.poi SET linked_badge_id = 'c6d83964-dc4d-4a99-865d-e7d276fbd1c3' WHERE id = 'aacee662-92b4-4451-9cbb-50c15d0ec0a1';
UPDATE public.poi SET linked_badge_id = '9d3a4684-de7f-4a6b-80c4-91aa50615808' WHERE id = 'aaf93428-192c-4a0a-bfd8-fe5d2b270a6d';
UPDATE public.poi SET linked_badge_id = '86766d95-9ed2-48c4-8d94-b9732387caf2' WHERE id = 'ab228a74-0d24-4f0d-b579-b3f5af2be20f';
UPDATE public.poi SET linked_badge_id = 'd6e2ae45-b643-4051-8e58-c17ab05be937' WHERE id = 'ab3b4fab-2432-4718-997d-aed886c8bd66';
UPDATE public.poi SET linked_badge_id = '20e093e4-0c67-413b-8e8e-82292386ed13' WHERE id = 'ab42e3e0-5620-4d1b-9c2c-6dcc6abda4a0';
UPDATE public.poi SET linked_badge_id = '73604c09-df89-49e1-acdc-94035babbc90' WHERE id = 'ab7bab60-ac87-411a-bb2d-b8f9d3e5ce1d';
UPDATE public.poi SET linked_badge_id = '62543795-f582-4ed1-a387-351fb72f7e18' WHERE id = 'ab851126-e29a-4f56-88a5-04cd7f5d4d42';
UPDATE public.poi SET linked_badge_id = '9c14d61e-8c08-4e65-9832-ba62b9506b9e' WHERE id = 'ab9980aa-7c75-41bd-a28d-f874d90b141b';
UPDATE public.poi SET linked_badge_id = '3415fa53-2d57-42aa-badb-0c8406c9e421' WHERE id = 'abd0d28d-aff4-481d-adc6-b8facc929042';
UPDATE public.poi SET linked_badge_id = 'bcc81f78-5c99-408f-bad4-ffbf24fd205e' WHERE id = 'abdd12f4-b78f-4c82-ad75-a61c35ef56ed';
UPDATE public.poi SET linked_badge_id = 'c13fd6fa-f46f-42fe-92dd-f879a3fdbdd8' WHERE id = 'abf73fef-d569-40ce-b35a-77257f043e07';
UPDATE public.poi SET linked_badge_id = 'dd281068-7bc1-4609-ae5d-9fcf046da626' WHERE id = 'ac255be0-0db7-4881-bf8b-0ca2f4d84876';
UPDATE public.poi SET linked_badge_id = 'e97d74bd-89ae-407f-9de1-1b590174125a' WHERE id = 'ac5bd262-8587-40dd-85ea-f5750b904550';
UPDATE public.poi SET linked_badge_id = 'b018ba57-c350-43ee-8f4f-2e5b0c3539a1' WHERE id = 'aca42350-62b2-4cb0-bfde-41dff531db0c';
UPDATE public.poi SET linked_badge_id = '0a8b2789-7d85-436f-93ed-ba8fdadbfa3f' WHERE id = 'aca857cf-e09c-4395-855c-e22b67164706';
UPDATE public.poi SET linked_badge_id = '2be45020-f576-45d9-8bc1-95c8997b88d1' WHERE id = 'acd06d47-a34c-4fb8-8ace-1efd3c07c071';
UPDATE public.poi SET linked_badge_id = 'f5ee41eb-17c2-4570-98b9-a886f95e8739' WHERE id = 'acd70b77-2eee-4b44-addf-c59e3c8a0ebd';
UPDATE public.poi SET linked_badge_id = '7ea9ecf0-08fe-4f22-a045-3031155397ba' WHERE id = 'acde7702-447b-4931-b653-cf412706171d';
UPDATE public.poi SET linked_badge_id = '93ce1d81-c930-4398-8d55-934f97711c84' WHERE id = 'ad12b7e6-5ae7-478a-a781-bdc88d8aa6e2';
UPDATE public.poi SET linked_badge_id = '946bb972-e7b5-4460-aedf-057ceac50309' WHERE id = 'ad3caad8-8b7a-4c0f-a3c2-52438c372192';
UPDATE public.poi SET linked_badge_id = 'c7624f54-2080-426e-bafa-5a4e4649045f' WHERE id = 'ad5e5fed-0a8e-40d7-9bd9-94cdc7fc9754';
UPDATE public.poi SET linked_badge_id = '405134ea-5d8a-4a83-af32-28c314cbc764' WHERE id = 'adb70360-8299-4634-82f1-be7cf5da50f1';
UPDATE public.poi SET linked_badge_id = '3b0cc341-426a-4059-aa0e-c016126cd97b' WHERE id = 'adbe1f7f-3746-4fa3-beaf-253c208928c8';
UPDATE public.poi SET linked_badge_id = '1c5a09ea-519b-43c2-a5c2-f764c415d464' WHERE id = 'add911f2-6ea5-4f70-ada7-c067df062c5b';
UPDATE public.poi SET linked_badge_id = 'a92a7373-5669-422d-8f9c-370c7f432881' WHERE id = 'add9b5d5-588d-4091-978b-6dd08a689dde';
UPDATE public.poi SET linked_badge_id = '5cd7a6ae-9162-40d9-8c2b-7e5ed34c938d' WHERE id = 'ae1f5533-075f-4535-9c49-e43b4d3e5f9b';
UPDATE public.poi SET linked_badge_id = '42abd708-5354-4384-9914-34dfabc515f3' WHERE id = 'ae324430-307a-46cc-8cda-f3de9fa0df81';
UPDATE public.poi SET linked_badge_id = '85cb1b9c-4bf0-4b39-ad9b-8fcece829ec3' WHERE id = 'ae357391-ab7f-4230-8aa2-93920862457f';
UPDATE public.poi SET linked_badge_id = 'd31d78ee-4788-4094-aace-4d397e929845' WHERE id = 'ae38ee6b-ee07-4b7a-a88f-b4f5a949b816';
UPDATE public.poi SET linked_badge_id = 'aa858ba1-5481-4470-bb0c-da2ea84a923e' WHERE id = 'ae3d5f70-0b34-4b59-b44f-8a26fa7962d5';
UPDATE public.poi SET linked_badge_id = '29dec2ca-d704-42ed-b92c-fbe747a0eb00' WHERE id = 'ae61fef1-df87-4735-a713-ff1a3c27b219';
UPDATE public.poi SET linked_badge_id = '722cf96f-0f0b-4c97-acd4-d0a0fa41b588' WHERE id = 'aea6ec8d-d480-428e-8a0d-647449fd5f43';
UPDATE public.poi SET linked_badge_id = '121651a7-049d-4d81-b0e3-a1b3e6b82ea0' WHERE id = 'aeaa425a-3e38-478b-9bf8-f620570ccf0b';
UPDATE public.poi SET linked_badge_id = 'd62896e5-624f-4d56-9c7c-51917558bc9d' WHERE id = 'aeb2cc0e-8b50-411f-bf7a-31ea337ce406';
UPDATE public.poi SET linked_badge_id = '780783f5-cbd7-4fdd-b1a6-f9aa16b3b811' WHERE id = 'aed6a3d4-af70-494e-958d-8cb89de119a1';
UPDATE public.poi SET linked_badge_id = 'b66d751a-2903-463c-85a4-fce47ce378d6' WHERE id = 'aeff7b73-cd9b-4039-81df-d92a83ee0eed';
UPDATE public.poi SET linked_badge_id = '576b7ea9-1f7d-48a3-809a-d548c5e1348a' WHERE id = 'af4f9959-49f5-4890-bb20-e7656690b3b7';
UPDATE public.poi SET linked_badge_id = 'da3520b1-4e75-44c4-9e9e-597c316d55e5' WHERE id = 'af5731a2-fa00-4b70-95c7-54d3f7c3a8e6';
UPDATE public.poi SET linked_badge_id = 'd3aebdfa-d5e7-4a33-a244-97e501c5f9db' WHERE id = 'afc8df56-5e7d-4b53-9118-977e04b6f513';
UPDATE public.poi SET linked_badge_id = '29b934d8-1ff1-4bdd-b5e9-6197c63dd113' WHERE id = 'afe87124-a808-41ea-8a65-3f04ecde89d8';
UPDATE public.poi SET linked_badge_id = 'c90f52a4-5f4c-4bd7-aece-ed68e68e9638' WHERE id = 'b00119b6-02ca-4e98-9a32-a80fa045e0ca';
UPDATE public.poi SET linked_badge_id = '38947796-d181-4e18-aaba-c935e967d66f' WHERE id = 'b00b5bd3-fd63-400f-97b7-fefc0a8e0d61';
UPDATE public.poi SET linked_badge_id = '98b50b8e-2e4a-4aeb-a060-91a3b357a8d5' WHERE id = 'b022b742-fae9-4010-9c5f-877aea5796e8';
UPDATE public.poi SET linked_badge_id = '35b8a60b-46a7-46fc-9748-1ccea2b8209b' WHERE id = 'b02e69b1-ab0b-4f6f-98cb-347dce7dee88';
UPDATE public.poi SET linked_badge_id = 'e881c5f6-e061-478e-afe0-b72cbf9beed6' WHERE id = 'b02f7fd6-18e9-40ee-ab62-6bc2232ef930';
UPDATE public.poi SET linked_badge_id = '27d5459c-e1bb-4ac9-96da-00af55fc10ea' WHERE id = 'b04be045-8a67-4a86-9b08-d9218a0671f8';
UPDATE public.poi SET linked_badge_id = 'efa2087f-f6e6-46f2-8139-3b203f04d80e' WHERE id = 'b08fe662-4a7d-432c-8c6b-976539105182';
UPDATE public.poi SET linked_badge_id = '736fd25c-2a7e-4770-a22a-f4def614cdc6' WHERE id = 'b0921b9d-3276-4633-90db-2c67e7e3d90d';
UPDATE public.poi SET linked_badge_id = '70e2845f-b6d1-4b2c-8f46-9c482460fceb' WHERE id = 'b142bea2-8122-4881-82d4-2d224866d65e';
UPDATE public.poi SET linked_badge_id = '902aae9f-64c5-48f7-92d3-431a4793d9c3' WHERE id = 'b186fa7f-cdaa-4edd-9355-d93674b854c5';
UPDATE public.poi SET linked_badge_id = 'c075227f-f8f9-4570-a3da-bca177a7e3c2' WHERE id = 'b1e7d880-f4da-466f-aa84-cb6343b9ef33';
UPDATE public.poi SET linked_badge_id = '3d704308-fa5d-4fc9-a176-962b773bf1a0' WHERE id = 'b21ce18d-7316-40bd-9509-7d0d30a06571';
UPDATE public.poi SET linked_badge_id = '49534770-5a0b-4c6e-9087-aba2c7fb1e72' WHERE id = 'b231ed33-cfa1-4fcb-92f2-73e8238f88a5';
UPDATE public.poi SET linked_badge_id = '7d40a4b2-2a4e-44c7-9f0f-493a05b9d10f' WHERE id = 'b2380c51-eeee-4630-baf5-1a3b203b0947';
UPDATE public.poi SET linked_badge_id = '26c2a575-afd6-46c0-ac0b-6270706ff186' WHERE id = 'b27c714f-d411-4110-a9e1-38086f515969';
UPDATE public.poi SET linked_badge_id = '9c7b7b8e-0bad-4655-a76b-cf1d66217c5b' WHERE id = 'b2a05ebb-e71b-418d-a500-7c7cdff3df6a';
UPDATE public.poi SET linked_badge_id = '205d8a29-e6e4-4abb-830f-99460af471f7' WHERE id = 'b2bc63b3-b330-4785-b8e4-40382dd0f9a8';
UPDATE public.poi SET linked_badge_id = '4da6b7d2-fe87-4458-b540-a5d2dd7eda57' WHERE id = 'b2eaa1fe-311e-4a16-9694-e024faee5bf7';
UPDATE public.poi SET linked_badge_id = '2baef46c-f921-4269-9c05-13fd96305d84' WHERE id = 'b31db493-b9ba-431a-8911-1036b662bab3';
UPDATE public.poi SET linked_badge_id = 'd9feadcf-f4d5-4493-888f-eb9b65ee7708' WHERE id = 'b32bf7da-1c6f-4b2c-ad7d-dc9d6ec6e225';
UPDATE public.poi SET linked_badge_id = '064b7af2-74d3-42d3-a513-0533ee3dc254' WHERE id = 'b34d43fa-958a-463d-8378-cca6fe9074c7';
UPDATE public.poi SET linked_badge_id = '9cba304c-87dd-4e9c-a8a7-a15b175ff0bd' WHERE id = 'b3607d48-7960-471c-8114-74212e21cdf2';
UPDATE public.poi SET linked_badge_id = '6a59a216-8936-4278-b1e0-4f7522eac722' WHERE id = 'b3741d17-f2cc-468a-ad6e-2b6b4e068eac';
UPDATE public.poi SET linked_badge_id = '22c06dc0-3805-4002-b019-936233c13f39' WHERE id = 'b379e96e-dc1c-4cbc-9acf-ba7052a1ada1';
UPDATE public.poi SET linked_badge_id = '5fe10e0a-cb82-4309-a7e7-d5c20601b091' WHERE id = 'b395ed23-3477-4edf-b7dc-fb35d490ad6b';
UPDATE public.poi SET linked_badge_id = '31339f9a-53b4-4b88-9af4-10f22971bb66' WHERE id = 'b39dce9a-e457-4992-8dbf-8ce3700006e9';
UPDATE public.poi SET linked_badge_id = 'a004c5bc-e719-4a45-aa09-5db5fd62d9d6' WHERE id = 'b3d9c666-86e0-4aaf-8bfd-1a2c527fd4da';
UPDATE public.poi SET linked_badge_id = '3f116048-6276-48eb-8957-b419a7040044' WHERE id = 'b3da927e-02e4-4ac8-adb8-940372befe22';
UPDATE public.poi SET linked_badge_id = '9ea4e1b0-7bdc-4df4-b8eb-f2a4824fec94' WHERE id = 'b3f51032-a009-4e22-857d-41f761b34575';
UPDATE public.poi SET linked_badge_id = 'b1aa363d-df3c-473b-bc51-983688557fd7' WHERE id = 'b4197fcd-5516-43c0-87dc-dbccd6dffc3f';
UPDATE public.poi SET linked_badge_id = '64173c5d-64ff-4058-a16c-c62817b4e4ae' WHERE id = 'b4264bad-caf3-4214-bee7-5d41f10f33f8';
UPDATE public.poi SET linked_badge_id = '8400c6d4-e58e-4ec7-a98c-4f6f76affe98' WHERE id = 'b4563af6-7723-4e66-aa84-7c76e1014583';
UPDATE public.poi SET linked_badge_id = '0e07f039-12f7-40fd-844c-2f9e7ae27b9b' WHERE id = 'b4744bee-24e4-4993-a252-d9d9a33650e5';
UPDATE public.poi SET linked_badge_id = '9cd5e7eb-00b4-49cf-9996-8d04c453c310' WHERE id = 'b4901d36-3f00-415e-a08e-61d9194370f7';
UPDATE public.poi SET linked_badge_id = '537ae578-51d4-4f71-871e-94c6d63f44ca' WHERE id = 'b4cb2caa-3960-45a9-9f92-7fd88fbe9886';
UPDATE public.poi SET linked_badge_id = 'd2d3d6bf-365a-46c7-8172-fdaeb9e5edad' WHERE id = 'b504efc3-099e-4480-823a-44da5c40cba9';
UPDATE public.poi SET linked_badge_id = '99fb833c-fae2-4e08-bb9c-7788b86008f5' WHERE id = 'b53df356-ba6e-41c2-922a-dee700a9f719';
UPDATE public.poi SET linked_badge_id = '45fc5a7a-6fa1-4616-a796-701820b092f2' WHERE id = 'b56ab8f9-0d71-4ff7-8512-7070f50e5bf4';
UPDATE public.poi SET linked_badge_id = '684b354d-3c55-4f58-95ad-e8abb4e38de3' WHERE id = 'b578b712-2aac-4dbc-943d-c580b584e6c9';
UPDATE public.poi SET linked_badge_id = '95f7d1db-0b80-40a6-a037-93fc1d7c9c48' WHERE id = 'b581995d-8691-4f80-aefd-2042ec997bf4';
UPDATE public.poi SET linked_badge_id = 'f419e7e1-f3e0-4766-a4c1-af5e9dfc69c4' WHERE id = 'b5c15d3d-faea-4653-a4cc-c712af6353cd';
UPDATE public.poi SET linked_badge_id = '2dd17cbf-f285-4df3-ae51-0fa84bfb092a' WHERE id = 'b647632c-5d35-492b-8b7e-f34a7671505c';
UPDATE public.poi SET linked_badge_id = 'b8fe6afa-c40a-4986-8b57-e0b0055baa70' WHERE id = 'b6488d6d-761a-4ef1-b1fc-d0327bdd3211';
UPDATE public.poi SET linked_badge_id = '1826f3b8-73b4-436f-bbb0-e1191779b0db' WHERE id = 'b64cc533-3853-4869-9257-1be417062399';
UPDATE public.poi SET linked_badge_id = '3accd303-e7c7-4663-b82d-94760050d517' WHERE id = 'b664ea25-b395-4f27-8a9c-8166e0b97b80';
UPDATE public.poi SET linked_badge_id = 'dfd5d2be-bc1c-4a29-9c34-e7897b73533b' WHERE id = 'b66a673e-e8fe-457d-9564-9a36103011e3';
UPDATE public.poi SET linked_badge_id = '6d8b8aae-ed0d-4e73-9785-b89e8843da35' WHERE id = 'b67051f5-aa56-4d10-9ebe-146773984ba9';
UPDATE public.poi SET linked_badge_id = '5af1a733-abb8-449e-bc96-20ee873ea1e8' WHERE id = 'b6b8366d-4b0c-467d-9c9f-09baf51c4dd3';
UPDATE public.poi SET linked_badge_id = '69b24d79-0efd-453a-bb53-07aa4b9b817b' WHERE id = 'b6f255c2-37d0-4f10-bdef-af6fead35e95';
UPDATE public.poi SET linked_badge_id = '592c5d0a-d299-410a-9da8-edaaab6fd287' WHERE id = 'b7198ad1-aa32-48a1-b23a-15637a1d52b8';
UPDATE public.poi SET linked_badge_id = '0102199c-f42d-4d71-913f-482643ba51fd' WHERE id = 'b75e32b2-7a0d-4375-a715-32aa2b770206';
UPDATE public.poi SET linked_badge_id = '2da257a0-51e0-4a96-84a8-d1f162cb91f6' WHERE id = 'b76bf46a-2f4f-424a-b645-2a33dc006953';
UPDATE public.poi SET linked_badge_id = 'd4072374-6216-4a32-a20e-dda3eda54591' WHERE id = 'b7884621-29b9-46b0-8815-f2ffb9aa80cf';
UPDATE public.poi SET linked_badge_id = '0c9adce8-fb7e-4643-931d-078e069529c8' WHERE id = 'b7c539e2-416b-42bc-bfa4-8fe5bae6e9f8';
UPDATE public.poi SET linked_badge_id = '4464986a-254e-43d3-a15b-e123438065ab' WHERE id = 'b7f0002a-05e3-433e-9830-8c49739f95f7';
UPDATE public.poi SET linked_badge_id = 'b0761f8f-a131-43cf-b518-bfd693b4d9ec' WHERE id = 'b7f89af4-b414-4222-afaf-9fa7472bb2d7';
UPDATE public.poi SET linked_badge_id = 'cdce084a-00d2-4871-ac22-9d8ef5fc88fc' WHERE id = 'b817ab76-99d7-4422-98dd-5b387cc137b0';
UPDATE public.poi SET linked_badge_id = '88915419-9688-4820-9826-fce3f825ec29' WHERE id = 'b826c411-cc2c-45a9-86cc-b2bf2c5aa2ee';
UPDATE public.poi SET linked_badge_id = '6b10e428-2d13-4c15-a948-dda419760fec' WHERE id = 'b83f3096-ce8d-4f11-9d8c-d63bd4b45f7b';
UPDATE public.poi SET linked_badge_id = '1392b79c-c568-44d3-a042-7011883fc7c7' WHERE id = 'b85cd6ea-7700-4991-96d2-75ebb8306f44';
UPDATE public.poi SET linked_badge_id = '3bb378f1-295d-4225-bb07-ee87dfe44c75' WHERE id = 'b86267e9-944b-4cd0-beac-777db519d475';
UPDATE public.poi SET linked_badge_id = 'cfecdc1a-ad77-42fd-b428-79c748b77074' WHERE id = 'b878a1a5-6c00-4f9c-bd1a-1783a705e07b';
UPDATE public.poi SET linked_badge_id = 'ebb14fc3-ecbe-4197-a0e5-05b91b2a9e39' WHERE id = 'b8d9cdfd-9f50-42d6-ba91-6c22d379d470';
UPDATE public.poi SET linked_badge_id = '04239347-11bd-41c0-bdb0-3c47d26829d5' WHERE id = 'b93172f1-4d67-4485-b117-6d0e4e8cd5e5';
UPDATE public.poi SET linked_badge_id = '16ebf0aa-fa73-4f2a-a739-6d7dcea22eed' WHERE id = 'b93c9e1c-9e5a-4d32-83f4-f7529ff420a7';
UPDATE public.poi SET linked_badge_id = 'be19c2c0-9537-42be-af08-1e93468a62d3' WHERE id = 'b95ed618-c350-45ca-89f0-052354167aaf';
UPDATE public.poi SET linked_badge_id = '67c85dcf-cc95-4a77-8cb8-b792f0b6e47d' WHERE id = 'b9751709-cade-416e-b1ee-ae924d4e3164';
UPDATE public.poi SET linked_badge_id = '6a7b03f9-7a38-4811-bf57-afb2be96523b' WHERE id = 'b978b577-f42c-4c4d-9735-23b19a076a70';
UPDATE public.poi SET linked_badge_id = '9d96fa20-8940-42c5-a6c9-7128d0783c74' WHERE id = 'b9798ef7-3b09-411b-8db5-e87cbcc92809';
UPDATE public.poi SET linked_badge_id = 'd52e3bb2-34c0-4a02-bd78-dbddfb7e605b' WHERE id = 'b97ec192-c96f-4405-9924-a28d6cc8ea55';
UPDATE public.poi SET linked_badge_id = 'b6ec0e32-5447-4997-9f2a-d1c0c923d056' WHERE id = 'b981c050-66c0-437e-849f-52488b74a0e0';
UPDATE public.poi SET linked_badge_id = 'ef3c39f7-c7ef-4994-82f8-b84ced3fd6f8' WHERE id = 'b9889d61-7199-4bc4-a1c2-3a68b230dc04';
UPDATE public.poi SET linked_badge_id = 'aa867d62-df3e-4d7e-a0f0-dac01508dc9b' WHERE id = 'b9971c80-5f1b-4a77-96eb-8751b3394417';
UPDATE public.poi SET linked_badge_id = '26d513de-efb2-4b97-9cb7-fbc1941a9c73' WHERE id = 'b9b7917e-e560-4022-b6ad-3387f48484de';
UPDATE public.poi SET linked_badge_id = '59067564-0d3e-4399-91dd-89d8c51c2531' WHERE id = 'b9c68dad-1dca-4cd6-ade9-cffe98becfe2';
UPDATE public.poi SET linked_badge_id = '12a6d8d6-e8ff-4128-9f1c-9f9caca79560' WHERE id = 'ba2b1e76-2cdf-4d41-91ea-d07965ff0764';
UPDATE public.poi SET linked_badge_id = '83117c84-a6bd-49ea-84a7-a257cb3e70c4' WHERE id = 'ba3059bf-34ec-4dfc-89d8-7b5433a768ca';
UPDATE public.poi SET linked_badge_id = 'afae86c1-59e1-4a32-b7de-539a2568671f' WHERE id = 'ba32d229-64fd-42e4-9712-5a8ba287f948';
UPDATE public.poi SET linked_badge_id = '532286c2-63cd-4ae4-82ec-77a8422007ef' WHERE id = 'ba45db6e-483d-42e9-a07a-817b67d2e994';
UPDATE public.poi SET linked_badge_id = 'babc0695-6a6e-4d72-aa93-27196575eb7f' WHERE id = 'ba5bf939-364b-42f1-adc2-3adcc66d3c3b';
UPDATE public.poi SET linked_badge_id = '0409f73a-63ef-4c49-8701-97f321376c67' WHERE id = 'ba674b4c-52dd-4487-9a46-f4422bc52064';
UPDATE public.poi SET linked_badge_id = '96581f9d-6dc2-479f-907b-8173f32ab661' WHERE id = 'ba86278f-3654-41bf-b9ed-46d82c7d3198';
UPDATE public.poi SET linked_badge_id = '2b01eec5-6cf5-4b0f-8c87-2fcda1e2b14f' WHERE id = 'bac9abfd-1585-4ada-8a36-739a4e04125a';
UPDATE public.poi SET linked_badge_id = 'df83db5f-0779-48e0-b9d0-65c36b47064d' WHERE id = 'bacf0e28-86a6-40fe-8190-287191e60eaf';
UPDATE public.poi SET linked_badge_id = 'c888bb0a-899f-434b-9854-4817348f582c' WHERE id = 'bb070af1-6ace-4f11-bcff-4814e0ca02bb';
UPDATE public.poi SET linked_badge_id = '2a3b5510-bf56-4a3f-91ed-750ec471d97d' WHERE id = 'bb373b22-4364-4702-8b16-270703e1699c';
UPDATE public.poi SET linked_badge_id = '1c128559-6bbc-4e2b-be3b-20f7b50ac0eb' WHERE id = 'bb733bb2-f257-4fe4-a12b-467e91a1bf02';
UPDATE public.poi SET linked_badge_id = '393cf0d6-8680-4215-90e8-60e9dda909fe' WHERE id = 'bb8f557c-b79d-4ad1-a42d-b95f014edd43';
UPDATE public.poi SET linked_badge_id = 'd0d669d8-5944-4378-994f-66b97e2f2955' WHERE id = 'bc02d8a2-58f1-4e05-b65c-12e1b8616ffc';
UPDATE public.poi SET linked_badge_id = '3f60ad0d-1923-43c6-9d42-94c068aadbd9' WHERE id = 'bc3072b9-0e4c-4ea6-a6f1-2da7a849bc62';
UPDATE public.poi SET linked_badge_id = '4ddcfa3a-9a68-4fbb-98f7-d06827278acd' WHERE id = 'bc6e1f74-16b9-4d25-86d6-eb698609e0c1';
UPDATE public.poi SET linked_badge_id = 'f15257d6-7d71-4abc-ac01-a458375d6ccf' WHERE id = 'bc7be56a-c896-43a6-8f5f-d87dba4fb77b';
UPDATE public.poi SET linked_badge_id = '81e6a14c-4ac6-4b5d-b9c3-45bcbd60af6e' WHERE id = 'bc8e30d7-398a-4e60-aceb-dd1492e011cd';
UPDATE public.poi SET linked_badge_id = '98818328-4316-4eb8-bfae-7530156b3043' WHERE id = 'bcbb8654-9267-4cab-baca-2469ab1f93d6';
UPDATE public.poi SET linked_badge_id = '83c63dda-b487-4235-aa35-fe9b687c5414' WHERE id = 'bd0d4c48-e442-4ced-8547-0fa601728ae8';
UPDATE public.poi SET linked_badge_id = '70698188-2879-46ee-beb2-c05663020b3f' WHERE id = 'bd23f8d6-1a35-4989-9648-fe9b200c3f20';
UPDATE public.poi SET linked_badge_id = '77d4222e-8e73-4e83-8dc4-05d1680fd539' WHERE id = 'bd34d697-ac7a-449a-a59c-899569e9c688';
UPDATE public.poi SET linked_badge_id = 'ef9b120b-f848-487c-81f9-092131a5294c' WHERE id = 'bd60c349-3eab-4db6-825a-18b3a56137f9';
UPDATE public.poi SET linked_badge_id = '229b034a-f2b3-4d1a-97cf-ab5ca3d183cd' WHERE id = 'bd67eaaa-0e11-41bb-9b60-4e8e01519f29';
UPDATE public.poi SET linked_badge_id = '42ed6673-8568-4f2b-a759-9f69e3756b99' WHERE id = 'bd77d5a7-c5e4-45a3-8821-d0019657cae6';
UPDATE public.poi SET linked_badge_id = '94956023-6f20-44f0-b965-60649ae1220f' WHERE id = 'bd9d3029-7e9e-47fb-ad8c-83c6b5c17c8d';
UPDATE public.poi SET linked_badge_id = '4ba6fde2-3541-4074-aa2e-eeed3c77b29d' WHERE id = 'bde3b338-141f-4c81-b6af-e24ac87382b3';
UPDATE public.poi SET linked_badge_id = 'de113d4b-dc1e-4df6-805f-526134a9d882' WHERE id = 'be8ceed8-49b9-47de-baeb-0a1a737bad53';
UPDATE public.poi SET linked_badge_id = 'a9031fdf-5630-4c65-ab79-53ae6a8eba94' WHERE id = 'bf08b4a6-cb95-4baf-9cb3-5c344c4b3116';
UPDATE public.poi SET linked_badge_id = '5d357d31-b694-4b8d-8a50-6c0f81655aa2' WHERE id = 'bf0d3429-b0e6-4054-aabf-7d07d9f20cc5';
UPDATE public.poi SET linked_badge_id = '8f66a1ad-e7e4-456e-8702-4398bb390325' WHERE id = 'bf3a5efe-fc9d-4c8d-afd8-89909349de3a';
UPDATE public.poi SET linked_badge_id = '4cc2eb13-9c3f-4fe7-8dd1-832eef92db60' WHERE id = 'bf41b92e-f414-4af9-a669-9c2fd8bed2ff';
UPDATE public.poi SET linked_badge_id = '7593006b-e504-498b-860e-ef63a3bdab1a' WHERE id = 'bf758c03-bf09-47ea-a7c2-b47886093008';
UPDATE public.poi SET linked_badge_id = '2b4cbf7a-b649-4a00-9fa0-e909fd9e80f0' WHERE id = 'bf893aa5-dca3-428e-bf2b-2ab1efbce99d';
UPDATE public.poi SET linked_badge_id = 'b66415f5-34af-4c12-96d3-fe6eb572ecee' WHERE id = 'bf9126ce-e3d6-4349-b0cc-61c866bb8971';
UPDATE public.poi SET linked_badge_id = '0bcbe5ce-b78c-4558-822e-5e7e360bf6b6' WHERE id = 'bf96ece1-6244-4117-9d11-e747e211f57c';
UPDATE public.poi SET linked_badge_id = '17378579-0673-4f7a-b61b-1196940f790c' WHERE id = 'bfa042c6-5e52-47da-81a5-9f40d9f94c6c';
UPDATE public.poi SET linked_badge_id = '0ab28d52-55ae-430d-94d1-68a03c0799f2' WHERE id = 'bfb5e390-8bac-4984-bf83-41fa5e598981';
UPDATE public.poi SET linked_badge_id = 'bf6b8f96-3d36-4a6b-bb21-08ffafd1a9ca' WHERE id = 'bfb90f14-1818-45b3-a30a-c2221e9ac3dd';
UPDATE public.poi SET linked_badge_id = '90ecafde-2187-49e6-b94e-a782b5289f97' WHERE id = 'bfe44fdf-0566-434f-a285-dca9bd05e8e1';
UPDATE public.poi SET linked_badge_id = 'afa20238-c486-4fd0-894f-483d458a580c' WHERE id = 'bff323fc-659e-4719-a328-ecfcfdeff080';
UPDATE public.poi SET linked_badge_id = '325d537a-99e5-45c6-b213-b3e4d195d308' WHERE id = 'c006a7eb-99e5-4e60-94d4-e625dcee7c2a';
UPDATE public.poi SET linked_badge_id = 'cdf34d73-6f34-4109-85d9-89147b21802c' WHERE id = 'c0180a37-a5e9-4a1c-8f37-a8acc8120724';
UPDATE public.poi SET linked_badge_id = 'ec7dcc17-2c3b-4abb-bf28-69983ba72afa' WHERE id = 'c0478428-c5fa-41a3-bfbd-0f5ccf89bf9a';
UPDATE public.poi SET linked_badge_id = 'ba6932ca-21b5-4392-9c6c-98689846b58f' WHERE id = 'c054bdd9-6573-4640-88a5-69d3ed782753';
UPDATE public.poi SET linked_badge_id = '31e6dee2-4ef5-4c44-8aef-207cff43600b' WHERE id = 'c05b224d-8fb0-4634-9899-e2f1d3f3c160';
UPDATE public.poi SET linked_badge_id = '66434e2f-7c08-498e-aee9-96a9e4ddf198' WHERE id = 'c090904f-ba1f-4e6a-a786-be25d9317dc3';
UPDATE public.poi SET linked_badge_id = '857b0622-762d-4837-9451-02471fe1a547' WHERE id = 'c0deefc2-a248-46b5-93e5-2130720cddc0';
UPDATE public.poi SET linked_badge_id = 'b7830f6e-fe66-465f-bb21-7dc64631abb5' WHERE id = 'c1014031-6425-4857-beae-491998a787b5';
UPDATE public.poi SET linked_badge_id = 'c6ddeeae-bf17-4fc8-b471-eb74b9399509' WHERE id = 'c128ed23-a728-4c0f-9201-ff7e29fc1a0b';
UPDATE public.poi SET linked_badge_id = '456e0591-cc29-4760-9ff5-a406b037eef9' WHERE id = 'c139b808-6d89-4d9e-bac1-263145bca088';
UPDATE public.poi SET linked_badge_id = '3c647878-2e88-493e-9a88-be0ce00f35c3' WHERE id = 'c143ccdd-85d8-4767-88e4-2dae1e382937';
UPDATE public.poi SET linked_badge_id = '4863f4a4-42c0-4c1a-b6d2-78d380a95bf1' WHERE id = 'c1e0a3a0-95d9-4bb0-a646-dedbd94df047';
UPDATE public.poi SET linked_badge_id = '2b8db362-6f2c-476e-a8c7-8a3416764230' WHERE id = 'c1fad199-7561-44ed-bae5-a003af3be397';
UPDATE public.poi SET linked_badge_id = 'c9c8e3b0-0f28-42e4-9f5d-748f8cb696ea' WHERE id = 'c25e67b7-fcb9-414d-bd7a-db4ea16e06d3';
UPDATE public.poi SET linked_badge_id = '296be2f0-d17a-4f45-83d1-0a55cacfcd7b' WHERE id = 'c26eecb6-d4fb-4827-96e4-1e0025d445d7';
UPDATE public.poi SET linked_badge_id = '60094db0-6ee9-4f92-a385-1c77ceac4e29' WHERE id = 'c26f4058-0092-4c98-a029-1b6c17d89006';
UPDATE public.poi SET linked_badge_id = 'd54347ec-a125-4875-af87-b58ce8ea7799' WHERE id = 'c2bc651b-68a1-4d62-a743-98a5ed7c511e';
UPDATE public.poi SET linked_badge_id = '9f839eab-65fb-4570-9836-6d6e67f162a3' WHERE id = 'c3a5a04b-8039-4966-a404-18b3802caf81';
UPDATE public.poi SET linked_badge_id = '4eb72115-d8f5-4d21-8dc9-b7ec657dff90' WHERE id = 'c44f9551-4da3-4a0c-b0c5-5799acc27288';
UPDATE public.poi SET linked_badge_id = '068d9cc8-e8aa-4e79-b96e-73992618dbaf' WHERE id = 'c4542f47-a6d1-411e-b5ec-2b7eb04e1aaa';
UPDATE public.poi SET linked_badge_id = '80281acb-3d55-477b-ba71-734f3550e591' WHERE id = 'c45d5aaf-11f4-40c7-8814-2e57c35ba423';
UPDATE public.poi SET linked_badge_id = '9b10c756-40cc-4577-a62b-a566a9f51519' WHERE id = 'c4d0a4c7-7ed0-4460-8e01-e3ce95e8cd23';
UPDATE public.poi SET linked_badge_id = '294689d0-b8b0-447f-90a4-a4a65e83a8e2' WHERE id = 'c4d2efe8-f7ec-4e13-a7b0-b8eb54ef38da';
UPDATE public.poi SET linked_badge_id = '3285dbf1-e9e9-451d-8767-557c8dac4c80' WHERE id = 'c4d3b51d-af38-45bb-bfdd-d31441f89e04';
UPDATE public.poi SET linked_badge_id = '26ab1854-f442-47bb-8475-a0939d87e42e' WHERE id = 'c4e0ca99-c21f-49f1-a44a-d1076cefa703';
UPDATE public.poi SET linked_badge_id = 'a70221ca-bf26-4bd6-a1c8-98889884d686' WHERE id = 'c51ee2e6-5a9c-4242-a312-0778e06d671a';
UPDATE public.poi SET linked_badge_id = '972464b3-c7c1-4151-9dfc-a1da94eacfea' WHERE id = 'c53d90d5-e145-4b48-aa2f-600f51e00ae0';
UPDATE public.poi SET linked_badge_id = '5ed9a0c6-3fa0-4b81-b7d5-09660284ba67' WHERE id = 'c5987fe3-92ab-4873-8e93-e3480dda16eb';
UPDATE public.poi SET linked_badge_id = 'b1892f5a-b567-4b64-97f9-060a48e34410' WHERE id = 'c5fac4c2-48cd-49a7-a018-76d6004bd0e4';
UPDATE public.poi SET linked_badge_id = 'f873cd16-bf52-42c5-9173-ed0364e83436' WHERE id = 'c603fbf7-ff5c-4101-8c39-676e8cc785a1';
UPDATE public.poi SET linked_badge_id = 'c3a419fa-d479-406c-b1bc-bb994e5bbcfd' WHERE id = 'c61ab6c3-9b06-4e2a-b2ff-f8b1ccd8bbab';
UPDATE public.poi SET linked_badge_id = 'b12ecb26-6df4-4180-a2ea-dedfb7b379c1' WHERE id = 'c639b249-3894-41ed-a1fa-446ae14d998a';
UPDATE public.poi SET linked_badge_id = '2adb823c-58aa-4fa3-bd7e-7b7413f4f232' WHERE id = 'c65ac5dd-b86e-4efa-bf84-3f8fe9ec4a65';
UPDATE public.poi SET linked_badge_id = 'c8a37ad1-87d2-4190-8b06-f23bf0c539ef' WHERE id = 'c65bf46c-6ee9-4bec-a05e-f1eb4210701e';
UPDATE public.poi SET linked_badge_id = 'dec34f35-0d02-48d3-88d3-72f4d8c12bc7' WHERE id = 'c664e411-9456-4c5c-b6fc-adc4ee7f2f4b';
UPDATE public.poi SET linked_badge_id = '6c4e7219-091b-483e-a130-532b34a0ca39' WHERE id = 'c684c34b-90be-4eaa-bbdd-2b4ba0893d26';
UPDATE public.poi SET linked_badge_id = '5272ace7-30ad-467b-b4e4-347de2a5d94e' WHERE id = 'c6986cf5-3346-4cd6-b4cb-5f301114c581';
UPDATE public.poi SET linked_badge_id = 'b4a5a7c4-6aa9-4e19-b363-caf5faac3c83' WHERE id = 'c6e6532c-0f53-4b72-9395-41afea039c2d';
UPDATE public.poi SET linked_badge_id = '7908b1a2-1c6d-4791-a8cd-4917ee5ef110' WHERE id = 'c70e4cd5-6e62-43a4-9028-e75465f38829';
UPDATE public.poi SET linked_badge_id = '6fe67c2f-e1be-44ca-adc3-529f4db6fdff' WHERE id = 'c72c3270-727c-446d-a05d-03bd820ee9c1';
UPDATE public.poi SET linked_badge_id = '7a280fda-a447-4288-9d50-b4adb5d4341a' WHERE id = 'c73c196d-3fd7-436c-bd2a-d275ff1706a8';
UPDATE public.poi SET linked_badge_id = 'b8f7b6da-269e-4a22-9f89-2dea9b75662f' WHERE id = 'c74ef1fb-ca35-4e7f-8739-dc90cbfc61d9';
UPDATE public.poi SET linked_badge_id = '2797cdcb-8a1d-4331-bf3e-fd8c57178a25' WHERE id = 'c7fe3a19-152d-47ec-98e5-fd554a703f33';
UPDATE public.poi SET linked_badge_id = 'ac5349a0-1944-4a6a-90b7-4edd99604e19' WHERE id = 'c8431ee6-5e63-47ee-9bc2-acef8ee79611';
UPDATE public.poi SET linked_badge_id = '3b71953d-b7bc-4311-a31a-8f6442c5fb8c' WHERE id = 'c8715ed5-9196-428d-b3e7-a5320ce3142c';
UPDATE public.poi SET linked_badge_id = '1167ddcb-4c07-4174-bb23-667232faeff4' WHERE id = 'c881ceea-af2f-449a-8b50-c86f41ab75a6';
UPDATE public.poi SET linked_badge_id = '048cfba9-0796-4010-87ab-43c5952bb4f9' WHERE id = 'c8cc396e-21e5-4f35-89e3-a9a698654548';
UPDATE public.poi SET linked_badge_id = '76ed1eb6-5e7a-4ce1-ac2a-f95667fc63c2' WHERE id = 'c8fd560e-d81b-418e-893d-00d05d238de1';
UPDATE public.poi SET linked_badge_id = '59a87cbe-232a-4966-adae-d7d80f0a3cd0' WHERE id = 'c90dd575-3ba8-4d94-be6b-ab9026abc119';
UPDATE public.poi SET linked_badge_id = '09c9ba77-def4-42c3-9240-68ad4ba2f0f3' WHERE id = 'c9156dc2-1b11-4427-a190-37c1543ebb17';
UPDATE public.poi SET linked_badge_id = 'c598f1c7-7296-4495-9a65-12d0fa63678b' WHERE id = 'c9634ca1-ea2b-46a2-bf21-223bb16ded82';
UPDATE public.poi SET linked_badge_id = 'ea8f4c27-96a6-42b9-ab55-afa038b642cb' WHERE id = 'c9708a4b-7bd3-47e5-8ea7-36fa6f507b0f';
UPDATE public.poi SET linked_badge_id = 'aeb6e4fa-1825-427a-a1aa-466dfc723c4f' WHERE id = 'c9851fb0-9dc3-4f49-8294-721d83206c4f';
UPDATE public.poi SET linked_badge_id = 'c4d152a1-67b4-4898-a75a-2885e6310899' WHERE id = 'c9d5db78-705a-4cc4-991d-fa2bb983bbec';
UPDATE public.poi SET linked_badge_id = 'e1e29c58-48a0-4cb3-9f83-72191b2bbf85' WHERE id = 'c9f880b7-307c-4256-990c-4187cbe5d85e';
UPDATE public.poi SET linked_badge_id = 'd8050338-7f76-405f-8033-63908fda03df' WHERE id = 'c9fef3cb-efb5-46bb-87ad-c681f84b8b28';
UPDATE public.poi SET linked_badge_id = '6af9fac5-d9c1-49e5-8df0-dba21254688f' WHERE id = 'ca39a7e1-eb46-408d-83a0-5d0c4f332b77';
UPDATE public.poi SET linked_badge_id = 'b31661d3-446e-4b2b-a461-5667fc8e6bb8' WHERE id = 'ca99df3f-a3da-4334-afba-99a4a5c6230c';
UPDATE public.poi SET linked_badge_id = 'f376fb62-132e-4491-a201-19ef84c114a5' WHERE id = 'caf93bac-90ac-4928-82bc-a77a32519827';
UPDATE public.poi SET linked_badge_id = '19b5fae7-771f-4279-8743-98d04a76de4e' WHERE id = 'cb0730d0-4d68-4341-89a9-9a521912b21e';
UPDATE public.poi SET linked_badge_id = '373ee848-cf24-4e9f-848e-9dd80de2e6db' WHERE id = 'cb7dac3b-d74a-41fe-bd7b-0011d19c55e9';
UPDATE public.poi SET linked_badge_id = '96feeb80-42b2-4e2d-85fe-c93903b6d6ed' WHERE id = 'cbb5982b-29ce-4d6c-9715-20ca51c00a45';
UPDATE public.poi SET linked_badge_id = 'bbf6d078-3641-437e-bd4b-3155889b4a26' WHERE id = 'cbb8cf02-0e00-4700-aa4e-c968201117ab';
UPDATE public.poi SET linked_badge_id = '501f7de6-79f3-462c-9598-56b99c86a795' WHERE id = 'cbdffe74-28f5-4726-a18f-84e5050e7e21';
UPDATE public.poi SET linked_badge_id = 'ea96a6f4-99cb-498b-98f4-80b939f5c965' WHERE id = 'cc0614d2-4afa-4e23-b1f2-dc28e0d9d685';
UPDATE public.poi SET linked_badge_id = 'b37d4ccf-32f9-4fe9-ad96-3e845301ba9c' WHERE id = 'cc0c1f8c-3001-432b-adf1-35dcbfb2a10a';
UPDATE public.poi SET linked_badge_id = '7c54ea71-0d8e-4d44-994f-1b8eee0e6bed' WHERE id = 'cc1d8387-442f-475f-9534-8b49cd0f828d';
UPDATE public.poi SET linked_badge_id = 'da285bb1-3745-48ef-876a-64de5b928a85' WHERE id = 'cc415c48-57d4-46ba-90b3-c1b3683d4e8a';
UPDATE public.poi SET linked_badge_id = 'fe7a97be-249c-4ada-97b0-2e2b25f88c38' WHERE id = 'ccf8b6bd-2aaf-4a51-884a-3e360f15b266';
UPDATE public.poi SET linked_badge_id = 'e55c517c-0fc9-4278-a347-50b9421e4fd2' WHERE id = 'cd096e63-7b7d-42e1-ba58-8e10da1116a6';
UPDATE public.poi SET linked_badge_id = '84a7098f-02cc-4eda-8d4c-d27bc0727462' WHERE id = 'cd258054-b98e-4cf5-be01-0859379c115c';
UPDATE public.poi SET linked_badge_id = '1c509595-b79a-4810-b423-4509cbaf37f3' WHERE id = 'cdb4e519-5b54-4494-b7a4-62b67de33126';
UPDATE public.poi SET linked_badge_id = '7c9d95c5-9df5-40b3-827e-2106cb32abf3' WHERE id = 'cdf9587c-7112-4628-9d1b-179220cc245a';
UPDATE public.poi SET linked_badge_id = '27dacc31-bf42-46b8-b2b9-1dbf394a7a29' WHERE id = 'ce17fa57-a42a-4983-a24f-b490cc86f9b8';
UPDATE public.poi SET linked_badge_id = '511664aa-1395-478a-870e-66bb96894cfc' WHERE id = 'ce4686bf-ed5b-4e70-9336-9725c72eff6f';
UPDATE public.poi SET linked_badge_id = 'c159ab4a-9354-4a35-a971-cfcee1ba1c30' WHERE id = 'ce80d8ba-ab87-4fb7-a239-f6b3ae2e37bc';
UPDATE public.poi SET linked_badge_id = '0266c4d2-70ec-4020-b9ed-55c9652fe58c' WHERE id = 'ce843a59-77df-4e6e-a7d3-7e8927409274';
UPDATE public.poi SET linked_badge_id = 'ba15cf78-118a-4d4c-9254-833fa011307e' WHERE id = 'ceec2a78-e293-4217-955d-da02bf2fbd64';
UPDATE public.poi SET linked_badge_id = 'e5b387c4-30a5-4f36-b6e1-39e07a428a4e' WHERE id = 'cefbfbae-dbb5-4d11-9c16-34000a59887b';
UPDATE public.poi SET linked_badge_id = '23f05953-68eb-47ff-b99b-b268de13e336' WHERE id = 'cf1aba8c-777c-4836-9d6a-2524512ae4de';
UPDATE public.poi SET linked_badge_id = 'ceddc080-0cb5-42b0-ac75-cd9dcb8c6883' WHERE id = 'cf41ad1b-4c7d-48b0-88c1-c42ffe3cad72';
UPDATE public.poi SET linked_badge_id = 'b61babfd-444b-48a6-8dd3-d414b841bc8e' WHERE id = 'cf462bb9-5e80-4287-bec1-79f6787181c3';
UPDATE public.poi SET linked_badge_id = '8222e923-422a-458e-ac05-c4c9ad6a82cf' WHERE id = 'cf874e18-0aa7-4956-9f95-3b047db76f2f';
UPDATE public.poi SET linked_badge_id = 'eb1e8581-6cfc-4e11-9fe0-6b4ba3e28f2b' WHERE id = 'cf8a7f14-b2b2-4e6c-9757-36091d4c8a0a';
UPDATE public.poi SET linked_badge_id = 'ccf904b8-e1eb-489e-89fb-343e44856c3d' WHERE id = 'cfc4bbf3-5210-4358-a35c-0d59f47a8e2f';
UPDATE public.poi SET linked_badge_id = 'c214b4d3-6a68-456a-910a-71206bf5d597' WHERE id = 'cfd277b3-d4ed-4b03-b55f-61348fa27f28';
UPDATE public.poi SET linked_badge_id = 'b094aec2-cb84-4244-bb00-9211f1b92c7d' WHERE id = 'cfe2a265-a0b2-4ace-90e1-26eb4663e400';
UPDATE public.poi SET linked_badge_id = 'f17e8a75-8301-4a05-aef1-df57e56a3a31' WHERE id = 'd0427fdb-f07d-4e09-9582-6e12e4764366';
UPDATE public.poi SET linked_badge_id = 'ab5218ca-4057-439f-a9d6-d56e5bf6eb88' WHERE id = 'd0774cac-cb7c-4404-8483-8c02b1835661';
UPDATE public.poi SET linked_badge_id = 'eb49bea7-9460-4f32-a509-d981d3afc709' WHERE id = 'd098726e-3906-4493-b368-1055e1ea374a';
UPDATE public.poi SET linked_badge_id = '980ce22a-1822-4b29-9bc4-137dfe3116df' WHERE id = 'd09e5ba0-fabc-423c-a1e5-b65fa23ea6fd';
UPDATE public.poi SET linked_badge_id = '137cc1f3-e430-47cd-8f7d-10b4b664eee9' WHERE id = 'd0aab311-db5e-49de-a93d-e0f97a8efecc';
UPDATE public.poi SET linked_badge_id = 'ca3add7b-538c-4e2d-97bf-90712a103292' WHERE id = 'd0bb9dab-502b-4826-9cb0-db2a29094630';
UPDATE public.poi SET linked_badge_id = 'faf2bc99-6744-4aa5-ade8-324f687b2961' WHERE id = 'd0c00503-8579-478a-8cad-5addd0452427';
UPDATE public.poi SET linked_badge_id = 'cf5ae89d-6392-4ef4-ac4e-869b9094ba01' WHERE id = 'd0d35735-70b0-4973-a78f-b804917cbdf2';
UPDATE public.poi SET linked_badge_id = '6d144edf-9e61-4d7d-bd0f-464a917423dd' WHERE id = 'd12599ed-1555-4388-9be1-66b7483e74b0';
UPDATE public.poi SET linked_badge_id = '8ad60e2d-56a6-4481-a324-0b6bf0db6882' WHERE id = 'd1a5a48c-a34e-49a7-bc85-ff0f47c7ca5c';
UPDATE public.poi SET linked_badge_id = '6b3314e5-0737-49c9-a172-9312c442a573' WHERE id = 'd1b8f69d-269e-401d-b145-79e04be43c11';
UPDATE public.poi SET linked_badge_id = 'aa265ead-d082-4607-ad81-080dff08fb7b' WHERE id = 'd1bfe48c-9200-4f59-ab7d-6d3685b2559f';
UPDATE public.poi SET linked_badge_id = '37186b88-4130-40e8-a3f4-d837998fdc0f' WHERE id = 'd1c2ad90-c76e-438e-b93f-c6fa38fb8e08';
UPDATE public.poi SET linked_badge_id = '5cf77a8b-227b-400b-9b62-8d5875751cef' WHERE id = 'd1dbc9ef-6122-4c15-a326-f386ca9a5090';
UPDATE public.poi SET linked_badge_id = '83b7de44-0c1e-4299-a6c2-5b622a3bf330' WHERE id = 'd1dc0960-ed97-4fda-87ad-0cb40a636e8f';
UPDATE public.poi SET linked_badge_id = 'cc51dde7-c295-4d00-afac-4dec826c29c7' WHERE id = 'd1e76322-2004-4720-b579-23677e6cc30d';
UPDATE public.poi SET linked_badge_id = 'ba757eda-c5ab-4ddd-ab99-d92d88ebf9d7' WHERE id = 'd2099937-37eb-4c0b-b632-92358d9a9ba2';
UPDATE public.poi SET linked_badge_id = 'd1074005-3032-4bb1-bf82-96bf9e670885' WHERE id = 'd28643f3-cf2b-451b-a54d-2d2969522545';
UPDATE public.poi SET linked_badge_id = '02faf46b-4b4b-4b68-969c-b318f5bac0c7' WHERE id = 'd28fe9c2-4b22-462b-9e91-c225542f0534';
UPDATE public.poi SET linked_badge_id = 'ea0e0ae7-5116-48e1-946e-5f588f85dd38' WHERE id = 'd29cd90a-ea83-42b2-9f85-548366e34d92';
UPDATE public.poi SET linked_badge_id = '32011a8f-e25c-4a9b-be6d-373bab3fac8d' WHERE id = 'd2b2ffdc-1d7f-4e66-8b41-7cf1b0885d52';
UPDATE public.poi SET linked_badge_id = '9164dd97-6833-4ebd-a6e0-fcca436989a2' WHERE id = 'd2f349a7-d1a7-484f-9854-55b828d17690';
UPDATE public.poi SET linked_badge_id = '70de43b5-5e01-4fca-876b-54ad490724bd' WHERE id = 'd30a9f00-8d3b-44a3-a15f-0b7e8a9c55f9';
UPDATE public.poi SET linked_badge_id = '7452cc9b-c817-4c87-bf61-08842301d358' WHERE id = 'd30ccb31-b7e3-45da-9fce-854784e072a4';
UPDATE public.poi SET linked_badge_id = 'd26afb80-8163-4a47-b569-7f51a845680d' WHERE id = 'd336d818-660f-4017-9d71-3d382f9e778c';
UPDATE public.poi SET linked_badge_id = '2c8dec11-24da-4898-8dc4-d60772227849' WHERE id = 'd3478fca-5f2f-4d92-9aeb-4dd3b7269373';
UPDATE public.poi SET linked_badge_id = '622e52cd-a5ff-4338-93de-17583882c2e6' WHERE id = 'd35a8ba7-6dac-413b-b8cf-f9552fb28d9f';
UPDATE public.poi SET linked_badge_id = 'ba911a87-fc6e-4630-a86f-326a31b2e0f8' WHERE id = 'd367724c-1ebf-41ea-baac-72a126c38a16';
UPDATE public.poi SET linked_badge_id = 'b0284bd2-3bac-44c8-9a11-e299327d35c9' WHERE id = 'd3744b71-3f76-4067-a3b8-b0c23259fa9b';
UPDATE public.poi SET linked_badge_id = 'cc2937a4-54b0-4c19-8614-59f2f9b663ba' WHERE id = 'd3a16631-9fa2-4579-a511-bf28f6818ce1';
UPDATE public.poi SET linked_badge_id = 'd257d86b-c284-4267-951a-312abd70e768' WHERE id = 'd3b09159-c627-432c-9d88-272a56437138';
UPDATE public.poi SET linked_badge_id = '589cd3a2-f3fe-4019-abdd-23ae0087fc92' WHERE id = 'd4162737-2b84-4960-ab61-310599d37ab8';
UPDATE public.poi SET linked_badge_id = 'cb7109d0-de9e-4795-9371-559e800981ab' WHERE id = 'd4445fc4-2cc8-4d7e-91a6-af220340eff2';
UPDATE public.poi SET linked_badge_id = '05770fc0-dd98-4bc2-ac38-2009d5f754d7' WHERE id = 'd45f36be-92b1-4a60-9b78-1216c8b543a1';
UPDATE public.poi SET linked_badge_id = 'e05e17bf-b96e-4fee-b6a9-af2299d3276b' WHERE id = 'd4b7c4b2-4e3d-4af8-92d9-4e199226824e';
UPDATE public.poi SET linked_badge_id = 'c789f125-f445-4b12-9a71-24c9a5d7826c' WHERE id = 'd4baae27-8d22-42fd-baff-0f1dc59b9b07';
UPDATE public.poi SET linked_badge_id = '95cad1e0-d2c3-49fb-91ef-1883bf4839f4' WHERE id = 'd4bd5248-acbf-4a74-8923-f3f3f16a386c';
UPDATE public.poi SET linked_badge_id = 'c47dffe3-2699-4e9f-9cf7-3bbc21678d92' WHERE id = 'd509ffd6-ef5e-4879-a19c-1e6429e94355';
UPDATE public.poi SET linked_badge_id = '15724955-1873-404f-b8f9-20db01d866c7' WHERE id = 'd5175422-931a-48a6-bcb8-6ffc915a230b';
UPDATE public.poi SET linked_badge_id = '6cf36405-00b8-4a72-bea2-72cc4ad08ad3' WHERE id = 'd5562011-2929-497a-b766-a52d3cd4090b';
UPDATE public.poi SET linked_badge_id = 'c51cbd09-a4d5-48db-892b-f70a2a8d24c4' WHERE id = 'd556da79-8031-47ea-a5fe-e458ef526bc2';
UPDATE public.poi SET linked_badge_id = '426a6f29-340d-4524-81f6-7e011531482e' WHERE id = 'd5641e46-2c59-44f6-b67f-346bee0b486d';
UPDATE public.poi SET linked_badge_id = '358900ab-c48d-403c-a2ed-6b31272dc9a7' WHERE id = 'd594a52d-35c0-4e07-b954-0997f61b51b6';
UPDATE public.poi SET linked_badge_id = '2bb14f97-d7bf-49d2-8309-1782d6e797aa' WHERE id = 'd5a67b46-f130-4f81-bffd-3765383bbd65';
UPDATE public.poi SET linked_badge_id = 'b0787d89-927c-4bdf-b8c3-b0187a058b7e' WHERE id = 'd5d0a0f8-f3cf-4051-9adc-1873557bd442';
UPDATE public.poi SET linked_badge_id = '78c6eae7-5f78-454b-b669-58b855938334' WHERE id = 'd5da6718-c625-4b6c-9f82-a1404ae7c525';
UPDATE public.poi SET linked_badge_id = '3e0f38ab-7d35-4596-a649-25b4b25f2db6' WHERE id = 'd651e088-df6d-4ab2-97b4-fd8e5a3e47f0';
UPDATE public.poi SET linked_badge_id = 'b5248c51-68cd-4e95-a469-4971776a4c80' WHERE id = 'd65a052f-bdf2-4e49-a885-58691733eded';
UPDATE public.poi SET linked_badge_id = 'd8d3d9b7-d183-4dd5-a779-5032809498c3' WHERE id = 'd699f5e8-751a-413d-a2c9-574963bdf85a';
UPDATE public.poi SET linked_badge_id = '19651152-8a62-4741-bf1a-7560b4df3dfb' WHERE id = 'd6bbeadd-c39d-4125-a23e-708b284797de';
UPDATE public.poi SET linked_badge_id = 'a8bffe5f-8d70-450c-860b-9543e586d375' WHERE id = 'd6ec6f1a-eb64-4361-8581-b541506cde88';
UPDATE public.poi SET linked_badge_id = 'e14ff6c6-8a49-4734-9b07-fba59852a941' WHERE id = 'd7166115-7a66-4a59-8dd1-66ab7af709d3';
UPDATE public.poi SET linked_badge_id = '92a80a5c-9ee9-440a-90c5-be124161779a' WHERE id = 'd7419605-3eca-495f-98ec-46123800c989';
UPDATE public.poi SET linked_badge_id = 'caedead2-8a67-480c-bdaa-37fbdef718f0' WHERE id = 'd77a22ff-1c52-4834-9a23-3a64456ec207';
UPDATE public.poi SET linked_badge_id = 'bb4b0524-4e6b-47a0-84d4-7565478ea795' WHERE id = 'd840a360-605b-4bb1-be57-7cf8314d52a4';
UPDATE public.poi SET linked_badge_id = 'fe7ee4ea-5d44-4702-9bc3-7e6bf62e9a03' WHERE id = 'd8517497-093f-408e-b45e-75eff9c57191';
UPDATE public.poi SET linked_badge_id = '69010d70-b28a-46a7-9600-9da01988aa05' WHERE id = 'd858d604-ce5a-4a97-80db-144c494e8d2c';
UPDATE public.poi SET linked_badge_id = '9b17c019-ec68-4b6d-884f-1da511977e26' WHERE id = 'd85aa84c-6fe9-4add-817e-07231d3d290b';
UPDATE public.poi SET linked_badge_id = '52d003ca-9c00-427b-bdc7-6fd9fd27a95c' WHERE id = 'd8f27452-abb6-41a9-8b91-7147354ae61c';
UPDATE public.poi SET linked_badge_id = '97d42eb9-f1fe-40cf-8c42-a728ee989716' WHERE id = 'd91ddb5c-33c2-411c-acd8-83468da1b07e';
UPDATE public.poi SET linked_badge_id = '8106541d-425c-4c33-a886-58e9112ed0fd' WHERE id = 'd94c56c1-c939-46e9-820b-6ca2f0c794da';
UPDATE public.poi SET linked_badge_id = '30a7f77b-ed33-4e5e-9d35-b26aeec899ef' WHERE id = 'd952fd10-2040-493d-b8de-84602a9f23a5';
UPDATE public.poi SET linked_badge_id = '6da291a3-78c0-44d9-89c8-2ea3f57612dd' WHERE id = 'd9653529-1b97-4e71-813b-d6514eafcb8c';
UPDATE public.poi SET linked_badge_id = '4d1217dd-b494-4d7c-a55b-ef1bd79c63f0' WHERE id = 'd96bb857-90f9-41e9-8250-fa30e9e906e7';
UPDATE public.poi SET linked_badge_id = '37bba4c1-3984-40d6-a3f0-f8fdfd22c7f2' WHERE id = 'd99ca576-6b39-43fe-b073-cc7c7295d80b';
UPDATE public.poi SET linked_badge_id = 'd016b5af-3cd5-4d72-a7d5-8731e6b4c4b4' WHERE id = 'd9dff094-a15b-4730-b33b-b746830fb315';
UPDATE public.poi SET linked_badge_id = 'ab2deec3-d6be-473e-baa0-9759d27b642d' WHERE id = 'd9ff9b96-c099-48c9-bc89-b08c5d2f620b';
UPDATE public.poi SET linked_badge_id = '1b164505-36bd-40e1-8344-e29723563a9b' WHERE id = 'da6c5023-ee8f-4643-966e-4e95e5262b0f';
UPDATE public.poi SET linked_badge_id = '9dd26946-a84d-4b5c-aee0-c41564aa74f7' WHERE id = 'da81745c-f042-4497-8628-34907fe709d1';
UPDATE public.poi SET linked_badge_id = '45c1a0ec-34be-4c1d-8f18-c91dc9ece593' WHERE id = 'da9235d4-3a4d-4f9e-84bd-da04aa6a667e';
UPDATE public.poi SET linked_badge_id = '6d27d2c4-a3e3-4d19-b776-962de0639175' WHERE id = 'daa00927-9232-4b7e-ab95-412f679eb4dd';
UPDATE public.poi SET linked_badge_id = '764bd917-040e-4574-b6cf-b71f487a2e62' WHERE id = 'dadbb129-f910-4967-b3c0-d8f19579b829';
UPDATE public.poi SET linked_badge_id = '429c79a1-4655-4b9d-be72-e4dc9f329f16' WHERE id = 'daebb7db-a78c-45e8-8c30-bfd9d5d6fd2c';
UPDATE public.poi SET linked_badge_id = '51f34528-cfbd-4914-a7c8-8e5c812a7f3e' WHERE id = 'daee2dde-8a7d-432f-b05e-68a346a02406';
UPDATE public.poi SET linked_badge_id = 'e75c8752-1908-4c65-9ddf-9cb42a47e563' WHERE id = 'db1f2d0e-d672-4762-9f9f-5ff776f30403';
UPDATE public.poi SET linked_badge_id = 'bf48cdf9-b2a9-4de5-838e-36c7915feae9' WHERE id = 'db24564b-ea17-4b3f-aaa4-26bba7e8839d';
UPDATE public.poi SET linked_badge_id = '0407e739-fbf0-4206-82f6-8a2a7c64e7a5' WHERE id = 'db50eaf6-393d-488e-94a3-970d127d7599';
UPDATE public.poi SET linked_badge_id = '244601d6-9694-4081-a83a-3f05214735b1' WHERE id = 'db515647-7a49-4f0e-9d9e-527b5566f18f';
UPDATE public.poi SET linked_badge_id = '9e59529b-d30f-4088-a8a6-7dc30a7aeb05' WHERE id = 'db533ca6-94d4-4d53-bafc-03b9d882491c';
UPDATE public.poi SET linked_badge_id = 'd152b2c6-3af5-4f1c-9323-f95bcf47bba1' WHERE id = 'db595728-b876-4f59-8328-4d1bf590135d';
UPDATE public.poi SET linked_badge_id = '047a97ec-b7c8-491b-b3cf-70594751a4c0' WHERE id = 'db6ab9ad-ae08-40ad-9b7c-356adac90398';
UPDATE public.poi SET linked_badge_id = '1f1eb703-1dd7-4b47-9eb3-04b566b88d14' WHERE id = 'db98a7c0-d55f-48ff-84af-800566dbf6db';
UPDATE public.poi SET linked_badge_id = 'cb7e00ba-f51a-4715-a54f-e7434e56a973' WHERE id = 'dba2da6f-63c1-4c91-8736-bb484f4a5af9';
UPDATE public.poi SET linked_badge_id = '75856949-a987-48ae-beca-b6854eeacf8a' WHERE id = 'dbc24ea7-e95f-4904-a64b-908f1b2d0f22';
UPDATE public.poi SET linked_badge_id = '8b07d0e6-337d-47a6-a1a1-6b18142b119c' WHERE id = 'dbc4df94-b2e7-4c4e-9616-9c9cbd8edd7e';
UPDATE public.poi SET linked_badge_id = 'd2379718-cbec-499d-ae09-894d632609d0' WHERE id = 'dbcdaeb4-6212-4d3a-8ae1-c3629a68a1ea';
UPDATE public.poi SET linked_badge_id = 'cca7abdb-85a4-4358-bade-5dfbbeb239c2' WHERE id = 'dbda57af-42b6-4787-8c57-63b7b76c851a';
UPDATE public.poi SET linked_badge_id = '1dea0838-ef07-49c3-8322-695300bb6b20' WHERE id = 'dc2df592-7297-4e72-b694-dc11bce0a4d8';
UPDATE public.poi SET linked_badge_id = '420b38ad-cdea-454c-be1c-e42a7ff3e51a' WHERE id = 'dc4a0f16-d647-47f3-8ee0-43ba89717326';
UPDATE public.poi SET linked_badge_id = 'f5c0cd20-4b26-438f-a23a-13ee3f6d310e' WHERE id = 'dc534248-53c0-4d30-a8be-73abdbda34f4';
UPDATE public.poi SET linked_badge_id = 'c87638d3-28e1-413c-a0f4-02d87d404dae' WHERE id = 'dc977b06-98c3-4bcb-875d-a38995406fc0';
UPDATE public.poi SET linked_badge_id = 'e60f7fbc-c5c6-4a6d-83dc-75fdea025d28' WHERE id = 'dcd478de-b383-43ce-b17d-590e1f3f8b59';
UPDATE public.poi SET linked_badge_id = '20d2d842-bac3-4c1c-b56b-02e9b7d4a3a0' WHERE id = 'dd16112a-3e4c-474d-8afd-7e549a9ce56e';
UPDATE public.poi SET linked_badge_id = '3f7f3297-a964-407c-80b1-38877255e8cf' WHERE id = 'dd34c052-ee86-488e-9809-4310501bf8d0';
UPDATE public.poi SET linked_badge_id = '904f572f-3cc8-4f31-96fd-2f18466ae09e' WHERE id = 'dd6305c8-11aa-4f07-88f9-95b8d1624f10';
UPDATE public.poi SET linked_badge_id = 'cfae2fb2-c315-4766-8d62-ef13686e8657' WHERE id = 'dd6c96d3-0b35-4321-bb89-8f6052fa8c1d';
UPDATE public.poi SET linked_badge_id = '8ca6833e-a1bc-4b4d-8684-25b78cfe7b8b' WHERE id = 'dd7d5abb-a1a2-47e9-b8cc-72d758a7d779';
UPDATE public.poi SET linked_badge_id = 'dd0e0b30-b9d0-4a4b-99d5-e6b6d077066e' WHERE id = 'dd95bc5c-b196-4393-9532-60e60e06a3cb';
UPDATE public.poi SET linked_badge_id = '2a818f2c-7199-472f-ad43-6545e24c0723' WHERE id = 'ddafa70c-0894-4651-abe1-aadb95f6a316';
UPDATE public.poi SET linked_badge_id = 'e4d745bc-eea0-48d4-93f0-e7364fa7d8ad' WHERE id = 'ddb070c4-5ac3-450e-912f-44da1c00a6fb';
UPDATE public.poi SET linked_badge_id = '53a92143-6e71-4ee8-a78f-093ff15b2960' WHERE id = 'ddd8f83e-1603-4b29-90ab-6eb3090d202c';
UPDATE public.poi SET linked_badge_id = '24f96292-c088-412f-842c-72a0a28f4d7e' WHERE id = 'ddddd86c-27a2-4a92-9d9c-3c61fbd7d16d';
UPDATE public.poi SET linked_badge_id = '72918854-523b-4eee-a4da-feefcf93bf78' WHERE id = 'de31e04d-4412-443e-8bf7-870e9d687087';
UPDATE public.poi SET linked_badge_id = 'a26d0c41-ef8a-49a3-970a-9e101bdd4ec9' WHERE id = 'de41b0b1-f00d-4eb9-bf61-49f1e1191848';
UPDATE public.poi SET linked_badge_id = '87fb8928-a412-49dd-8981-54c865bdfeea' WHERE id = 'de464238-0a3d-44b7-92b8-e3ab06427b9f';
UPDATE public.poi SET linked_badge_id = '003dd30d-8202-4e9c-b230-49827e396221' WHERE id = 'de71d213-24ba-4560-895f-e6e0204933ad';
UPDATE public.poi SET linked_badge_id = 'd2172b0f-fba6-4b9c-9024-f81eb7393343' WHERE id = 'de9217e4-e009-4285-814f-e728b3b1030b';
UPDATE public.poi SET linked_badge_id = '3f05b79b-57dc-4511-ac40-75a164a9aa57' WHERE id = 'def5cc2b-3e62-404c-9c06-72bdc1cce121';
UPDATE public.poi SET linked_badge_id = 'b8172312-16d0-4c80-859f-72980061af94' WHERE id = 'df236108-1186-4d97-9bec-c82a61a7ad12';
UPDATE public.poi SET linked_badge_id = '64f00ba7-8b44-41cc-866f-a36f34e4d25f' WHERE id = 'df365068-0aea-456c-b983-e57e6aad48b3';
UPDATE public.poi SET linked_badge_id = '44cedacb-8b01-414e-af9f-ed1d93c9cb2d' WHERE id = 'df3657ed-5a2e-4dbb-8e8e-2d782c84671b';
UPDATE public.poi SET linked_badge_id = 'beee5657-a922-4d7e-8ea5-24d82b6bd96a' WHERE id = 'df654037-0b78-4a01-a2fa-b8703c4b8c8b';
UPDATE public.poi SET linked_badge_id = 'f2840b98-0a47-43fa-b087-227dd33cf401' WHERE id = 'df833e76-c807-4113-9855-31278d4f069a';
UPDATE public.poi SET linked_badge_id = '4c2eab9e-0ba7-48c9-903f-223b3ced3302' WHERE id = 'dff0f2da-bade-44c5-8c15-99b37c5b3ec2';
UPDATE public.poi SET linked_badge_id = 'af45541a-3896-40aa-82d2-42eae5e419e3' WHERE id = 'e04ff14f-0718-405a-b06a-2db5ee2b2c30';
UPDATE public.poi SET linked_badge_id = '55aa1bd8-e89a-4fd6-802b-99c8b8cfcfad' WHERE id = 'e093046d-4e3a-48cd-8011-693b1f1d2534';
UPDATE public.poi SET linked_badge_id = '348f5d71-aa29-4c1b-9c31-92b99c474406' WHERE id = 'e0bbbae0-e76e-4c74-898a-8d2dc6a7424f';
UPDATE public.poi SET linked_badge_id = 'e3a9928c-6551-48a4-8a17-7e7ee4956c77' WHERE id = 'e0e517ae-f98e-4859-8588-cc24fee0c06e';
UPDATE public.poi SET linked_badge_id = '8838ce2c-5d0b-460f-bc87-ed05f94e499a' WHERE id = 'e0fbc5e1-167d-46a4-8e39-ecce368ef63c';
UPDATE public.poi SET linked_badge_id = '86539011-87d3-45d2-ade4-1c4869f8703b' WHERE id = 'e10890c8-dd11-4238-80e3-0d42f2bb4d01';
UPDATE public.poi SET linked_badge_id = '6a5abc69-51ad-4e27-bab6-f02785f4d859' WHERE id = 'e11f09c8-2277-4052-8562-33ff73127278';
UPDATE public.poi SET linked_badge_id = '3c05da96-7397-4dec-82d5-2876b98d16fc' WHERE id = 'e1370511-a5bd-4a04-9ae8-b62435647a13';
UPDATE public.poi SET linked_badge_id = '40808c01-7d28-4895-b5f8-440d4d9c4414' WHERE id = 'e1aba0c5-1454-4880-b4bd-304e9f96bf1f';
UPDATE public.poi SET linked_badge_id = '0e74dc1e-0b88-47db-bb87-d6aef7272121' WHERE id = 'e1b7e45e-fb96-4ffe-8e2b-f82d5c3a7b8f';
UPDATE public.poi SET linked_badge_id = 'ec5869ed-fe5d-405d-bd23-dca9241fac65' WHERE id = 'e28ce069-70de-4095-a329-72b89a0ec0cb';
UPDATE public.poi SET linked_badge_id = '86853964-fcf4-4a90-a2a5-219ce27fe021' WHERE id = 'e308a50c-bd02-4a61-83db-65af71d61b31';
UPDATE public.poi SET linked_badge_id = '94059e00-f6f6-4729-8328-66730fdfd655' WHERE id = 'e3197075-c982-4133-ac5a-d4e551992759';
UPDATE public.poi SET linked_badge_id = '63583b23-99d0-445d-839a-03ff98be37fd' WHERE id = 'e34c76fc-c572-48f1-a081-319fc36beed5';
UPDATE public.poi SET linked_badge_id = '6b8e9484-1f19-47e4-bd74-d67732662958' WHERE id = 'e357c1db-15d8-49dc-9432-a32ef3768262';
UPDATE public.poi SET linked_badge_id = '0c39062e-df91-4f8a-b494-538964532526' WHERE id = 'e37633a2-2f00-4505-acaf-0fec1fcf2f1b';
UPDATE public.poi SET linked_badge_id = '7b1e688f-3154-4d06-a4dd-5c819869e3ed' WHERE id = 'e3a35ca8-a485-4fab-b632-7e4a6c317a1e';
UPDATE public.poi SET linked_badge_id = '3009d8bc-15c5-4698-b210-9ba75fc9ffd6' WHERE id = 'e3daba29-08db-464c-b58b-37e1d9206fa5';
UPDATE public.poi SET linked_badge_id = '030fada0-75da-42f5-a383-c64f53b5777c' WHERE id = 'e44bba67-4820-4ac5-a826-85d6c3b6da53';
UPDATE public.poi SET linked_badge_id = '95467240-df7f-4a47-b339-c3b2e9ac049f' WHERE id = 'e4b4cbab-20c6-448e-a40a-a50cdef32a55';
UPDATE public.poi SET linked_badge_id = '2f2171ca-64c3-4868-92f4-720e24a34812' WHERE id = 'e4d0b946-54f4-4731-b95a-5c74a3e3429e';
UPDATE public.poi SET linked_badge_id = 'f5d113a0-f47f-40f7-a41f-1129394ece03' WHERE id = 'e4e3e9c4-86e9-419a-ab0b-0a3c3ee88bc2';
UPDATE public.poi SET linked_badge_id = '18c359b3-64c4-4279-87d9-09aadcf2048b' WHERE id = 'e58e8b3a-4879-4ace-8f02-04a5b33458a1';
UPDATE public.poi SET linked_badge_id = '3ebcb7db-161f-4b3e-9f5b-7b950e364fb9' WHERE id = 'e5c96afa-d4f2-451b-ae21-2fb00f794c66';
UPDATE public.poi SET linked_badge_id = 'f94a8ec8-d8ba-4747-938f-27b95670dce0' WHERE id = 'e604e24b-f8e5-4ef8-b866-06db24c4d6ab';
UPDATE public.poi SET linked_badge_id = '4a3d1c4d-73c2-4c08-a0cc-762581d33e95' WHERE id = 'e627f907-047f-49bc-b37f-482116805dfa';
UPDATE public.poi SET linked_badge_id = 'cf594fcc-fff4-407b-abf8-bc912cfb040c' WHERE id = 'e62c5f27-dd20-4ff9-9c9a-c586384704ae';
UPDATE public.poi SET linked_badge_id = 'f5e72b3c-b6b6-46f2-b6e6-079806b08181' WHERE id = 'e67c2b12-84fc-46cf-86b2-ef3f9fa612aa';
UPDATE public.poi SET linked_badge_id = '151a281b-2189-4669-91a8-3f1c5342f8e0' WHERE id = 'e69d699f-b95a-4892-9cad-ae5b55fc1de1';
UPDATE public.poi SET linked_badge_id = 'da481570-78ac-4d62-8cdc-ba646d1030b4' WHERE id = 'e6bdaf9a-298b-4853-b9a5-68e89c3db64b';
UPDATE public.poi SET linked_badge_id = 'd7dbf54b-9a93-4c55-903b-8147c5fcf3c3' WHERE id = 'e6f5905e-0816-44d5-a3ae-710874a542f5';
UPDATE public.poi SET linked_badge_id = 'e0f8b357-9cad-4969-a8e6-009fdb1ff7ff' WHERE id = 'e705615e-b589-4582-b282-c50e6649404c';
UPDATE public.poi SET linked_badge_id = '4d2ef31e-52b3-4c72-836a-e2b93e89ea03' WHERE id = 'e713dd0c-352a-4b28-83bc-2f6b41728a65';
UPDATE public.poi SET linked_badge_id = '2328dad0-3fda-4288-84c1-aa402ed65c29' WHERE id = 'e71dc5e0-4a94-4ad2-b48f-cbc1464d936b';
UPDATE public.poi SET linked_badge_id = 'd0f87489-0749-45f7-b9ad-2b1c7a200d4a' WHERE id = 'e74ef21c-61e2-46aa-9998-fdfd10e35995';
UPDATE public.poi SET linked_badge_id = 'a0858c77-ddf1-49d5-8a9b-2c67806b7e9f' WHERE id = 'e76ba9dc-7cc6-4860-8e26-8b0584788f0e';
UPDATE public.poi SET linked_badge_id = '7e2f4470-8010-46a7-a5d2-c7106d53ba90' WHERE id = 'e77438e4-3673-4c0e-9002-9d51243cf8a4';
UPDATE public.poi SET linked_badge_id = '68739841-0dab-4a65-bdf7-0d46cb88c5fe' WHERE id = 'e77b3a65-f17e-4bfe-a807-a23536991a68';
UPDATE public.poi SET linked_badge_id = '8fe1a49f-e807-4819-9e10-61645be7a879' WHERE id = 'e77f49d6-a40a-49e2-a8f9-1ce19fa6148f';
UPDATE public.poi SET linked_badge_id = '33ad1502-e5c6-4d15-bf68-4c9e8d478b49' WHERE id = 'e79b7938-4a3a-4e49-8c26-97358a8f96f8';
UPDATE public.poi SET linked_badge_id = '7da69581-29e2-4662-aef5-4aeb2acb602e' WHERE id = 'e79dc2fc-2d14-4c4e-963a-9e9f89b7f0e9';
UPDATE public.poi SET linked_badge_id = 'e6ac9781-0a1b-45c6-8c06-7225aa4f4e92' WHERE id = 'e8254dfc-6122-4076-ba6b-088661e54043';
UPDATE public.poi SET linked_badge_id = '8a22f0e3-593d-4d7d-a857-a51d54d9e34e' WHERE id = 'e8454763-da8f-4437-ac34-06ec829dd49e';
UPDATE public.poi SET linked_badge_id = '27d9fc98-9ab2-481c-90d7-c6a5d83cace6' WHERE id = 'e85e2d60-329f-4dbd-84be-d5dd7a3db754';
UPDATE public.poi SET linked_badge_id = '036e8a3d-b0da-4fbe-8b14-37e8ef8e36b1' WHERE id = 'e8889ea5-4d7e-4e21-a724-8a31aa39f44f';
UPDATE public.poi SET linked_badge_id = '2b763044-6218-4dd9-b97f-dc3505d47dcb' WHERE id = 'e888a7ff-0f52-42ad-a1b4-136b58b969c8';
UPDATE public.poi SET linked_badge_id = '4ac59184-19c2-4838-8ad9-0af6af87b652' WHERE id = 'e8e5f85c-94db-4d9b-b675-71453dcbb86d';
UPDATE public.poi SET linked_badge_id = 'e559f38c-6901-41b8-a56d-9efa64e5135b' WHERE id = 'e8e93e02-5298-4b03-af5e-19c7b62b06c6';
UPDATE public.poi SET linked_badge_id = 'a41faa91-2435-480a-aee8-afe085679dee' WHERE id = 'e92ad104-7932-4750-b568-179dd839cb33';
UPDATE public.poi SET linked_badge_id = '7c661953-5a68-4fa2-92be-5260178193a7' WHERE id = 'e939aa11-29af-4ada-9ed2-fe8ee921232f';
UPDATE public.poi SET linked_badge_id = '9477bf2a-4918-4f02-a692-7ba3c0053a93' WHERE id = 'e96a19a0-fc94-49ea-85f0-cf9b545c90a5';
UPDATE public.poi SET linked_badge_id = 'e9585c17-95ce-47c2-9c2e-c0b7a39e4526' WHERE id = 'eab90573-5102-43d5-bbfa-24b0c0f73249';
UPDATE public.poi SET linked_badge_id = '661705ea-eb68-4244-bd13-be3adb18427b' WHERE id = 'eabddce7-dc7e-4102-a683-4be5e6b5cbc3';
UPDATE public.poi SET linked_badge_id = 'b3a5c4ad-d480-4686-9c10-25a7720a503c' WHERE id = 'eb01d805-fe2d-444b-adce-22e60d6b36af';
UPDATE public.poi SET linked_badge_id = 'cdcd2fe3-08fc-43ab-b87f-1c41e72b5643' WHERE id = 'eb02c9a0-abf5-4689-892d-41c9c0eb10e5';
UPDATE public.poi SET linked_badge_id = 'cd272cb6-2195-4c72-8b58-aadd6fbae81e' WHERE id = 'eb24a56f-3700-4abd-856f-d7c83f2bf72e';
UPDATE public.poi SET linked_badge_id = '8fe44ee4-25b1-4496-b1f1-b04c1e802334' WHERE id = 'eb29d0b6-9bcb-4dfd-a853-1322bcfd748b';
UPDATE public.poi SET linked_badge_id = '58efdd0c-6490-483d-bf31-6277fc0ebe3d' WHERE id = 'ebb0f75a-82f6-4dc8-a2d5-5abe6ba7d7e7';
UPDATE public.poi SET linked_badge_id = 'd36b57bc-dde3-44a3-95a7-5c4c7ef8598e' WHERE id = 'ebe3e8db-2531-498f-a46b-05d850b1e6d3';
UPDATE public.poi SET linked_badge_id = '5dfc93e8-0b70-46e4-80d9-5a2c9b2d4691' WHERE id = 'ec0d59dc-d910-4c9a-bf0c-ab19cc56d8c2';
UPDATE public.poi SET linked_badge_id = '1de68426-9ffa-48e5-aa76-a50f71771d74' WHERE id = 'ec15c57d-740c-48d1-a014-de22296d84dc';
UPDATE public.poi SET linked_badge_id = '6c062264-ff7c-480a-8ead-2f3efa097221' WHERE id = 'ec196645-3dcc-45c9-8f3a-1d5bd6786886';
UPDATE public.poi SET linked_badge_id = 'c369dac2-e2c0-4491-87ee-6b8d1e3df61a' WHERE id = 'ec2402b8-3c7b-497b-9e32-b7c07bcee300';
UPDATE public.poi SET linked_badge_id = 'ffd31e60-8508-4e8c-a6b8-b2f09c88a288' WHERE id = 'ec64789f-0151-47c5-a2fc-333f3fd070d1';
UPDATE public.poi SET linked_badge_id = '0654630c-a4c4-45e9-9c32-af6ff8189845' WHERE id = 'ec77b5e2-5100-4aea-babe-ebffd0116f4d';
UPDATE public.poi SET linked_badge_id = '46bbfa4c-0bee-45bb-94bf-01db2b6f305d' WHERE id = 'ecb11e09-b3af-4ee0-bf06-c6b28a78dfa6';
UPDATE public.poi SET linked_badge_id = 'dd6453ef-936a-4e9d-a218-abf7efeb1540' WHERE id = 'ecc5c12f-6557-4089-a17c-4134a5726b75';
UPDATE public.poi SET linked_badge_id = '2b6f7bf8-6b81-438e-84fe-7e6ce83e8446' WHERE id = 'ececad98-c251-4c86-a47a-6a9c268b6950';
UPDATE public.poi SET linked_badge_id = '92f551d3-22b1-48d7-8550-7142d9a98c41' WHERE id = 'ecfac91c-0852-4c84-8c0b-9cfa54fd6b37';
UPDATE public.poi SET linked_badge_id = '58ef9186-8ddc-430a-89b3-6a62e475ccba' WHERE id = 'ed3b620c-dfea-4c5d-89a8-9ae7a1e68f7f';
UPDATE public.poi SET linked_badge_id = '313d64b7-c4a8-405f-afa1-9492db1f65eb' WHERE id = 'ed73a6dd-7893-4862-926a-57516f1dd038';
UPDATE public.poi SET linked_badge_id = '82812a51-fcc1-422c-addc-40e16362fbb9' WHERE id = 'ed84927a-924c-47ac-be72-a412baeb6969';
UPDATE public.poi SET linked_badge_id = '6dbce94c-bab8-4cc0-8344-5656c9175418' WHERE id = 'ed95c684-0951-4990-a2aa-c121ba5399df';
UPDATE public.poi SET linked_badge_id = 'a94e72cd-9a81-4f71-86d1-19a08f117e61' WHERE id = 'eda366ab-8ae1-403e-94aa-af4f53daedce';
UPDATE public.poi SET linked_badge_id = '6434db21-c9c2-4c01-b46f-fb29b156225e' WHERE id = 'edb54591-bece-4201-9d2f-1200965ef4a2';
UPDATE public.poi SET linked_badge_id = '56ae43e6-909a-4483-8a48-a3b48260e1ec' WHERE id = 'edc20ff3-8fbc-44d4-ba86-4d93976b2a54';
UPDATE public.poi SET linked_badge_id = 'a7f68fdf-246a-4bf6-bddf-448cf974c557' WHERE id = 'ede24e1e-0ed3-4183-b7b5-beab92a4e969';
UPDATE public.poi SET linked_badge_id = '766b277f-6ec3-4bb0-84af-4c99027659cd' WHERE id = 'ee01637f-2de0-4154-9270-749ea91b803f';
UPDATE public.poi SET linked_badge_id = '07d14f72-c122-4494-81b1-8a251fe8898f' WHERE id = 'ee082873-4e2d-48b6-9430-3e8c19892b01';
UPDATE public.poi SET linked_badge_id = '6d649152-ad15-4cf7-8350-fcfe3302522f' WHERE id = 'ee119668-2202-4400-96a2-627ff6abd580';
UPDATE public.poi SET linked_badge_id = '0c5c6451-0526-43f0-a5ce-d4b4150be988' WHERE id = 'ee1d70fd-0593-4bba-a4e7-3365d2a7615a';
UPDATE public.poi SET linked_badge_id = 'cf3a8dfe-102a-473e-a886-066b289d7f7a' WHERE id = 'ee732bf8-58f2-4875-b145-222503639164';
UPDATE public.poi SET linked_badge_id = '1a908a9f-4548-4d3a-8ad5-cb89a3ec69ba' WHERE id = 'eeb9f6e3-7841-4ec3-bf26-6dd2fe99b321';
UPDATE public.poi SET linked_badge_id = '4669b528-f23e-4974-bad3-bdde0c05a8e9' WHERE id = 'eecdff8c-32ab-49cf-905f-bcb1097fd1eb';
UPDATE public.poi SET linked_badge_id = 'c7427213-b453-4bda-b630-96ce90361896' WHERE id = 'eed6e953-de17-44a0-97d0-bafebdce04af';
UPDATE public.poi SET linked_badge_id = '54aab658-712e-498e-8e9f-e53324855e37' WHERE id = 'eef375af-495d-4f4d-bdb9-03bc80ff10cc';
UPDATE public.poi SET linked_badge_id = '61f2c66d-ece9-426f-b6a5-69c2ae444cf8' WHERE id = 'eefd01f0-4097-41c0-8314-0317ff13acfd';
UPDATE public.poi SET linked_badge_id = '817eddf0-cf05-4f80-b4a9-f796d31896ce' WHERE id = 'ef2a8a7b-bf92-4832-a0fb-bd3070296939';
UPDATE public.poi SET linked_badge_id = '00301a22-f3a9-4dc6-8974-0b9260313903' WHERE id = 'ef355bc7-9897-4fec-a5f2-cb0b1bea4b75';
UPDATE public.poi SET linked_badge_id = 'b071ce7f-b420-43fe-8f30-f0c3dc2bf12b' WHERE id = 'ef3aeb67-bbea-4182-b2bc-08e1b41c6f80';
UPDATE public.poi SET linked_badge_id = '2cc11e9f-13ec-4fad-b523-d5dadb372bc6' WHERE id = 'ef3e7938-8b42-4c7a-8856-27fda4e4d3c3';
UPDATE public.poi SET linked_badge_id = 'fee3444a-e290-4d07-8840-9b20153f4b29' WHERE id = 'ef5b2451-4bb8-4fef-acac-a85c5b847906';
UPDATE public.poi SET linked_badge_id = '7acc0015-85ef-42d0-9e10-fb8b032f7003' WHERE id = 'ef64817f-2616-4a30-b1d8-23f58c6815e6';
UPDATE public.poi SET linked_badge_id = 'fab4dcea-9826-4f99-9a1f-f022940aee2b' WHERE id = 'ef900bfa-ff45-4beb-83e9-f7bc2aef5892';
UPDATE public.poi SET linked_badge_id = '2ffe42ad-72af-418a-8817-5cad1d178b1e' WHERE id = 'f0136056-9490-40d0-826b-c31e70f8d777';
UPDATE public.poi SET linked_badge_id = '327c3ce5-4778-4bac-9a87-439281e21c8b' WHERE id = 'f05022c3-99ee-42d2-a28a-eff5721ea930';
UPDATE public.poi SET linked_badge_id = '16d98acf-d68b-4f81-80a0-4fb3ffd46a02' WHERE id = 'f06a41f4-c149-4693-81aa-2e03927f4bf4';
UPDATE public.poi SET linked_badge_id = 'd16c14a8-bc54-4e0f-ae3d-8539127ff537' WHERE id = 'f0756091-39ad-4be5-97e5-f5af99165d1d';
UPDATE public.poi SET linked_badge_id = '41d8fa2a-f0f1-49fc-96f5-793e0df217fb' WHERE id = 'f07ec910-79c5-4b6d-83b2-91bd0d41d685';
UPDATE public.poi SET linked_badge_id = '2427f893-475b-437f-af38-fa4f8e8414b8' WHERE id = 'f0a9f485-5ef6-4fc1-835d-5237a13c3792';
UPDATE public.poi SET linked_badge_id = '3a53526c-4daf-4cb5-9a76-f608656c282a' WHERE id = 'f0b4b2b4-9115-40c3-8aea-ceb7d4a053f1';
UPDATE public.poi SET linked_badge_id = '7ca6be24-2a85-4902-831f-b9f8692a0292' WHERE id = 'f0d77529-1ddd-4ee1-b738-cdf34d110094';
UPDATE public.poi SET linked_badge_id = '82e8627a-7a37-4fdf-90de-ea1f11b8c7ef' WHERE id = 'f0e49bd5-fa5c-4d8b-b14e-0036a12c1a0a';
UPDATE public.poi SET linked_badge_id = 'da9bf23b-7590-49cc-8336-c4b2494b6aa0' WHERE id = 'f0f2ec96-1a49-4100-ae80-e028eae48d9a';
UPDATE public.poi SET linked_badge_id = '3c11bd31-1e89-4823-9904-a7a594814e59' WHERE id = 'f10d7b79-e4a0-4d67-9a2d-89fcc7759c0b';
UPDATE public.poi SET linked_badge_id = 'fae94a38-81e4-4e02-b788-756c327a0b90' WHERE id = 'f116e0aa-ef4d-437e-9c11-e0276dd51087';
UPDATE public.poi SET linked_badge_id = 'caeb37f1-9303-4dc1-8105-720c91e96e66' WHERE id = 'f11a8cbd-1a0f-4db2-b79a-7ade77e4cbcb';
UPDATE public.poi SET linked_badge_id = 'c11cd9ae-a07f-4578-8a28-f5ca1dccaf3e' WHERE id = 'f11aeccb-9293-4c89-9b45-aaf36c8edcfc';
UPDATE public.poi SET linked_badge_id = '60facc90-c460-43c1-9196-e1e7b6f1c68e' WHERE id = 'f1704982-a004-4f1a-9515-78275e3ee8f0';
UPDATE public.poi SET linked_badge_id = '38fdff21-034b-4699-852d-7f2b3591f9b2' WHERE id = 'f198013b-52e6-4e97-bf17-ecc55f71a85a';
UPDATE public.poi SET linked_badge_id = 'cd086390-e5f3-4533-8303-26ab265a0674' WHERE id = 'f2463786-d85f-4f21-8ff8-e556f001c590';
UPDATE public.poi SET linked_badge_id = '6529a57b-7329-4277-b5b7-99a55b8c4f04' WHERE id = 'f25e31b7-4662-44df-b82f-68911073cd10';
UPDATE public.poi SET linked_badge_id = '978ce1a3-aafd-4524-8082-db8d50b6ea3b' WHERE id = 'f2868196-608b-4230-877e-39aae3cda7ee';
UPDATE public.poi SET linked_badge_id = '9349c79c-2f2f-4ece-8261-297be911dc2e' WHERE id = 'f28981e2-25e7-487d-a5a5-3b0eec735336';
UPDATE public.poi SET linked_badge_id = '7f448fcf-08d5-4abd-9302-2deafe00b33d' WHERE id = 'f28dba10-9287-4963-8276-7df0e2e46c10';
UPDATE public.poi SET linked_badge_id = '11ea1d16-7ee7-475c-bd76-f8c315236546' WHERE id = 'f2bf3ec5-36c9-4c8c-804f-5c830a72215b';
UPDATE public.poi SET linked_badge_id = '6c06c7bc-fb37-4c76-9f41-48ded5167b3a' WHERE id = 'f2d469fe-a025-45ba-8e88-ac86518731f1';
UPDATE public.poi SET linked_badge_id = '91b077f2-0ac3-460d-8a81-57b3335a40c0' WHERE id = 'f2e7cdff-b67f-46b1-b658-e1c5471b3995';
UPDATE public.poi SET linked_badge_id = '00eee2ee-d3aa-48d9-80ce-fd5a8138c457' WHERE id = 'f2fac65d-d941-40ee-bbeb-80ca1a52168e';
UPDATE public.poi SET linked_badge_id = '722fdde9-e402-4f53-bd14-58c1ea330f28' WHERE id = 'f2fd1c8d-f3d8-41b8-965d-7bc0359246c7';
UPDATE public.poi SET linked_badge_id = '932e5175-1b1e-4dd4-a82c-97e5f555f96b' WHERE id = 'f3026095-5bd1-4e12-8d3f-79251dc224ea';
UPDATE public.poi SET linked_badge_id = '94e79da5-c064-4086-ab2f-070a99c7dc91' WHERE id = 'f3437baf-b386-4b2e-bd3a-ef22bf4e6dcf';
UPDATE public.poi SET linked_badge_id = 'fcfcf800-56ae-42db-a3f3-3e09aad4e2d9' WHERE id = 'f36669f7-9f61-4fdd-8d0f-d59751c114dc';
UPDATE public.poi SET linked_badge_id = 'db82bdba-004d-4e9e-b807-9b2025997a0d' WHERE id = 'f36aee6e-f3dd-4722-9b3f-cf0ad7fae6a5';
UPDATE public.poi SET linked_badge_id = 'ada4215c-9f77-4a2a-bebb-512eeb03acc5' WHERE id = 'f371b292-cd76-413a-bd17-9e1337050979';
UPDATE public.poi SET linked_badge_id = '4f936b91-d5b6-4bf8-b815-1471d271b79d' WHERE id = 'f37baecf-f7c4-4219-b0e0-0410369471b1';
UPDATE public.poi SET linked_badge_id = '8b283f6f-11be-4b8f-bdca-a6f2139f3bcf' WHERE id = 'f3949159-1890-42ce-8d3b-09d1116de7c4';
UPDATE public.poi SET linked_badge_id = '78a4c3e1-fef2-4cbd-b97e-126fb2d321c2' WHERE id = 'f39632b8-4bf7-4077-806f-3578f41d5da7';
UPDATE public.poi SET linked_badge_id = 'f35919f1-2e0d-44f9-8617-014c4fac192e' WHERE id = 'f3baa8a6-7911-4b36-ab3c-136b082ce343';
UPDATE public.poi SET linked_badge_id = 'e6f45d36-0160-410f-a067-179a4c6aff50' WHERE id = 'f3ec9fea-7cde-4da1-8fe0-8111b36bf274';
UPDATE public.poi SET linked_badge_id = 'ec24531c-bcf4-4123-9b70-9a2dbf877b32' WHERE id = 'f3f85334-811d-4307-9b71-130b967fc8bc';
UPDATE public.poi SET linked_badge_id = '97498856-4ec4-4235-9242-4abd4e55203d' WHERE id = 'f4048d0d-5980-4b65-9b68-4b67809d0a67';
UPDATE public.poi SET linked_badge_id = '0ccee6f6-d8f3-4d92-9364-d8a344feeb95' WHERE id = 'f40a8be6-0984-417d-80ac-fe71a720da1b';
UPDATE public.poi SET linked_badge_id = 'eff3c4e4-11d8-42bb-8ea1-435bf7e22b57' WHERE id = 'f43fc791-be68-4461-a548-96fb5cc85285';
UPDATE public.poi SET linked_badge_id = '3d643f6b-3dbb-480f-9d37-49ef423cd888' WHERE id = 'f45a1965-fe29-402e-922f-e79203a28ee6';
UPDATE public.poi SET linked_badge_id = 'd72ba4b5-2eba-4706-801a-5cc91e696884' WHERE id = 'f467a8bc-9fe5-4420-954b-d832f255afed';
UPDATE public.poi SET linked_badge_id = '4c8a43c8-e16d-42c6-b83e-26651ddfc261' WHERE id = 'f46e0645-874f-4a84-9672-e6ef6f79bed8';
UPDATE public.poi SET linked_badge_id = '68c4eeda-d0ea-4efb-8b19-991c34d9a97d' WHERE id = 'f490f622-b272-4031-9faf-412e4e553fe3';
UPDATE public.poi SET linked_badge_id = '14dfb74b-e83a-4356-8481-1659a221d6ca' WHERE id = 'f4d47f48-6fe7-468f-9eac-8051d5405412';
UPDATE public.poi SET linked_badge_id = 'fb17cde8-b89c-44e6-815b-79d6921e9044' WHERE id = 'f4f471a9-b443-4a55-9299-17aea68220e3';
UPDATE public.poi SET linked_badge_id = '20781c20-309c-46f3-9e8a-83ff09e05634' WHERE id = 'f500c609-ae32-4d37-9ff5-0f131d42f93e';
UPDATE public.poi SET linked_badge_id = '05fce504-78d8-4e72-ad75-c629c098c39a' WHERE id = 'f506b480-1ced-4688-8cb5-c4aa7ea3084c';
UPDATE public.poi SET linked_badge_id = '9ee576d5-b00e-4a89-be38-0968dc94624c' WHERE id = 'f53ebac7-6c2d-43ed-afe8-4fb86ea7fa60';
UPDATE public.poi SET linked_badge_id = '9d76cc89-fa82-4f78-a8aa-a765ac87cc07' WHERE id = 'f5b56f51-38e9-4d2c-9e84-796c0cd2bf46';
UPDATE public.poi SET linked_badge_id = '43623353-c25f-4c13-9582-99c08a1f2348' WHERE id = 'f5bebfe9-8576-4900-8ac0-dce0422b7a23';
UPDATE public.poi SET linked_badge_id = '43e0629c-4db7-4404-afb6-ba3c4d1e102e' WHERE id = 'f5d50885-c4d2-4e6a-b3ff-a73ade67fcc3';
UPDATE public.poi SET linked_badge_id = '7488ec2e-36fd-478e-baec-75084f3e1afd' WHERE id = 'f5dcf1aa-a5dd-4909-bc79-04eae8980e9e';
UPDATE public.poi SET linked_badge_id = 'fee901ba-f80e-4f04-9121-700dad564afd' WHERE id = 'f602b366-1a3e-4be1-b3dd-5bf769122ab7';
UPDATE public.poi SET linked_badge_id = '5fe87a12-a27a-49d9-8980-9730c6783182' WHERE id = 'f61a4376-68cd-4bfb-8b89-3b27297fb14f';
UPDATE public.poi SET linked_badge_id = '931261a1-ee2c-4755-9605-0d361dcf39a1' WHERE id = 'f61a5411-5e42-4925-aaf3-784678648156';
UPDATE public.poi SET linked_badge_id = 'f25e678b-acdf-42ee-972b-dd91261a83ee' WHERE id = 'f6359b1b-fb0f-4cea-bbcd-45f09cf608d9';
UPDATE public.poi SET linked_badge_id = 'cf9782e2-ba3c-4006-b966-f75205f3ef19' WHERE id = 'f63d6405-94ce-47e3-915a-89424ae9bfb0';
UPDATE public.poi SET linked_badge_id = 'ab8e3439-05e8-4826-a45b-8b08204dba8b' WHERE id = 'f644e093-d135-44eb-9499-a9a0dd63c47e';
UPDATE public.poi SET linked_badge_id = '3fd32d9d-b813-486a-a65c-eec7ac29553e' WHERE id = 'f6aaf0df-a0bf-451f-baca-aeb94ecf4a82';
UPDATE public.poi SET linked_badge_id = 'edb99cd4-1ed5-4c88-8600-2dbef4117c18' WHERE id = 'f6ac755c-81d9-4724-8760-522d2141e4dc';
UPDATE public.poi SET linked_badge_id = '9361e790-b4af-4c25-879b-2a091cacdf9d' WHERE id = 'f6ca7853-fb78-46e9-b9af-a93c4ddb87cd';
UPDATE public.poi SET linked_badge_id = 'd4d5de39-6a31-4b47-afe7-b2e4e355274c' WHERE id = 'f6cd5664-242b-48d5-84ee-0171b06538ac';
UPDATE public.poi SET linked_badge_id = '4820d69a-45be-479e-8544-9c779fbd8fb0' WHERE id = 'f6cf0e81-b37b-452e-84b0-8256f8a7adcb';
UPDATE public.poi SET linked_badge_id = '4f36dd27-c805-4c0f-90f4-ad7ecdeb6e49' WHERE id = 'f722cc9d-40cc-4c0a-ad2b-ec718463c2f2';
UPDATE public.poi SET linked_badge_id = '49fdd562-6857-4907-b179-d1ac65e37de9' WHERE id = 'f732d163-9d67-4ee0-b931-94a9e0e3cae4';
UPDATE public.poi SET linked_badge_id = '3a6ad21a-6788-4db9-bee7-8029c57a48fb' WHERE id = 'f749cba2-47db-484e-8364-7ff29e4d4711';
UPDATE public.poi SET linked_badge_id = '91f594b3-c1b7-4391-9b80-50f60e6c9564' WHERE id = 'f794de00-0d95-432b-bf9b-5d882c983131';
UPDATE public.poi SET linked_badge_id = '4637fb60-a26d-4180-b4c8-2f3a4edecf63' WHERE id = 'f7c37745-e8bc-46d4-8924-b52700ab5917';
UPDATE public.poi SET linked_badge_id = '0df394d5-f069-41ae-a304-51862cdc97d6' WHERE id = 'f809a416-2bbb-4cf6-8c2f-aa990b3ce9e2';
UPDATE public.poi SET linked_badge_id = '560a6310-24e0-4218-b287-22058a6779b2' WHERE id = 'f809b9d2-004b-4b61-81cb-3580ad8a0e79';
UPDATE public.poi SET linked_badge_id = 'a8cdd189-a2aa-42d8-b655-f2713e9e4b8f' WHERE id = 'f82d6f17-a040-4c19-bfd2-c5569b86f991';
UPDATE public.poi SET linked_badge_id = '6e6f2720-6263-4e84-a360-19ed5843afd1' WHERE id = 'f835309d-978b-47f5-9dbc-3bb4c761aa8c';
UPDATE public.poi SET linked_badge_id = '01fb1fb6-ffac-441d-80c2-067a3c62a0c2' WHERE id = 'f88b1745-4e85-4624-858f-8312198d94e4';
UPDATE public.poi SET linked_badge_id = '5aba65b3-a368-4ac1-bd4d-99d3e5e0706e' WHERE id = 'f8aa93aa-e0e2-41ba-92e1-e2c436c42caa';
UPDATE public.poi SET linked_badge_id = '38c945a6-2e70-46ef-bca1-b11308d2aeb9' WHERE id = 'f8b0c550-d25e-40e6-8584-275136c59c56';
UPDATE public.poi SET linked_badge_id = '8f248806-49e0-4c4a-af68-ec1c6294fe25' WHERE id = 'f8df3d2b-28ab-4d3b-a11a-e8e9b1a38ab5';
UPDATE public.poi SET linked_badge_id = '68524f8b-8134-475e-96dd-e9225b4ba8e7' WHERE id = 'f8ec7d24-704a-4344-9589-20ac15f6e95e';
UPDATE public.poi SET linked_badge_id = '5e498d95-fdbc-49a2-bb63-a41b58cf3588' WHERE id = 'f91cb22e-67d8-49f3-9baa-2cc8d3a0c490';
UPDATE public.poi SET linked_badge_id = 'b7c606d4-65c4-4dc0-998f-f15a7e578172' WHERE id = 'f91f552d-b410-43b9-976d-013fa2f8126c';
UPDATE public.poi SET linked_badge_id = 'a8cb8b20-bbd8-41d7-9215-0ea7b37f4240' WHERE id = 'f94a82f3-4443-4e96-9cca-f2ecd27a55ac';
UPDATE public.poi SET linked_badge_id = '89d55012-c1c6-4823-9ff4-4f3e91317031' WHERE id = 'f957c684-c172-4f8b-b352-9d32b81cbbf4';
UPDATE public.poi SET linked_badge_id = '1688b34c-9456-4aa3-8198-0fa190779501' WHERE id = 'f968450b-6013-418a-888f-ce8d318b054a';
UPDATE public.poi SET linked_badge_id = 'b2a38d69-06ed-4997-88b8-3f89ccc86690' WHERE id = 'f97c8dca-2855-4998-924a-ae9f6c03714c';
UPDATE public.poi SET linked_badge_id = 'a2617f59-3cf9-4e40-88fa-d2354e1543ee' WHERE id = 'f9c613cc-0244-461d-98da-12899e9096f7';
UPDATE public.poi SET linked_badge_id = 'e29cc9a5-23b2-42f6-a6f1-4d8ac95fee17' WHERE id = 'f9d4ae77-0f98-4d50-8b6c-34a89cd9a6cd';
UPDATE public.poi SET linked_badge_id = '7e5cc534-2b34-4c38-bcf1-afc279e15236' WHERE id = 'f9df0b61-0fe9-429e-abdc-5821941e9dd2';
UPDATE public.poi SET linked_badge_id = 'f041141a-8a4e-447f-8b6e-8a003e90186a' WHERE id = 'f9eb53ea-04c1-4c5a-aff2-317d9b108399';
UPDATE public.poi SET linked_badge_id = '0fd2cba4-81b3-44c8-9154-29afabc27840' WHERE id = 'fa013acd-eccd-43da-b025-17355fcf790a';
UPDATE public.poi SET linked_badge_id = 'fd44cefd-abe9-4bc6-89a7-3bd5bf8ef283' WHERE id = 'fa055286-98b2-480d-98ec-94fd2f8921dd';
UPDATE public.poi SET linked_badge_id = '9ae5c212-bd76-4d28-92e5-03e814efbacf' WHERE id = 'fa303f4e-ef0e-439b-9d7b-36730488b6cf';
UPDATE public.poi SET linked_badge_id = '798f4273-859e-4d72-8e9b-7b0b77732f86' WHERE id = 'fa35a1d4-f159-407d-b37b-a3fcf361644e';
UPDATE public.poi SET linked_badge_id = '5d492b6d-6fc0-4d8e-8868-4ca1ba363788' WHERE id = 'fa4c2e26-0179-4b3d-a1e3-4c46c91af5f5';
UPDATE public.poi SET linked_badge_id = '54075b1c-e3f9-4097-8b53-1d6649edac28' WHERE id = 'fa67736f-9a10-4888-8a5d-ac3dfc811758';
UPDATE public.poi SET linked_badge_id = 'a28391e2-0a62-4426-9a4f-abc7fef8cfde' WHERE id = 'fa6b243f-9b00-41ae-9076-4d94fffceefe';
UPDATE public.poi SET linked_badge_id = '36e39744-c920-499e-a1cb-154c33cd03ad' WHERE id = 'fa822360-9b11-4127-a6c5-3a0664fbb03f';
UPDATE public.poi SET linked_badge_id = 'ce522685-a58b-41de-84d7-8dab2d381cbd' WHERE id = 'fae45697-c0bc-4f8a-9abc-c3b33e21e96f';
UPDATE public.poi SET linked_badge_id = 'dbcb3ec4-042f-4d2d-bfa8-18f37eeff4ff' WHERE id = 'fb0b836b-a7bc-4a37-b8bb-49dc30c8c545';
UPDATE public.poi SET linked_badge_id = '6f25ac6e-9c5d-4405-9aad-21b72c44ace4' WHERE id = 'fb0fcef5-41c5-4529-83bd-1bd88a649f3f';
UPDATE public.poi SET linked_badge_id = '27a27494-4fd1-455c-9b53-6204c3d598cd' WHERE id = 'fb37ed69-2448-4682-939c-9d8a2bb4345b';
UPDATE public.poi SET linked_badge_id = '0d814cff-bf53-45d0-8827-182e730f406c' WHERE id = 'fb4578d8-ec10-4d86-99fa-5636ffab0d40';
UPDATE public.poi SET linked_badge_id = '34281627-6250-47ba-94b0-709084f86ec7' WHERE id = 'fb598bd1-7112-4725-822f-3878faab4214';
UPDATE public.poi SET linked_badge_id = '02b91c60-e3b4-4179-950c-b45f4e5694c7' WHERE id = 'fb73792d-215e-4051-b3ab-bd0b03f4dd00';
UPDATE public.poi SET linked_badge_id = '3d733d80-5fb5-4029-99ea-1bbbcc1dbdb3' WHERE id = 'fb8c0a32-c432-48d3-8b06-8ab5f933e5a9';
UPDATE public.poi SET linked_badge_id = 'd334ef77-7b59-42a3-8f73-a9b2ecae62d3' WHERE id = 'fbacdd2b-76ec-4261-a671-b2e7332e316c';
UPDATE public.poi SET linked_badge_id = 'cdcff0d2-3b42-42c9-bf57-9297c37211f6' WHERE id = 'fbbc9749-a0db-4f46-a482-e0c07be4d7fc';
UPDATE public.poi SET linked_badge_id = 'd4c2a637-7ae1-47cb-a8ff-a981e3d8fd5f' WHERE id = 'fbf4ac4d-8688-4606-8299-dd2ce50c01c7';
UPDATE public.poi SET linked_badge_id = '525f4961-7c7d-468b-aca2-ea122ed7b889' WHERE id = 'fc1971df-343f-4b16-b987-6860006b6d88';
UPDATE public.poi SET linked_badge_id = '8b40ffc7-3855-4f2f-b110-9224ef0f18b7' WHERE id = 'fc20c405-f5f8-40d6-837a-cfa08115330a';
UPDATE public.poi SET linked_badge_id = '6e67c849-ca08-472b-a09c-8421df5c2902' WHERE id = 'fc636c54-cf86-428a-8cae-52bbae663c06';
UPDATE public.poi SET linked_badge_id = 'fb2e58c0-f97c-4535-a18f-7382947dc7f8' WHERE id = 'fc80ba1a-6d4d-452c-8b63-300cce8a4ed4';
UPDATE public.poi SET linked_badge_id = 'e6837584-366c-4225-a9e6-bd228c2d7462' WHERE id = 'fc929015-2fd5-4efe-806b-cfb8d5566ddb';
UPDATE public.poi SET linked_badge_id = 'f7f1349e-e6d3-4e9a-8777-a73f834b5d06' WHERE id = 'fcbdbc0f-71a4-4999-90da-58eb19cc1f6c';
UPDATE public.poi SET linked_badge_id = '3c096ef0-6606-4ebb-8c2e-debf1fac7e8d' WHERE id = 'fcd4e78a-008b-4e6b-8b10-f548e78db998';
UPDATE public.poi SET linked_badge_id = '42d7f43b-89c6-414b-85f3-d1f0be437f9e' WHERE id = 'fd3cd133-5a6f-4c6a-ab26-0d9e06dfc6ea';
UPDATE public.poi SET linked_badge_id = '57d0c3d9-427d-434c-a868-75a7c29b37e0' WHERE id = 'fd425f58-3b61-4db1-928b-78d9041ac0a8';
UPDATE public.poi SET linked_badge_id = 'b19962e0-25a8-470a-8207-1eed8656454e' WHERE id = 'fe1360ea-2934-46f5-96fd-aeb1ae739b6b';
UPDATE public.poi SET linked_badge_id = '8abc57cc-3cd8-4242-814a-e48b35ba21a2' WHERE id = 'fe28681d-4b57-4785-90df-db5483d6b01f';
UPDATE public.poi SET linked_badge_id = 'be34e0b5-b8e6-42ff-a854-5e240249fa8b' WHERE id = 'fe331089-a7c8-4cce-9084-5b202c0c2354';
UPDATE public.poi SET linked_badge_id = '260111c1-52ad-489d-ba83-93b9f0dc36fd' WHERE id = 'fe6d6cce-c4d2-4be2-aba6-fb1a7175ef02';
UPDATE public.poi SET linked_badge_id = '074a8e58-a5fd-40cb-8401-b3c535b41a52' WHERE id = 'feb3fdce-9d80-4015-ba61-1858ad1939f2';
UPDATE public.poi SET linked_badge_id = 'fa57e4d5-6f8e-415d-a8f8-d131bee6b822' WHERE id = 'fed00994-eab0-4d7f-be34-a529253fe19e';
UPDATE public.poi SET linked_badge_id = '9d7262fe-a9e7-4d19-9329-456d7522a882' WHERE id = 'fef7345c-ced0-4cd7-8dd5-171c6f7fc299';
UPDATE public.poi SET linked_badge_id = '89b0dfb3-6bde-4a6d-8484-7c1eaf4d9efe' WHERE id = 'ff034482-9d31-418f-8bf2-c68796e94b69';
UPDATE public.poi SET linked_badge_id = '2f2a2479-6e33-4b9f-8dff-e4488d135fcd' WHERE id = 'ff2e5027-2223-420c-ad53-8f6370cdb92a';
UPDATE public.poi SET linked_badge_id = '3bf0f93b-48b2-4f73-a11e-4ffd7349f00c' WHERE id = 'ff5fae14-7b5e-4d68-a886-d374d2690624';
UPDATE public.poi SET linked_badge_id = '89d30cb4-4a1e-4474-8e1e-86aeced27c0d' WHERE id = 'ff72ad85-02a2-449e-bc4b-188bf1c6a6a2';
UPDATE public.poi SET linked_badge_id = 'f5b05f1f-8b95-49f5-9578-5fb76e5dc4de' WHERE id = 'ff7e54d4-c179-4cb4-ae0c-7ee7fd88ddba';
UPDATE public.poi SET linked_badge_id = 'bd54226b-3549-481b-af6a-add69d609629' WHERE id = 'ff8a79c9-953a-4780-ad71-6d966c13bf92';
UPDATE public.poi SET linked_badge_id = '5be17d5a-17d2-42ee-9ef9-cce62734ead8' WHERE id = 'ffc5ba2e-8aaa-4827-9033-d5570a31622e';
