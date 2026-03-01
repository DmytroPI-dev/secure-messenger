import { useEffect, useState, useRef } from "react";

export const useRTCStats = (peerConnection: RTCPeerConnection | null) => {
  const [stats, setStats] = useState({
    bitrate: 0,
    packetLoss: 0,
    rtt: 0,
  });

  const previousStatsRef = useRef(
    new Map<
      string,
      {
        bytesReceived: number;
        timestamp: number;
      }
    >(),
  );

  useEffect(() => {
    if (!peerConnection) return;

    const interval = setInterval(async () => {
      const statsReport = await peerConnection.getStats();

      // 1. Use null to track if we actually found these stats in this specific tick
      let currentBitrate: number | null = null;
      let currentPacketLoss: number | null = null;
      let currentRtt: number | null = null;

      statsReport.forEach((report) => {
        // Video bitrate calculation
        if (report.type === "inbound-rtp" && report.kind === "video") {
          const currentBytes = report.bytesReceived || 0;
          const currentTimestamp = report.timestamp || Date.now();
          const previous = previousStatsRef.current.get(report.id);

          if (previous) {
            const bytesDiff = currentBytes - previous.bytesReceived;
            const timeDiff = (currentTimestamp - previous.timestamp) / 1000;
            currentBitrate = Math.round((bytesDiff * 8) / (timeDiff * 1000));
          }

          previousStatsRef.current.set(report.id, {
            bytesReceived: currentBytes,
            timestamp: currentTimestamp,
          });
        }

        // RTT (Round Trip Time)
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          currentRtt = report.currentRoundTripTime
            ? Math.round(report.currentRoundTripTime * 1000)
            : 0;
        }
      });

      // 2. Use functional state update to completely avoid the Stale Closure!
      setStats((prev) => ({
        bitrate: currentBitrate !== null ? currentBitrate : prev.bitrate,
        packetLoss:
          currentPacketLoss !== null ? currentPacketLoss : prev.packetLoss,
        rtt: currentRtt !== null ? currentRtt : prev.rtt,
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [peerConnection]);

  return stats;
};
