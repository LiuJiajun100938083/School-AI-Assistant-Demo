# vector_store.py - 修复版本，兼容新版langchain-chroma
import os
import uuid
from datetime import datetime
from typing import List, Dict, Optional
from pathlib import Path
import logging

from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

logger = logging.getLogger(__name__)

# 初始化 Embedding
embedding = HuggingFaceEmbeddings(model_name='GanymedeNil/text2vec-large-chinese')

# 初始化向量数据库
vector_db = Chroma(
    persist_directory='./vector_db',
    embedding_function=embedding
)

# 全局文档列表，用于邻居查找
all_docs: List[Document] = []

# 文本分割器
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""],
)


def add_document_to_vector_store(
        content: str,
        filename: str,
        subject: str,
        doc_type: str = "uploaded",
        metadata: Optional[Dict] = None
) -> bool:
    """
    添加文档到向量数据库

    Args:
        content: 文档内容
        filename: 文件名
        subject: 科目代码 ('ict', 'ces', 'history', etc.)
        doc_type: 文档类型
        metadata: 额外的元数据

    Returns:
        bool: 是否成功添加
    """
    global all_docs

    try:
        logger.info(f"📝 开始处理文档: {filename}")
        logger.info(f"🎯 科目: {subject}")
        logger.info(f"📄 内容长度: {len(content)} 字符")

        # 生成唯一文档ID
        doc_id = str(uuid.uuid4())

        # 分割文档内容
        chunks = text_splitter.split_text(content)

        if not chunks:
            logger.warning("⚠️ 文档分割后没有产生任何块")
            return False

        logger.info(f"✂️ 文档分割为 {len(chunks)} 个块")

        # 准备文档列表
        documents = []

        for i, chunk in enumerate(chunks):
            # 确保每个块都正确标记科目
            chunk_metadata = {
                'doc_id': doc_id,
                'chunk_id': i,
                'filename': filename,
                'subject': subject,  # 关键：明确设置科目
                'doc_type': doc_type,
                'content_length': len(chunk),
                'total_chunks': len(chunks),
                'upload_time': datetime.now().isoformat()
            }

            # 添加额外的元数据
            if metadata:
                chunk_metadata.update(metadata)

            # 创建文档对象
            doc = Document(
                page_content=chunk,
                metadata=chunk_metadata
            )

            documents.append(doc)

            # 调试输出
            logger.debug(f"  块 {i + 1}: {len(chunk)} 字符, subject='{subject}'")

        # 添加到向量数据库
        logger.info(f"💾 正在添加 {len(documents)} 个文档块到向量数据库...")

        # 新版本的Chroma会自动持久化，不需要调用persist()
        try:
            vector_db.add_documents(documents)
            logger.info("✅ 文档已添加到向量数据库")
        except Exception as e:
            logger.error(f"❌ 添加文档到Chroma失败: {e}")
            # 如果add_documents失败，尝试使用add方法
            try:
                texts = [doc.page_content for doc in documents]
                metadatas = [doc.metadata for doc in documents]
                ids = [f"{doc_id}_{i}" for i in range(len(documents))]

                vector_db.add_texts(
                    texts=texts,
                    metadatas=metadatas,
                    ids=ids
                )
                logger.info("✅ 使用add_texts方法成功添加文档")
            except Exception as e2:
                logger.error(f"❌ 使用add_texts也失败了: {e2}")
                raise

        # 添加到全局文档列表
        all_docs.extend(documents)

        # 不再需要调用 persist()，因为新版本会自动持久化
        # vector_db.persist()  # 移除这行

        logger.info(f"✅ 成功添加文档 '{filename}' 到 {subject} 科目知识库")
        logger.info(f"📚 当前全局文档总数: {len(all_docs)}")

        # 验证添加结果
        verify_document_addition(subject, doc_id, len(chunks))

        return True

    except Exception as e:
        logger.error(f"❌ 添加文档时发生错误: {e}")
        import traceback
        traceback.print_exc()
        return False


def verify_document_addition(subject: str, doc_id: str, expected_chunks: int):
    """验证文档是否正确添加"""
    try:
        # 使用简单的搜索来验证
        logger.info(f"🔍 验证文档添加结果...")

        # 从全局文档列表中验证
        matched_docs = [d for d in all_docs if d.metadata.get('doc_id') == doc_id]
        subject_docs = [d for d in all_docs if d.metadata.get('subject') == subject]

        logger.info(f"  - 找到相同doc_id的块: {len(matched_docs)} / {expected_chunks}")
        logger.info(f"  - 找到相同科目的文档: {len(subject_docs)}")

        # 检查科目标记
        for doc in matched_docs[:3]:  # 检查前3个块
            doc_subject = doc.metadata.get('subject')
            if doc_subject != subject:
                logger.warning(f"  ⚠️ 块的科目标记不正确！期望'{subject}'，实际'{doc_subject}'")

    except Exception as e:
        logger.error(f"❌ 验证文档时发生错误: {e}")


def get_documents_by_subject(subject: str) -> List[Document]:
    """获取指定科目的所有文档"""
    global all_docs

    subject_docs = []
    for doc in all_docs:
        if doc.metadata.get('subject') == subject:
            subject_docs.append(doc)

    logger.info(f"📊 科目 '{subject}' 共有 {len(subject_docs)} 个文档块")
    return subject_docs


def list_all_subjects() -> Dict[str, int]:
    """列出所有科目及其文档数量"""
    global all_docs

    subject_counts = {}
    for doc in all_docs:
        subject = doc.metadata.get('subject', 'unknown')
        subject_counts[subject] = subject_counts.get(subject, 0) + 1

    logger.info("📊 各科目文档统计:")
    for subject, count in subject_counts.items():
        logger.info(f"  - {subject}: {count} 个文档块")

    return subject_counts


def search_documents(query: str, subject: str = None, k: int = 5) -> List[Document]:
    """
    搜索文档

    Args:
        query: 搜索查询
        subject: 限定科目（可选）
        k: 返回结果数量

    Returns:
        相关文档列表
    """
    try:
        # 使用向量数据库搜索
        results = vector_db.similarity_search(query, k=k * 2)  # 多搜索一些，后面筛选

        # 如果指定了科目，进行筛选
        if subject:
            results = [doc for doc in results if doc.metadata.get('subject') == subject]
            results = results[:k]  # 只取前k个
        else:
            results = results[:k]

        logger.info(f"🔍 搜索 '{query}' 返回 {len(results)} 个结果")
        return results

    except Exception as e:
        logger.error(f"❌ 搜索文档时出错: {e}")
        return []


def remove_documents_by_subject(subject: str) -> bool:
    """删除指定科目的所有文档"""
    global all_docs

    try:
        # 从全局列表中移除
        original_count = len(all_docs)
        all_docs = [doc for doc in all_docs if doc.metadata.get('subject') != subject]
        removed_count = original_count - len(all_docs)

        # 注意：从Chroma中删除文档比较复杂，可能需要重建数据库
        logger.warning(f"⚠️ 从内存中移除了 {removed_count} 个 {subject} 科目的文档块")
        logger.warning("⚠️ 注意：从向量数据库中完全删除需要重建数据库")

        return True

    except Exception as e:
        logger.error(f"❌ 删除文档时发生错误: {e}")
        return False


def initialize_vector_store():
    """初始化向量存储，加载已有的文档"""
    global all_docs

    try:
        # 检查向量数据库目录
        if os.path.exists('./vector_db'):
            logger.info("📚 正在加载现有的向量数据库...")

            # 尝试获取所有文档
            try:
                # 使用一个通用查询来获取文档
                # 注意：这种方法可能不会返回所有文档
                sample_docs = vector_db.similarity_search("", k=100)

                # 重置全局文档列表
                all_docs = []

                # 处理加载的文档
                for doc in sample_docs:
                    # 确保文档有必要的metadata
                    if 'subject' not in doc.metadata:
                        logger.warning(f"⚠️ 发现没有科目标记的文档，设为默认科目'ict'")
                        doc.metadata['subject'] = 'ict'
                    all_docs.append(doc)

                logger.info(f"📚 从向量数据库加载了 {len(all_docs)} 个文档样本")

            except Exception as e:
                logger.warning(f"⚠️ 无法从向量数据库加载文档: {e}")
                all_docs = []
        else:
            logger.info("📚 创建新的向量数据库...")
            Path('./vector_db').mkdir(parents=True, exist_ok=True)
            all_docs = []

        list_all_subjects()

    except Exception as e:
        logger.error(f"❌ 初始化向量存储时发生错误: {e}")
        all_docs = []


def clear_vector_store():
    """清空向量存储"""
    global all_docs

    try:
        # 清空内存中的文档
        all_docs = []

        # 删除向量数据库文件
        import shutil
        if os.path.exists('./vector_db'):
            shutil.rmtree('./vector_db')
            logger.info("🗑️ 已删除向量数据库目录")

        # 重新创建目录
        Path('./vector_db').mkdir(parents=True, exist_ok=True)

        # 重新初始化向量数据库
        global vector_db
        vector_db = Chroma(
            persist_directory='./vector_db',
            embedding_function=embedding
        )

        logger.info("🗑️ 向量存储已清空")
        return True

    except Exception as e:
        logger.error(f"❌ 清空向量存储时发生错误: {e}")
        return False


# 便捷函数
def add_ict_document(content: str, filename: str, metadata: Optional[Dict] = None) -> bool:
    """添加ICT科目文档"""
    return add_document_to_vector_store(content, filename, "ict", metadata=metadata)


def add_ces_document(content: str, filename: str, metadata: Optional[Dict] = None) -> bool:
    """添加CES科目文档"""
    return add_document_to_vector_store(content, filename, "ces", metadata=metadata)


def add_history_document(content: str, filename: str, metadata: Optional[Dict] = None) -> bool:
    """添加历史科目文档"""
    return add_document_to_vector_store(content, filename, "history", metadata=metadata)


def add_chinese_document(content: str, filename: str, metadata: Optional[Dict] = None) -> bool:
    """添加中文科目文档"""
    return add_document_to_vector_store(content, filename, "chinese", metadata=metadata)


def add_english_document(content: str, filename: str, metadata: Optional[Dict] = None) -> bool:
    """添加英文科目文档"""
    return add_document_to_vector_store(content, filename, "english", metadata=metadata)


def add_math_document(content: str, filename: str, metadata: Optional[Dict] = None) -> bool:
    """添加数学科目文档"""
    return add_document_to_vector_store(content, filename, "math", metadata=metadata)


def add_physics_document(content: str, filename: str, metadata: Optional[Dict] = None) -> bool:
    """添加物理科目文档"""
    return add_document_to_vector_store(content, filename, "physics", metadata=metadata)


def add_chemistry_document(content: str, filename: str, metadata: Optional[Dict] = None) -> bool:
    """添加化学科目文档"""
    return add_document_to_vector_store(content, filename, "chemistry", metadata=metadata)


def add_biology_document(content: str, filename: str, metadata: Optional[Dict] = None) -> bool:
    """添加生物科目文档"""
    return add_document_to_vector_store(content, filename, "biology", metadata=metadata)


# 初始化
logger.info("🚀 正在初始化向量存储...")
initialize_vector_store()


# 测试函数
def test_vector_store():
    """测试向量存储功能"""
    logger.info("\n🧪 测试向量存储功能...")

    # 测试添加文档
    test_content = "这是一个测试文档，用于测试向量存储功能。"
    success = add_chinese_document(test_content, "test.txt", {"test": True})

    if success:
        logger.info("✅ 测试文档添加成功")

        # 测试搜索
        results = search_documents("测试", subject="chinese")
        logger.info(f"🔍 搜索结果: {len(results)} 个文档")

        for i, doc in enumerate(results[:3]):
            logger.info(f"  结果{i + 1}: {doc.page_content[:50]}...")
    else:
        logger.error("❌ 测试文档添加失败")

    # 显示统计
    list_all_subjects()


if __name__ == "__main__":
    # 设置日志级别
    logging.basicConfig(level=logging.INFO)

    # 运行测试
    test_vector_store()