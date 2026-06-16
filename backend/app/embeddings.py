"""文本向量化(embedding)抽象。

默认 provider = "local":哈希词袋(hashing bag-of-words),离线、确定性、零依赖、零额外 key。
  - 对中英文都做词法切分(英文按词,中文按单字+二元组),哈希到固定维度,L2 归一化。
  - 性质:文本词法重叠越多,余弦相似度越高 —— 足够演示和测试整套 RAG 管道(切块→嵌入→检索→注入)。
  - 局限:它是"词法"相似,不是真"语义"。生产应换真语义 embedding。

生产:把 EMBEDDING_PROVIDER 换成 "voyage"/"openai" 等(需对应 key),实现对应分支即可,
上层(检索/存储)无需改动。注意换 provider 通常维度不同,需重嵌入历史数据。
"""

import hashlib
import math
import re

from .config import settings

_CJK = r"一-鿿"
_WORD_RE = re.compile(rf"[a-z0-9]+|[{_CJK}]")


def _tokens(text: str) -> list[str]:
    text = text.lower()
    toks = _WORD_RE.findall(text)
    # 中文加二元组,提升词法匹配粒度
    cjk = [t for t in toks if re.match(rf"[{_CJK}]", t)]
    bigrams = [cjk[i] + cjk[i + 1] for i in range(len(cjk) - 1)]
    return toks + bigrams


def _embed_local(text: str) -> list[float]:
    dim = settings.embedding_dim
    vec = [0.0] * dim
    for tok in _tokens(text):
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        idx = h % dim
        sign = 1.0 if (h // dim) % 2 == 0 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def embed(texts: list[str]) -> list[list[float]]:
    """把多段文本批量向量化。"""
    if settings.embedding_provider == "local":
        return [_embed_local(t) for t in texts]
    # 生产 provider 分支(voyage/openai)在此实现
    raise NotImplementedError(f"未实现的 embedding provider: {settings.embedding_provider}")


def embed_one(text: str) -> list[float]:
    return embed([text])[0]
