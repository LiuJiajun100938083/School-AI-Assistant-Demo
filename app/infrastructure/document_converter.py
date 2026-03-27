"""
文档转换器（基础设施层）

职责单一：将 Office 文档（DOCX/PPTX/XLSX 等）转换为 PDF。
不包含任何业务逻辑、数据库操作或外部服务调用。

转换策略（按优先级）：
    1. LibreOffice headless — 保留完整排版
    2. python-docx + fpdf2 降级 — 纯文本 PDF，内容可读
"""

import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# LibreOffice 可执行文件候选名称
_LIBREOFFICE_NAMES = ["soffice", "libreoffice"]

# 平台特定路径
_LIBREOFFICE_EXTRA_PATHS = [
    # Mac
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    # Windows 常见安装路径
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
]


def _find_libreoffice() -> Optional[str]:
    """自动检测 LibreOffice 可执行文件路径。"""
    for name in _LIBREOFFICE_NAMES:
        path = shutil.which(name)
        if path:
            return path

    for path in _LIBREOFFICE_EXTRA_PATHS:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path

    return None


class DocumentConverter:
    """
    Office 文档 → PDF 转换器。

    用法：
        converter = DocumentConverter()
        pdf_path = converter.to_pdf("doc.docx", "output/")
    """

    def __init__(self):
        self._libreoffice = _find_libreoffice()
        if self._libreoffice:
            logger.info("DocumentConverter: LibreOffice 路径 = %s", self._libreoffice)
        else:
            logger.info("DocumentConverter: LibreOffice 未检测到，将使用降级方案")

    @property
    def has_libreoffice(self) -> bool:
        return self._libreoffice is not None

    def to_pdf(self, source_path: str, output_dir: str) -> Optional[str]:
        """
        将源文件转为 PDF。

        Args:
            source_path: 源文件绝对路径
            output_dir: PDF 输出目录

        Returns:
            生成的 PDF 文件绝对路径；失败返回 None
        """
        source = Path(source_path)
        if not source.exists():
            logger.error("源文件不存在: %s", source_path)
            return None

        os.makedirs(output_dir, exist_ok=True)

        # 策略 1: LibreOffice
        if self._libreoffice:
            result = self._convert_with_libreoffice(str(source), output_dir)
            if result:
                return result
            logger.warning("LibreOffice 转换失败，尝试降级方案")

        # 策略 2: python-docx + fpdf2（仅 docx）
        if source.suffix.lower() in (".docx", ".doc"):
            return self._convert_docx_fallback(str(source), output_dir)

        logger.warning("无可用的转换方案: %s", source.suffix)
        return None

    def _convert_with_libreoffice(self, source_path: str, output_dir: str) -> Optional[str]:
        """使用 LibreOffice headless 转换。"""
        try:
            cmd = [
                self._libreoffice,
                "--headless",
                "--norestore",
                "--convert-to", "pdf",
                "--outdir", output_dir,
                source_path,
            ]
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=120,
            )

            if result.returncode != 0:
                stderr = result.stderr.decode("utf-8", errors="replace")
                logger.error("LibreOffice 转换失败 (exit=%d): %s", result.returncode, stderr)
                return None

            # LibreOffice 输出文件名 = 源文件名.pdf
            pdf_name = Path(source_path).stem + ".pdf"
            pdf_path = os.path.join(output_dir, pdf_name)

            if os.path.exists(pdf_path):
                logger.info("LibreOffice 转换成功: %s", pdf_path)
                return pdf_path

            logger.error("LibreOffice 未生成 PDF 文件: %s", pdf_path)
            return None

        except subprocess.TimeoutExpired:
            logger.error("LibreOffice 转换超时 (120s)")
            return None
        except Exception as e:
            logger.error("LibreOffice 转换异常: %s", e)
            return None

    def _convert_docx_fallback(self, source_path: str, output_dir: str) -> Optional[str]:
        """
        降级方案：用 python-docx 提取文本 → fpdf2 生成纯文本 PDF。
        不保留复杂排版，但内容完整可读。
        """
        try:
            from docx import Document
            from fpdf import FPDF

            # 1. 提取文本
            doc = Document(source_path)
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]

            if not paragraphs:
                logger.warning("DOCX 文件无文本内容: %s", source_path)
                return None

            # 2. 生成 PDF
            pdf = FPDF()
            pdf.set_auto_page_break(auto=True, margin=20)

            # 加载中文字体（Windows: 微软雅黑）
            font_path = r"C:\Windows\Fonts\msyh.ttc"
            if os.path.exists(font_path):
                pdf.add_font("msyh", "", font_path, uni=True)
                pdf.set_font("msyh", size=11)
            else:
                pdf.set_font("Helvetica", size=11)

            pdf.add_page()
            # 标题
            title = Path(source_path).stem
            pdf.set_font_size(16)
            pdf.cell(0, 12, title, new_x="LMARGIN", new_y="NEXT")
            pdf.ln(6)
            pdf.set_font_size(11)

            # 正文
            for para in paragraphs:
                pdf.multi_cell(0, 7, para)
                pdf.ln(2)

            pdf_name = Path(source_path).stem + ".pdf"
            pdf_path = os.path.join(output_dir, pdf_name)
            pdf.output(pdf_path)

            logger.info("DOCX 降级转换完成（纯文本 PDF）: %s", pdf_path)
            return pdf_path

        except ImportError as e:
            logger.error("降级转换缺少依赖: %s", e)
            return None
        except Exception as e:
            logger.error("DOCX 降级转换失败: %s", e)
            return None
