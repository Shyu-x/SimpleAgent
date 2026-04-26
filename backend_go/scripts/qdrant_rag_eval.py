"""
Qdrant 向量数据库 RAG 系统评估
基于《向量数据库实战》优化策略
"""

from qdrant_client import QdrantClient
from qdrant_client.http import models
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any
import time
import json

class QdrantRAGSystem:
    """基于 Qdrant 的 RAG 系统"""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6333,
        collection_name: str = "chat_documents",
        embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2",
    ):
        # 连接 Qdrant
        print(f"连接 Qdrant: {host}:{port}")
        self.client = QdrantClient(host=host, port=port)
        self.collection_name = collection_name

        # 初始化 Embedding 模型
        print(f"加载 Embedding 模型: {embedding_model}")
        self.encoder = SentenceTransformer(embedding_model)
        self.dimension = 384  # all-MiniLM-L6-v2 输出维度

    def create_collection(self):
        """创建集合"""
        # 检查是否已存在
        collections = self.client.get_collections().collections
        collection_names = [c.name for c in collections]

        if self.collection_name in collection_names:
            print(f"集合 {self.collection_name} 已存在，删除旧集合...")
            self.client.delete_collection(self.collection_name)

        # 创建新集合
        self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=models.VectorParams(
                size=self.dimension,
                distance=models.Distance.COSINE,
            ),
        )
        print(f"[OK] Collection {self.collection_name} created (dimension: {self.dimension}, metric: COSINE)")

    def insert_documents(self, documents: List[Dict[str, str]]):
        """插入文档"""
        texts = [doc["text"] for doc in documents]
        print(f"生成 {len(texts)} 个文档的向量...")

        # 批量编码
        embeddings = self.encoder.encode(texts, normalize_embeddings=True)

        # 准备 upsert 数据
        points = []
        for i, (emb, doc) in enumerate(zip(embeddings, documents)):
            points.append(models.PointStruct(
                id=i,
                vector=emb.tolist(),
                payload={
                    "text": doc["text"],
                    "doc_id": doc.get("doc_id", f"doc_{i}"),
                    "title": doc.get("title", ""),
                }
            ))

        # 批量插入
        self.client.upsert(
            collection_name=self.collection_name,
            points=points,
        )
        print(f"[OK] 成功插入 {len(points)} 个文档")

    def search(self, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        """向量检索"""
        # 编码查询
        query_vector = self.encoder.encode(query, normalize_embeddings=True).tolist()

        # 搜索 - 使用 query_points 方法
        results = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            limit=top_k,
        )

        # 格式化结果
        retrieved_docs = []
        for result in results.points:
            retrieved_docs.append({
                "id": result.id,
                "score": result.score,
                "text": result.payload.get("text", ""),
                "doc_id": result.payload.get("doc_id", ""),
                "title": result.payload.get("title", ""),
            })

        return retrieved_docs

    def build_context(self, query: str, retrieved_docs: List[Dict[str, Any]]) -> str:
        """构建上下文（位置优化 - 突破U型陷阱）"""
        # 按相关性排序
        sorted_docs = sorted(
            retrieved_docs,
            key=lambda x: x.get("score", 0),
            reverse=True
        )

        context_parts = ["[系统提示] 请基于以下文档回答问题。\n"]

        # 最相关文档（开头位置 - 利用 Primacy Bias ~75.8%）
        context_parts.append("[最相关文档 - 开头位置]\n")
        for i, doc in enumerate(sorted_docs[:3], 1):
            context_parts.append(f"文档{i}: {doc.get('text', '')}\n")

        # 次相关文档（中间位置 - Lost in the Middle ~53.8%）
        if len(sorted_docs) > 3:
            context_parts.append("\n[次相关文档 - 中间位置]\n")
            for i, doc in enumerate(sorted_docs[3:7], 4):
                context_parts.append(f"文档{i}: {doc.get('text', '')}\n")

        # 用户问题（结尾位置 - 利用 Recency Bias ~63.2%）
        context_parts.append("\n[用户问题 - 结尾位置]\n")
        context_parts.append(f"问题: {query}")

        return "\n".join(context_parts)

    def query(self, user_query: str, top_k: int = 10):
        """完整查询流程"""
        start_time = time.time()

        # 检索
        retrieval_start = time.time()
        retrieved_docs = self.search(user_query, top_k=top_k)
        retrieval_time = time.time() - retrieval_start

        # 构建上下文
        context = self.build_context(user_query, retrieved_docs)
        total_time = time.time() - start_time

        return {
            "query": user_query,
            "context": context,
            "documents": retrieved_docs,
            "metrics": {
                "retrieval_time_ms": round(retrieval_time * 1000, 2),
                "total_time_ms": round(total_time * 1000, 2),
                "retrieved_count": len(retrieved_docs),
            }
        }


def run_evaluation():
    """运行评估"""
    print("=" * 60)
    print("Qdrant RAG 系统性能评估")
    print("=" * 60)

    # 初始化 RAG 系统
    rag = QdrantRAGSystem(
        host="localhost",
        port=6333,
        collection_name="chat_documents",
        embedding_model="sentence-transformers/all-MiniLM-L6-v2",
    )

    # 创建集合
    rag.create_collection()

    # 插入测试文档
    test_documents = [
        {"text": "Qdrant 是一个高性能的向量相似度搜索引擎，专为 AI 应用设计，支持大规模向量数据的存储、索引和检索。", "doc_id": "doc_001", "title": "Qdrant简介"},
        {"text": "RAG（Retrieval-Augmented Generation）结合信息检索与语言模型，提升生成答案的准确性。", "doc_id": "doc_002", "title": "RAG概述"},
        {"text": "HNSW（Hierarchical Navigable Small World）是一种高效的向量索引算法。", "doc_id": "doc_003", "title": "HNSW索引"},
        {"text": "Transformer 模型在自然语言处理领域取得了突破性进展。", "doc_id": "doc_004", "title": "Transformer模型"},
        {"text": "Embedding 将文本转换为密集向量表示，捕捉语义相似性。", "doc_id": "doc_005", "title": "Embedding技术"},
        {"text": "LangChain 是一个用于构建 LLM 应用的开发框架。", "doc_id": "doc_006", "title": "LangChain框架"},
        {"text": "向量检索通过计算向量间的距离来找到最相似的文档。", "doc_id": "doc_007", "title": "向量检索原理"},
        {"text": "中文 Embedding 模型如 BGE-large-zh 支持高质量中文检索。", "doc_id": "doc_008", "title": "中文Embedding"},
        {"text": "Reranking 使用交叉编码器对检索结果进行精细排序。", "doc_id": "doc_009", "title": "Reranking技术"},
        {"text": "上下文窗口管理对于处理长文本至关重要。", "doc_id": "doc_010", "title": "上下文窗口"},
        {"text": "Qdrant 是一个高性能的向量相似度搜索引擎。", "doc_id": "doc_011", "title": "Qdrant简介"},
        {"text": "余弦相似度是衡量向量相似度的常用指标。", "doc_id": "doc_012", "title": "余弦相似度"},
    ]
    rag.insert_documents(test_documents)

    # 测试查询
    print("\n" + "=" * 60)
    print("执行查询测试")
    print("=" * 60)

    test_queries = [
        "什么是向量数据库？",
        "RAG 系统的原理是什么？",
        "HNSW 索引有什么优势？",
        "Qdrant 的特点是什么？",
    ]

    results = []
    for query in test_queries:
        print(f"\n查询: {query}")
        result = rag.query(query, top_k=5)
        print(f"检索到 {result['metrics']['retrieved_count']} 个文档")
        print(f"检索耗时: {result['metrics']['retrieval_time_ms']}ms")
        print(f"总耗时: {result['metrics']['total_time_ms']}ms")
        if result['documents']:
            print(f"最相关文档: {result['documents'][0]['title']} (score: {result['documents'][0]['score']:.4f})")

        results.append({
            "query": query,
            "metrics": result['metrics'],
            "top_doc": result['documents'][0]['title'] if result['documents'] else '无'
        })

    # 输出评估总结
    print("\n" + "=" * 60)
    print("性能评估总结")
    print("=" * 60)
    print(f"{'查询':<30} {'检索耗时':<15} {'总耗时':<15} {'最相关文档'}")
    print("-" * 60)
    for r in results:
        print(f"{r['query']:<30} {r['metrics']['retrieval_time_ms']:<15} {r['metrics']['total_time_ms']:<15} {r['top_doc']}")

    avg_retrieval = sum(r['metrics']['retrieval_time_ms'] for r in results) / len(results)
    avg_total = sum(r['metrics']['total_time_ms'] for r in results) / len(results)
    print("-" * 60)
    print(f"{'平均':<30} {avg_retrieval:<15.2f} {avg_total:<15.2f}")

    # 性能对比
    print("\n" + "=" * 60)
    print("U型陷阱优化效果对比")
    print("=" * 60)
    print("位置策略        预期准确率    效果提升")
    print("-" * 40)
    print(f"{'开头位置(Primacy)':<20} ~75.8%       +22% vs 中间")
    print(f"{'结尾位置(Recency)':<20} ~63.2%       +9.4% vs 中间")
    print(f"{'中间位置(Lost in Middle)':<20} ~53.8%       基准")

    return results


if __name__ == "__main__":
    run_evaluation()
