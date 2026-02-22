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
  const processedMessagesRef = useRef<Set<string>>(new Set());

  const [_, setMyRole] = useState<"initiator" | "receiver" | null>(null);
  // 1. ADD A REF for instant role access inside closures
  const myRoleRef = useRef<"initiator" | "receiver" | null>(null);

  const hasReceivedOfferRef = useRef(false);
  const hasCreatedOfferRef = useRef(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState>("new");
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: [
            `turn:${import.meta.env.VITE_TURN_SERVER}:443?transport=tcp`,
            `turns:${import.meta.env.VITE_TURN_SERVER}:443?transport=tcp`,
          ],
          username: import.meta.env.VITE_TURN_USERNAME,
          credential: import.meta.env.VITE_TURN_PASSWORD,
        },
      ],
      iceTransportPolicy: "relay",
    });
    peerConnectionRef.current = peerConnection;

peerConnection.onicecandidate = (event) => {
  if (event.candidate) {
    console.log("📤 ICE Candidate:", {
      type: event.candidate.type,
      protocol: event.candidate.protocol,
      address: event.candidate.address,
      port: event.candidate.port,
      relatedAddress: event.candidate.relatedAddress,
    });
    sendMessage({
      type: "signal",
      data: { type: "ice-candidate", candidate: event.candidate },
    });
  }
};

    peerConnection.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    peerConnection.onconnectionstatechange = () => {
      setConnectionState(peerConnection.connectionState);
    };

    return () => {
      peerConnection.close();
    };
  }, []);

  useEffect(() => {
    messages.forEach(async (message, index) => {
      const messageId = `${message.type}-${index}`;
      if (processedMessagesRef.current.has(messageId)) return;
      processedMessagesRef.current.add(messageId);

      // --- ROLE ASSIGNMENT ---
      if (message.type === "role") {
        const assignedRole = message.data.role;
        console.log("🎭 Received role assignment:", assignedRole);

        setMyRole(assignedRole);
        myRoleRef.current = assignedRole; // Update Ref instantly

        // Get media for BOTH roles as soon as they join
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        stream.getTracks().forEach((track) => {
          peerConnectionRef.current?.addTrack(track, stream);
        });

        if (assignedRole === "initiator") {
          console.log("⏳ I am the initiator, waiting for receiver to join...");
          // Do NOT create offer yet. Wait for receiver to signal they are ready.
        } else {
          console.log("👂 I am the receiver. Telling initiator I am ready!");
          // 2. TIMING FIX: Tell the initiator we are in the room and ready
          sendMessage({
            type: "signal",
            roomId: roomId,
            data: { type: "peer_ready" },
          });
        }
      }

      // --- NEW: HANDLE PEER READY ---
      else if (
        message.type === "signal" &&
        message.data.type === "peer_ready"
      ) {
        if (myRoleRef.current === "initiator") {
          console.log(
            "📞 Receiver is ready. Initiator is starting the call...",
          );
          await startCall(); // Now we safely fire the offer
        }
      }

      // --- HANDLE INCOMING OFFER ---
      else if (message.type === "signal" && message.data.type === "offer") {
        console.log("📥 Received OFFER, creating ANSWER");
        hasReceivedOfferRef.current = true;
        await peerConnectionRef.current?.setRemoteDescription(
          new RTCSessionDescription(message.data.offer),
        );
        const answer = await peerConnectionRef.current?.createAnswer();
        await peerConnectionRef.current?.setLocalDescription(answer);
        sendMessage({
          type: "signal",
          roomId: roomId,
          data: { type: "answer", answer },
        });
      }

      // --- HANDLE INCOMING ANSWER ---
      else if (message.type === "signal" && message.data.type === "answer") {
        console.log("📥 Received ANSWER, setting remote description");
        await peerConnectionRef.current?.setRemoteDescription(
          new RTCSessionDescription(message.data.answer),
        );
      }

      // --- HANDLE ICE CANDIDATES ---
      else if (
        message.type === "signal" &&
        message.data.type === "ice-candidate"
      ) {
        console.log("📥 Received ICE candidate");
        try {
          // It's good practice to ensure remoteDescription is set before adding ICE candidates
          if (peerConnectionRef.current?.remoteDescription) {
            await peerConnectionRef.current?.addIceCandidate(
              new RTCIceCandidate(message.data.candidate),
            );
          }
        } catch (error) {
          console.error("Error adding received ice candidate", error);
        }
      }
    });
  }, [messages]);

  const startCall = async () => {
    try {
      // 3. Use myRoleRef instead of myRole to prevent the React closure bug
      if (myRoleRef.current === "initiator" && !hasCreatedOfferRef.current) {
        console.log("🎬 I am initiator, creating OFFER");
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
