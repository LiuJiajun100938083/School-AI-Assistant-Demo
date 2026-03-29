# llm/rag/vector_store.py
"""
向量存儲管理模塊
提供統一的向量數據庫操作接口：文檔添加、檢索、刪除等。
使用懶初始化避免 import 時阻塞啟動。
"""
import os
import uuid
import logging
from datetime import datetime
from typing import List, Dict, Optional
from pathlib import Path

from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)

# ==================== 全局狀態（懶初始化） ====================

_embedding = None
_vector_db = None

# 全局文檔列表，用於鄰居查找
all_docs: List[Document] = []

# 文本分割器
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""],
)


def get_embedding():
    """獲取 embedding 實例（延遲加載）。已切換為 Qwen text-embedding-v4 API。"""
    global _embedding
    if _embedding is None:
        from app.infrastructure.ai_pipeline.embedding import QwenLangChainEmbeddings
        _embedding = QwenLangChainEmbeddings()
        logger.info("✅ Embedding 已切換為 Qwen text-embedding-v4")
    return _embedding


def get_vector_db():
    """獲取向量數據庫實例（延遲加載）"""
    global _vector_db
    if _vector_db is None:
        from langchain_chroma import Chroma
        _vector_db = Chroma(
            persist_directory='./vector_db',
            embedding_function=get_embedding()
        )
        logger.info("✅ 向量數據庫加載完成")
    return _vector_db


# ==================== 核心操作函數 ====================


def add_document_to_vector_store(
    content: str,
    filename: str,
    subject: str,
    doc_type: str = "uploaded",
    metadata: Optional[Dict] = None
) -> bool:
    """
    添加文檔到向量數據庫

    Args:
        content: 文檔內容
        filename: 文件名
        subject: 科目代碼 ('ict', 'ces', 'history', etc.)
        doc_type: 文檔類型
        metadata: 額外的元數據

    Returns:
        bool: 是否成功添加
    """
    global all_docs

    try:
        logger.info(f"📝 開始處理文檔: {filename}, 科目: {subject}, 內容長度: {len(content)}")

        doc_id = str(uuid.uuid4())
        chunks = text_splitter.split_text(content)

        if not chunks:
            logger.warning("⚠️ 文檔分割後沒有產生任何塊")
            return False

        logger.info(f"✂️ 文檔分割為 {len(chunks)} 個塊")

        documents = []
        for i, chunk in enumerate(chunks):
            chunk_metadata = {
                'doc_id': doc_id,
                'chunk_id': i,
                'filename': filename,
                'subject': subject,
                'doc_type': doc_type,
                'content_length': len(chunk),
                'total_chunks': len(chunks),
                'upload_time': datetime.now().isoformat()
            }

            if metadata:
                chunk_metadata.update(metadata)

            doc = Document(page_content=chunk, metadata=chunk_metadata)
            documents.append(doc)

        logger.info(f"💾 正在添加 {len(documents)} 個文檔塊到向量數據庫...")

        vector_db = get_vector_db()
        try:
            vector_db.add_documents(documents)
            logger.info("✅ 文檔已添加到向量數據庫")
        except Exception as e:
            logger.error(f"❌ add_documents 失敗: {e}，嘗試 add_texts...")
            texts = [doc.page_content for doc in documents]
            metadatas = [doc.metadata for doc in documents]
            ids = [f"{doc_id}_{i}" for i in range(len(documents))]
            vector_db.add_texts(texts=texts, metadatas=metadatas, ids=ids)
            logger.info("✅ 使用 add_texts 方法成功添加文檔")

        all_docs.extend(documents)
        logger.info(f"✅ 成功添加文檔 '{filename}' 到 {subject} 科目知識庫，全局文檔總數: {len(all_docs)}")

        _verify_document_addition(subject, doc_id, len(chunks))
        return True

    except Exception as e:
        logger.error(f"❌ 添加文檔時發生錯誤: {e}")
        return False


def search_documents(query: str, subject: str = None, k: int = 5) -> List[Document]:
    """
    搜索文檔

    Args:
        query: 搜索查詢
        subject: 限定科目（可選）
        k: 返回結果數量

    Returns:
        相關文檔列表
    """
    try:
        vector_db = get_vector_db()
        results = vector_db.similarity_search(query, k=k * 2)

        if subject:
            results = [doc for doc in results if doc.metadata.get('subject') == subject]
            results = results[:k]
        else:
            results = results[:k]

        logger.info(f"🔍 搜索 '{query[:50]}' 返回 {len(results)} 個結果")
        return results

    except Exception as e:
        logger.error(f"❌ 搜索文檔時出錯: {e}")
        return []


def get_documents_by_subject(subject: str) -> List[Document]:
    """獲取指定科目的所有文檔"""
    subject_docs = [doc for doc in all_docs if doc.metadata.get('subject') == subject]
    logger.info(f"📊 科目 '{subject}' 共有 {len(subject_docs)} 個文檔塊")
    return subject_docs


def list_all_subjects() -> Dict[str, int]:
    """列出所有科目及其文檔數量"""
    subject_counts: Dict[str, int] = {}
    for doc in all_docs:
        subject = doc.metadata.get('subject', 'unknown')
        subject_counts[subject] = subject_counts.get(subject, 0) + 1

    logger.info("📊 各科目文檔統計: %s", subject_counts)
    return subject_counts


def remove_documents_by_subject(subject: str) -> bool:
    """刪除指定科目的所有文檔（僅從內存，ChromaDB 需重建）"""
    global all_docs

    try:
        original_count = len(all_docs)
        all_docs = [doc for doc in all_docs if doc.metadata.get('subject') != subject]
        removed_count = original_count - len(all_docs)

        logger.warning(f"⚠️ 從內存中移除了 {removed_count} 個 {subject} 科目的文檔塊")
        logger.warning("⚠️ 注意：從向量數據庫中完全刪除需要重建數據庫")
        return True

    except Exception as e:
        logger.error(f"❌ 刪除文檔時發生錯誤: {e}")
        return False


def initialize_vector_store():
    """初始化向量存儲，加載已有的文檔到 all_docs"""
    global all_docs

    try:
        if os.path.exists('./vector_db'):
            logger.info("📚 正在加載現有的向量數據庫...")
            try:
                vector_db = get_vector_db()
                sample_docs = vector_db.similarity_search("", k=100)

                all_docs = list(sample_docs)

                logger.info(f"📚 從向量數據庫加載了 {len(all_docs)} 個文檔樣本")
            except Exception as e:
                logger.warning(f"⚠️ 無法從向量數據庫加載文檔: {e}")
                all_docs = []
        else:
            logger.info("📚 創建新的向量數據庫...")
            Path('./vector_db').mkdir(parents=True, exist_ok=True)
            all_docs = []

        list_all_subjects()

    except Exception as e:
        logger.error(f"❌ 初始化向量存儲時發生錯誤: {e}")
        all_docs = []


def clear_vector_store():
    """清空向量存儲"""
    global all_docs, _vector_db

    try:
        all_docs = []

        import shutil
        if os.path.exists('./vector_db'):
            shutil.rmtree('./vector_db')
            logger.info("🗑️ 已刪除向量數據庫目錄")

        Path('./vector_db').mkdir(parents=True, exist_ok=True)

        _vector_db = None  # 下次使用時重新初始化

        logger.info("🗑️ 向量存儲已清空")
        return True

    except Exception as e:
        logger.error(f"❌ 清空向量存儲時發生錯誤: {e}")
        return False


# ==================== 內部輔助函數 ====================


def _verify_document_addition(subject: str, doc_id: str, expected_chunks: int):
    """驗證文檔是否正確添加"""
    try:
        matched_docs = [d for d in all_docs if d.metadata.get('doc_id') == doc_id]
        subject_docs = [d for d in all_docs if d.metadata.get('subject') == subject]

        logger.info(f"  驗證: 相同 doc_id 的塊: {len(matched_docs)}/{expected_chunks}, 相同科目文檔: {len(subject_docs)}")

        for doc in matched_docs[:3]:
            doc_subject = doc.metadata.get('subject')
            if doc_subject != subject:
                logger.warning(f"  ⚠️ 塊的科目標記不正確！期望 '{subject}'，實際 '{doc_subject}'")

    except Exception as e:
        logger.error(f"❌ 驗證文檔時發生錯誤: {e}")
