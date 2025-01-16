import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, CameraOff, Disc2, Download } from "lucide-react";
import { API_BASE_URL } from "../config";

const VideoStreaming = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("disconnected");
  const [selectedFilter, setSelectedFilter] = useState("none");
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const debugVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const [streamStats, setStreamStats] = useState({
    resolution: "",
    frameRate: 0,
    bytesReceived: 0,
  });

  const filters = [
    { value: "none", label: "No Filter" },
    { value: "grayscale", label: "Grayscale" },
    { value: "edge", label: "Edge Detection" },
  ];

  const monitorStream = async () => {
    if (!peerConnectionRef.current) return;

    try {
      const stats = await peerConnectionRef.current.getStats();
      stats.forEach((report) => {
        if (report.type === "inbound-rtp" && report.kind === "video") {
          setStreamStats({
            resolution: `${report.frameWidth || 0}x${report.frameHeight || 0}`,
            frameRate: Math.round(report.framesPerSecond || 0),
            bytesReceived: report.bytesReceived || 0,
          });
        }
      });
    } catch (err) {
      console.error("Error monitoring stream:", err);
    }
  };

  const startStream = async () => {
    try {
      setError(null);
      setStatus("connecting");

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      // Set up debug view
      if (debugVideoRef.current) {
        debugVideoRef.current.srcObject = stream;
      }

      // Create and configure RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      // Add connection state handling
      pc.onconnectionstatechange = () => {
        console.log("Connection state:", pc.connectionState);
        if (pc.connectionState === "connected") {
          setStatus("connected");
        } else if (pc.connectionState === "disconnected") {
          setStatus("disconnected");
          stopStream();
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", pc.iceConnectionState);
      };

      // Add error handling for tracks
      pc.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
        }
      };

      // Add all tracks from the stream
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      peerConnectionRef.current = pc;

      // Create and set local description
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer to server
      const response = await fetch(`${API_BASE_URL}/offer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sdp: pc.localDescription.sdp,
          type: pc.localDescription.type,
          filter: selectedFilter, // Make sure this matches your server's expected parameter name
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const answer = await response.json();
      if (!answer || !answer.sdp) {
        throw new Error("Invalid response from server");
      }

      // Set remote description
      await pc.setRemoteDescription(new RTCSessionDescription(answer));

      setIsStreaming(true);

      // Start stats monitoring
      statsIntervalRef.current = setInterval(monitorStream, 1000);
    } catch (error) {
      console.error("Error starting stream:", error);
      setError(error.message);
      setStatus("error");
      await stopStream();
    }
  };

  const stopStream = async () => {
    // Clear stats interval
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Stop all tracks in both video elements
    [videoRef, debugVideoRef].forEach((ref) => {
      if (ref.current?.srcObject) {
        ref.current.srcObject.getTracks().forEach((track) => track.stop());
        ref.current.srcObject = null;
      }
    });

    setIsStreaming(false);
    setStatus("disconnected");
    setStreamStats({
      resolution: "",
      frameRate: 0,
      bytesReceived: 0,
    });
  };

  const takeSnapshot = () => {
    if (!videoRef.current) return;

    try {
      const canvas = document.createElement("canvas");
      const video = videoRef.current;

      // Set canvas size to match video dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);

      // Create download link
      const link = document.createElement("a");
      link.download = `snapshot-${selectedFilter}-${new Date().toISOString()}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Error taking snapshot:", err);
      setError("Failed to take snapshot");
    }
  };

  const handleFilterChange = async (value) => {
    setSelectedFilter(value);
    if (isStreaming) {
      await stopStream();
      await startStream();
    }
  };

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="mr-6">WebRTC Video Stream</span>
            <div className="flex items-center gap-2">
              <Disc2
                className={`h-4 w-4 ${
                  status === "connected"
                    ? "text-green-500"
                    : status === "connecting"
                    ? "text-yellow-500"
                    : status === "error"
                    ? "text-red-500"
                    : "text-gray-500"
                }`}
              />
              <span className="text-sm capitalize">{status}</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-500 p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Original Stream</h3>
                <video
                  ref={debugVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full bg-gray-900 rounded-lg aspect-video"
                />
              </div>
              <div>
                <h3 className="text-sm font-medium mb-2">
                  Processed Stream ({selectedFilter})
                </h3>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full bg-gray-900 rounded-lg aspect-video"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Button
                onClick={isStreaming ? stopStream : startStream}
                variant={isStreaming ? "destructive" : "default"}
                className="flex items-center gap-2"
              >
                {isStreaming ? (
                  <>
                    <CameraOff className="h-4 w-4" />
                    Stop Stream
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4" />
                    Start Stream
                  </>
                )}
              </Button>

              <Select
                value={selectedFilter}
                onValueChange={handleFilterChange}
                disabled={!isStreaming}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Select Filter" />
                </SelectTrigger>
                <SelectContent>
                  {filters.map((filter) => (
                    <SelectItem key={filter.value} value={filter.value}>
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                onClick={takeSnapshot}
                disabled={!isStreaming}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Take Snapshot
              </Button>
            </div>

            <div className="mt-4 p-3 bg-gray-100 rounded-lg text-sm space-y-1">
              <div>Resolution: {streamStats.resolution}</div>
              <div>Frame Rate: {streamStats.frameRate} FPS</div>
              <div>
                Data Received: {Math.round(streamStats.bytesReceived / 1024)} KB
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VideoStreaming;
