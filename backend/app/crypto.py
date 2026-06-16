"""组织模型 key 的加解密(Fernet 对称加密)。

key 明文不落库,只存密文;读出时解密用于调用模型。
密钥来自 settings.app_secret_key(生产务必换强随机值且不进代码)。
"""

import base64
import hashlib

from cryptography.fernet import Fernet

from .config import settings


def _fernet() -> Fernet:
    # 允许 app_secret_key 是任意字符串:派生成合法的 32 字节 Fernet key
    raw = settings.app_secret_key.encode()
    digest = hashlib.sha256(raw).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()
