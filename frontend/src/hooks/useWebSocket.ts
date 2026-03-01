import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

const MAX_RECONNECT_ATTEMPTS = 6;
const RECONNECT_BASE_DELAY_MS = 1000;

interface UseWebSocketReturn {
  sendMessage: (message: any) => void;
  messages: any[];
  isConnected: boolean;
  error: string | null;
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

export function useWebSocket(roomId: string): UseWebSocketReturn {
  const [messages, setMessages] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const clientId = useRef<string>(getOrCreateClientId(roomId));
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);

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

    shouldReconnectRef.current = true;

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        clearReconnectTimer();
        setIsConnected(true);
        setError(null);
        ws.send(
          JSON.stringify({
            type: "join",
            roomId: roomId,
            data: { clientId: clientId.current },
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMessages((prev) => [...prev, data]);
        } catch (err) {
          console.error("Failed to parse message:", err);
        }
      };

      ws.onerror = (event) => {
        setError("WebSocket error");
        console.error("WebSocket error:", event);
      };

      ws.onclose = () => {
        setIsConnected(false);

        if (!shouldReconnectRef.current) {
          return;
        }

        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setError("WebSocket disconnected");
          return;
        }

        const delay = RECONNECT_BASE_DELAY_MS * (reconnectAttemptsRef.current + 1);
        reconnectAttemptsRef.current += 1;
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      const ws = wsRef.current;
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
      ) {
        ws.close();
      }
    };
  }, [roomId]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { sendMessage, messages, isConnected, error };
}
