// Package rag 文档分块嵌入入库 + 向量检索 + 上下文拼装。
package rag

import (
	"context"
	"strings"

	"agora/internal/embed"
	"agora/internal/store"
)

func Chunk(text string, size, overlap int) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	r := []rune(text)
	if len(r) <= size {
		return []string{text}
	}
	var out []string
	for i := 0; i < len(r); i += size - overlap {
		end := i + size
		if end > len(r) {
			end = len(r)
		}
		out = append(out, string(r[i:end]))
	}
	return out
}

// Ingest 把一篇资料切块、嵌入、入库,返回 docID 和块数。
func Ingest(ctx context.Context, st *store.Store, name, text string) (string, int, error) {
	chunks := Chunk(text, 500, 50)
	docID, err := st.AddDocument(ctx, name)
	if err != nil {
		return "", 0, err
	}
	for i, c := range chunks {
		if err := st.AddChunk(ctx, docID, name, i, c, embed.One(c)); err != nil {
			return "", 0, err
		}
	}
	return docID, len(chunks), nil
}

type Item struct {
	Source string
	Text   string
}

// Retrieve 取最相关的记忆 + 文档块。
func Retrieve(ctx context.Context, st *store.Store, query string, kMem, kDoc int) ([]Item, error) {
	vec := embed.One(query)
	var out []Item
	mems, err := st.RetrieveMemories(ctx, vec, kMem)
	if err != nil {
		return nil, err
	}
	for _, m := range mems {
		out = append(out, Item{Source: "记忆", Text: m})
	}
	chunks, err := st.RetrieveChunks(ctx, vec, kDoc)
	if err != nil {
		return nil, err
	}
	for _, c := range chunks {
		out = append(out, Item{Source: "资料:" + c.DocName, Text: c.Content})
	}
	return out, nil
}

func BuildContext(items []Item) string {
	if len(items) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("\n\n以下是可能相关的背景信息与资料,回答时可参考并注明来源(如「据资料X」):")
	for _, it := range items {
		text := it.Text
		if r := []rune(text); len(r) > 400 {
			text = string(r[:400]) + "…"
		}
		b.WriteString("\n[" + it.Source + "] " + text)
	}
	return b.String()
}
