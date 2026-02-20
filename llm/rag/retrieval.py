# llm/rag/retrieval.py
"""
知識庫檢索功能
"""

import logging
from typing import List, Optional

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
