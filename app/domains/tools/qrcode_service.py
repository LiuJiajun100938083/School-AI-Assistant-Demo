"""QR 碼生成 — 純函式葉節點

依賴: qrcode[pil] (已在 requirements)
職責: str → PNG bytes
  - 輸入驗證
  - 呼叫 qrcode 庫
  - 固定輸出尺寸
不碰 DB、不碰其他 domain、不寫檔案系統。
"""

import io
import logging

from app.domains.tools.constants import (
    QR_EC_CHOICES,
    QR_EC_DEFAULT,
    QR_MAX_TEXT_LEN,
    QR_SIZE_DEFAULT,
)
from app.domains.tools.exceptions import ToolInputError

logger = logging.getLogger(__name__)


# 對應 qrcode 庫的 error correction 常數,延遲 import 避免單元測還沒裝庫就爆
def _ec_constant(level: str):
    import qrcode
    return {
        "L": qrcode.constants.ERROR_CORRECT_L,
        "M": qrcode.constants.ERROR_CORRECT_M,
        "Q": qrcode.constants.ERROR_CORRECT_Q,
        "H": qrcode.constants.ERROR_CORRECT_H,
    }[level]


def generate_qrcode_png(
    text: str,
    *,
    size: int = QR_SIZE_DEFAULT,
    error_correction: str = QR_EC_DEFAULT,
    border: int = 2,
) -> bytes:
    """
    給定文字,產生指定尺寸的 QR 碼 PNG bytes。

    Args:
        text: 要編碼的內容(URL / 文字)
        size: 輸出 PNG 邊長(pixel),預設 512
        error_correction: 'L' / 'M' / 'Q' / 'H'
        border: 靜止區大小(module 單位),預設 2

    Returns:
        PNG bytes

    Raises:
        ToolInputError: 空字串、超長、錯誤 EC、或編碼失敗
    """
    if text is None or not text.strip():
        raise ToolInputError("TOOL_INPUT_EMPTY", "內容不能為空")
    if len(text) > QR_MAX_TEXT_LEN:
        raise ToolInputError(
            "TOOL_INPUT_TOO_LONG",
            f"內容過長,最多 {QR_MAX_TEXT_LEN} 字",
        )
    if error_correction not in QR_EC_CHOICES:
        raise ToolInputError(
            "TOOL_INPUT_INVALID",
            f"error_correction 必須為 {sorted(QR_EC_CHOICES)} 之一",
        )

    try:
        import qrcode
    except ImportError as e:
        raise ToolInputError("QR_LIB_MISSING", "QR 庫未安裝") from e

    try:
        qr = qrcode.QRCode(
            error_correction=_ec_constant(error_correction),
            box_size=10,
            border=border,
        )
        qr.add_data(text)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
    except Exception as e:  # noqa: BLE001
        logger.warning("QR encode failed: %s", e)
        raise ToolInputError("QR_ENCODE_FAILED", "無法編碼,請縮短內容或降低糾錯等級") from e

    # 固定輸出尺寸 (qrcode 預設大小依 version 而變)
    try:
        img = img.resize((size, size))
    except Exception:  # noqa: BLE001
        pass  # 某些 image 物件可能不支援 resize,保留原始

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
