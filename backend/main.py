from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
#from fastapi.staticfiles import StaticFiles
#from fastapi.responses import HTMLResponse
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import cv2
import numpy as np
import asyncio
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription
from av import VideoFrame
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#app.mount("/static", StaticFiles(directory="static"), name="static")


# Store active peer connections
pcs = set()

# Define request model
class OfferModel(BaseModel):
    sdp: str
    type: str
    transform: str = "none"

class VideoTransformTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self, track, transform):
        super().__init__()
        self.track = track
        self.transform = transform

    async def recv(self):
        frame = await self.track.recv()
        
        if self.transform == "grayscale":
            # Convert frame to grayscale
            img = frame.to_ndarray(format="bgr24")
            img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
            new_frame = VideoFrame.from_ndarray(img, format="bgr24")
            new_frame.pts = frame.pts
            new_frame.time_base = frame.time_base
            return new_frame
        
        elif self.transform == "edge":
            # Apply edge detection
            img = frame.to_ndarray(format="bgr24")
            img = cv2.Canny(img, 100, 200)
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
            new_frame = VideoFrame.from_ndarray(img, format="bgr24")
            new_frame.pts = frame.pts
            new_frame.time_base = frame.time_base
            return new_frame

        return frame

@app.get("/")
async def index():
    # with open("static/index.html", "r") as f:
    #     html = f.read()
    # return HTMLResponse(content=html)
    return {"message": "WebRTC Video Streaming Server"}

@app.post("/offer")
async def offer(params: OfferModel):
    try:
        logger.info(f"Received offer with transform: {params.transform}")
        
        offer = RTCSessionDescription(sdp=params.sdp, type=params.type)
        pc = RTCPeerConnection()
        pcs.add(pc)

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            logger.info(f"Connection state is {pc.connectionState}")
            logger.info(f"ICE connection state is {pc.iceConnectionState}")
            logger.info(f"ICE gathering state is {pc.iceGatheringState}")
    
            if pc.connectionState == "failed":
                await pc.close()
                pcs.discard(pc)
                logger.warning("Connection failed and was closed")

        @pc.on("track")
        def on_track(track):
            if track.kind == "video":
                logger.info(f"Adding video track with transform: {params.transform}")
                local_video = VideoTransformTrack(track, transform=params.transform)
                pc.addTrack(local_video)

        await pc.setRemoteDescription(offer)
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        response = {
            "sdp": pc.localDescription.sdp,
            "type": pc.localDescription.type
        }
        logger.info("Successfully created answer")
        return JSONResponse(content=response)

    except Exception as e:
        logger.error(f"Error processing offer: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/check")
async def check_stream():
    return {
        "active_connections": len(pcs),
        "server_ip": {
            "ipv4": "192.168.1.16",
            "ipv6": "2401:4900:8815:e6ab:fef4:11ed:9e16:b1d5"
        },
        "status": "running"
    }

@app.on_event("shutdown")
async def shutdown_event():
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)
    pcs.clear()