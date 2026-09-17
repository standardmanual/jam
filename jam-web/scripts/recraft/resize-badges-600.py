#!/usr/bin/env python3
"""
Supabase Storage images 버킷의 badges/ 하위 이미지 중 최대변이 600px를 넘는 파일을
비율 유지한 채 최대변 600px로 축소해 같은 경로에 덮어쓴다.

- 알파 채널(RGBA)은 그대로 보존한다 (PNG 무손실 리사이즈).
- 이미 600px 이하인 파일은 건드리지 않는다.
- 처리 전 원본을 로컬 백업 디렉토리에 저장한다 (되돌리기용).
- .env.local에서 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 읽는다.

사용법:
  python3 resize-badges-600.py            # 실제 실행
  python3 resize-badges-600.py --dry-run  # 대상 파일과 예상 절감량만 출력
"""
import io
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image

MAX_SIDE = 600
BUCKET = "images"
PREFIX = "badges"
BACKUP_DIR = Path("/tmp/badge-resize-backup")
ENV_PATH = Path(__file__).resolve().parents[2] / ".env.local"

DRY_RUN = "--dry-run" in sys.argv


def load_env():
    env = {}
    for line in ENV_PATH.read_text().splitlines():
        m = re.match(r'^([A-Z0-9_]+)=(.*)$', line.strip())
        if m:
            env[m.group(1)] = m.group(2).strip().strip('"')
    return env


ENV = load_env()
SUPABASE_URL = ENV["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SERVICE_ROLE_KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]


def curl_bytes(args, input_bytes=None):
    """curl을 서브프로세스로 실행해 stdout(바이트)을 반환한다. 로컬 SSL 인증서 체인 이슈를 우회."""
    proc = subprocess.run(
        ["curl", "-sS", "--fail", *args],
        input=input_bytes,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"curl failed ({proc.returncode}): {proc.stderr.decode(errors='replace')[:500]}")
    return proc.stdout


def api_request(method, path, body=None, headers=None):
    url = f"{SUPABASE_URL}{path}"
    args = ["-X", method, url, "-H", f"Authorization: Bearer {SERVICE_ROLE_KEY}", "-H", f"apikey: {SERVICE_ROLE_KEY}"]
    data = None
    if body is not None:
        args += ["-H", "Content-Type: application/json", "--data-binary", "@-"]
        data = json.dumps(body).encode()
    if headers:
        for k, v in headers.items():
            args += ["-H", f"{k}: {v}"]
    return curl_bytes(args, input_bytes=data)


def list_all(prefix):
    """Storage list API를 재귀 호출해 prefix 하위 전체 파일 경로를 모은다."""
    files = []
    stack = [prefix]
    while stack:
        cur = stack.pop()
        offset = 0
        while True:
            body = {"prefix": cur, "limit": 1000, "offset": offset, "sortBy": {"column": "name", "order": "asc"}}
            res = json.loads(api_request("POST", f"/storage/v1/object/list/{BUCKET}", body))
            if not res:
                break
            for item in res:
                full = f"{cur}/{item['name']}"
                if item.get("id") is None:
                    # 폴더
                    stack.append(full)
                else:
                    files.append((full, item["metadata"]["size"] if item.get("metadata") else 0))
            if len(res) < 1000:
                break
            offset += 1000
    return files


def download(path):
    url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"
    return curl_bytes([url])


def upload(path, data, content_type):
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    args = [
        "-X", "PUT", url,
        "-H", f"Authorization: Bearer {SERVICE_ROLE_KEY}",
        "-H", f"apikey: {SERVICE_ROLE_KEY}",
        "-H", f"Content-Type: {content_type}",
        "-H", "x-upsert: true",
        "--data-binary", "@-",
    ]
    return curl_bytes(args, input_bytes=data)


def main():
    print(f"[1/3] {BUCKET}/{PREFIX} 하위 파일 목록 조회 중...")
    files = list_all(PREFIX)
    print(f"  총 {len(files)}개 파일 발견")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    total_before = 0
    total_after = 0
    skipped = 0
    processed = 0
    failed = []

    for i, (path, orig_size) in enumerate(files, 1):
        if not path.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            continue
        try:
            raw = download(path)
        except Exception as e:
            failed.append((path, f"download: {e}"))
            continue

        try:
            img = Image.open(io.BytesIO(raw))
            w, h = img.size
        except Exception as e:
            failed.append((path, f"open: {e}"))
            continue

        if max(w, h) <= MAX_SIDE:
            skipped += 1
            total_before += len(raw)
            total_after += len(raw)
            continue

        # 백업
        backup_path = BACKUP_DIR / path
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        if not backup_path.exists():
            backup_path.write_bytes(raw)

        ratio = MAX_SIDE / max(w, h)
        new_w, new_h = max(1, round(w * ratio)), max(1, round(h * ratio))

        is_png = path.lower().endswith(".png")
        mode = "RGBA" if is_png else "RGB"
        resized = img.convert(mode).resize((new_w, new_h), Image.LANCZOS)

        buf = io.BytesIO()
        if is_png:
            resized.save(buf, "PNG", optimize=True)
            content_type = "image/png"
        else:
            resized.save(buf, "JPEG", quality=90)
            content_type = "image/jpeg"
        new_bytes = buf.getvalue()

        total_before += len(raw)
        total_after += len(new_bytes)
        processed += 1

        print(f"  [{i}/{len(files)}] {path}: {w}x{h} ({len(raw)//1024}KB) -> {new_w}x{new_h} ({len(new_bytes)//1024}KB)")

        if not DRY_RUN:
            try:
                upload(path, new_bytes, content_type)
            except Exception as e:
                failed.append((path, f"upload: {e}"))

    print()
    print(f"[결과] 처리 대상 {processed}개, 스킵(이미 {MAX_SIDE}px 이하) {skipped}개, 실패 {len(failed)}개")
    print(f"용량: {total_before/1024/1024:.1f}MB -> {total_after/1024/1024:.1f}MB "
          f"({100*total_after/total_before:.1f}% / 절감 {(total_before-total_after)/1024/1024:.1f}MB)")
    if failed:
        print("\n실패 목록:")
        for p, err in failed:
            print(f"  - {p}: {err}")
    print(f"\n원본 백업 위치: {BACKUP_DIR}")
    if DRY_RUN:
        print("\n(--dry-run 모드: 실제 업로드는 수행하지 않았습니다)")


if __name__ == "__main__":
    main()
