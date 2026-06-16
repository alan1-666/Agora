package tools

import (
	"errors"
	"math"
	"strconv"
	"strings"
	"unicode"
)

// Eval 安全求值四则/幂/取模表达式(递归下降,只认数字和 + - * / % ** 和括号,不执行任意代码)。
func Eval(expr string) (float64, error) {
	p := &parser{toks: tokenize(expr)}
	v, err := p.parseExpr()
	if err != nil {
		return 0, err
	}
	if p.pos != len(p.toks) {
		return 0, errors.New("表达式有多余内容")
	}
	return v, nil
}

func tokenize(s string) []string {
	var toks []string
	i := 0
	for i < len(s) {
		c := s[i]
		switch {
		case c == ' ' || c == '\t':
			i++
		case c == '*' && i+1 < len(s) && s[i+1] == '*':
			toks = append(toks, "**")
			i += 2
		case strings.ContainsRune("+-*/%()", rune(c)):
			toks = append(toks, string(c))
			i++
		case unicode.IsDigit(rune(c)) || c == '.':
			j := i
			for j < len(s) && (unicode.IsDigit(rune(s[j])) || s[j] == '.') {
				j++
			}
			toks = append(toks, s[i:j])
			i = j
		default:
			toks = append(toks, "?") // 非法字符,触发解析错误
			i++
		}
	}
	return toks
}

type parser struct {
	toks []string
	pos  int
}

func (p *parser) peek() string {
	if p.pos < len(p.toks) {
		return p.toks[p.pos]
	}
	return ""
}

func (p *parser) parseExpr() (float64, error) {
	v, err := p.parseTerm()
	if err != nil {
		return 0, err
	}
	for p.peek() == "+" || p.peek() == "-" {
		op := p.toks[p.pos]
		p.pos++
		rhs, err := p.parseTerm()
		if err != nil {
			return 0, err
		}
		if op == "+" {
			v += rhs
		} else {
			v -= rhs
		}
	}
	return v, nil
}

func (p *parser) parseTerm() (float64, error) {
	v, err := p.parsePower()
	if err != nil {
		return 0, err
	}
	for p.peek() == "*" || p.peek() == "/" || p.peek() == "%" {
		op := p.toks[p.pos]
		p.pos++
		rhs, err := p.parsePower()
		if err != nil {
			return 0, err
		}
		switch op {
		case "*":
			v *= rhs
		case "/":
			v /= rhs
		case "%":
			v = math.Mod(v, rhs)
		}
	}
	return v, nil
}

func (p *parser) parsePower() (float64, error) {
	v, err := p.parseUnary()
	if err != nil {
		return 0, err
	}
	if p.peek() == "**" {
		p.pos++
		rhs, err := p.parsePower() // 右结合
		if err != nil {
			return 0, err
		}
		return math.Pow(v, rhs), nil
	}
	return v, nil
}

func (p *parser) parseUnary() (float64, error) {
	if p.peek() == "-" {
		p.pos++
		v, err := p.parseUnary()
		return -v, err
	}
	if p.peek() == "+" {
		p.pos++
		return p.parseUnary()
	}
	return p.parsePrimary()
}

func (p *parser) parsePrimary() (float64, error) {
	t := p.peek()
	if t == "(" {
		p.pos++
		v, err := p.parseExpr()
		if err != nil {
			return 0, err
		}
		if p.peek() != ")" {
			return 0, errors.New("缺少右括号")
		}
		p.pos++
		return v, nil
	}
	f, err := strconv.ParseFloat(t, 64)
	if err != nil {
		return 0, errors.New("非法记号: " + t)
	}
	p.pos++
	return f, nil
}
