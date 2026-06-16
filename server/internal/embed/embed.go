// Package embed 本地哈希词袋 embedding(离线、确定性、中英文词法检索)。与 Python 版同算法。
package embed

import (
	"crypto/md5"
	"encoding/binary"
	"math"
	"regexp"
	"strings"
)

const Dim = 256

var wordRe = regexp.MustCompile(`[a-z0-9]+|[\x{4e00}-\x{9fff}]`)

func tokens(text string) []string {
	text = strings.ToLower(text)
	toks := wordRe.FindAllString(text, -1)
	// 中文加二元组
	var cjk []string
	for _, t := range toks {
		r := []rune(t)
		if len(r) == 1 && r[0] >= 0x4e00 && r[0] <= 0x9fff {
			cjk = append(cjk, t)
		}
	}
	for i := 0; i+1 < len(cjk); i++ {
		toks = append(toks, cjk[i]+cjk[i+1])
	}
	return toks
}

// One 把一段文本向量化。
func One(text string) []float32 {
	vec := make([]float32, Dim)
	for _, tok := range tokens(text) {
		sum := md5.Sum([]byte(tok))
		h := binary.BigEndian.Uint64(sum[:8])
		idx := h % uint64(Dim)
		sign := float32(1)
		if (h/uint64(Dim))%2 == 1 {
			sign = -1
		}
		vec[idx] += sign
	}
	var norm float64
	for _, x := range vec {
		norm += float64(x) * float64(x)
	}
	norm = math.Sqrt(norm)
	if norm == 0 {
		norm = 1
	}
	for i := range vec {
		vec[i] = float32(float64(vec[i]) / norm)
	}
	return vec
}
