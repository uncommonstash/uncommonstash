import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import AudioCutter from "./audio-cutter";
import * as ffmpeg from "@/lib/ffmpeg";

// Mock the cutAudio function
jest.mock("@/lib/ffmpeg", () => ({
  cutAudio: jest.fn(async () => new Blob(["cut-audio"])),
}));

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => "mock-url");

// Mock HTMLMediaElement
Object.defineProperty(window.HTMLMediaElement.prototype, "duration", {
  writable: true,
  value: 120,
});
Object.defineProperty(window.HTMLMediaElement.prototype, "onloadedmetadata", {
  set(callback) {
    if (callback) {
      callback();
    }
  },
});

describe("AudioCutter", () => {
  it("renders without crashing", async () => {
    render(<AudioCutter ssr={true} />);
    expect(await screen.findByText("Audio Cutter")).toBeInTheDocument();
  });

  it("handles file upload and displays the cutter controls", async () => {
    render(<AudioCutter ssr={true} />);

    const file = new File(["dummy-audio"], "test.mp3", { type: "audio/mp3" });
    // The new label text in FileSelector is "Click to upload audio"
    const input = screen.getByLabelText(/click to upload audio/i);

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("Cut Audio")).toBeInTheDocument();
    expect(await screen.findByText(/Start: 0.00s/)).toBeInTheDocument();
    expect(await screen.findByText(/End: 120.00s/)).toBeInTheDocument();
  });

  it("calls cutAudio and creates a download link", async () => {
    render(<AudioCutter ssr={true} />);

    const file = new File(["dummy-audio"], "test.mp3", { type: "audio/mp3" });
    const input = screen.getByLabelText(/click to upload audio/i);

    fireEvent.change(input, { target: { files: [file] } });

    await act(async () => {
      fireEvent.click(await screen.findByText("Cut Audio"));
    });

    await waitFor(() => {
      expect(ffmpeg.cutAudio).toHaveBeenCalledWith(file, 0, 120);
    });

    // In the new UI, the download link is inside a button with text "Download"
    // And it might take a moment to appear in the result list
    await waitFor(async () => {
      const downloadLink = await screen.findByRole("link", {
        name: /download/i,
      });
      expect(downloadLink).toHaveAttribute("href", "mock-url");
      // The filename is dynamically generated in the new component
      expect(downloadLink).toHaveAttribute("download", expect.stringContaining("test.mp3"));
    });
  });
});
