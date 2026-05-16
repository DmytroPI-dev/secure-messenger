import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { type WebRTCCallMode } from "@/hooks/useWebRTC";

const MAX_RECONNECT_ATTEMPTS = 6;
const RECONNECT_BASE_DELAY_MS = 1000;

interface UseWebSocketReturn {
  sendMessage: (message: any) => void;
  messages: any[];
  isConnected: boolean;
  error: string | null;
  assignedMode: WebRTCCallMode | null;
}

// Helper function to keep ID persistent during a browser session
const getOrCreateClientId = (roomId: string) => {
  const key = `ghost-id-${roomId}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = uuidv4();
    sessionStorage.setItem(key, id);
  }
  return id;
};

function parseAssignedMode(mode: unknown): WebRTCCallMode | null {
  if (mode === "audio" || mode === "video") {
    return mode;
  }

  return null;
}  

function createWebSocketLogger(roomId: string) {
  return (event: string, details?: unknown) => {
    if (details === undefined) {
      console.log(`[ws:${roomId}] ${event}`);
      return;
    }

    console.log(`[ws:${roomId}] ${event}`, details);
  };
}

export function useWebSocket(roomId: string, requestedMode: WebRTCCallMode): UseWebSocketReturn {
  const [messages, setMessages] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignedMode, setAssignedMode] = useState<WebRTCCallMode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const clientId = useRef<string>(getOrCreateClientId(roomId));
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);
  const logRef = useRef(createWebSocketLogger(roomId));

  useEffect(() => {
    logRef.current = createWebSocketLogger(roomId);
  }, [roomId]);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;
    const log = logRef.current;

    shouldReconnectRef.current = true;
    log("starting websocket hook", {
      wsUrl,
      requestedMode,
      clientId: clientId.current,
    });

    const connect = () => {
      log("opening websocket", {
        attempt: reconnectAttemptsRef.current + 1,
        wsUrl,
      });
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        clearReconnectTimer();
        setIsConnected(true);
        setError(null);
        log("websocket opened", {
          readyState: ws.readyState,
        });

        const joinMessage = {
          type: "join",
          roomId: roomId,
          data: { clientId: clientId.current, mode: requestedMode },
        };

        log("sending join", joinMessage);
        ws.send(
          JSON.stringify(joinMessage),
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          log("received message", {
            type: data?.type,
            signalType: data?.data?.type,
            error: data?.error,
          });
          if (data?.type === "role") {
            setAssignedMode(parseAssignedMode(data?.data?.mode));
          }
          setMessages((prev) => [...prev, data]);
        } catch (err) {
          console.error("Failed to parse message:", err);
        }
      };

      ws.onerror = (event) => {
        setError("WebSocket error");
        log("websocket error", event);
        console.error("WebSocket error:", event);
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        log("websocket closed", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          reconnectAttempts: reconnectAttemptsRef.current,
        });

        if (!shouldReconnectRef.current) {
          log("reconnect skipped", { reason: "intentional shutdown" });
          return;
        }

        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setError("WebSocket disconnected");
          log("reconnect exhausted", {
            attempts: reconnectAttemptsRef.current,
          });
          return;
        }

        const delay = RECONNECT_BASE_DELAY_MS * (reconnectAttemptsRef.current + 1);
        reconnectAttemptsRef.current += 1;
        clearReconnectTimer();
        log("scheduling reconnect", {
          delay,
          nextAttempt: reconnectAttemptsRef.current + 1,
        });
        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      log("disposing websocket hook");
      const ws = wsRef.current;
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
      ) {
        log("closing websocket from cleanup", {
          readyState: ws.readyState,
        });
        ws.close();
      }
    };
  }, [roomId]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      logRef.current("sending message", {
        type: message?.type,
        signalType: message?.data?.type,
      });
      wsRef.current.send(JSON.stringify(message));
      return;
    }

    logRef.current("dropping message because websocket is not open", {
      type: message?.type,
      signalType: message?.data?.type,
      readyState: wsRef.current?.readyState ?? null,
    });
  }, []);

  return { sendMessage, messages, isConnected, error, assignedMode };
}
