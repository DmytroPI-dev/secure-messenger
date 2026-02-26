package room

import (
	"fmt"
	"github.com/gorilla/websocket"
	"log"
	"sync"
)

// Room represents a chat room with a unique ID and a list of connections.
type Room struct {
	Id          string
	Connection  []*websocket.Conn
	mutex       sync.Mutex
	InitiatorId string
	ReceiverId  string
}

// RoomManager manages multiple rooms and their connections.
type RoomManager struct {
	Rooms map[string]*Room
	mutex sync.Mutex
}

// NewRoomManager creates a new RoomManager instance.
func NewRoomManager() *RoomManager {
	return &RoomManager{
		Rooms: make(map[string]*Room),
	}
}

// JoinRoom adds a connection to the specified room. If the room does not exist, it creates a new one. If the room already has 2 connections, it logs a message and returns an error.
func (rm *RoomManager) JoinRoom(roomId string, conn *websocket.Conn) error {
	rm.mutex.Lock()
	defer rm.mutex.Unlock()

	// Check if the room already exists, if not create a new one
	room, exists := rm.Rooms[roomId]
	if !exists {
		room = &Room{
			Id:         roomId,
			Connection: make([]*websocket.Conn, 0),
		}
		rm.Rooms[roomId] = room
	}
	// Check if the room has more than 2 connections, if so, log a message and return
	if len(room.Connection) >= 2 {
		log.Printf("Room %s is full", roomId)
		return fmt.Errorf("room %s is full", roomId)
	}
	// Add the connection to the room if it's not full
	room.Connection = append(room.Connection, conn)
	return nil
}

// LeaveRoom removes a connection from the specified room. If the room becomes empty after removing the connection, it deletes the room from the RoomManager.
func (rm *RoomManager) LeaveRoom(roomId string, conn *websocket.Conn) {
	// Lock the room manager to safely access the rooms map
	room := rm.GetOrCreateRoom(roomId)
	if room == nil {
		return
	}
	room.mutex.Lock()
	// Remove the connection from the room and if the room is empty, delete it
	for i, c := range room.Connection {
		if c == conn {
			room.Connection = append(room.Connection[:i], room.Connection[i+1:]...)
			break
		}
	}
	if len(room.Connection) == 0 {
		room.mutex.Unlock() // Unlock the room mutex before deleting the room
		rm.mutex.Lock()
		delete(rm.Rooms, roomId)
		rm.mutex.Unlock() // Unlock the room mutex after deleting the room
		log.Printf("Room %s deleted", roomId)
		return
	}
	room.mutex.Unlock()
}

// Broadcast sends a message to all connections in the specified room except the sender connection.
func (rm *RoomManager) Broadcast(roomId string, message []byte, senderConn *websocket.Conn) {
	room := rm.GetOrCreateRoom(roomId)
	if room == nil {
		return
	}
	room.mutex.Lock()
	defer room.mutex.Unlock()
	for _, conn := range room.Connection {
		if conn != senderConn {
			if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("Error broadcasting message to room %s: %v", roomId, err)
			}
		}
	}
}

// GetOrCreateRoom locks the manager, fetches the room, or creates it if it doesn't exist.
func (rm *RoomManager) GetOrCreateRoom(roomId string) *Room {
	rm.mutex.Lock()
	defer rm.mutex.Unlock()

	r, exists := rm.Rooms[roomId]
	if !exists {
		// Create the new room instance safely
		r = &Room{
			Id: roomId,
			// Initialize your connection slice/map depending on how you structured it
			Connection: make([]*websocket.Conn, 0),
		}
		rm.Rooms[roomId] = r
	}
	return r
}
