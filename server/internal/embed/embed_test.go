package embed

import (
	"math"
	"testing"
)

func cos(a, b []float32) float64 {
	var dot, na, nb float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		na += float64(a[i]) * float64(a[i])
		nb += float64(b[i]) * float64(b[i])
	}
	return dot / (math.Sqrt(na)*math.Sqrt(nb) + 1e-12)
}

func TestDeterministic(t *testing.T) {
	a, b := One("hello world"), One("hello world")
	for i := range a {
		if a[i] != b[i] {
			t.Fatal("embedding 应确定")
		}
	}
}

func TestOverlapMoreSimilar(t *testing.T) {
	q := One("vacation policy")
	near := One("the vacation policy is 15 days")
	far := One("database migration script")
	if cos(q, near) <= cos(q, far) {
		t.Error("词法重叠应更相似")
	}
}

func TestChineseOverlap(t *testing.T) {
	q := One("休假政策")
	near := One("公司的休假政策是每年十五天")
	far := One("报销需要提交发票")
	if cos(q, near) <= cos(q, far) {
		t.Error("中文词法重叠应更相似")
	}
}
