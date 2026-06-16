package store

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// Auth 解出的鉴权信息(给 llm 用)。Mode: apikey | oauth | ""(未配置)。
type Auth struct {
	Mode   string
	Secret string
	Model  string
}

type credRow struct {
	kind         string
	secret       *string
	oauthAccess  *string
	oauthRefresh *string
	oauthExpiry  int64
	model        *string
}

func (s *Store) readCred(ctx context.Context) (*credRow, error) {
	var r credRow
	err := s.pool.QueryRow(ctx,
		`SELECT kind, secret, oauth_access, oauth_refresh, oauth_expiry, model FROM credentials WHERE id=1`).
		Scan(&r.kind, &r.secret, &r.oauthAccess, &r.oauthRefresh, &r.oauthExpiry, &r.model)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return &r, err
}

// GetAuth 返回当前可用的鉴权(优先 OAuth 登录,否则 API key)。
func (s *Store) GetAuth(ctx context.Context) (Auth, error) {
	r, err := s.readCred(ctx)
	if err != nil || r == nil {
		return Auth{}, err
	}
	model := ""
	if r.model != nil {
		model = *r.model
	}
	if r.kind == "oauth" && r.oauthAccess != nil && *r.oauthAccess != "" {
		tok, err := s.cipher.Decrypt(*r.oauthAccess)
		if err != nil {
			return Auth{}, err
		}
		return Auth{Mode: "oauth", Secret: tok, Model: model}, nil
	}
	if r.secret != nil && *r.secret != "" {
		key, err := s.cipher.Decrypt(*r.secret)
		if err != nil {
			return Auth{}, err
		}
		return Auth{Mode: "apikey", Secret: key, Model: model}, nil
	}
	return Auth{Model: model}, nil
}

// KeyStatus 给前端展示当前鉴权状态(不回明文)。
type KeyStatus struct {
	Configured bool   `json:"configured"`
	Kind       string `json:"kind"`
	Model      string `json:"model"`
}

func (s *Store) KeyStatus(ctx context.Context) (KeyStatus, error) {
	r, err := s.readCred(ctx)
	if err != nil || r == nil {
		return KeyStatus{}, err
	}
	st := KeyStatus{Kind: r.kind}
	if r.model != nil {
		st.Model = *r.model
	}
	st.Configured = (r.kind == "oauth" && r.oauthAccess != nil && *r.oauthAccess != "") ||
		(r.secret != nil && *r.secret != "")
	return st, nil
}

func (s *Store) upsertCred(ctx context.Context, set string, args ...any) error {
	// 保证单行存在再更新
	if _, err := s.pool.Exec(ctx, `INSERT INTO credentials (id) VALUES (1) ON CONFLICT (id) DO NOTHING`); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `UPDATE credentials SET `+set+`, updated_at=now() WHERE id=1`, args...)
	return err
}

// SetAPIKey 存 API key(加密)。
func (s *Store) SetAPIKey(ctx context.Context, plainKey, model string) error {
	enc, err := s.cipher.Encrypt(plainKey)
	if err != nil {
		return err
	}
	return s.upsertCred(ctx, `kind='apikey', secret=$1, model=$2`, enc, model)
}

// OAuthCreds 返回解密的 OAuth 凭证(供刷新用)。isOAuth=false 表示当前不是 OAuth 模式。
func (s *Store) OAuthCreds(ctx context.Context) (refresh string, expiry int64, model string, isOAuth bool, err error) {
	r, err := s.readCred(ctx)
	if err != nil || r == nil {
		return "", 0, "", false, err
	}
	if r.kind != "oauth" || r.oauthRefresh == nil || *r.oauthRefresh == "" {
		return "", 0, "", false, nil
	}
	ref, err := s.cipher.Decrypt(*r.oauthRefresh)
	if err != nil {
		return "", 0, "", false, err
	}
	m := ""
	if r.model != nil {
		m = *r.model
	}
	return ref, r.oauthExpiry, m, true, nil
}

// SetOAuth 存 OAuth token(加密)。Task 16 登录后调用。
func (s *Store) SetOAuth(ctx context.Context, access, refresh string, expiry int64, model string) error {
	ea, err := s.cipher.Encrypt(access)
	if err != nil {
		return err
	}
	er, err := s.cipher.Encrypt(refresh)
	if err != nil {
		return err
	}
	return s.upsertCred(ctx, `kind='oauth', oauth_access=$1, oauth_refresh=$2, oauth_expiry=$3, model=$4`,
		ea, er, expiry, model)
}
