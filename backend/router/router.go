package router

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"log"
	"messenger-backend/room"
	"net/http"
	"fmt"
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
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status": "ok",
		})
	})
	router.GET("/ws", func(c *gin.Context) {
		handleWebSocket(c.Writer, c.Request)
	})
	return router
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	var currentRoomId string

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	defer func() {
		if currentRoomId != "" {
			roomManager.LeaveRoom(currentRoomId, conn)
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
			err := json.Unmarshal(msg.Data, &joinData)
			if err != nil {
				log.Println(err)
				conn.WriteJSON(gin.H{"error": "invalid join data"})
				return
			}
			currentRoomId = msg.RoomId
			var role string
			existingRoom := roomManager.GetOrCreateRoom(msg.RoomId)
			if existingRoom.InitiatorId == "" {
				role = "initiator"
				existingRoom.InitiatorId = joinData.ClientId
			} else if existingRoom.InitiatorId == joinData.ClientId {
				role = "initiator"
			} else if existingRoom.InitiatorId != joinData.ClientId && existingRoom.ReceiverId == "" {
				role = "receiver"
				existingRoom.ReceiverId = joinData.ClientId
			} else if existingRoom.ReceiverId == joinData.ClientId {
				role = "receiver"
			} else {
				log.Printf("Room %s is full", msg.RoomId)
				conn.WriteJSON(gin.H{"error": fmt.Sprintf("room %s is full", msg.RoomId)})
				return
			}
			err = roomManager.JoinRoom(msg.RoomId, conn)
			if err != nil {
				log.Println(err)
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
		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}
}
