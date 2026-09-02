import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { Checkbox } from "@/components/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { csr } from "@/lib/compat";
import * as gtag from "@/lib/gtag";
import { BackLink } from "@/components/back-link";

export const AudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioURL, setAudioURL] = useState("");
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null,
  );
  const [outputFormat, setOutputFormat] = useState("audio/webm");
  const [recordSystemAudio, setRecordSystemAudio] = useState(false);
  const [supportedMimeTypes, setSupportedMimeTypes] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const drawRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Get supported MIME types on client side only
  useEffect(() => {
    if (typeof window !== "undefined") {
      const mimeTypes = [
        "audio/webm",
        "audio/ogg",
        "audio/wav",
        "audio/mp4",
        "audio/aac",
      ];
      const supported = mimeTypes.filter((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType),
      );
      setSupportedMimeTypes(supported);

      // Set the first supported format as default if current format is not supported
      if (supported.length > 0 && !supported.includes(outputFormat)) {
        setOutputFormat(supported[0]);
      }
    }
  }, [outputFormat]);

  const handleStartRecording = async () => {
    gtag.event({
      action: "run_action",
      category: "engagement",
      label: "record_audio",
      value: 1,
    });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    let mediaStream: MediaStream = stream;
    if (recordSystemAudio) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const destination = audioContext.createMediaStreamDestination();

        const userAudio = audioContext.createMediaStreamSource(stream);
        userAudio.connect(destination);

        if (displayStream.getAudioTracks().length > 0) {
          const systemAudio =
            audioContext.createMediaStreamSource(displayStream);
          systemAudio.connect(destination);
        }
        mediaStream = destination.stream;
      } catch (err) {
        console.error("Error starting screen recording:", err);
        return;
      }
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    audioContextRef.current = new AudioContextCtor();
    analyserRef.current = audioContextRef.current.createAnalyser();
    const source = audioContextRef.current.createMediaStreamSource(mediaStream);
    source.connect(analyserRef.current);
    analyserRef.current.fftSize = 256;
    const bufferLength = analyserRef.current.frequencyBinCount;
    dataArrayRef.current = new Uint8Array(bufferLength);

    const recorder = new MediaRecorder(mediaStream, { mimeType: outputFormat });
    setMediaRecorder(recorder);
    recorder.start();
    setIsRecording(true);
    setIsPaused(false);
    audioChunksRef.current = [];
    draw();
  };

  const handleStopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      mediaRecorder.stop();
      setIsRecording(false);
      if (drawRef.current) {
        cancelAnimationFrame(drawRef.current);
      }
    }
  };

  const handlePauseResumeRecording = () => {
    if (mediaRecorder) {
      if (isPaused) {
        mediaRecorder.resume();
        draw();
      } else {
        mediaRecorder.pause();
        if (drawRef.current) {
          cancelAnimationFrame(drawRef.current);
        }
      }
      setIsPaused(!isPaused);
    }
  };

  useEffect(() => {
    if (mediaRecorder) {
      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        console.log(audioChunksRef.current);
        const audioBlob = new Blob(audioChunksRef.current, {
          type: outputFormat,
        });
        const url = URL.createObjectURL(audioBlob);
        setAudioURL(url);
      };
    }
  }, [mediaRecorder, outputFormat]);

  const draw = () => {
    if (!analyserRef.current || !dataArrayRef.current || !canvasRef.current)
      return;
    drawRef.current = requestAnimationFrame(draw);
    // @ts-expect-error - TypeScript strict typing issue with ArrayBufferLike vs ArrayBuffer
    analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) return;

    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = "rgb(0, 0, 0)";

    canvasCtx.beginPath();

    const sliceWidth =
      (canvas.width * 1.0) / analyserRef.current.frequencyBinCount;
    let x = 0;

    for (let i = 0; i < analyserRef.current.frequencyBinCount; i++) {
      const v = dataArrayRef.current[i] / 128.0;
      const y = (v * canvas.height) / 2;

      if (i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }

      x += sliceWidth;
    }
    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audio Recorder</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleStartRecording} disabled={isRecording}>
            Start Recording
          </Button>
          <Button onClick={handlePauseResumeRecording} disabled={!isRecording}>
            {isPaused ? "Resume" : "Pause"}
          </Button>
          <Button onClick={handleStopRecording} disabled={!isRecording}>
            Stop Recording
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="system-audio"
            checked={recordSystemAudio}
            onCheckedChange={(checked) => setRecordSystemAudio(!!checked)}
          />
          <label htmlFor="system-audio">Record System Audio</label>
        </div>

        <div>
          <Select onValueChange={setOutputFormat} defaultValue={outputFormat}>
            <SelectTrigger>
              <SelectValue placeholder="Select output format" />
            </SelectTrigger>
            <SelectContent>
              {supportedMimeTypes.map((mimeType) => (
                <SelectItem key={mimeType} value={mimeType}>
                  {mimeType}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <canvas
          ref={canvasRef}
          className="w-full h-24 rounded-lg bg-muted"
        ></canvas>
        {audioURL && (
          <div className="flex flex-col gap-2">
            <audio src={audioURL} controls />
            <a
              href={audioURL}
              download={`recording.${outputFormat.split("/")[1]}`}
            >
              Download
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default csr(function AudioRecorderPage() {
  return (
    <div className="min-h-screen bg-secondary/30 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <BackLink />
        <AudioRecorder />
      </div>
    </div>
  );
});
