from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """从环境变量 / .env 读取配置。"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str = ""

    # 默认用 Sonnet：agent 循环会反复调模型，Sonnet 在能力/成本上最平衡。
    # 想更强可换 claude-opus-4-8 或 claude-fable-5；想更省可换 claude-haiku-4-5-20251001。
    model: str = "claude-sonnet-4-6"
    max_tokens: int = 2048

    # 前端开发地址，用于 CORS
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
