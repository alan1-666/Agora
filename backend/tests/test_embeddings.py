"""本地 embedding 测试:确定性 + 词法相似度。"""

import math

from app.embeddings import embed_one


def _cos(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb or 1)


def test_deterministic():
    assert embed_one("hello world") == embed_one("hello world")


def test_overlap_more_similar():
    q = embed_one("vacation policy")
    near = embed_one("the vacation policy is 15 days")
    far = embed_one("database migration script")
    assert _cos(q, near) > _cos(q, far)


def test_chinese_overlap():
    q = embed_one("休假政策")
    near = embed_one("公司的休假政策是每年十五天")
    far = embed_one("报销需要提交发票")
    assert _cos(q, near) > _cos(q, far)
