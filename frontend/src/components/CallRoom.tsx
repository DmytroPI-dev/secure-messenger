import { useWebSocket } from "@/hooks/useWebSocket";
import {
  Box,
  HStack,
  Stack,
  Text,
  VStack,
  Spinner,
  Slider,
  IconButton,
  useBreakpointValue,
} from "@chakra-ui/react";

import { useWebRTC } from "@/hooks/useWebRTC";
import { useRTCStats } from "@/hooks/useRTCStats";
import { useEffect, useRef, useState } from "react";
import {
  MdCallEnd,
  MdMic,
  MdMicOff,
  MdVideocam,
  MdVideocamOff,
} from "react-icons/md";

interface CallRoomProps {
  roomId: string;
  onEndCall: () => void;
}

export const CallRoom: React.FC<CallRoomProps> = ({ roomId, onEndCall }) => {
  const { messages, isConnected, error, sendMessage } = useWebSocket(roomId);
  const isMobile = useBreakpointValue({ base: true, md: false });

  const [maxBitrate, setMaxBitrate] = useState([2500]);
  const [audioMuted, setAudioMuted] = useState(true);
  const [videoMuted, setVideoMuted] = useState(true);
  const [remoteStatus, setRemoteStatus] = useState({
    audioMuted: false,
    videoMuted: false,
  });
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const hasStoppedRef = useRef(false);

  const {
    localStream,
    remoteStream,
    connectionState,
    stopCall,
    peerConnection,
  } = useWebRTC(sendMessage, roomId, messages);

  const rtcStats = useRTCStats(peerConnection);

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

  const handleBitrateChange = async (details: { value: number[] }) => {
    const value = details.value[0];
    setMaxBitrate([value]);

    if (!peerConnection) {
      console.error("❌ No peer connection available!");
      return;
    }
    const sender = peerConnection
      .getSenders()
      .find((s) => s.track?.kind === "video");

    if (!sender) {
      console.error("❌ No video sender found!");
      return;
    }
    try {
      // IMPORTANT: Get fresh parameters from the sender
      const params = sender.getParameters();
      // Ensure encodings array exists
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      // Set the max bitrate
      params.encodings[0].maxBitrate = value * 1000; // kbps to bps
      // Apply the parameters
      await sender.setParameters(params);
      // Notify peer
      sendMessage({
        type: "peer-status",
        roomId: roomId,
        data: {
          audioMuted,
          videoMuted,
          maxBitrate: value,
        },
      });
    } catch (error) {
      console.error("❌ Failed to set bitrate:", error);
    }
  };

  const handleEndCall = () => {
    if (!hasStoppedRef.current) {
      hasStoppedRef.current = true;
      stopCall();
      sendMessage({ type: "end-call", roomId });
    }
    onEndCall();
  };

  const bitrateMarks = [
    { value: 500, label: "Low" },
    { value: 2500, label: "Med" },
    { value: 5000, label: "High" },
  ];

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
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.type === "peer-status") {
      setRemoteStatus({
        audioMuted: !!lastMsg.data.audioMuted,
        videoMuted: !!lastMsg.data.videoMuted,
      });
    }
    if (lastMsg?.type === "call-ended") {
      // Peer ended call, just clean up locally without sending another message
      if (!hasStoppedRef.current) {
        hasStoppedRef.current = true;
        stopCall();
      }
      alert("Peer has ended the call.");
      onEndCall();
    }
  }, [messages]);

  return isMobile ? (
    <Box
      position="fixed" // 1. Locks container to the screen completely
      top={0}
      left={0}
      width="100dvw"   // 2. Dynamic Viewport Width
      height="100dvh"  // 3. Dynamic Viewport Height (ignores mobile address bars)
      bg="black"
      zIndex={9999}    // Ensure it overlays your app completely
      overflow="hidden"
      style={{ touchAction: "none" }} // 4. PREVENTS the screen from being dragged/bounced with fingers
    >
      {/* Remote video - TRULY full screen */}
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
          // REMOVED border and borderRadius to make it edge-to-edge
        }}
      />

      {/* Stats at top center */}
      <Box
        position="absolute"
        top="max(20px, env(safe-area-inset-top))" // Respects iOS notches
        left="50%"
        transform="translateX(-50%)"
        zIndex={2}
        bg="blackAlpha.700"
        px={4}
        py={2}
        borderRadius="full"
        backdropFilter="blur(10px)"
      >
        <HStack gap={3} fontSize="xs" color="white">
          <Text>📶 {rtcStats.bitrate.toFixed(0)} kbps</Text>
          <Text>⏱️ {rtcStats.rtt}ms</Text>
        </HStack>
      </Box>

      {/* Local video PiP - top right */}
      <Box
        position="absolute"
        top="max(80px, env(safe-area-inset-top) + 60px)"
        right="20px"
        width="100px"
        height="140px"
        borderRadius="xl" // Adjusted for a cleaner mobile look
        overflow="hidden"
        border="2px solid"
        borderColor="whiteAlpha.400"
        boxShadow="dark-lg"
        zIndex={2} // Ensure it's above the remote video
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
            backgroundColor: "#2D3748", // Dark placeholder background
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

      {/* Remote status indicators */}
      {(remoteStatus.audioMuted || remoteStatus.videoMuted) && (
        <Box
          position="absolute"
          bottom="max(140px, env(safe-area-inset-bottom) + 120px)"
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
            {remoteStatus.audioMuted && <Text>🔇 Peer Muted</Text>}
            {remoteStatus.videoMuted && <Text>📵 Peer Video Off</Text>}
          </HStack>
        </Box>
      )}

      {/* Control buttons at bottom */}
      <Box
        position="absolute"
        bottom="max(30px, env(safe-area-inset-bottom))" // Safe area for iOS swipe bar
        left="50%"
        transform="translateX(-50%)"
        zIndex={3}
      >
        <HStack gap={6}>
          <IconButton
            aria-label="Toggle audio"
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
            aria-label="End call"
            onClick={handleEndCall}
            size="xl"
            rounded="full"
            bg="red.500"
            color="white"
            width="72px"
            height="72px"
            fontSize="3xl"
            boxShadow="0 4px 14px 0 rgba(229, 62, 62, 0.39)" // Nice glow effect
            _hover={{ bg: "red.600" }}
          >
            <MdCallEnd />
          </IconButton>

          <IconButton
            aria-label="Toggle video"
            onClick={toggleVideo}
            size="lg"
            rounded="full"
            bg={videoMuted ? "white" : "whiteAlpha.300"}
            color={videoMuted ? "black" : "white"}
            backdropFilter="blur(10px)"
            _hover={{ bg: videoMuted ? "gray.200" : "whiteAlpha.400" }}
          >
            {videoMuted ? <MdVideocamOff size="24px" /> : <MdVideocam size="24px" />}
          </IconButton>
        </HStack>
      </Box>
    </Box>
  ) : (
    // Desktop layout
    <VStack
      gap={6}
      p={8}
      bg="green.700"
      borderRadius="xl"
      color="white"
      boxShadow="lg"
      align="center"
      maxW="1000px"
      mx="auto"
    >
      {isConnected ? (
        <>
          <VStack gap={1}>
            <HStack gap={4}>
              <Text fontSize="sm" opacity={0.9}>
                Connection status: <b>{connectionState}</b>
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
                  border: "2px solid rgba(255,255,255,0.2)",
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
                  border: "2px solid rgba(255,255,255,0.2)",
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
                    🎥 Off
                  </Box>
                )}
              </HStack>
            </Box>
          </Stack>

          <HStack gap={4} mt={6}>
            {" "}
            <Box p={4} bg="whiteAlpha.00" borderRadius="md">
              <VStack gap={3} align="stretch">
                <HStack justify="space-between">
                  <Text fontSize="sm" fontWeight="medium">
                    📊 Video Quality
                  </Text>
                  <Text fontSize="sm" color="blue.300">
                    {maxBitrate[0]} kbps
                  </Text>
                </HStack>

                <Slider.Root
                  width="full"
                  colorPalette="blue"
                  value={maxBitrate}
                  onValueChange={handleBitrateChange}
                  min={500}
                  max={5000}
                  step={100}
                >
                  <Slider.Control>
                    <Slider.Track>
                      <Slider.Range />
                    </Slider.Track>
                    <Slider.Thumb index={0} />
                    <Slider.Marks marks={bitrateMarks} />
                  </Slider.Control>
                </Slider.Root>
              </VStack>
            </Box>
            <IconButton
              aria-label="Toggle audio"
              onClick={toggleAudio}
              size="lg"
              rounded="full"
              bg={audioMuted ? "red.500" : "whiteAlpha.300"}
              color="white"
              backdropFilter="blur(10px)"
              _hover={{ bg: audioMuted ? "red.600" : "whiteAlpha.400" }}
            >
              {audioMuted ? <MdMicOff /> : <MdMic />}
            </IconButton>
            <IconButton
              aria-label="End call"
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
            <IconButton
              aria-label="Toggle video"
              onClick={toggleVideo}
              size="lg"
              rounded="full"
              bg={videoMuted ? "red.500" : "whiteAlpha.300"}
              color="white"
              backdropFilter="blur(10px)"
              _hover={{ bg: videoMuted ? "red.600" : "whiteAlpha.400" }}
            >
              {videoMuted ? <MdVideocamOff /> : <MdVideocam />}
            </IconButton>
            <Box textAlign="center" position="relative">
              <VStack gap={1} align="center">
                <Text fontSize="sm" fontWeight="medium">
                  Connection Stats
                </Text>
                <HStack gap={4} bg="blackAlpha.00" p={2} borderRadius="md">
                  <Text fontSize="xs">
                    📶 {rtcStats.bitrate.toFixed(0)} kbps
                  </Text>
                  <Text fontSize="xs">⏱️ {rtcStats.rtt.toFixed(0)}ms</Text>
                </HStack>
              </VStack>
            </Box>
          </HStack>
        </>
      ) : (
        <VStack p={10}>
          <Spinner size="xl" />
          <Text mt={4}>Establishing connection...</Text>
        </VStack>
      )}
      {error && (
        <Box p={4} bg="red.500" borderRadius="md" mt={4}>
          <Text fontWeight="bold">Error: {error}</Text>
        </Box>
      )}
    </VStack>
  );
};
