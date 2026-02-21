import { useState } from "react";
import { JoinRoom } from "./components/JoinRoom";
import { CallRoom } from "./components/CallRoom";
import "./App.css";

type roomId = null | string;

function App() {
  const [roomId, setRoomId] = useState<roomId>(null);

  if (roomId === null) {
    return (
      console.log("Room ID:", roomId),
      <JoinRoom onJoinRoom={(hashedId) => setRoomId(hashedId)} />
    );
  } else {
    return (
      console.log("Call room ID:", roomId),
      <CallRoom roomId={roomId} />
    );
  }
}

export default App;
