import { Box, Button, HStack, Icon, Spinner, Stack, Text, VStack } from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MdMic, MdVideocam } from "react-icons/md";
import doorImage from "../assets/door-svgrepo-com.svg";
import { BulletinPanel } from "@/components/BulletinPanel";
import { Switch } from "@/components/ui/switch";

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
  layout = "screen",
  onCancel,
}) => {
  const { t } = useTranslation();
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
  const isVideoMode = selectedMode === "video";

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
      alignItems="center"
      justifyContent="center"
      height={isPanel ? "auto" : "100vh"}
      width="100%"
      maxW={isPanel ? "28rem" : "32rem"}
      mx="auto"
      px={isPanel ? 0 : 6}
    >
      <Stack
        gap={5}
        width="100%"
        borderRadius="1.35rem"
        border="1px solid var(--weather-panel-border)"
        bg="var(--weather-panel-bg)"
        boxShadow="var(--weather-panel-shadow)"
        backdropFilter="blur(18px)"
        px={{ base: 4, sm: 5 }}
        py={{ base: 4, sm: 5 }}
      >
        <Stack gap={1} alignItems="center">
          <Text
            color="var(--weather-accent-color)"
            fontSize="0.76rem"
            fontWeight="700"
            letterSpacing="0.18em"
            textTransform="uppercase"
            textAlign="center"
          >
            {stationName}
          </Text>
        </Stack>

        <Box className="access-door">
          <Stack className="access-door__indicators" gap={3}>
            <HStack
              className={isRoomEmpty ? "access-door__indicator access-door__indicator--active" : "access-door__indicator"}
              gap={3}
            >
              <Box className="access-door__light" />
              <Text className="access-door__indicator-label">{t("gate.status.roomEmpty")}</Text>
            </HStack>
            <HStack
              className={isPeerWaiting ? "access-door__indicator access-door__indicator--active" : "access-door__indicator"}
              gap={3}
            >
              <Box className="access-door__light" />
              <Text className="access-door__indicator-label">{t("gate.status.peerWaiting")}</Text>
            </HStack>
          </Stack>
          <img src={doorImage} alt="Access door" className="access-door__image" />
        </Box>

        {isStatusLoading ? (
          <HStack color="var(--weather-text-soft)" justifyContent="center">
            <Spinner size="sm" />
            <Text>{t("gate.status.checking")}</Text>
          </HStack>
        ) : null}

        <HStack justifyContent="center">
          <BulletinPanel />
        </HStack>

        <Stack gap={3} alignItems="center">
          <Text color="var(--weather-text-soft)" fontSize="0.82rem" fontWeight="700" letterSpacing="0.14em" textTransform="uppercase">
            {t("gate.callMode")}
          </Text>
          <HStack gap={{ base: 3, sm: 5 }} align="center" justifyContent="center">
            <VStack gap={2} minW={{ base: "4.5rem", sm: "5.25rem" }}>
              <Box
                width={{ base: "3rem", sm: "3.4rem" }}
                height={{ base: "3rem", sm: "3.4rem" }}
                borderRadius="full"
                border="1px solid"
                borderColor={!isVideoMode ? "rgba(109, 219, 135, 0.42)" : "var(--weather-chip-border)"}
                bg={!isVideoMode ? "rgba(34, 110, 67, 0.88)" : "var(--weather-chip-bg)"}
                color={!isVideoMode ? "white" : "#6ddb87"}
                display="flex"
                alignItems="center"
                justifyContent="center"
                transition="background 160ms ease, border-color 160ms ease, color 160ms ease"
              >
                <Icon as={MdMic} boxSize={5} />
              </Box>
              <Box
                width="0.45rem"
                height="0.45rem"
                borderRadius="full"
                bg={!isVideoMode ? "#6ddb87" : "transparent"}
                boxShadow={!isVideoMode ? "0 0 10px rgba(109, 219, 135, 0.54)" : "none"}
                border={!isVideoMode ? "none" : "1px solid var(--weather-chip-border)"}
              />
              <Text color="var(--weather-text-soft)" fontSize="xs" textAlign="center">
                {t("gate.audioOnly")}
              </Text>
            </VStack>

            <Switch
              checked={isVideoMode}
              disabled={isModeLocked}
              size="lg"
              colorPalette="green"
              trackLabel={{
                on: <Icon as={MdVideocam} boxSize={3.5} color="white" />,
                off: <Icon as={MdMic} boxSize={3.5} color="var(--weather-text-subtle)" />,
              }}
              onCheckedChange={(details) => setSelectedMode(details.checked ? "video" : "audio")}
              css={{
                "& [data-scope='switch'][data-part='control']": {
                  bg: isVideoMode ? "rgba(34, 110, 67, 0.88)" : "var(--weather-chip-bg)",
                  borderColor: isVideoMode ? "rgba(109, 219, 135, 0.42)" : "var(--weather-chip-border)",
                  borderWidth: "1px",
                  width: "3.75rem",
                },
                "& [data-scope='switch'][data-part='indicator']": {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: isVideoMode ? "flex-start" : "flex-end",
                  px: "0.45rem",
                },
                "& [data-scope='switch'][data-part='thumb']": {
                  bg: isModeLocked ? "rgba(255,255,255,0.72)" : "white",
                },
              }}
            />

            <VStack gap={2} minW={{ base: "4.5rem", sm: "5.25rem" }}>
              <Box
                width={{ base: "3rem", sm: "3.4rem" }}
                height={{ base: "3rem", sm: "3.4rem" }}
                borderRadius="full"
                border="1px solid"
                borderColor={isVideoMode ? "rgba(109, 219, 135, 0.42)" : "var(--weather-chip-border)"}
                bg={isVideoMode ? "rgba(34, 110, 67, 0.88)" : "var(--weather-chip-bg)"}
                color={isVideoMode ? "white" : "#6ddb87"}
                display="flex"
                alignItems="center"
                justifyContent="center"
                transition="background 160ms ease, border-color 160ms ease, color 160ms ease"
              >
                <Icon as={MdVideocam} boxSize={5} />
              </Box>
              <Box
                width="0.45rem"
                height="0.45rem"
                borderRadius="full"
                bg={isVideoMode ? "#6ddb87" : "transparent"}
                boxShadow={isVideoMode ? "0 0 10px rgba(109, 219, 135, 0.54)" : "none"}
                border={isVideoMode ? "none" : "1px solid var(--weather-chip-border)"}
              />
              <Text color="var(--weather-text-soft)" fontSize="xs" textAlign="center">
                {t("gate.video")}
              </Text>
            </VStack>
          </HStack>
          {isModeLocked ? (
            <Text color="var(--weather-text-soft)" fontSize="sm" textAlign="center">
              {t("gate.modeLocked", {
                mode: lockedMode === "video" ? t("gate.lockedMode.video") : t("gate.lockedMode.audio"),
              })}
            </Text>
          ) : null}
        </Stack>

        <Stack gap={3} width="100%" alignItems="center">
          <Button
            disabled={isOpening || isRoomFull}
            width="100%"
            rounded="full"
            bg="rgba(34, 110, 67, 0.88)"
            color="white"
            border="1px solid rgba(109, 219, 135, 0.42)"
            _hover={{ bg: "rgba(41, 129, 78, 0.92)" }}
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
            {t("gate.openDoor")}
          </Button>
          {onCancel ? (
            <Button
              variant="ghost"
              color="var(--weather-text-soft)"
              width="100%"
              rounded="full"
              border="1px solid var(--weather-chip-border)"
              bg="var(--weather-chip-bg)"
              _hover={{ bg: "var(--weather-chip-hover-bg)", color: "var(--weather-text-main)" }}
              onClick={onCancel}
            >
              {t("gate.returnToForecast")}
            </Button>
          ) : null}
          {isOpening ? <Spinner mt={1} /> : null}
        </Stack>
      </Stack>
    </Box>
  );
};
