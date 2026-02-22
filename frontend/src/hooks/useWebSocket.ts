import { useState, useRef, useCallback, useEffect } from "react";

interface UseWebSocketReturn {
  sendMessage: (message: any) => void;
  messages: any[];
  isConnected: boolean;
  error: string | null;
}

export function useWebSocket(url: string, roomId: string): UseWebSocketReturn {
  const [messages, setMessages] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    console.log("🔌 Creating WebSocket connection for room:", roomId);
    // Dynamically determine the protocol (WSS for HTTPS, WS for HTTP)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Dynamically determine the host (supports both localhost and deployed environments)
    const host = window.location.host;
    // Construct the URL.
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
      setError("WebSocket connection closed");
      console.warn("WebSocket connection closed");
    };

    return () => {
      console.log("🔌 Closing WebSocket connection");
      ws.close();
    };
  }, [url, roomId]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket is not connected");
    }
  }, []);

  return { sendMessage, messages, isConnected, error };
}
