import { useState, useRef, useCallback, useEffect } from "react";

interface UseWebSocketReturn {
  sendMessage: (message: any) => void;
  messages: any[];
  isConnected: boolean;
  error: string | null;
}

// Removed the unused `url` parameter
export function useWebSocket(roomId: string): UseWebSocketReturn {
  const [messages, setMessages] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    console.log("🔌 Creating WebSocket connection for room:", roomId);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket opened for room:", roomId);
      setIsConnected(true);
      setError(null);
      ws.send(JSON.stringify({ type: "join", roomId: roomId, data: null }));
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
      // Removed the error state here, normal closures shouldn't look like errors
      console.warn("WebSocket connection closed");
    };

    return () => {
      console.log("🔌 Closing WebSocket connection");
      // Prevent the Strict Mode warning by checking readyState
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    };
  }, [roomId]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket is not connected");
    }
  }, []);

  return { sendMessage, messages, isConnected, error };
}
