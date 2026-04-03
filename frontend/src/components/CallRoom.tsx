import { useWebSocket } from "@/hooks/useWebSocket";
import {
  Box,
  Button,
  HStack,
  Stack,
  Text,
  VStack,
  Spinner,
  IconButton,
  useBreakpointValue,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import {
  MdCallEnd,
  MdMic,
  MdMicOff,
  MdVideocam,
  MdVideocamOff,
} from "react-icons/md";
import { useTranslation } from "react-i18next";
import { type WebRTCCallMode, useWebRTC } from "@/hooks/useWebRTC";
import {
  buildFingerprintShortCode,
  clearStoredPeerFingerprint,
  readStoredPeerFingerprint,
  writeStoredPeerFingerprint,
} from "@/utils/fingerprint";

interface CallRoomProps {
  roomId: string;
  mode: WebRTCCallMode;
  continuityHint: string;
  onEndCall: () => void;
}

type FingerprintTrustState =
  | "awaiting-peer"
  | "unverified"
  | "trusted"
  | "changed";

export const CallRoom: React.FC<CallRoomProps> = ({
  roomId,
  mode,
  continuityHint,
  onEndCall,
}) => {
  const { t } = useTranslation();
  const { messages, isConnected, sendMessage, assignedMode } = useWebSocket(
    roomId,
    mode,
  );
  const isMobile = useBreakpointValue({ base: true, md: false });
  const effectiveMode = assignedMode ?? mode;
  const isAudioOnly = effectiveMode === "audio";

  const [audioMuted, setAudioMuted] = useState(true);
  const [videoMuted, setVideoMuted] = useState(isAudioOnly);
  const [remoteStatus, setRemoteStatus] = useState({
    audioMuted: false,
    videoMuted: false,
  });
  const [trustState, setTrustState] =
    useState<FingerprintTrustState>("awaiting-peer");
  const [trustedFingerprint, setTrustedFingerprint] = useState<string | null>(
    null,
  );
  const [trustedAt, setTrustedAt] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const hasStoppedRef = useRef(false);

  const {
    localStream,
    remoteStream,
    connectionState,
    stopCall,
    localFingerprint,
    remoteFingerprint,
  } = useWebRTC(sendMessage, roomId, messages, effectiveMode);

  const toggleAudio = () => {
    const newAudioMuted = !audioMuted;
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !newAudioMuted;
    });
    sendMessage({
      type: "peer-status",
      roomId: roomId,
      data: {
        audioMuted: newAudioMuted,
        videoMuted: videoMuted,
      },
    });
    setAudioMuted(newAudioMuted);
  };

  const toggleVideo = () => {
    if (isAudioOnly) {
      return;
    }

    const newVideoMuted = !videoMuted;
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = !newVideoMuted;
    });
    sendMessage({
      type: "peer-status",
      roomId: roomId,
      data: {
        audioMuted: audioMuted,
        videoMuted: newVideoMuted,
      },
    });
    setVideoMuted(newVideoMuted);
  };

  const handleEndCall = () => {
    if (!hasStoppedRef.current) {
      hasStoppedRef.current = true;
      stopCall();
      sendMessage({ type: "end-call", roomId });
    }
    onEndCall();
  };

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isConnected]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, isConnected]);

  useEffect(() => {
    return () => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    };
  }, []);

  useEffect(() => {
    setVideoMuted(isAudioOnly);
  }, [isAudioOnly]);

  useEffect(() => {
    if (!remoteFingerprint) {
      setTrustState("awaiting-peer");
      setTrustedFingerprint(null);
      setTrustedAt(null);
      return;
    }

    const storedRecord = readStoredPeerFingerprint(continuityHint);
    if (!storedRecord) {
      setTrustState("unverified");
      setTrustedFingerprint(null);
      setTrustedAt(null);
      return;
    }

    setTrustedFingerprint(storedRecord.fingerprint);
    setTrustedAt(storedRecord.verifiedAt);
    setTrustState(
      storedRecord.fingerprint === remoteFingerprint ? "trusted" : "changed",
    );
  }, [continuityHint, remoteFingerprint]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.type === "peer-status") {
      setRemoteStatus({
        audioMuted: !!lastMsg.data.audioMuted,
        videoMuted: isAudioOnly ? true : !!lastMsg.data.videoMuted,
      });
    }
    if (lastMsg?.type === "call-ended") {
      if (!hasStoppedRef.current) {
        hasStoppedRef.current = true;
        stopCall();
      }
      onEndCall();
    }
  }, [isAudioOnly, messages, onEndCall, stopCall]);

  const handleTrustFingerprint = () => {
    if (!remoteFingerprint) {
      return;
    }

    const storedRecord = writeStoredPeerFingerprint(
      continuityHint,
      remoteFingerprint,
    );
    setTrustedFingerprint(storedRecord.fingerprint);
    setTrustedAt(storedRecord.verifiedAt);
    setTrustState("trusted");
  };

  const handleClearTrust = () => {
    clearStoredPeerFingerprint(continuityHint);
    setTrustedFingerprint(null);
    setTrustedAt(null);
    setTrustState(remoteFingerprint ? "unverified" : "awaiting-peer");
  };

  const trustTone =
    trustState === "trusted"
      ? { border: "rgba(104, 211, 145, 0.4)", bg: "rgba(20, 82, 44, 0.42)" }
      : trustState === "changed"
        ? { border: "rgba(252, 129, 129, 0.44)", bg: "rgba(103, 21, 21, 0.4)" }
        : { border: "rgba(246, 224, 94, 0.38)", bg: "rgba(90, 73, 14, 0.34)" };

  const trustHeading =
    trustState === "trusted"
      ? t("call.verification.heading.trusted")
      : trustState === "changed"
        ? t("call.verification.heading.changed")
        : trustState === "awaiting-peer"
          ? t("call.verification.heading.waiting")
          : t("call.verification.heading.unverified");

  const trustDescription =
    trustState === "trusted"
      ? t("call.verification.description.trusted")
      : trustState === "changed"
        ? t("call.verification.description.changed")
        : trustState === "awaiting-peer"
          ? t("call.verification.description.waiting")
          : t("call.verification.description.unverified");

  const trustTimestamp = trustedAt
    ? t("call.verification.storedAt", {
        time: new Date(trustedAt).toLocaleString(),
      })
    : null;
  const localShortCode = buildFingerprintShortCode(localFingerprint);
  const remoteShortCode = buildFingerprintShortCode(remoteFingerprint);
  const previousShortCode = buildFingerprintShortCode(trustedFingerprint);
  const connectionStateLabel = t(`call.status.state.${connectionState}`, {
    defaultValue: connectionState,
  });
  const localShortCodeLabel =
    localShortCode || t("call.verification.waitingCode");
  const remoteShortCodeLabel =
    remoteShortCode || t("call.verification.waitingCode");
  const previousShortCodeLabel =
    previousShortCode || t("call.verification.waitingCode");

  const fingerprintPanel = (
    <Box
      width="full"
      maxW={isMobile ? "none" : "44rem"}
      borderRadius="xl"
      border="1px solid"
      borderColor={trustTone.border}
      bg={trustTone.bg}
      p={4}
      boxShadow="lg"
      backdropFilter="blur(12px)"
    >
      <VStack align="stretch" gap={3}>
        <HStack justify="space-between" align="start" flexWrap="wrap">
          <VStack align="start" gap={1}>
            <Text
              fontSize="xs"
              textTransform="uppercase"
              letterSpacing="0.14em"
              color="whiteAlpha.700"
            >
              {t("call.verification.kicker")}
            </Text>
            <Text fontSize="sm" fontWeight="semibold" color="white">
              {trustHeading}
            </Text>
          </VStack>
          {trustTimestamp ? (
            <Text fontSize="xs" color="whiteAlpha.700">
              {trustTimestamp}
            </Text>
          ) : null}
        </HStack>

        <Text fontSize="xs" color="whiteAlpha.800">
          {trustDescription}
        </Text>

        <Stack direction={{ base: "column", md: "row" }} gap={3}>
          <Box
            flex="1"
            borderRadius="lg"
            border="1px solid rgba(255,255,255,0.12)"
            bg="rgba(255,255,255,0.06)"
            p={3}
          >
            <Text
              fontSize="2xs"
              textTransform="uppercase"
              letterSpacing="0.12em"
              color="whiteAlpha.700"
              mb={2}
            >
              {t("call.verification.yourCode")}
            </Text>
            <Text fontFamily="mono" fontSize="sm" color="whiteAlpha.950">
              {localShortCodeLabel}
            </Text>
          </Box>
          <Box
            flex="1"
            borderRadius="lg"
            border="1px solid rgba(255,255,255,0.12)"
            bg="rgba(255,255,255,0.06)"
            p={3}
          >
            <Text
              fontSize="2xs"
              textTransform="uppercase"
              letterSpacing="0.12em"
              color="whiteAlpha.700"
              mb={2}
            >
              {t("call.verification.peerCode")}
            </Text>
            <Text fontFamily="mono" fontSize="sm" color="whiteAlpha.950">
              {remoteShortCodeLabel}
            </Text>
          </Box>
        </Stack>

        {trustState === "changed" && trustedFingerprint ? (
          <Box
            borderRadius="lg"
            border="1px solid rgba(255,255,255,0.12)"
            bg="rgba(255,255,255,0.05)"
            p={3}
          >
            <Text
              fontSize="2xs"
              textTransform="uppercase"
              letterSpacing="0.12em"
              color="whiteAlpha.700"
              mb={2}
            >
              {t("call.verification.previousCode")}
            </Text>
            <Text fontFamily="mono" fontSize="sm" color="whiteAlpha.900">
              {previousShortCodeLabel}
            </Text>
          </Box>
        ) : null}

        {remoteFingerprint ? (
          <HStack gap={3} flexWrap="wrap">
            <Button
              size="sm"
              bg={
                trustState === "changed"
                  ? "red.500"
                  : "rgba(191, 143, 73, 0.24)"
              }
              color="white"
              border="1px solid rgba(255,255,255,0.16)"
              _hover={{
                bg:
                  trustState === "changed"
                    ? "red.600"
                    : "rgba(191, 143, 73, 0.34)",
              }}
              onClick={handleTrustFingerprint}
            >
              {trustState === "changed"
                ? t("call.verification.actions.trustNew")
                : t("call.verification.actions.markVerified")}
            </Button>
            {trustState === "trusted" || trustState === "changed" ? (
              <Button
                size="sm"
                variant="outline"
                color="whiteAlpha.900"
                borderColor="whiteAlpha.300"
                _hover={{ bg: "whiteAlpha.200" }}
                onClick={handleClearTrust}
              >
                {t("call.verification.actions.clearSavedTrust")}
              </Button>
            ) : null}
          </HStack>
        ) : null}
      </VStack>
    </Box>
  );

  const offscreenMediaElements = isAudioOnly ? (
    <>
      <video
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </>
  ) : null;

  return isMobile ? (
    <Box
      position="fixed"
      top={0}
      left={0}
      width="100dvw"
      height="100dvh"
      bg="black"
      zIndex={9999}
      overflow="hidden"
      style={{ touchAction: "none" }}
    >
      {offscreenMediaElements}

      <Box
        position="absolute"
        top="max(16px, env(safe-area-inset-top))"
        left="16px"
        right="16px"
        zIndex={3}
      >
        {fingerprintPanel}
      </Box>

      {isAudioOnly ? (
        <Box
          position="absolute"
          inset={0}
          zIndex={0}
          bg="linear-gradient(180deg, rgba(2,10,17,0.96), rgba(9,30,44,0.92))"
        />
      ) : (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            zIndex: 0,
            backgroundColor: "black",
          }}
        />
      )}

      {!isAudioOnly ? (
        <Box
          position="absolute"
          top="max(220px, env(safe-area-inset-top) + 200px)"
          right="20px"
          width="100px"
          height="140px"
          borderRadius="xl"
          overflow="hidden"
          border="2px solid"
          borderColor="whiteAlpha.400"
          boxShadow="dark-lg"
          zIndex={2}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: "scaleX(-1)",
              backgroundColor: "#2D3748",
            }}
          />
          {videoMuted && (
            <Box
              position="absolute"
              top="50%"
              left="50%"
              transform="translate(-50%, -50%)"
              fontSize="3xl"
              zIndex={3}
            >
              👤
            </Box>
          )}
        </Box>
      ) : (
        <Box
          position="absolute"
          inset={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
          zIndex={1}
          pointerEvents="none"
        ></Box>
      )}

      {(remoteStatus.audioMuted || remoteStatus.videoMuted) && (
        <Box
          position="absolute"
          bottom="max(200px, env(safe-area-inset-bottom) + 180px)"
          left="50%"
          transform="translateX(-50%)"
          zIndex={2}
          bg="blackAlpha.700"
          px={4}
          py={2}
          borderRadius="full"
          backdropFilter="blur(10px)"
        >
          <HStack gap={3} fontSize="sm" color="white">
            {remoteStatus.audioMuted && (
              <Text>🔇 {t("call.status.peerMuted")}</Text>
            )}
            {!isAudioOnly && remoteStatus.videoMuted && (
              <Text>📵 {t("call.status.peerVideoOff")}</Text>
            )}
          </HStack>
        </Box>
      )}

      <Box
        position="absolute"
        bottom="max(30px, env(safe-area-inset-bottom))"
        left="50%"
        transform="translateX(-50%)"
        zIndex={3}
      >
        <HStack gap={6}>
          <IconButton
            aria-label={t("call.controls.toggleAudio")}
            onClick={toggleAudio}
            size="lg"
            rounded="full"
            bg={audioMuted ? "white" : "whiteAlpha.300"}
            color={audioMuted ? "black" : "white"}
            backdropFilter="blur(10px)"
            _hover={{ bg: audioMuted ? "gray.200" : "whiteAlpha.400" }}
          >
            {audioMuted ? <MdMicOff size="24px" /> : <MdMic size="24px" />}
          </IconButton>

          <IconButton
            aria-label={t("call.controls.endCall")}
            onClick={handleEndCall}
            size="xl"
            rounded="full"
            bg="red.500"
            color="white"
            width="72px"
            height="72px"
            fontSize="3xl"
            boxShadow="0 4px 14px 0 rgba(229, 62, 62, 0.39)"
            _hover={{ bg: "red.600" }}
          >
            <MdCallEnd />
          </IconButton>

          {!isAudioOnly ? (
            <IconButton
              aria-label={t("call.controls.toggleVideo")}
              onClick={toggleVideo}
              size="lg"
              rounded="full"
              bg={videoMuted ? "white" : "whiteAlpha.300"}
              color={videoMuted ? "black" : "white"}
              backdropFilter="blur(10px)"
              _hover={{ bg: videoMuted ? "gray.200" : "whiteAlpha.400" }}
            >
              {videoMuted ? (
                <MdVideocamOff size="24px" />
              ) : (
                <MdVideocam size="24px" />
              )}
            </IconButton>
          ) : null}
        </HStack>
      </Box>
    </Box>
  ) : (
    <VStack
      gap={6}
      p={8}
      width="min(100%, 72rem)"
      bg="var(--weather-panel-bg)"
      border="1px solid var(--weather-panel-border)"
      borderRadius="1.5rem"
      color="var(--weather-text-main)"
      boxShadow="var(--weather-panel-shadow)"
      backdropFilter="blur(18px)"
      align="center"
      mx="auto"
    >
      {isConnected ? (
        <>
          {fingerprintPanel}

          <VStack gap={1}>
            <HStack gap={4}>
              <Text fontSize="sm" color="var(--weather-text-soft)">
                {t("call.status.connectionLabel")}:{" "}
                <b>{connectionStateLabel}</b>
              </Text>
              <Box
                w="10px"
                h="10px"
                borderRadius="full"
                bg={
                  connectionState === "connected" ? "green.400" : "yellow.400"
                }
              />
            </HStack>
          </VStack>

          {offscreenMediaElements}

          {isAudioOnly ? (
            <Box></Box>
          ) : (
            <Stack direction={{ base: "column", md: "row" }} gap={6} mt={4}>
              <Box textAlign="center" position="relative">
                <video
                  id="Outgoing"
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{
                    width: "300px",
                    height: "225px",
                    transform: "scaleX(-1)",
                    borderRadius: "12px",
                    border: "2px solid rgba(205, 228, 236, 0.2)",
                    backgroundColor: "black",
                  }}
                />
              </Box>

              <Box textAlign="center" position="relative">
                <video
                  id="Incoming"
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  style={{
                    width: "300px",
                    height: "225px",
                    borderRadius: "12px",
                    border: "2px solid rgba(205, 228, 236, 0.2)",
                    backgroundColor: "black",
                  }}
                />
                <HStack position="absolute" top={2} right={2} gap={2}>
                  {remoteStatus.audioMuted && (
                    <Box bg="red.500" p={1} borderRadius="md">
                      🔇
                    </Box>
                  )}
                  {remoteStatus.videoMuted && (
                    <Box bg="red.500" p={1} borderRadius="md">
                      🎥 {t("call.status.peerVideoOff")}
                    </Box>
                  )}
                </HStack>
              </Box>
            </Stack>
          )}

          <HStack gap={4} mt={6}>
            <IconButton
              aria-label={t("call.controls.toggleAudio")}
              onClick={toggleAudio}
              size="lg"
              rounded="full"
              bg={audioMuted ? "white" : "whiteAlpha.300"}
              color={audioMuted ? "black" : "white"}
              backdropFilter="blur(10px)"
              _hover={{ bg: audioMuted ? "gray.200" : "whiteAlpha.400" }}
            >
              {audioMuted ? <MdMicOff /> : <MdMic />}
            </IconButton>
            <IconButton
              aria-label={t("call.controls.endCall")}
              onClick={handleEndCall}
              size="xl"
              rounded="full"
              bg="red.500"
              color="white"
              width="70px"
              height="70px"
              fontSize="2xl"
              _hover={{ bg: "red.600" }}
            >
              <MdCallEnd />
            </IconButton>
            {!isAudioOnly ? (
              <IconButton
                aria-label={t("call.controls.toggleVideo")}
                onClick={toggleVideo}
                size="lg"
                rounded="full"
                bg={videoMuted ? "white" : "whiteAlpha.300"}
                color={videoMuted ? "black" : "white"}
                backdropFilter="blur(10px)"
                _hover={{ bg: videoMuted ? "gray.200" : "whiteAlpha.400" }}
              >
                {videoMuted ? <MdVideocamOff /> : <MdVideocam />}
              </IconButton>
            ) : null}
          </HStack>
        </>
      ) : (
        <VStack p={10}>
          <Spinner size="xl" />
          <Text mt={4} color="var(--weather-text-soft)">
            {t("call.status.establishing")}
          </Text>
        </VStack>
      )}
    </VStack>
  );
};
