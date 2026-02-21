import { useWebSocket } from "@/hooks/useWebSocket";

interface CallRoomProps {
  roomId: string;
}

export const CallRoom: React.FC<CallRoomProps> = ({ roomId }) => {
  const {messages, isConnected, error } = useWebSocket(
    `ws://localhost:8080/ws`,
    roomId
  );

  return (
    <div>
      <h1>Call Room</h1>
      {isConnected ? (
        <p>Connected to room {roomId}</p>
      ) : (
        <>
          <p>Connecting...</p>
          <p>
            {" "}
            Connection status: {isConnected ? "Connected" : "Disconnected"}{" "}
          </p>
        </>
      )}
      {error && <p>Error: {error}</p>}
      <ul>
        {messages.map((message, index) => (
          <li key={index}>{JSON.stringify(message)}</li>
        ))}
      </ul>
    </div>
  );
};
