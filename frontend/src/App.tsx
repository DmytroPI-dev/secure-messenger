import { Box } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BlackSeaWeatherSite,
  type SecretAccessRequest,
} from "./components/BlackSeaWeatherSite";
import { JoinRoom } from "./components/JoinRoom";
import { CallRoom } from "./components/CallRoom";
import "./App.css";

function App() {
  const { t, i18n } = useTranslation();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isSecretEntryOpen, setIsSecretEntryOpen] = useState(false);
  const [pendingAccess, setPendingAccess] = useState<SecretAccessRequest | null>(null);

  useEffect(() => {
    document.title = t("app.title");
    document.documentElement.lang = i18n.resolvedLanguage ?? "en";
  }, [i18n.resolvedLanguage, t]);

  useEffect(() => {
    const staleRoomId = sessionStorage.getItem("activeRoom");
    if (staleRoomId) {
      sessionStorage.removeItem(`ghost-id-${staleRoomId}`);
      sessionStorage.removeItem("activeRoom");
    }
  }, []);

  const handleLeaveRoom = () => {
    if (roomId) {
      sessionStorage.removeItem(`ghost-id-${roomId}`);
    }
    setIsSecretEntryOpen(false);
    setPendingAccess(null);
    setRoomId(null);
  };

  const handleJoinRoom = (nextRoomId: string) => {
    setIsSecretEntryOpen(false);
    setPendingAccess(null);
    setRoomId(nextRoomId);
  };

  if (roomId !== null) {
    return (
      <CallRoom
        roomId={roomId}
        onEndCall={() => {
          handleLeaveRoom();
        }}
      />
    );
  }

  return (
    <>
      <BlackSeaWeatherSite
        onUnlockRequest={(access) => {
          setPendingAccess(access);
          setIsSecretEntryOpen(true);
        }}
      />
      {isSecretEntryOpen && pendingAccess ? (
        <Box className="secret-overlay">
          <Box className="secret-overlay__panel">
            <JoinRoom
              onJoinRoom={handleJoinRoom}
              roomId={pendingAccess.roomId}
              stationName={pendingAccess.stationName}
              dateCode={pendingAccess.dateCode}
              layout="panel"
              onCancel={() => {
                setIsSecretEntryOpen(false);
                setPendingAccess(null);
              }}
            />
          </Box>
        </Box>
      ) : null}
    </>
  );
}

export default App;
