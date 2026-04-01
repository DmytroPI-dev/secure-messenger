import { Box, Button, Heading, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import doorImage from "../assets/door-svgrepo-com.svg";

export type CallMode = "audio" | "video";

interface JoinRoomProps {
  onJoinRoom: (roomId: string, mode: CallMode) => void;
  roomId: string;
  stationName: string;
  dateCode: string;
  layout?: "screen" | "panel";
  onCancel?: () => void;
}

interface RoomStatus {
  occupants: number;
  mode?: CallMode;
}

export const JoinRoom: React.FC<JoinRoomProps> = ({
  onJoinRoom,
  roomId,
  stationName,
  dateCode,
  layout = "screen",
  onCancel,
}) => {
  const [isOpening, setIsOpening] = useState(false);
  const [selectedMode, setSelectedMode] = useState<CallMode>("audio");
  const [status, setStatus] = useState<RoomStatus>({ occupants: 0 });
  const [isStatusLoading, setIsStatusLoading] = useState(true);
  const isPanel = layout === "panel";
  const isRoomEmpty = status.occupants === 0;
  const isPeerWaiting = status.occupants === 1;
  const isRoomFull = status.occupants >= 2;
  const lockedMode = status.mode === "video" ? "video" : status.mode === "audio" ? "audio" : null;
  const isModeLocked = isPeerWaiting && lockedMode !== null;

  useEffect(() => {
    let isDisposed = false;

    const refreshStatus = async () => {
      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/status`);

        if (!response.ok) {
          return;
        }

        const nextStatus = (await response.json()) as RoomStatus;
        if (!isDisposed) {
          setStatus(nextStatus);
          if (nextStatus.mode === "audio" || nextStatus.mode === "video") {
            setSelectedMode(nextStatus.mode);
          }
        }
      } catch {
        // Keep the hidden flow quiet on status lookup failures.
      } finally {
        if (!isDisposed) {
          setIsStatusLoading(false);
        }
      }
    };

    void refreshStatus();
    const intervalId = window.setInterval(() => {
      void refreshStatus();
    }, 4000);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
    };
  }, [roomId]);

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems={isPanel ? "stretch" : "center"}
      justifyContent="center"
      height={isPanel ? "auto" : "100vh"}
      width="100%"
      maxW={isPanel ? "28rem" : "32rem"}
      mx="auto"
      px={isPanel ? 0 : 6}
    >
      <Stack gap={5}>
        <Box>
          <Heading mb={3} color="white" textAlign={isPanel ? "left" : "center"}>
            Bulletin access
          </Heading>
          <Text color="whiteAlpha.800" textAlign={isPanel ? "left" : "center"}>
            {stationName} {dateCode}
          </Text>
        </Box>

        <Box className="secret-door">
          <Stack className="secret-door__indicators" gap={3}>
            <HStack
              className={isRoomEmpty ? "secret-door__indicator secret-door__indicator--active" : "secret-door__indicator"}
              gap={3}
            >
              <Box className="secret-door__light" />
              <Text className="secret-door__indicator-label">Room empty</Text>
            </HStack>
            <HStack
              className={isPeerWaiting ? "secret-door__indicator secret-door__indicator--active" : "secret-door__indicator"}
              gap={3}
            >
              <Box className="secret-door__light" />
              <Text className="secret-door__indicator-label">Peer waiting</Text>
            </HStack>
          </Stack>
          <img src={doorImage} alt="Access door" className="secret-door__image" />
        </Box>

        {isStatusLoading ? (
          <HStack color="whiteAlpha.800" justifyContent={isPanel ? "flex-start" : "center"}>
            <Spinner size="sm" />
            <Text>Checking room status</Text>
          </HStack>
        ) : null}

        <Stack gap={3}>
          <Text color="whiteAlpha.900" fontSize="0.88rem" fontWeight="600" letterSpacing="0.08em" textTransform="uppercase">
            Call mode
          </Text>
          <HStack gap={3} flexWrap="wrap">
            <Button
              type="button"
              bg={selectedMode === "audio" ? "rgba(191, 143, 73, 0.22)" : "rgba(255,255,255,0.04)"}
              color={selectedMode === "audio" ? "#fff4dc" : "whiteAlpha.900"}
              border="1px solid"
              borderColor={selectedMode === "audio" ? "rgba(250, 214, 160, 0.4)" : "rgba(250, 214, 160, 0.22)"}
              _hover={{ bg: selectedMode === "audio" ? "rgba(191, 143, 73, 0.28)" : "rgba(255,255,255,0.08)" }}
              disabled={isModeLocked}
              _disabled={{ opacity: 0.72, cursor: "not-allowed" }}
              onClick={() => setSelectedMode("audio")}
            >
              Audio only
            </Button>
            <Button
              type="button"
              bg={selectedMode === "video" ? "rgba(191, 143, 73, 0.22)" : "rgba(255,255,255,0.04)"}
              color={selectedMode === "video" ? "#fff4dc" : "whiteAlpha.900"}
              border="1px solid"
              borderColor={selectedMode === "video" ? "rgba(250, 214, 160, 0.4)" : "rgba(250, 214, 160, 0.22)"}
              _hover={{ bg: selectedMode === "video" ? "rgba(191, 143, 73, 0.28)" : "rgba(255,255,255,0.08)" }}
              disabled={isModeLocked}
              _disabled={{ opacity: 0.72, cursor: "not-allowed" }}
              onClick={() => setSelectedMode("video")}
            >
              Video
            </Button>
          </HStack>
          {isModeLocked ? (
            <Text color="whiteAlpha.800" fontSize="sm">
              First peer locked this room to {lockedMode === "video" ? "video" : "audio only"}.
            </Text>
          ) : null}
        </Stack>
      </Stack>

      <Button
        disabled={isOpening || isRoomFull}
        mt={4}
        width={isPanel ? "100%" : "auto"}
        bg="rgba(191, 143, 73, 0.22)"
        color="white"
        border="1px solid rgba(250, 214, 160, 0.4)"
        _hover={{ bg: "rgba(191, 143, 73, 0.34)" }}
        _disabled={{ opacity: 0.5, cursor: "not-allowed" }}
        onClick={async () => {
          setIsOpening(true);
          try {
            onJoinRoom(roomId, selectedMode);
          } finally {
            setIsOpening(false);
          }
        }}
      >
        Open door
      </Button>
      {onCancel ? (
        <Button variant="ghost" color="whiteAlpha.900" mt={3} width={isPanel ? "100%" : "auto"} onClick={onCancel}>
          Return to forecast
        </Button>
      ) : null}
      {isOpening ? <Spinner mt={4} /> : null}
    </Box>
  );
};
