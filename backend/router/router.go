package router

import (
	"encoding/json"
	"log"
	translations "messenger-backend/i18n"
	"messenger-backend/room"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type Message struct {
	Type   string          `json:"type"`
	RoomId string          `json:"roomId"`
	Data   json.RawMessage `json:"data"`
}

var roomManager = room.NewRoomManager()

// allowedOrigins builds the set of permitted WebSocket origins from the
// CORS_ORIGIN environment variable (comma-separated) plus the local dev origin.
// No production origins are hardcoded — set CORS_ORIGIN on each server.
func allowedOrigins() map[string]bool {
	allowed := map[string]bool{"http://localhost:5173": true}
	raw := os.Getenv("CORS_ORIGIN")

	for o := range strings.SplitSeq(raw, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			allowed[o] = true
		}
	}
	return allowed
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return allowedOrigins()[r.Header.Get("Origin")]
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

func SetupRouter() *gin.Engine {
	router := gin.Default()
	go roomManager.CleanupRooms() // Start the cleanup goroutine
	router.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })
	router.GET("/api/i18n/:language", handlePublicTranslation)
	router.GET("/api/rooms/:roomId/status", handleRoomStatus)
	router.GET("/ws", func(c *gin.Context) { handleWebSocket(c.Writer, c.Request) })
	return router
}

func handlePublicTranslation(c *gin.Context) {
	payload, err := translations.LoadPublicTranslation(c.Param("language"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "translation unavailable"})
		return
	}

	c.Header("Cache-Control", "public, max-age=3600")
	c.Data(http.StatusOK, "application/json; charset=utf-8", payload)
}

func handleRoomStatus(c *gin.Context) {
	roomId := c.Param("roomId")
	occupants := roomManager.GetRoomOccupancy(roomId)
	state := "empty"

	switch {
	case occupants == 1:
		state = "waiting"
	case occupants >= 2:
		state = "full"
	}

	c.JSON(http.StatusOK, gin.H{
		"roomId":    roomId,
		"occupants": occupants,
		"state":     state,
	})
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
