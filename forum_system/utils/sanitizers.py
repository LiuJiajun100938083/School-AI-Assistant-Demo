"""
内容安全工具
==========

提供XSS防护和内容清理功能。
"""

import re
from html import escape
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)

# 尝试导入bleach，如果不存在则使用基础方法
try:
    import bleach
    BLEACH_AVAILABLE = True
except ImportError:
    BLEACH_AVAILABLE = False
    logger.warning("bleach库未安装，将使用基础XSS防护方法")


class ContentSanitizer:
    """内容清理器"""

    # 允许的HTML标签（用于Markdown渲染后的内容）
    ALLOWED_TAGS: List[str] = [
        'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li',
        'blockquote', 'code', 'pre',
        'a', 'img',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'span', 'div',
        'hr',
    ]

    # 允许的属性
    ALLOWED_ATTRIBUTES: dict = {
        'a': ['href', 'title', 'target', 'rel'],
        'img': ['src', 'alt', 'width', 'height', 'title'],
        'code': ['class'],
        'pre': ['class'],
        'div': ['class'],
        'span': ['class'],
        'table': ['class'],
        'th': ['class', 'colspan', 'rowspan'],
        'td': ['class', 'colspan', 'rowspan'],
    }

    # 允许的URL协议
    ALLOWED_PROTOCOLS: List[str] = ['http', 'https', 'mailto']

    @classmethod
    def sanitize_html(cls, html_content: str) -> str:
        """
        清理HTML内容，防止XSS攻击

        Args:
            html_content: 原始HTML内容

        Returns:
            清理后的安全HTML
        """
        if not html_content:
            return ""

        if BLEACH_AVAILABLE:
            # 使用bleach进行专业清理
            return bleach.clean(
                html_content,
                tags=cls.ALLOWED_TAGS,
                attributes=cls.ALLOWED_ATTRIBUTES,
                protocols=cls.ALLOWED_PROTOCOLS,
                strip=True
            )
        else:
            # 基础清理方法
            return cls._basic_sanitize(html_content)

    @classmethod
    def _basic_sanitize(cls, content: str) -> str:
        """基础HTML清理（当bleach不可用时）"""
        if not content:
            return ""

        # 移除script标签
        content = re.sub(
            r'<script[^>]*>.*?</script>',
            '',
            content,
            flags=re.IGNORECASE | re.DOTALL
        )

        # 移除事件处理器
        content = re.sub(
            r'\s+on\w+\s*=\s*["\'][^"\']*["\']',
            '',
            content,
            flags=re.IGNORECASE
        )

        # 移除javascript:链接
        content = re.sub(
            r'href\s*=\s*["\']javascript:[^"\']*["\']',
            'href="#"',
            content,
            flags=re.IGNORECASE
        )

        # 移除style标签
        content = re.sub(
            r'<style[^>]*>.*?</style>',
            '',
            content,
            flags=re.IGNORECASE | re.DOTALL
        )

        # 移除iframe
        content = re.sub(
            r'<iframe[^>]*>.*?</iframe>',
            '',
            content,
            flags=re.IGNORECASE | re.DOTALL
        )

        return content

    @classmethod
    def escape_text(cls, text: str) -> str:
        """
        转义纯文本（用于用户名等显示）

        Args:
            text: 原始文本

        Returns:
            转义后的文本
        """
        if not text:
            return ""
        return escape(text)

    @classmethod
    def strip_html(cls, html_content: str) -> str:
        """
        移除所有HTML标签，只保留纯文本

        Args:
            html_content: HTML内容

        Returns:
            纯文本内容
        """
        if not html_content:
            return ""

        if BLEACH_AVAILABLE:
            return bleach.clean(html_content, tags=[], strip=True)
        else:
            # 基础方法：移除所有标签
            return re.sub(r'<[^>]+>', '', html_content)

    @classmethod
    def extract_mentions(cls, content: str) -> List[str]:
        """
        提取@提及的用户名

        Args:
            content: 内容文本

        Returns:
            提及的用户名列表
        """
        if not content:
            return []

        # 匹配@username格式
        pattern = r'@([a-zA-Z0-9_]+)'
        matches = re.findall(pattern, content)
        return list(set(matches))  # 去重

    @classmethod
    def create_content_preview(cls, content: str, max_length: int = 200) -> str:
        """
        创建内容预览

        Args:
            content: 原始内容
            max_length: 最大长度

        Returns:
            预览文本
        """
        if not content:
            return ""

        # 先移除HTML标签
        text = cls.strip_html(content)

        # 移除多余空白
        text = ' '.join(text.split())

        # 截断
        if len(text) <= max_length:
            return text

        return text[:max_length].rsplit(' ', 1)[0] + '...'


# 便捷函数
def sanitize_html(content: str) -> str:
    """清理HTML内容"""
    return ContentSanitizer.sanitize_html(content)


def escape_text(text: str) -> str:
    """转义纯文本"""
    return ContentSanitizer.escape_text(text)
