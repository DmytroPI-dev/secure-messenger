import { useState } from "react";
import { JoinRoom } from "./components/JoinRoom";
import { CallRoom } from "./components/CallRoom";
import "./App.css";

type roomId = null | string;

function App() {
  const [roomId, setRoomId] = useState<roomId>(null);
  const [username, setUsername] = useState<string>("");

  if (roomId === null) {
    return (
      console.log("Room ID:", roomId),
      <JoinRoom onJoinRoom={(hashedId, user) => {
        setRoomId(hashedId);
        setUsername(user);
      }} />
    );
  } else {
    return (
      console.log("Call room ID:", roomId),
      <CallRoom roomId={roomId} username={username} />
    );
  }
}

export default App;
