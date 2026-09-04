import { act, fireEvent, render, screen } from "@testing-library/react";
import { AudioRecorder } from "./audio-recorder";

// Mock MediaRecorder and related APIs
let mediaRecorderInstance: {
  start: jest.Mock;
  stop: jest.Mock;
  pause: jest.Mock;
  resume: jest.Mock;
  ondataavailable: (event: Partial<BlobEvent>) => void;
  onstop: () => void;
  stream: { getTracks: jest.Mock };
};

const mockMediaRecorder = jest.fn(() => {
  mediaRecorderInstance = {
    start: jest.fn(),
    stop: jest.fn(() => {
      if (mediaRecorderInstance.onstop) {
        mediaRecorderInstance.onstop();
      }
    }),
    pause: jest.fn(),
    resume: jest.fn(),
    ondataavailable: () => {},
    onstop: () => {},
    stream: {
      getTracks: jest.fn(() => [{ stop: jest.fn() }]),
    },
  };
  return mediaRecorderInstance;
});
(global as unknown as { MediaRecorder: unknown }).MediaRecorder =
  mockMediaRecorder;
(
  global as { MediaRecorder: { isTypeSupported: unknown } }
).MediaRecorder.isTypeSupported = jest.fn(() => true);

(global.navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
  ...global.navigator.mediaDevices,
  getUserMedia: jest.fn().mockResolvedValue({}),
  getDisplayMedia: jest.fn().mockResolvedValue({ getAudioTracks: () => [{}] }),
};

global.URL.createObjectURL = jest.fn(() => "mock-url");

// Mock AudioContext and related APIs
const mockAnalyser = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  getByteTimeDomainData: jest.fn(),
  fftSize: 256,
  frequencyBinCount: 128,
};

const mockAudioContext = {
  createMediaStreamSource: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
  createAnalyser: jest.fn(() => mockAnalyser),
  createMediaStreamDestination: jest.fn(() => ({ stream: {} })),
  close: jest.fn(),
};

(global as unknown as { AudioContext: unknown }).AudioContext = jest.fn(
  () => mockAudioContext,
);

describe("AudioRecorder", () => {
  it("renders the audio recorder component", () => {
    act(() => {
      render(<AudioRecorder />);
    });
    expect(screen.getByText("Audio Recorder")).toBeInTheDocument();
  });

  it("starts and stops recording", async () => {
    act(() => {
      render(<AudioRecorder />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Start Recording"));
    });

    expect(mediaRecorderInstance.start).toHaveBeenCalled();

    act(() => {
      fireEvent.click(screen.getByText("Stop Recording"));
    });

    expect(mediaRecorderInstance.stop).toHaveBeenCalled();
  });

  it("pauses and resumes recording", async () => {
    act(() => {
      render(<AudioRecorder />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Start Recording"));
    });

    act(() => {
      fireEvent.click(screen.getByText("Pause"));
    });
    expect(mediaRecorderInstance.pause).toHaveBeenCalled();

    act(() => {
      fireEvent.click(screen.getByText("Resume"));
    });
    expect(mediaRecorderInstance.resume).toHaveBeenCalled();
  });

  it("creates a download link for the recorded audio", async () => {
    act(() => {
      render(<AudioRecorder />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Start Recording"));
    });

    act(() => {
      mediaRecorderInstance.ondataavailable({ data: new Blob(["audio"]) });
      fireEvent.click(screen.getByText("Stop Recording"));
    });

    expect(screen.getByText("Download")).toBeInTheDocument();
    const downloadLink = screen.getByRole("link", { name: /download/i });
    expect(downloadLink).toHaveAttribute("href", "mock-url");
    expect(downloadLink).toHaveAttribute("download", "recording.webm");
  });

  it("records system audio when the checkbox is checked", async () => {
    act(() => {
      render(<AudioRecorder />);
    });

    act(() => {
      fireEvent.click(screen.getByLabelText("Record System Audio"));
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Start Recording"));
    });

    expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled();
  });
});
