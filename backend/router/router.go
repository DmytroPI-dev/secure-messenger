package router

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"log"
	"messenger-backend/room"
	"net/http"
)

type Message struct {
	Type   string          `json:"type"`
	RoomId string          `json:"roomId"`
	Data   json.RawMessage `json:"data"`
}

var roomManager = room.NewRoomManager()

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		return origin == "http://localhost:5173" || origin == "https://messenger.dmytro-dev.net"
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

func SetupRouter() *gin.Engine {
	router := gin.Default()
	go roomManager.CleanupRooms() // Start the cleanup goroutine
	router.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })
	router.GET("/ws", func(c *gin.Context) { handleWebSocket(c.Writer, c.Request) })
	return router
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	var currentRoomId string

	rawConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	conn := &room.SafeConnection{Conn: rawConn}

	defer func() {
		if currentRoomId != "" {
			roomManager.LeaveRoom(currentRoomId, conn)
			log.Printf("Client disconnected from room %s", currentRoomId)
		}
	}()

	defer conn.Close()

	for {
		var msg Message
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Println(err)
			break
		}
		switch msg.Type {
		case "join":
			var joinData struct {
				ClientId string `json:"clientId"`
			}
			if err := json.Unmarshal(msg.Data, &joinData); err != nil {
				conn.WriteJSON(gin.H{"error": "invalid join data"})
				return
			}

			currentRoomId = msg.RoomId
			// JoinRoom handles creation, locking, AND role assignment
			role, err := roomManager.JoinRoom(msg.RoomId, joinData.ClientId, conn)
			if err != nil {
				conn.WriteJSON(gin.H{"error": err.Error()})
				return
			}
			roleMsg := map[string]any{
				"type": "role",
				"data": map[string]string{"role": role},
			}
			conn.WriteJSON(roleMsg)
		case "signal":
			data, _ := json.Marshal(gin.H{"type": "signal", "data": msg.Data})
			roomManager.Broadcast(msg.RoomId, data, conn)
		case "chat":
			data, _ := json.Marshal(gin.H{"type": "chat", "data": msg.Data})
			roomManager.Broadcast(msg.RoomId, data, conn)
		case "peer-status":
			data, _ := json.Marshal(gin.H{"type": "peer-status", "data": msg.Data})
			roomManager.Broadcast(msg.RoomId, data, conn)
		case "end-call":
			data, _ := json.Marshal(gin.H{"type": "call-ended"})
			roomManager.Broadcast(msg.RoomId, data, conn)
			// Remove this connection first to ensure the "call-ended" message is sent to the peer before the room is potentially deleted
			roomManager.LeaveRoom(msg.RoomId, conn)
			// Then permanently delete the room
			roomManager.DeleteRoom(msg.RoomId)
			currentRoomId = ""
			log.Printf("Call ended in room %s", msg.RoomId)
			return
		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}
}
