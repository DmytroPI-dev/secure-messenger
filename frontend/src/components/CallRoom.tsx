import { useWebSocket } from "@/hooks/useWebSocket";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useEffect, useRef } from "react";

interface CallRoomProps {
  roomId: string;
  username: string;
}

export const CallRoom: React.FC<CallRoomProps> = ({ roomId, username }) => {
  const { messages, isConnected, error, sendMessage } = useWebSocket(
    `ws://localhost:8080/ws`,
    roomId,
  );
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const { localStream, remoteStream, connectionState, stopCall } =
    useWebRTC(sendMessage, roomId, messages);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    return () => {
      console.log("Cleaning up call...");
      stopCall();
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        backgroundColor: "green",
        padding: "20px",
        borderRadius: "10px",
      }}
    >
      <h1>Call Room - You are: {username}</h1>
      {isConnected ? (
        <>
          <p>Connected to room {roomId}</p>
          <p>Connection state: {connectionState}</p>
          <p>
            {" "}
            Connection status: {isConnected ? "Connected" : "Disconnected"}{" "}
            <video
              id="Incoming"
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{ width: "200px" }}
            />
            <video
              id="Outgoing"
              ref={remoteVideoRef}
              autoPlay
              muted
              playsInline
              style={{ width: "200px" }}
            />
          </p>
        </>
      ) : (
        <>
          <p>Connecting...</p>
        </>
      )}
      {error && <p>Error: {error}</p>}

    </div>
  );
};
