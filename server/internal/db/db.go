// Package db 连接 Postgres + 建表(单用户)。
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct{ Pool *pgxpool.Pool }

func New(ctx context.Context, url string) (*DB, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	d := &DB{Pool: pool}
	if err := d.initSchema(ctx); err != nil {
		return nil, err
	}
	return d, nil
}

func (d *DB) initSchema(ctx context.Context) error {
	stmts := []string{
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
	}
	for _, s := range stmts {
		if _, err := d.Pool.Exec(ctx, s); err != nil {
			return fmt.Errorf("init schema: %w", err)
		}
	}
	return nil
}
