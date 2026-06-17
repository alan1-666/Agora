// Package hub 进程内发布/订阅:按频道把事件推给所有订阅者(SSE 连接)。单用户本地够用。
package hub

import "sync"

type Event map[string]any

type Hub struct {
	mu   sync.Mutex
	subs map[string]map[chan Event]struct{} // channelID -> 订阅者集合
}

func New() *Hub {
	return &Hub{subs: map[string]map[chan Event]struct{}{}}
}

// Subscribe 订阅某频道,返回一个带缓冲的事件通道。
func (h *Hub) Subscribe(channelID string) chan Event {
	ch := make(chan Event, 32)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs[channelID] == nil {
		h.subs[channelID] = map[chan Event]struct{}{}
	}
	h.subs[channelID][ch] = struct{}{}
	return ch
}

func (h *Hub) Unsubscribe(channelID string, ch chan Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set := h.subs[channelID]; set != nil {
		delete(set, ch)
		if len(set) == 0 {
			delete(h.subs, channelID)
		}
	}
	close(ch)
}

// Publish 把事件发给该频道所有订阅者(满了就丢,不阻塞发布方)。
func (h *Hub) Publish(channelID string, ev Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs[channelID] {
		select {
		case ch <- ev:
		default:
		}
	}
}
