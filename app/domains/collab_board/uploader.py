"""
協作佈告板 — 檔案上傳器
=========================
職責: 校驗 + 儲存 + 返回 URL。

不碰業務（權限在 policy / 入口在 service）。
"""

import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import UploadFile

from app.domains.collab_board.constants import (
    ALLOWED_MIMES,
    ALLOWED_MIME_PREFIXES,
    MAX_FILE_SIZE,
)
from app.domains.collab_board.exceptions import (
    FileTooLargeError,
    InvalidFileTypeError,
)

logger = logging.getLogger(__name__)


class BoardFileUploader:
    def __init__(
        self,
        upload_dir: Path,
        max_size: int = MAX_FILE_SIZE,
    ):
        self._root = Path(upload_dir)
        self._root.mkdir(parents=True, exist_ok=True)
        self._max_size = max_size

    def _ensure_allowed(self, mime: str) -> None:
        if not mime:
            raise InvalidFileTypeError("unknown")
        if mime in ALLOWED_MIMES:
            return
        for prefix in ALLOWED_MIME_PREFIXES:
            if mime.startswith(prefix):
                return
        raise InvalidFileTypeError(mime)

    async def save(self, board_uuid: str, file: UploadFile) -> dict:
        """儲存檔案至 {root}/{board_uuid}/{uuid}{ext}，返回 {url, filename, size, mime}"""
        mime = file.content_type or ""
        self._ensure_allowed(mime)

        content = await file.read()
        size = len(content)
        if size > self._max_size:
            raise FileTooLargeError(size, self._max_size)

        ext = Path(file.filename or "").suffix.lower()
        if len(ext) > 10:  # 防超長副檔名
            ext = ""
        filename = f"{uuid.uuid4().hex}{ext}"

        board_dir = self._root / board_uuid
        board_dir.mkdir(parents=True, exist_ok=True)
        file_path = board_dir / filename
        file_path.write_bytes(content)

        rel = f"/uploads/boards/{board_uuid}/{filename}"
        return {
            "url": rel,
            "filename": filename,
            "original_name": file.filename or filename,
            "size": size,
            "mime": mime,
        }
