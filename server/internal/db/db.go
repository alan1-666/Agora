// Package db 连接 Postgres + 建表(单用户,无多租户/RLS)。
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	pgxvector "github.com/pgvector/pgvector-go/pgx"
)

type DB struct{ Pool *pgxpool.Pool }

func New(ctx context.Context, url string, dim int) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	// 每个连接注册 pgvector 类型
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		return pgxvector.RegisterTypes(ctx, conn)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	d := &DB{Pool: pool}
	if err := d.initSchema(ctx, dim); err != nil {
		return nil, err
	}
	return d, nil
}

func (d *DB) initSchema(ctx context.Context, dim int) error {
	stmts := []string{
		`CREATE EXTENSION IF NOT EXISTS vector`,
		`CREATE TABLE IF NOT EXISTS agents (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name TEXT NOT NULL,
			system_prompt TEXT NOT NULL DEFAULT '',
			model TEXT,
			tools JSONB NOT NULL DEFAULT '[]',
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS channels (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name TEXT NOT NULL DEFAULT 'general',
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		// DM:kind='dm' 且 agent_id 指向私信对象;普通频道 kind='channel'。
		`ALTER TABLE channels ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'channel'`,
		`ALTER TABLE channels ADD COLUMN IF NOT EXISTS agent_id UUID`,
		`CREATE TABLE IF NOT EXISTS messages (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
			seq BIGINT NOT NULL,
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		// 线程:parent_id 指向所属线程的根消息;根消息 parent_id 为 NULL。
		`ALTER TABLE messages ADD COLUMN IF NOT EXISTS parent_id UUID`,
		`CREATE TABLE IF NOT EXISTS memories (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			content TEXT NOT NULL,
			embedding vector(` + fmt.Sprint(dim) + `) NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS documents (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name TEXT NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`,
		`CREATE TABLE IF NOT EXISTS document_chunks (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
			doc_name TEXT NOT NULL,
			seq BIGINT NOT NULL,
			content TEXT NOT NULL,
			embedding vector(` + fmt.Sprint(dim) + `) NOT NULL
		)`,
		// credentials:单行,存模型鉴权(API key 或 OAuth token)
		`CREATE TABLE IF NOT EXISTS credentials (
			id INT PRIMARY KEY DEFAULT 1,
			provider TEXT NOT NULL DEFAULT 'anthropic',
			kind TEXT NOT NULL DEFAULT 'apikey',          -- apikey | oauth
			secret TEXT,                                   -- 加密的 API key
			oauth_access TEXT,                             -- 加密的 OAuth access token
			oauth_refresh TEXT,                            -- 加密的 OAuth refresh token
			oauth_expiry BIGINT NOT NULL DEFAULT 0,        -- access token 过期 epoch 秒
			model TEXT,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			CONSTRAINT credentials_single CHECK (id = 1)
		)`,
	}
	for _, s := range stmts {
		if _, err := d.Pool.Exec(ctx, s); err != nil {
			return fmt.Errorf("init schema: %w", err)
		}
	}
	return nil
}
