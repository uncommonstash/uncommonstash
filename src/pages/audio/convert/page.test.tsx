import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as ffmpeg from "@/lib/ffmpeg";
import { AudioConverter } from "./audio-converter";

jest.mock("@/lib/ffmpeg", () => ({
  ...jest.requireActual("@/lib/ffmpeg"),
  convertAudio: jest.fn(),
}));

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => "blob:mock-url");
global.URL.revokeObjectURL = jest.fn();

describe("AudioConverterPage", () => {
  it("renders the page", () => {
    render(<AudioConverter />);
    expect(screen.getByText("Audio Converter")).toBeInTheDocument();
  });

  it("should show conversion options when a file is selected", async () => {
    render(<AudioConverter />);
    // The input is hidden inside the label "Add Audio"
    const fileInput = screen.getByLabelText("Add Audio");
    const file = new File([""], "test.mp3", { type: "audio/mpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByText("Output Format")).toBeInTheDocument();
    expect(screen.getByText("Convert All")).toBeInTheDocument();
  });

  it("should call convertAudio when the convert button is clicked", async () => {
    const convertAudioSpy = jest
      .spyOn(ffmpeg, "convertAudio")
      .mockResolvedValue(new Blob());
    render(<AudioConverter />);

    const fileInput = screen.getByLabelText("Add Audio");
    const file = new File(["dummy content"], "test.mp3", {
      type: "audio/mpeg",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const convertButton = screen.getByText("Convert All");
    fireEvent.click(convertButton);

    await waitFor(() => {
      expect(convertAudioSpy).toHaveBeenCalledWith(file, "mp3");
    });
  });
});
