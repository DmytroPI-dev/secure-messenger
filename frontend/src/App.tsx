import { useState } from "react";
import { JoinRoom } from "./components/JoinRoom";
import { CallRoom } from "./components/CallRoom";
import "./App.css";

function App() {
  // 1. Initialize state directly from sessionStorage using a lazy initializer function
  const [roomId, setRoomId] = useState<string | null>(() => {
    return sessionStorage.getItem("activeRoom");
  });

  const handleLeaveRoom = () => {
    if (roomId) {
      sessionStorage.removeItem(`ghost-id-${roomId}`); // ← Add this
    }
    sessionStorage.removeItem("activeRoom");
    setRoomId(null);
  };

  const handleJoinRoom = (hashedId: string) => {
    // 2. Save the hashed ID to sessionStorage BEFORE setting state
    sessionStorage.setItem("activeRoom", hashedId);
    setRoomId(hashedId);
  };

  if (roomId === null) {
    return <JoinRoom onJoinRoom={handleJoinRoom} />;
  } else {
    return (
      <CallRoom
        roomId={roomId}
        onEndCall={() => {
          handleLeaveRoom();
        }}
      />
    );
  }
}

export default App;
