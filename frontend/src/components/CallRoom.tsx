import { useWebSocket } from "@/hooks/useWebSocket";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useEffect, useRef } from "react";

interface CallRoomProps {
  roomId: string;
  username: string;
}

export const CallRoom: React.FC<CallRoomProps> = ({ roomId, username }) => {
  // Removed the hardcoded URL since useWebSocket builds it dynamically anyway
  const { messages, isConnected, error, sendMessage } = useWebSocket(roomId);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const { localStream, remoteStream, connectionState, stopCall } = useWebRTC(
    sendMessage,
    roomId,
    messages,
  );

  // Added isConnected to dependencies
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isConnected]);

  // Added isConnected to dependencies
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, isConnected]);

  useEffect(() => {
    return () => {
      console.log("Cleaning up call...");
      stopCall();
    };
  }, []); // Eslint might complain here, but empty array is fine for unmount

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
          <p>Connection status: {isConnected ? "Connected" : "Disconnected"}</p>
          <div style={{ display: "flex", gap: "20px" }}>
            <video
              id="Outgoing" // This is usually your local video (outgoing)
              ref={localVideoRef}
              autoPlay
              muted // Keep muted so you don't hear yourself
              playsInline
              style={{ width: "200px", transform: "scaleX(-1)" }} // Mirrors the video like a selfie cam
            />
            <video
              id="Incoming" // This is usually the remote video (incoming)
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{ width: "200px" }}
            />
          </div>
        </>
      ) : (
        <p>Connecting...</p>
      )}
      {error && <p>Error: {error}</p>}
    </div>
  );
};
