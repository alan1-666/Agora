// Package store 数据访问层(单用户,无多租户)。
package store

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// ---------- 频道 ----------

type Channel struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Kind    string  `json:"kind"`     // channel | dm
	AgentID *string `json:"agent_id"` // dm 的私信对象
}

func scanChannels(rows pgx.Rows) ([]Channel, error) {
	defer rows.Close()
	out := []Channel{}
	for rows.Next() {
		var c Channel
		if err := rows.Scan(&c.ID, &c.Name, &c.Kind, &c.AgentID); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ListChannels 只返普通频道(不含 DM)。
func (s *Store) ListChannels(ctx context.Context) ([]Channel, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, kind, agent_id FROM channels WHERE kind='channel' ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	return scanChannels(rows)
}

// ListDMs 返回所有 DM 会话。
func (s *Store) ListDMs(ctx context.Context) ([]Channel, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, kind, agent_id FROM channels WHERE kind='dm' ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	return scanChannels(rows)
}

func (s *Store) CreateChannel(ctx context.Context, name string) (Channel, error) {
	c := Channel{Kind: "channel"}
	err := s.pool.QueryRow(ctx,
		`INSERT INTO channels (name, kind) VALUES ($1, 'channel') RETURNING id, name, kind, agent_id`,
		name).Scan(&c.ID, &c.Name, &c.Kind, &c.AgentID)
	return c, err
}

// GetOrCreateDM 取/建与某 agent 的私信会话(name = agent 名)。
func (s *Store) GetOrCreateDM(ctx context.Context, agentID string) (Channel, error) {
	var c Channel
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, kind, agent_id FROM channels WHERE kind='dm' AND agent_id=$1 LIMIT 1`,
		agentID).Scan(&c.ID, &c.Name, &c.Kind, &c.AgentID)
	if err == nil {
		return c, nil
	}
	if err != pgx.ErrNoRows {
		return c, err
	}
	// 没有则新建,名字取 agent 名
	var name string
	if err := s.pool.QueryRow(ctx, `SELECT name FROM agents WHERE id=$1`, agentID).Scan(&name); err != nil {
		return c, err
	}
	err = s.pool.QueryRow(ctx,
		`INSERT INTO channels (name, kind, agent_id) VALUES ($1, 'dm', $2) RETURNING id, name, kind, agent_id`,
		name, agentID).Scan(&c.ID, &c.Name, &c.Kind, &c.AgentID)
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
	ID         string  `json:"id"`
	Role       string  `json:"role"`
	Content    string  `json:"content"`
	Seq        int64   `json:"seq"`
	ReplyCount int     `json:"reply_count"`
	ParentID   *string `json:"parent_id"`
	Author     *string `json:"author"`     // 作者(agent 名);user 消息为空
	RelayFrom  *string `json:"relay_from"` // 因被谁 @ 接力而产生;非接力为空
}

func scanMessages(rows pgx.Rows) ([]Message, error) {
	defer rows.Close()
	out := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.Role, &m.Content, &m.Seq, &m.ReplyCount, &m.ParentID, &m.Author, &m.RelayFrom); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// ListMessages 返回频道的"根消息"(不含线程内回复) + 各自回复数。
func (s *Store) ListMessages(ctx context.Context, channelID string) ([]Message, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT m.id, m.role, m.content, m.seq,
		        (SELECT count(*) FROM messages r WHERE r.parent_id = m.id) AS reply_count,
		        m.parent_id, m.author, m.relay_from
		 FROM messages m WHERE m.channel_id=$1 AND m.parent_id IS NULL ORDER BY m.seq`, channelID)
	if err != nil {
		return nil, err
	}
	return scanMessages(rows)
}

// ListThread 返回某条根消息及其线程内全部回复。
func (s *Store) ListThread(ctx context.Context, rootID string) ([]Message, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, role, content, seq, 0, parent_id, author, relay_from FROM messages
		 WHERE id=$1 OR parent_id=$1 ORDER BY seq`, rootID)
	if err != nil {
		return nil, err
	}
	return scanMessages(rows)
}

// AddMessage 写一条消息并返回它(含 id/parent_id,供事件推送)。parentID 非空=线程内回复。
// author=作者(agent 名,user 消息传 nil);relayFrom=接力来源(非接力传 nil)。
func (s *Store) AddMessage(ctx context.Context, channelID, role, content string, parentID, author, relayFrom *string) (Message, error) {
	var m Message
	err := s.pool.QueryRow(ctx,
		`INSERT INTO messages (channel_id, seq, role, content, parent_id, author, relay_from)
		 VALUES ($1, (SELECT COALESCE(MAX(seq),0)+1 FROM messages WHERE channel_id=$1), $2, $3, $4, $5, $6)
		 RETURNING id, role, content, seq, 0, parent_id, author, relay_from`,
		channelID, role, content, parentID, author, relayFrom).
		Scan(&m.ID, &m.Role, &m.Content, &m.Seq, &m.ReplyCount, &m.ParentID, &m.Author, &m.RelayFrom)
	return m, err
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

// ---------- 频道成员 ----------

func (s *Store) ListChannelMembers(ctx context.Context, channelID string) ([]Agent, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT a.id, a.name, a.system_prompt, a.model, a.tools
		 FROM channel_members m JOIN agents a ON a.id = m.agent_id
		 WHERE m.channel_id=$1 ORDER BY m.created_at`, channelID)
	if err != nil {
		return nil, err
	}
	return scanAgents(rows)
}

func (s *Store) AddChannelMember(ctx context.Context, channelID, agentID string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO channel_members (channel_id, agent_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
		channelID, agentID)
	return err
}

func (s *Store) RemoveChannelMember(ctx context.Context, channelID, agentID string) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM channel_members WHERE channel_id=$1 AND agent_id=$2`, channelID, agentID)
	return err
}
