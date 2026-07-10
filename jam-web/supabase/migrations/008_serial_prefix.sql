-- inventory_items에 4자리 랜덤 알파벳 prefix 추가
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS serial_prefix TEXT;

-- 신규 발급 시 자동으로 4자리 대문자 랜덤 생성하는 트리거 함수
CREATE OR REPLACE FUNCTION public.generate_serial_prefix()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.serial_prefix IS NULL THEN
    NEW.serial_prefix := (
      SELECT string_agg(chr(floor(65 + random() * 26)::int), '')
      FROM generate_series(1, 4)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_serial_prefix
BEFORE INSERT ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.generate_serial_prefix();
