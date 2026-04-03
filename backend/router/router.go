package router

import (
	"encoding/json"
	"log"
	"messenger-backend/bulletin"
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

var bulletinStore *bulletin.Store

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

func SetupRouter() (*gin.Engine, error) {
	store, err := bulletin.NewStore(bulletin.DefaultStorePath())
	if err != nil {
		return nil, err
	}

	bulletinStore = store

	router := gin.New()
	router.Use(gin.Recovery())
	go roomManager.CleanupRooms() // Start the cleanup goroutine
	go bulletinStore.CleanupExpired()
	router.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })
	router.GET("/api/i18n/:language", handlePublicTranslation)
	router.GET("/api/rooms/:roomId/status", handleRoomStatus)
	router.POST("/api/bulletins/store", handleBulletinStore)
	router.POST("/api/bulletins/read-once", handleBulletinReadOnce)
	router.GET("/ws", func(c *gin.Context) { handleWebSocket(c.Writer, c.Request) })
	return router, nil
}

type bulletinEnvelopeResponse struct {
	Version    int    `json:"version"`
	Nonce      string `json:"nonce"`
	Ciphertext string `json:"ciphertext"`
}

func handleBulletinStore(c *gin.Context) {
	var request struct {
		MailboxID          string                   `json:"mailboxId"`
		AccessVerifier     string                   `json:"accessVerifier"`
		CiphertextEnvelope bulletinEnvelopeResponse `json:"ciphertextEnvelope"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	err := bulletinStore.StoreNote(request.MailboxID, request.AccessVerifier, bulletin.Envelope{
		Version:    request.CiphertextEnvelope.Version,
		Nonce:      request.CiphertextEnvelope.Nonce,
		Ciphertext: request.CiphertextEnvelope.Ciphertext,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleBulletinReadOnce(c *gin.Context) {
	var request struct {
		MailboxID      string `json:"mailboxId"`
		AccessVerifier string `json:"accessVerifier"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	envelope, ok, err := bulletinStore.ReadOnce(request.MailboxID, request.AccessVerifier)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "unavailable"})
		return
	}

	if !ok || envelope == nil {
		c.JSON(http.StatusOK, gin.H{"ok": true, "note": nil})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok": true,
		"note": bulletinEnvelopeResponse{
			Version:    envelope.Version,
			Nonce:      envelope.Nonce,
			Ciphertext: envelope.Ciphertext,
		},
	})
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
	mode := roomManager.GetRoomMode(roomId)
	state := "empty"

	switch {
	case occupants == 1:
		state = "waiting"
	case occupants >= 2:
		state = "full"
	}

	c.JSON(http.StatusOK, gin.H{
		"occupants": occupants,
		"mode":      mode,
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
			log.Printf("client disconnected from active room")
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
				Mode     string `json:"mode"`
			}
			if err := json.Unmarshal(msg.Data, &joinData); err != nil {
				conn.WriteJSON(gin.H{"error": "invalid join data"})
				return
			}

			currentRoomId = msg.RoomId
			// JoinRoom handles creation, locking, AND role assignment
			joinResult, err := roomManager.JoinRoom(msg.RoomId, joinData.ClientId, joinData.Mode, conn)
			if err != nil {
				conn.WriteJSON(gin.H{"error": err.Error()})
				return
			}
			roleMsg := map[string]any{
				"type": "role",
				"data": map[string]string{"role": joinResult.Role, "mode": joinResult.Mode},
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
			log.Printf("call ended and room closed")
			return
		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}
}
