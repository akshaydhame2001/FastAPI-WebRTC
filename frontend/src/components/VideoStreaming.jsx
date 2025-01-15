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
import { Camera, CameraOff, Disc2 } from "lucide-react";
import { API_BASE_URL } from "../config";

const VideoStreaming = () => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("disconnected");
  const [selectedFilter, setSelectedFilter] = useState("none");
  const videoRef = useRef(null);
  const peerConnectionRef = useRef(null);

  const filters = [
    { value: "none", label: "No Filter" },
    { value: "grayscale", label: "Grayscale" },
    { value: "edge", label: "Edge Detection" },
  ];

  const startStream = async () => {
    try {
      setStatus("connecting");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch(`${API_BASE_URL}/offer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sdp: pc.localDescription.sdp,
          type: pc.localDescription.type,
          transform: selectedFilter,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const answer = await response.json();
      if (!answer) {
        throw new Error("Empty response from server");
      }

      await pc.setRemoteDescription(answer);

      setIsStreaming(true);
      setStatus("connected");
    } catch (error) {
      console.error("Error starting stream:", error);
      setStatus("error");
    }
  };

  const stopStream = async () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setStatus("disconnected");
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
    <div className="w-full max-w-4xl mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="mr-6">WebRTC Video Stream </span>
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
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full bg-gray-900 rounded-lg aspect-video"
            />

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
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VideoStreaming;
