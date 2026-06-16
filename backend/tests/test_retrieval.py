"""检索(RAG)测试:文档/记忆写入与检索、按 org 隔离。"""

from sqlalchemy import select

from app.db import session_no_tenant
from app.models import Organization
from app.retrieval import add_memory, ingest_document, retrieve


async def _org(name: str) -> str:
    async with session_no_tenant() as s:
        o = Organization(name=name)
        s.add(o)
        await s.commit()
        return str(o.id)


async def test_document_retrieval_ranks_relevant_first():
    org = await _org("A")
    await ingest_document(org, "HR", "公司的休假政策是每年十五天年假")
    await ingest_document(org, "财务", "报销流程需要提交发票后三天到账")

    hits = await retrieve(org, "休假政策", k_doc=1)
    assert hits, "应检索到内容"
    assert "休假" in hits[0].text
    assert hits[0].source == "资料:HR"


async def test_memory_retrieval():
    org = await _org("A")
    await add_memory(org, "用户喜欢简洁直接的回答")
    hits = await retrieve(org, "简洁", k_mem=3)
    assert any("简洁" in h.text and h.source == "记忆" for h in hits)


async def test_retrieval_is_org_isolated():
    org_a = await _org("A")
    org_b = await _org("B")
    await add_memory(org_a, "A 组织的机密备忘")
    await ingest_document(org_a, "secret", "A 组织的机密资料内容")

    # B 检索同样的词,不应看到 A 的任何东西
    hits = await retrieve(org_b, "机密")
    assert hits == []
