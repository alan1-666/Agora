"""记忆与文档的写入 + 向量检索(RAG)。全部按 org 隔离(RLS)。"""

from dataclasses import dataclass

from sqlalchemy import select

from .db import session_for_org
from .embeddings import embed, embed_one
from .models import Document, DocumentChunk, Memory


@dataclass
class Retrieved:
    source: str  # "记忆" 或 "资料:<文档名>"
    text: str


# ---------- 写入 ----------

async def add_memory(org_id: str, content: str) -> str:
    async with session_for_org(org_id) as s:
        m = Memory(org_id=org_id, content=content, embedding=embed_one(content))
        s.add(m)
        await s.commit()
        return str(m.id)


def _chunk(text: str, size: int = 500, overlap: int = 50) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    out, i = [], 0
    while i < len(text):
        out.append(text[i : i + size])
        i += size - overlap
    return out


async def ingest_document(org_id: str, name: str, text: str) -> tuple[str, int]:
    chunks = _chunk(text)
    vecs = embed(chunks) if chunks else []
    async with session_for_org(org_id) as s:
        doc = Document(org_id=org_id, name=name)
        s.add(doc)
        await s.flush()
        for i, (c, v) in enumerate(zip(chunks, vecs)):
            s.add(
                DocumentChunk(
                    org_id=org_id, document_id=doc.id, doc_name=name, seq=i, content=c, embedding=v
                )
            )
        await s.commit()
        return str(doc.id), len(chunks)


# ---------- 检索 ----------

async def retrieve(org_id: str, query: str, k_mem: int = 3, k_doc: int = 4) -> list[Retrieved]:
    """按相关性取最相关的记忆 + 文档切块(余弦距离)。"""
    qvec = embed_one(query)
    results: list[Retrieved] = []
    async with session_for_org(org_id) as s:
        mems = (
            await s.execute(
                select(Memory).order_by(Memory.embedding.cosine_distance(qvec)).limit(k_mem)
            )
        ).scalars().all()
        for m in mems:
            results.append(Retrieved(source="记忆", text=m.content))

        chunks = (
            await s.execute(
                select(DocumentChunk)
                .order_by(DocumentChunk.embedding.cosine_distance(qvec))
                .limit(k_doc)
            )
        ).scalars().all()
        for c in chunks:
            results.append(Retrieved(source=f"资料:{c.doc_name}", text=c.content))
    return results


def build_context(items: list[Retrieved]) -> str:
    """把检索结果拼成可注入 system 的背景文本。"""
    if not items:
        return ""
    lines = ["", "以下是可能相关的背景信息与资料,回答时可参考并注明来源(如「据资料X」):"]
    for it in items:
        snippet = it.text if len(it.text) <= 400 else it.text[:400] + "…"
        lines.append(f"[{it.source}] {snippet}")
    return "\n".join(lines)
