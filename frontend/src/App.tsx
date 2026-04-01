import { Box } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BlackSeaWeatherSite,
  type SecretAccessRequest,
} from "./components/BlackSeaWeatherSite";
import { JoinRoom, type CallMode } from "./components/JoinRoom";
import { CallRoom } from "./components/CallRoom";
import {
  clearStoredPeerFingerprint,
  purgeLegacyStoredPeerFingerprints,
} from "./utils/fingerprint";
import "./App.css";

const activeRoomStorageKey = "activeRoom";

function App() {
  const { t, i18n } = useTranslation();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [callMode, setCallMode] = useState<CallMode>("audio");
  const [continuityHint, setContinuityHint] = useState<string | null>(null);
  const [isSecretEntryOpen, setIsSecretEntryOpen] = useState(false);
  const [pendingAccess, setPendingAccess] = useState<SecretAccessRequest | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const continuityHintRef = useRef<string | null>(null);

  useEffect(() => {
    document.title = t("app.title");
    document.documentElement.lang = i18n.resolvedLanguage ?? "en";
  }, [i18n.resolvedLanguage, t]);

  useEffect(() => {
    purgeLegacyStoredPeerFingerprints();

    const staleRoomId = sessionStorage.getItem(activeRoomStorageKey);
    if (staleRoomId) {
      sessionStorage.removeItem(`ghost-id-${staleRoomId}`);
      sessionStorage.removeItem(activeRoomStorageKey);
    }
  }, []);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    continuityHintRef.current = continuityHint;
  }, [continuityHint]);

  useEffect(() => {
    if (roomId) {
      sessionStorage.setItem(activeRoomStorageKey, roomId);
      return;
    }

    sessionStorage.removeItem(activeRoomStorageKey);
  }, [roomId]);

  useEffect(() => {
    const scrubSessionArtifacts = () => {
      const currentRoomId = roomIdRef.current ?? sessionStorage.getItem(activeRoomStorageKey);
      if (currentRoomId) {
        sessionStorage.removeItem(`ghost-id-${currentRoomId}`);
      }

      const currentContinuityHint = continuityHintRef.current;
      if (currentContinuityHint) {
        clearStoredPeerFingerprint(currentContinuityHint);
      }

      sessionStorage.removeItem(activeRoomStorageKey);
    };

    window.addEventListener("pagehide", scrubSessionArtifacts);
    window.addEventListener("beforeunload", scrubSessionArtifacts);

    return () => {
      window.removeEventListener("pagehide", scrubSessionArtifacts);
      window.removeEventListener("beforeunload", scrubSessionArtifacts);
    };
  }, []);

  const handleLeaveRoom = () => {
    const currentRoomId = roomIdRef.current;
    const currentContinuityHint = continuityHintRef.current;

    if (currentRoomId) {
      sessionStorage.removeItem(`ghost-id-${currentRoomId}`);
      sessionStorage.removeItem(activeRoomStorageKey);
    }

    if (currentContinuityHint) {
      clearStoredPeerFingerprint(currentContinuityHint);
    }

    setIsSecretEntryOpen(false);
    setPendingAccess(null);
    setCallMode("audio");
    setContinuityHint(null);
    setRoomId(null);
  };

  const handleJoinRoom = (nextRoomId: string, nextMode: CallMode) => {
    const nextContinuityHint = pendingAccess?.stationName ?? nextRoomId;
    setIsSecretEntryOpen(false);
    setPendingAccess(null);
    setCallMode(nextMode);
    setContinuityHint(nextContinuityHint);
    setRoomId(nextRoomId);
  };

  if (roomId !== null) {
    return (
      <CallRoom
        roomId={roomId}
        mode={callMode}
        continuityHint={continuityHint ?? roomId}
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
