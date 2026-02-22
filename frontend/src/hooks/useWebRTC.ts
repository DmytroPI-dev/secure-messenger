import { useEffect, useRef, useState } from "react";

interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  startCall: () => Promise<void>;
  stopCall: () => void;
}

export function useWebRTC(
  sendMessage: (message: any) => void,
  roomId: string,
  messages: any[],
): UseWebRTCReturn {
  const myRoleRef = useRef<"initiator" | "receiver" | null>(null);
  const hasCreatedOfferRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // THE FIX: An async lock and index tracker to prevent React from dropping messages
  const isProcessingRef = useRef(false);
  const messageIndexRef = useRef(0);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState>("new");
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  // 1. Initialize PeerConnection
  useEffect(() => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: [
            `turn:${import.meta.env.VITE_TURN_SERVER}:3478?transport=tcp`,
            `turn:${import.meta.env.VITE_TURN_SERVER}:3478?transport=udp`,
            `stun:stun.l.google.com:19302`, // Added free Google STUN for fallback debugging
          ],
          username: import.meta.env.VITE_TURN_USERNAME,
          credential: import.meta.env.VITE_TURN_PASSWORD,
        },
      ],
      // THE FIX: Commented out to allow P2P if TURN is blocked by a firewall
      // iceTransportPolicy: "relay",
    });

    peerConnectionRef.current = peerConnection;

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessage({
          type: "signal",
          roomId: roomId,
          data: { type: "ice-candidate", candidate: event.candidate },
        });
      }
    };

    peerConnection.ontrack = (event) => {
      console.log("🎥 Received remote track!");
      setRemoteStream(event.streams[0]);
    };

    peerConnection.onconnectionstatechange = () => {
      console.log(
        "📡 Connection State Changed:",
        peerConnection.connectionState,
      );
      setConnectionState(peerConnection.connectionState);
    };

    return () => {
      peerConnection.close();
    };
  }, [roomId, sendMessage]);

  // 2. Process Messages Safely
  useEffect(() => {
    const processMessages = async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        // Process strictly in order using a while loop to prevent overlapping async calls
        while (messageIndexRef.current < messages.length) {
          const message = messages[messageIndexRef.current];

          if (message.type === "role") {
            const assignedRole = message.data.role;
            myRoleRef.current = assignedRole;

            const stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });
            setLocalStream(stream);
            stream.getTracks().forEach((track) => {
              peerConnectionRef.current?.addTrack(track, stream);
            });

            if (assignedRole === "initiator") {
              console.log("⏳ Initiator waiting for receiver...");
            } else {
              console.log("👂 Receiver telling initiator they are ready!");
              sendMessage({
                type: "signal",
                roomId: roomId,
                data: { type: "peer_ready" },
              });
            }
          } else if (
            message.type === "signal" &&
            message.data.type === "peer_ready"
          ) {
            if (myRoleRef.current === "initiator") {
              await startCall();
            }
          } else if (
            message.type === "signal" &&
            message.data.type === "offer"
          ) {
            await peerConnectionRef.current?.setRemoteDescription(
              new RTCSessionDescription(message.data.offer),
            );
            flushIceQueue();
            const answer = await peerConnectionRef.current?.createAnswer();
            await peerConnectionRef.current?.setLocalDescription(answer);
            sendMessage({
              type: "signal",
              roomId: roomId,
              data: { type: "answer", answer },
            });
          } else if (
            message.type === "signal" &&
            message.data.type === "answer"
          ) {
            await peerConnectionRef.current?.setRemoteDescription(
              new RTCSessionDescription(message.data.answer),
            );
            flushIceQueue();
          } else if (
            message.type === "signal" &&
            message.data.type === "ice-candidate"
          ) {
            if (peerConnectionRef.current?.remoteDescription) {
              await peerConnectionRef.current?.addIceCandidate(
                new RTCIceCandidate(message.data.candidate),
              );
            } else {
              pendingCandidatesRef.current.push(message.data.candidate);
            }
          }

          messageIndexRef.current++; // Move to next message
        }
      } finally {
        isProcessingRef.current = false;
        // If new messages arrived while we were processing, trigger loop again
        if (messageIndexRef.current < messages.length) {
          processMessages();
        }
      }
    };

    processMessages();
  }, [messages, roomId, sendMessage]);

  const flushIceQueue = async () => {
    for (const candidate of pendingCandidatesRef.current) {
      try {
        await peerConnectionRef.current?.addIceCandidate(
          new RTCIceCandidate(candidate),
        );
      } catch (e) {
        console.error("Error adding queued ICE candidate", e);
      }
    }
    pendingCandidatesRef.current = [];
  };

  const startCall = async () => {
    try {
      if (myRoleRef.current === "initiator" && !hasCreatedOfferRef.current) {
        const offer = await peerConnectionRef.current?.createOffer();
        await peerConnectionRef.current?.setLocalDescription(offer);
        sendMessage({
          type: "signal",
          roomId: roomId,
          data: { type: "offer", offer },
        });
        hasCreatedOfferRef.current = true;
      }
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  };

  const stopCall = () => {
    localStream?.getTracks().forEach((track) => track.stop());
    peerConnectionRef.current?.close();
    setLocalStream(null);
    setRemoteStream(null);
  };

  return { localStream, remoteStream, connectionState, startCall, stopCall };
}
