import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as ffmpeg from "@/lib/ffmpeg";
import { VideoConverter } from "./video-converter";

jest.mock("@/lib/ffmpeg", () => ({
  ...jest.requireActual("@/lib/ffmpeg"),
  convertVideo: jest.fn(),
}));

describe("VideoConverter error state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a friendly message when the engine runs out of memory", async () => {
    jest
      .spyOn(ffmpeg, "convertVideo")
      .mockRejectedValue(
        new Error(
          "RuntimeError: Out of bounds memory access (evaluating 'Module[\"_ffmpeg\"]')",
        ),
      );
    const { container } = render(<VideoConverter />);
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["dummy"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText("Convert All"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/ran out of memory/i);
  });

  it("clears the error when a new conversion starts", async () => {
    const convertSpy = jest
      .spyOn(ffmpeg, "convertVideo")
      .mockRejectedValueOnce(new Error("Out of bounds memory access"))
      .mockResolvedValueOnce({
        url: "blob:mock",
        name: "clip-converted.mp4",
      });
    const { container } = render(<VideoConverter />);
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["dummy"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByText("Convert All"));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByText("Convert All"));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(convertSpy).toHaveBeenCalledTimes(2);
  });
});
