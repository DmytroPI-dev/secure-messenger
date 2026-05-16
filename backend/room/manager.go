package room

import (
	"errors"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

const roomDeleteDelay = 30 * time.Second

// SafeConnection wraps a gorilla websocket to ensure thread-safe writes.
type SafeConnection struct {
	*websocket.Conn
	mu       sync.Mutex
	ClientId string
	closed   atomic.Bool
}

// Room represents a chat room with a unique ID and a list of connections.
type Room struct {
	Id             string
	Connection     []*SafeConnection
	mutex          sync.Mutex
	InitiatorId    string
	ReceiverId     string
	Mode           string
	LastDisconnect time.Time
}

type JoinResult struct {
	Role      string
	Mode      string
	Occupancy int
}

// RoomManager manages multiple rooms and their connections.
type RoomManager struct {
	Rooms map[string]*Room
	mutex sync.Mutex
}

// WriteJSON safely writes JSON to the websocket.
func (c *SafeConnection) WriteJSON(v any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.Conn.WriteJSON(v)
}

// WriteMessage safely writes a message to the websocket.
func (c *SafeConnection) WriteMessage(messageType int, data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.Conn.WriteMessage(messageType, data)
}

// WriteControl safely writes a control frame to the websocket.
func (c *SafeConnection) WriteControl(messageType int, data []byte, deadline time.Time) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.Conn.WriteControl(messageType, data, deadline)
}

func (c *SafeConnection) MarkClosed() {
	if c != nil {
		c.closed.Store(true)
	}
}

func (c *SafeConnection) IsAlive() bool {
	return c != nil && c.Conn != nil && !c.closed.Load() && c.UnderlyingConn() != nil
}

// NewRoomManager creates a new RoomManager instance.
func NewRoomManager() *RoomManager {
	return &RoomManager{
		Rooms: make(map[string]*Room),
	}
}

// Lock acquires the room's mutex
func (r *Room) Lock() {
	r.mutex.Lock()
}

// Unlock releases the room's mutex
func (r *Room) Unlock() {
	r.mutex.Unlock()
}

func (roomManager *RoomManager) Lock() {
	roomManager.mutex.Lock()
}

func (roomManager *RoomManager) Unlock() {
	roomManager.mutex.Unlock()
}

// JoinRoom adds a connection to the specified room. If the room does not exist, it creates a new one. If the room already has 2 connections, it logs a message and returns an error.
func normalizeMode(mode string) string {
	switch mode {
	case "video":
		return "video"
	default:
		return "audio"
	}
}

func (roomManager *RoomManager) JoinRoom(roomId string, clientId string, requestedMode string, conn *SafeConnection) (JoinResult, error) {
	room := roomManager.CreateRoom(roomId)

	room.Lock()
	defer room.Unlock()

	room.cleanDeadConnections()

	if len(room.Connection) >= 2 {
		log.Printf("room join rejected: room=%s client=%s occupants=%d mode=%s initiator=%s receiver=%s", roomId, clientId, len(room.Connection), room.Mode, room.InitiatorId, room.ReceiverId)
		return JoinResult{}, errors.New("room is full")
	}

	if room.Mode == "" {
		room.Mode = normalizeMode(requestedMode)
	}

	// Role assignment logic moved inside the safe boundary of the Room!
	var role string
	if room.InitiatorId == "" || room.InitiatorId == clientId {
		role = "initiator"
		room.InitiatorId = clientId
	} else if room.ReceiverId == "" || room.ReceiverId == clientId {
		role = "receiver"
		room.ReceiverId = clientId
	} else {
		return JoinResult{}, errors.New("room has no available roles")
	}
	conn.ClientId = clientId

	room.Connection = append(room.Connection, conn)
	occupancy := len(room.Connection)
	log.Printf("room join accepted: room=%s client=%s role=%s mode=%s occupants=%d", roomId, clientId, role, room.Mode, occupancy)
	return JoinResult{Role: role, Mode: room.Mode, Occupancy: occupancy}, nil
}

// LeaveRoom removes a connection from the specified room. If the room becomes empty after removal, it starts a grace period timer to potentially delete the room if it remains empty.
func (roomManager *RoomManager) LeaveRoom(roomId string, conn *SafeConnection) int {
	roomManager.Lock()
	room, exists := roomManager.Rooms[roomId]
	if !exists {
		roomManager.Unlock()
		return 0
	}
	roomManager.Unlock()

	room.Lock()
	defer room.Unlock()

	for i, c := range room.Connection {
		if c == conn {
			// Remove connection from slice
			room.Connection = append(room.Connection[:i], room.Connection[i+1:]...)
			conn.MarkClosed()
			// Clear role if this connection was assigned one
			if room.InitiatorId == conn.ClientId {
				room.InitiatorId = ""
			} else if room.ReceiverId == conn.ClientId {
				room.ReceiverId = ""
			}
			remaining := len(room.Connection)
			log.Printf("room leave: room=%s client=%s remaining=%d", roomId, conn.ClientId, remaining)
			if len(room.Connection) == 0 {
				room.LastDisconnect = time.Now()
				log.Printf("room became empty; cleanup grace period started: room=%s", roomId)
			}
			return remaining
		}
	}

	return len(room.Connection)
}

// GetRoom returns existing room without creating
func (roomManager *RoomManager) GetRoom(roomId string) *Room {
	roomManager.Lock()
	defer roomManager.Unlock()
	return roomManager.Rooms[roomId]
}

func (roomManager *RoomManager) GetRoomOccupancy(roomId string) int {
	room := roomManager.GetRoom(roomId)
	if room == nil {
		return 0
	}

	room.Lock()
	defer room.Unlock()
	room.cleanDeadConnections()
	return len(room.Connection)
}

func (roomManager *RoomManager) GetRoomMode(roomId string) string {
	room := roomManager.GetRoom(roomId)
	if room == nil {
		return ""
	}

	room.Lock()
	defer room.Unlock()
	room.cleanDeadConnections()
	return room.Mode
}

// Broadcast sends a message to all connections in the specified room except the sender connection.
func (roomManager *RoomManager) Broadcast(roomId string, message []byte, senderConn *SafeConnection) {
	room := roomManager.GetRoom(roomId)
	if room == nil {
		return
	}
	room.Lock()
	activeConn := make([]*SafeConnection, len(room.Connection))
	copy(activeConn, room.Connection)
	room.Unlock()

	for _, conn := range activeConn {
		if conn != senderConn {
			if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("broadcast failed: %v", err)
			}
		}
	}
}

// CreateRoom locks the manager, creates the room if it doesn't exist.
func (roomManager *RoomManager) CreateRoom(roomId string) *Room {
	roomManager.Lock()
	defer roomManager.Unlock()

	room, exists := roomManager.Rooms[roomId]
	if !exists {
		// Create the new room instance safely
		room = &Room{
			Id: roomId,
			// Initialize your connection slice/map depending on how you structured it
			Connection: make([]*SafeConnection, 0),
		}
		roomManager.Rooms[roomId] = room
	}
	return room
}

// DeleteRoom permanently deletes a room from the RoomManager. This should be called after a grace period if the room remains empty.
func (roomManager *RoomManager) DeleteRoom(roomId string) {
	roomManager.Lock()
	defer roomManager.Unlock()
	delete(roomManager.Rooms, roomId)
	log.Printf("room permanently deleted: room=%s", roomId)
}

func (roomManager *RoomManager) CleanupRooms() {
	ticker := time.NewTicker(roomDeleteDelay)
	defer ticker.Stop()
	for range ticker.C {
		func() {
			now := time.Now()
			toDelete := []string{}
			roomManager.Lock()
			defer roomManager.Unlock()

			for roomId, room := range roomManager.Rooms {
				room.Lock()
				// If room empty and been empty for > roomDeleteDelay seconds
				if len(room.Connection) == 0 &&
					!room.LastDisconnect.IsZero() &&
					now.Sub(room.LastDisconnect) > roomDeleteDelay {
					toDelete = append(toDelete, roomId)
				}
				room.Unlock()
			}
			for _, roomId := range toDelete {
				delete(roomManager.Rooms, roomId)
				log.Printf("cleaned up empty room: room=%s", roomId)
			}
		}()
	}
}

// cleanDeadConnections removes any closed or invalid WebSocket connections from the room
// This should be called with the room's mutex already locked
func (r *Room) cleanDeadConnections() {
	aliveConnections := make([]*SafeConnection, 0)
	for _, conn := range r.Connection {
		if conn.IsAlive() {
			aliveConnections = append(aliveConnections, conn)
		} else {
			if conn != nil {
				if r.InitiatorId == conn.ClientId {
					r.InitiatorId = ""
				}
				if r.ReceiverId == conn.ClientId {
					r.ReceiverId = ""
				}
				log.Printf("removed dead connection from room: room=%s client=%s", r.Id, conn.ClientId)
			} else {
				log.Printf("removed dead connection from room: room=%s client=<nil>", r.Id)
			}
		}
	}
	r.Connection = aliveConnections
}
