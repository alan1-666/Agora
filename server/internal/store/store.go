// Package store 数据访问层(单用户,无多租户)。
package store

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"

	"agora/internal/crypto"
)

type Store struct {
	pool   *pgxpool.Pool
	cipher *crypto.Cipher
}

func New(pool *pgxpool.Pool, cipher *crypto.Cipher) *Store {
	return &Store{pool: pool, cipher: cipher}
}

// ---------- 频道 ----------

type Channel struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (s *Store) ListChannels(ctx context.Context) ([]Channel, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, name FROM channels ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Channel
	for rows.Next() {
		var c Channel
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) CreateChannel(ctx context.Context, name string) (Channel, error) {
	var c Channel
	err := s.pool.QueryRow(ctx,
		`INSERT INTO channels (name) VALUES ($1) RETURNING id, name`, name).Scan(&c.ID, &c.Name)
	return c, err
}

func (s *Store) ChannelExists(ctx context.Context, id string) (bool, error) {
	var x int
	err := s.pool.QueryRow(ctx, `SELECT 1 FROM channels WHERE id=$1`, id).Scan(&x)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	return err == nil, err
}

// ---------- 消息 ----------

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Seq     int64  `json:"seq"`
}

func (s *Store) ListMessages(ctx context.Context, channelID string) ([]Message, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT role, content, seq FROM messages WHERE channel_id=$1 ORDER BY seq`, channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.Role, &m.Content, &m.Seq); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) AddMessage(ctx context.Context, channelID, role, content string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO messages (channel_id, seq, role, content)
		 VALUES ($1, (SELECT COALESCE(MAX(seq),0)+1 FROM messages WHERE channel_id=$1), $2, $3)`,
		channelID, role, content)
	return err
}

// ---------- Agents ----------

type Agent struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	SystemPrompt string   `json:"system_prompt"`
	Model        *string  `json:"model"`
	Tools        []string `json:"tools"`
}

func scanAgents(rows pgx.Rows) ([]Agent, error) {
	defer rows.Close()
	out := []Agent{}
	for rows.Next() {
		var a Agent
		if err := rows.Scan(&a.ID, &a.Name, &a.SystemPrompt, &a.Model, &a.Tools); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) ListAgents(ctx context.Context) ([]Agent, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, system_prompt, model, tools FROM agents ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	return scanAgents(rows)
}

func (s *Store) GetAgentByName(ctx context.Context, name string) (*Agent, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, system_prompt, model, tools FROM agents WHERE name=$1 LIMIT 1`, name)
	if err != nil {
		return nil, err
	}
	as, err := scanAgents(rows)
	if err != nil || len(as) == 0 {
		return nil, err
	}
	return &as[0], nil
}

func (s *Store) CreateAgent(ctx context.Context, a Agent) (Agent, error) {
	err := s.pool.QueryRow(ctx,
		`INSERT INTO agents (name, system_prompt, model, tools) VALUES ($1,$2,$3,$4)
		 RETURNING id, name, system_prompt, model, tools`,
		a.Name, a.SystemPrompt, a.Model, a.Tools).
		Scan(&a.ID, &a.Name, &a.SystemPrompt, &a.Model, &a.Tools)
	return a, err
}

func (s *Store) UpdateAgent(ctx context.Context, id string, a Agent) (Agent, error) {
	err := s.pool.QueryRow(ctx,
		`UPDATE agents SET name=$2, system_prompt=$3, model=$4, tools=$5 WHERE id=$1
		 RETURNING id, name, system_prompt, model, tools`,
		id, a.Name, a.SystemPrompt, a.Model, a.Tools).
		Scan(&a.ID, &a.Name, &a.SystemPrompt, &a.Model, &a.Tools)
	return a, err
}

func (s *Store) DeleteAgent(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM agents WHERE id=$1`, id)
	return err
}

// ---------- 记忆 / 文档(向量) ----------

func (s *Store) AddMemory(ctx context.Context, content string, vec []float32) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO memories (content, embedding) VALUES ($1,$2)`,
		content, pgvector.NewVector(vec))
	return err
}

func (s *Store) RetrieveMemories(ctx context.Context, vec []float32, k int) ([]string, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT content FROM memories ORDER BY embedding <=> $1 LIMIT $2`,
		pgvector.NewVector(vec), k)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

type Doc struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (s *Store) ListDocuments(ctx context.Context) ([]Doc, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, name FROM documents ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Doc{}
	for rows.Next() {
		var d Doc
		if err := rows.Scan(&d.ID, &d.Name); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Store) AddDocument(ctx context.Context, name string) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx, `INSERT INTO documents (name) VALUES ($1) RETURNING id`, name).Scan(&id)
	return id, err
}

func (s *Store) AddChunk(ctx context.Context, docID, docName string, seq int, content string, vec []float32) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO document_chunks (document_id, doc_name, seq, content, embedding) VALUES ($1,$2,$3,$4,$5)`,
		docID, docName, seq, content, pgvector.NewVector(vec))
	return err
}

type Chunk struct {
	DocName string
	Content string
}

func (s *Store) RetrieveChunks(ctx context.Context, vec []float32, k int) ([]Chunk, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT doc_name, content FROM document_chunks ORDER BY embedding <=> $1 LIMIT $2`,
		pgvector.NewVector(vec), k)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Chunk
	for rows.Next() {
		var c Chunk
		if err := rows.Scan(&c.DocName, &c.Content); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
