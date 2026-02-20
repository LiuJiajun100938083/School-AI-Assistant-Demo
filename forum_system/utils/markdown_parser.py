"""
Markdown解析器
=============

将Markdown内容转换为安全的HTML。
"""

import re
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# 尝试导入markdown库
try:
    import markdown
    from markdown.extensions.codehilite import CodeHiliteExtension
    from markdown.extensions.fenced_code import FencedCodeExtension
    from markdown.extensions.tables import TableExtension
    MARKDOWN_AVAILABLE = True
except ImportError:
    MARKDOWN_AVAILABLE = False
    logger.warning("markdown库未安装，将使用基础Markdown解析")

from .sanitizers import sanitize_html


class MarkdownParser:
    """Markdown解析器"""

    # Markdown扩展配置
    EXTENSIONS = [
        'markdown.extensions.fenced_code',
        'markdown.extensions.tables',
        'markdown.extensions.nl2br',  # 换行转<br>
        'markdown.extensions.sane_lists',
    ]

    # 代码高亮配置
    EXTENSION_CONFIGS = {
        'markdown.extensions.codehilite': {
            'css_class': 'highlight',
            'guess_lang': False
        }
    }

    _parser: Optional['markdown.Markdown'] = None

    @classmethod
    def get_parser(cls) -> Optional['markdown.Markdown']:
        """获取或创建Markdown解析器实例"""
        if not MARKDOWN_AVAILABLE:
            return None

        if cls._parser is None:
            try:
                cls._parser = markdown.Markdown(
                    extensions=cls.EXTENSIONS,
                    extension_configs=cls.EXTENSION_CONFIGS,
                    output_format='html5'
                )
            except Exception as e:
                logger.error(f"创建Markdown解析器失败: {e}")
                return None

        return cls._parser

    @classmethod
    def render(cls, content: str) -> str:
        """
        将Markdown转换为HTML

        Args:
            content: Markdown内容

        Returns:
            安全的HTML内容
        """
        if not content:
            return ""

        parser = cls.get_parser()

        if parser is not None:
            try:
                # 重置解析器状态
                parser.reset()
                # 转换Markdown
                html = parser.convert(content)
            except Exception as e:
                logger.error(f"Markdown解析失败: {e}")
                html = cls._basic_markdown(content)
        else:
            html = cls._basic_markdown(content)

        # 安全清理
        return sanitize_html(html)

    @classmethod
    def _basic_markdown(cls, content: str) -> str:
        """基础Markdown解析（当markdown库不可用时）"""
        if not content:
            return ""

        html = content

        # 转义HTML特殊字符（防止XSS）
        html = html.replace('&', '&amp;')
        html = html.replace('<', '&lt;')
        html = html.replace('>', '&gt;')

        # 代码块
        html = re.sub(
            r'```(\w*)\n(.*?)```',
            r'<pre><code class="language-\1">\2</code></pre>',
            html,
            flags=re.DOTALL
        )

        # 行内代码
        html = re.sub(r'`([^`]+)`', r'<code>\1</code>', html)

        # 标题
        html = re.sub(r'^######\s+(.+)$', r'<h6>\1</h6>', html, flags=re.MULTILINE)
        html = re.sub(r'^#####\s+(.+)$', r'<h5>\1</h5>', html, flags=re.MULTILINE)
        html = re.sub(r'^####\s+(.+)$', r'<h4>\1</h4>', html, flags=re.MULTILINE)
        html = re.sub(r'^###\s+(.+)$', r'<h3>\1</h3>', html, flags=re.MULTILINE)
        html = re.sub(r'^##\s+(.+)$', r'<h2>\1</h2>', html, flags=re.MULTILINE)
        html = re.sub(r'^#\s+(.+)$', r'<h1>\1</h1>', html, flags=re.MULTILINE)

        # 粗体和斜体
        html = re.sub(r'\*\*\*(.+?)\*\*\*', r'<strong><em>\1</em></strong>', html)
        html = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html)
        html = re.sub(r'\*(.+?)\*', r'<em>\1</em>', html)

        # 链接
        html = re.sub(
            r'\[([^\]]+)\]\(([^)]+)\)',
            r'<a href="\2" target="_blank" rel="noopener">\1</a>',
            html
        )

        # 图片
        html = re.sub(
            r'!\[([^\]]*)\]\(([^)]+)\)',
            r'<img src="\2" alt="\1">',
            html
        )

        # 无序列表
        lines = html.split('\n')
        in_list = False
        result = []
        for line in lines:
            if re.match(r'^\s*[-*]\s+', line):
                if not in_list:
                    result.append('<ul>')
                    in_list = True
                item = re.sub(r'^\s*[-*]\s+', '', line)
                result.append(f'<li>{item}</li>')
            else:
                if in_list:
                    result.append('</ul>')
                    in_list = False
                result.append(line)
        if in_list:
            result.append('</ul>')
        html = '\n'.join(result)

        # 引用块
        html = re.sub(
            r'^>\s+(.+)$',
            r'<blockquote>\1</blockquote>',
            html,
            flags=re.MULTILINE
        )

        # 换行
        html = html.replace('\n\n', '</p><p>')
        html = html.replace('\n', '<br>')
        html = f'<p>{html}</p>'

        # 清理空段落
        html = re.sub(r'<p>\s*</p>', '', html)

        return html

    @classmethod
    def extract_text(cls, content: str) -> str:
        """
        从Markdown中提取纯文本（用于搜索索引）

        Args:
            content: Markdown内容

        Returns:
            纯文本
        """
        if not content:
            return ""

        text = content

        # 移除代码块
        text = re.sub(r'```[\s\S]*?```', '', text)
        text = re.sub(r'`[^`]+`', '', text)

        # 移除链接但保留文本
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)

        # 移除图片
        text = re.sub(r'!\[[^\]]*\]\([^)]+\)', '', text)

        # 移除标题标记
        text = re.sub(r'^#+\s+', '', text, flags=re.MULTILINE)

        # 移除其他Markdown标记
        text = re.sub(r'[*_~`]', '', text)

        # 清理多余空白
        text = ' '.join(text.split())

        return text


# 便捷函数
def render_markdown(content: str) -> str:
    """将Markdown渲染为HTML"""
    return MarkdownParser.render(content)
