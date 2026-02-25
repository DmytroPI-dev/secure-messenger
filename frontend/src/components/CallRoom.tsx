import { useWebSocket } from "@/hooks/useWebSocket";
import {
  Box,
  Button,
  HStack,
  Stack,
  Text,
  VStack,
  Spinner,
  Slider,
} from "@chakra-ui/react";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useRTCStats } from "@/hooks/useRTCStats";
import { useEffect, useRef, useState } from "react";

interface CallRoomProps {
  roomId: string;
}

export const CallRoom: React.FC<CallRoomProps> = ({ roomId }) => {
  const { messages, isConnected, error, sendMessage } = useWebSocket(roomId);

  const [maxBitrate, setMaxBitrate] = useState([2500]);
  const [audioMuted, setAudioMuted] = useState(true);
  const [videoMuted, setVideoMuted] = useState(true);
  const [remoteStatus, setRemoteStatus] = useState({
    audioMuted: false,
    videoMuted: false,
  });
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

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

   console.log("🎚️ Bitrate slider changed to:", value);

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

     console.log("🔧 Setting maxBitrate to:", value * 1000, "bps");

     // Apply the parameters
     await sender.setParameters(params);

     console.log("✅ Bitrate set successfully!");

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
    return () => {
      console.log("Cleaning up call...");
      stopCall();
    };
  }, []);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.type === "peer-status") {
      setRemoteStatus({
        audioMuted: !!lastMsg.data.audioMuted,
        videoMuted: !!lastMsg.data.videoMuted,
      });
    }
  }, [messages]);

  return (
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
            <Box textAlign="center" position="relative">
              <HStack gap={4} bg="blackAlpha.400" p={2} borderRadius="md">
                <Text fontSize="xs">📶 {rtcStats.bitrate.toFixed(0)} kbps</Text>
                <Text fontSize="xs">⏱️ {rtcStats.rtt.toFixed(0)}ms</Text>
                <Text fontSize="xs">⚠️ {rtcStats.packetLoss.toFixed(2)}%</Text>
              </HStack>
            </Box>
          </Stack>

          <HStack gap={4} mt={6}>
            <Button
              variant="solid"
              colorPalette={audioMuted ? "red" : "gray"}
              onClick={toggleAudio}
            >
              {audioMuted ? "🎤" : "🔊"}
            </Button>
            <Button
              variant="solid"
              colorPalette={videoMuted ? "red" : "gray"}
              onClick={toggleVideo}
            >
              {videoMuted ? "📹" : "📹"}
            </Button>
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
