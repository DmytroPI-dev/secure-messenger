import { useEffect, useRef, useState } from "react";

interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  startCall: () => Promise<void>;
  stopCall: () => void;
  peerConnection: RTCPeerConnection | null;
}

export function useWebRTC(
  sendMessage: (message: any) => void,
  roomId: string,
  messages: any[],
): UseWebRTCReturn {
  const myRoleRef = useRef<"initiator" | "receiver" | null>(null);
  const hasCreatedOfferRef = useRef(false);
  const hasReceivedOfferRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const isProcessingRef = useRef(false);
  const messageIndexRef = useRef(0);
  const disconnectTimerRef = useRef<number | null>(null);
  const isRestartingIceRef = useRef(false);
  const iceRestartAttemptsRef = useRef(0);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState>("new");
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const clearDisconnectTimer = () => {
    if (disconnectTimerRef.current !== null) {
      window.clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
  };

  const restartIce = async (_reason: string) => {
    const peerConnection = peerConnectionRef.current;

    if (!peerConnection) {
      return;
    }

    if (myRoleRef.current !== "initiator") {
      return;
    }

    if (isRestartingIceRef.current) {
      return;
    }

    if (peerConnection.signalingState !== "stable") {
      return;
    }

    if (!peerConnection.remoteDescription) {
      return;
    }

    isRestartingIceRef.current = true;
    iceRestartAttemptsRef.current += 1;

    try {
      const offer = await peerConnection.createOffer({ iceRestart: true });
      await peerConnection.setLocalDescription(offer);
      sendMessage({
        type: "signal",
        roomId: roomId,
        data: { type: "offer", offer },
      });
    } catch (error) {
      console.error("Error restarting ICE:", error);
      isRestartingIceRef.current = false;
    }
  };

  // 1. Initialize PeerConnection
  useEffect(() => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: [`turns:${import.meta.env.VITE_TURN_SERVER}:443?transport=tcp`],
          username: import.meta.env.VITE_TURN_USERNAME,
          credential: import.meta.env.VITE_TURN_PASSWORD,
        },
      ],
      iceTransportPolicy: "relay",
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

    peerConnection.oniceconnectionstatechange = () => {
    };

    peerConnection.onicegatheringstatechange = () => {
    };

    peerConnection.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    peerConnection.onconnectionstatechange = () => {
      setConnectionState(peerConnection.connectionState);

      if (peerConnection.connectionState === "connected") {
        clearDisconnectTimer();
        isRestartingIceRef.current = false;
        iceRestartAttemptsRef.current = 0;
      }

      if (peerConnection.connectionState === "disconnected") {
        clearDisconnectTimer();
        disconnectTimerRef.current = window.setTimeout(() => {
          if (peerConnection.connectionState === "disconnected") {
            void restartIce("disconnect timeout");
          }
          disconnectTimerRef.current = null;
        }, 5000);
      }

      if (peerConnection.connectionState === "failed") {
        clearDisconnectTimer();
        void restartIce("connection failed");
      }

      if (peerConnection.connectionState === "closed") {
        clearDisconnectTimer();
      }
    };

    return () => {
      clearDisconnectTimer();
      peerConnection.close();
    };
  }, [roomId, sendMessage]);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 2. Process Messages Safely
  useEffect(() => {
    const processMessages = async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        while (messageIndexRef.current < messagesRef.current.length) {
          const message = messagesRef.current[messageIndexRef.current];

          if (message.type === "role") {
            const assignedRole = message.data.role;
            myRoleRef.current = assignedRole;

            const stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });
            stream.getVideoTracks().forEach((track) => (track.enabled = false));
            stream.getAudioTracks().forEach((track) => (track.enabled = false));
            setLocalStream(stream);
            stream.getTracks().forEach((track) => {
              peerConnectionRef.current?.addTrack(track, stream);
            });

            if (assignedRole === "initiator") {
              sendMessage({
                type: "signal",
                roomId: roomId,
                data: { type: "initiator_arrived" },
              });
            } else {
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
              if (!hasCreatedOfferRef.current) {
                await startCall();
              }
            }
          } else if (
            message.type === "signal" &&
            message.data.type === "initiator_arrived"
          ) {
            if (myRoleRef.current === "receiver") {
              sendMessage({
                type: "signal",
                roomId: roomId,
                data: { type: "peer_ready" },
              });
            }
          } else if (
            message.type === "signal" &&
            message.data.type === "offer"
          ) {
            hasReceivedOfferRef.current = true;
            isRestartingIceRef.current = false;
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
            isRestartingIceRef.current = false;
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

          messageIndexRef.current++;
        }
      } finally {
        isProcessingRef.current = false;
        if (messageIndexRef.current < messagesRef.current.length) {
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

  return {
    localStream,
    remoteStream,
    connectionState,
    startCall,
    stopCall,
    peerConnection: peerConnectionRef.current,
  };
}
