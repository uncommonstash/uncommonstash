import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ImageConvertPage from "./image-convert";
import { ImageMagick, initializeImageMagick } from "@imagemagick/magick-wasm";

jest.mock("@imagemagick/magick-wasm");

describe("ImageConvertPage", () => {
  beforeEach(() => {
    // Reset mocks before each test
    (initializeImageMagick as jest.Mock).mockClear();
    (ImageMagick.read as jest.Mock).mockClear();
  });

  it("renders the component", () => {
    render(<ImageConvertPage ssr={true} />);
    expect(screen.getByText("Image Converter")).toBeInTheDocument();
  });

  it("initializes ImageMagick on mount", () => {
    render(<ImageConvertPage ssr={true} />);
    expect(initializeImageMagick).toHaveBeenCalledTimes(1);
  });

  it("enables the convert button when a file is selected", () => {
    render(<ImageConvertPage ssr={true} />);
    const fileInput = screen.getByRole("button", { name: "Convert All" });
    expect(fileInput).toBeDisabled();

    const file = new File(["(⌐□_□)"], "chucknorris.png", { type: "image/png" });
    const inputFile = screen.getByLabelText("Add Image");
    fireEvent.change(inputFile, { target: { files: [file] } });

    expect(fileInput).toBeEnabled();
  });

  it("calls the conversion function when the convert button is clicked", async () => {
    render(<ImageConvertPage ssr={true} />);
    const file = new File(["(⌐□_□)"], "chucknorris.png", { type: "image/png" });
    const inputFile = screen.getByLabelText("Add Image");
    fireEvent.change(inputFile, { target: { files: [file] } });

    const convertButton = screen.getByRole("button", { name: "Convert All" });
    fireEvent.click(convertButton);

    await waitFor(() => {
      expect(ImageMagick.read).toHaveBeenCalledTimes(1);
    });
  });
});
