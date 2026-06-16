from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """从环境变量 / .env 读取配置。"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- 数据库 ---
    # 运行时连 agora_app(非超级用户),这样 RLS 才会真正生效(超级用户会绕过 RLS)。
    database_url: str = "postgresql+psycopg://agora_app:agora_app@localhost:5433/agora"
    # 建表/迁移/建角色用超级用户。
    database_admin_url: str = "postgresql+psycopg://agora:agora@localhost:5433/agora"

    # --- 安全 ---
    # 用于加密各组织存的模型 API key(Fernet)。生产必须换成强随机值,且不进代码。
    # 生成: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    app_secret_key: str = "dev-insecure-key-change-me-0000000000000000000="

    # --- 认证 ---
    # dev_mode=True 时用内置的开发用 org/user(免 Clerk),方便本地起步;
    # 生产置 False,走 Clerk 会话校验。
    dev_mode: bool = True
    clerk_secret_key: str = ""
    clerk_jwks_url: str = ""

    # --- 模型(BYO-key 缺省兜底:组织没配 key 时用这个全局 key,仅 dev 方便用) ---
    anthropic_api_key: str = ""
    model: str = "claude-sonnet-4-6"
    max_tokens: int = 2048

    # 前端开发地址,用于 CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]


settings = Settings()
