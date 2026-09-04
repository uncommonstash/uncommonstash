import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AudioCombiner } from "./audio-combiner";

describe("AudioCombiner", () => {
  it("should render the component", () => {
    render(<AudioCombiner />);
    expect(screen.getByText("Audio Combiner")).toBeInTheDocument();
  });

  it("should disable the combine button when no files are selected", () => {
    render(<AudioCombiner />);
    const combineButton = screen.getByText("Combine Audio");
    expect(combineButton).toBeDisabled();
  });

  it("should enable the combine button when 2 or more files are selected", () => {
    render(<AudioCombiner />);
    const fileInput = screen.getByLabelText("Add Audio Files");
    const files = [new File([""], "file1.mp3"), new File([""], "file2.mp3")];
    fireEvent.change(fileInput, { target: { files } });
    const combineButton = screen.getByText("Combine Audio");
    expect(combineButton).toBeEnabled();
  });
});
