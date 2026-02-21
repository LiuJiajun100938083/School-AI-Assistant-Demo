# llm/rag/retrieval.py
"""
知識庫檢索功能
"""

import logging
from typing import Dict, List, Optional, Tuple

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain.schema import Document

logger = logging.getLogger(__name__)

# ==================== 初始化 Embedding 和向量庫 ====================

_embedding = None
_vector_db = None


def get_embedding():
    """獲取 embedding 實例（延遲加載）"""
    global _embedding
    if _embedding is None:
        _embedding = HuggingFaceEmbeddings(model_name='GanymedeNil/text2vec-large-chinese')
        logger.info("✅ Embedding 模型加載完成")
    return _embedding


def get_vector_db():
    """獲取向量數據庫實例（延遲加載）"""
    global _vector_db
    if _vector_db is None:
        _vector_db = Chroma(
            persist_directory='./vector_db',
            embedding_function=get_embedding()
        )
        logger.info("✅ 向量數據庫加載完成")
    return _vector_db


# ==================== 文檔過濾函數 ====================

def filter_docs_by_subject(docs: List[Document], subject: str) -> List[Document]:
    """根據科目篩選文檔"""
    filtered_docs = []
    logger.debug(f"🔍 正在篩選科目: {subject}, 待篩選文檔數量: {len(docs)}")

    for doc in docs:
        doc_subject = doc.metadata.get('subject', None)
        if doc_subject == subject:
            filtered_docs.append(doc)

    logger.debug(f"🎯 篩選結果: {len(filtered_docs)} 個匹配的 {subject} 科目文檔")
    return filtered_docs


def fetch_with_neighbors(
    docs: List[Document],
    all_docs: List[Document],
    neighbor_range: int = 1,
    target_subject: str = None
) -> List[Document]:
    """擴展鄰居上下文"""
    indexed = {
        (d.metadata.get('doc_id', ''), d.metadata.get('chunk_id', 0)): d
        for d in all_docs
    }
    out = {}

    for doc in docs:
        key = (doc.metadata.get('doc_id', ''), doc.metadata.get('chunk_id', 0))

        if doc.metadata.get('subject') == target_subject:
            out[key] = doc

            for delta in range(-neighbor_range, neighbor_range + 1):
                if delta == 0:
                    continue
                nei_key = (
                    doc.metadata.get('doc_id', ''),
                    doc.metadata.get('chunk_id', 0) + delta
                )
                if nei_key in indexed:
                    neighbor_doc = indexed[nei_key]
                    if neighbor_doc.metadata.get('subject') == target_subject:
                        out[nei_key] = neighbor_doc

    return [out[k] for k in sorted(out.keys())]


# ==================== 主檢索函數 ====================

def get_context_from_knowledge_base(
    question: str,
    subject: str,
    k: int = 20,
    neighbor_range: int = 1
) -> str:
    """
    從知識庫獲取上下文

    Args:
        question: 用戶問題
        subject: 學科代碼
        k: 初始檢索數量
        neighbor_range: 鄰居擴展範圍

    Returns:
        格式化的上下文字符串
    """
    logger.info(f"🔍 知識庫檢索: 問題='{question[:50]}...', 科目={subject}")

    try:
        vector_db = get_vector_db()
        retriever = vector_db.as_retriever(search_kwargs={"k": k})
        retrieved = retriever.invoke(question)

        logger.debug(f"📄 初步檢索到 {len(retrieved)} 個文檔")

        # 按科目篩選
        subject_filtered = filter_docs_by_subject(retrieved, subject)

        if not subject_filtered:
            logger.warning(f"⚠️ 在知識庫中沒有找到 {subject} 科目的相關內容")
            return f"[知識庫中暫無{subject}科目的相關資料]"

        # 嘗試擴展鄰居上下文
        try:
            import vector_store
            extended = fetch_with_neighbors(
                subject_filtered,
                vector_store.all_docs,
                neighbor_range=neighbor_range,
                target_subject=subject
            )
        except (ImportError, AttributeError):
            # 如果 vector_store 不可用，使用原始結果
            extended = subject_filtered

        # 構建上下文
        context_parts = []
        for i, doc in enumerate(extended):
            if doc.metadata.get('subject') == subject:
                context_parts.append(f"【資料{i + 1}】\n{doc.page_content}")

        if not context_parts:
            return f"[知識庫中暫無{subject}科目的相關資料]"

        context = "\n\n".join(context_parts)
        logger.info(f"📖 最終上下文長度: {len(context)} 字符")
        return context

    except Exception as e:
        logger.error(f"知識庫檢索失敗: {e}")
        return f"[知識庫檢索失敗: {str(e)}]"


# ==================== 学习中心内容级检索 ====================


def get_context_for_content(
    question: str,
    content_id: int,
    k: int = 8,
) -> str:
    """
    检索特定学习内容的相关片段（按 content_id 过滤）。

    与 get_context_from_knowledge_base 不同，本函数将检索范围
    限制在单篇学习内容的 chunk 内，用于内容感知型 AI 问答。

    Args:
        question: 用户问题
        content_id: lc_contents.id
        k: 返回的最相似片段数

    Returns:
        格式化的上下文字符串（与 get_context_from_knowledge_base 格式一致）
    """
    logger.info(
        "内容级检索: question='%s...', content_id=%s",
        question[:50],
        content_id,
    )

    try:
        vector_db = get_vector_db()
        results = vector_db.similarity_search(
            question,
            k=k,
            filter={"content_id": str(content_id)},
        )

        if not results:
            logger.warning("content_id=%s 无匹配的 chunk", content_id)
            return "[该内容尚未建立索引或无可检索的文本]"

        context_parts = [
            f"【片段{i + 1}】\n{doc.page_content}"
            for i, doc in enumerate(results)
        ]

        context = "\n\n".join(context_parts)
        logger.info(
            "内容级检索结果: %d chunks, %d 字符",
            len(results),
            len(context),
        )
        return context

    except Exception as e:
        logger.error("内容级检索失败: %s", e)
        return f"[内容检索失败: {str(e)}]"


def get_context_for_content_with_pages(
    question: str,
    content_id: int,
    k: int = 8,
) -> Tuple[str, List[Dict]]:
    """
    检索特定学习内容的相关片段，同时返回页码引用信息。

    与 get_context_for_content 功能相同，但额外返回每个片段
    对应的 PDF 页码，用于前端页码跳转。

    Args:
        question: 用户问题
        content_id: lc_contents.id
        k: 返回的最相似片段数

    Returns:
        (context_str, page_refs)
        - context_str: 格式化上下文（片段标题含页码信息）
        - page_refs: [{"snippet_index": 1, "page_numbers": [3, 4], "preview": "前50字..."}, ...]
    """
    logger.info(
        "页码感知检索: question='%s...', content_id=%s",
        question[:50],
        content_id,
    )

    try:
        vector_db = get_vector_db()

        # 使用普通检索（结果已按相似度排序，最相关的在前）
        results = vector_db.similarity_search(
            question,
            k=k,
            filter={"content_id": str(content_id)},
        )

        if not results:
            logger.warning("content_id=%s 无匹配的 chunk", content_id)
            return "[该内容尚未建立索引或无可检索的文本]", []

        context_parts = []
        page_refs = []

        # 只取前 2 个最相关 chunk 的页码作为引用
        # （第 3 个及之后往往已不太相关，会引入无关页码）
        top_n = min(2, len(results))

        for i, doc in enumerate(results):
            # 解析 page_numbers metadata（逗号分隔字符串 → int 列表）
            raw_pages = doc.metadata.get("page_numbers", "")
            page_list = _parse_page_numbers(raw_pages)

            # 构建带页码标注的上下文片段（所有 chunk 都给 LLM 看）
            if page_list:
                page_label = ",".join(str(p) for p in page_list)
                header = f"【片段{i + 1}·第{page_label}页】"
            else:
                header = f"【片段{i + 1}】"

            context_parts.append(f"{header}\n{doc.page_content}")

            # 只收录前 top_n 个最相关 chunk 的页码
            if page_list and i < top_n:
                # 每个 chunk 内部：连续页码只保留起始页
                # 如 [41,42] → [41]，[43,44] → [43]
                representative = _pick_start_pages(page_list)
                preview = doc.page_content[:50].replace("\n", " ")
                page_refs.append({
                    "snippet_index": i + 1,
                    "page_numbers": representative,
                    "preview": preview,
                })

        # 跨 chunk 去重（不同 chunk 可能引用相同页码）
        page_refs = _deduplicate_page_refs(page_refs)

        context = "\n\n".join(context_parts)
        logger.info(
            "页码感知检索结果: %d chunks, %d 页码引用, %d 字符",
            len(results),
            len(page_refs),
            len(context),
        )
        return context, page_refs

    except Exception as e:
        logger.error("页码感知检索失败: %s", e)
        return f"[内容检索失败: {str(e)}]", []


def _parse_page_numbers(raw: str) -> List[int]:
    """
    解析 chunk metadata 中的 page_numbers 字符串。

    Args:
        raw: 逗号分隔的页码，如 "3,4" 或空字符串

    Returns:
        排序后的页码整数列表，如 [3, 4]
    """
    if not raw or not raw.strip():
        return []
    try:
        return sorted(int(p.strip()) for p in raw.split(",") if p.strip())
    except ValueError:
        logger.warning("无法解析 page_numbers: '%s'", raw)
        return []


def _pick_start_pages(pages: List[int]) -> List[int]:
    """
    从一个页码列表中，将连续区间合并为起始页。

    例如 [41,42] → [41]，[43,44] → [43]，[3,5,6,7] → [3,5]
    """
    if not pages:
        return []
    sorted_p = sorted(pages)
    result = [sorted_p[0]]
    for j in range(1, len(sorted_p)):
        if sorted_p[j] - sorted_p[j - 1] > 1:
            result.append(sorted_p[j])
    return result


def _deduplicate_page_refs(page_refs: List[Dict]) -> List[Dict]:
    """
    跨 chunk 去重：如果多个 chunk 引用相同的页码，只保留一次。

    保留每个唯一页码第一次出现时所在的 ref。
    """
    if not page_refs:
        return []

    seen_pages = set()
    deduped = []
    for ref in page_refs:
        unique_pages = [p for p in ref["page_numbers"] if p not in seen_pages]
        if unique_pages:
            seen_pages.update(unique_pages)
            deduped.append({
                "snippet_index": ref["snippet_index"],
                "page_numbers": unique_pages,
                "preview": ref["preview"],
            })
    return deduped
