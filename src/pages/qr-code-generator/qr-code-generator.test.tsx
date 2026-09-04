import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import QRCodeGeneratorPage from "./qr-code-generator";

const renderPage = (ui: React.ReactElement) =>
  render(<HelmetProvider>{ui}</HelmetProvider>);

// Mock @/components/ui to prevent module resolution errors in the test environment
jest.mock("@/components/ui/button", () => ({
  Button: (props: any) => <button {...props} />,
}));
jest.mock("@/components/ui/input", () => ({
  Input: (props: any) => (
    <input {...props} onChange={(e) => props.onChange?.(e.target.value)} />
  ),
}));
jest.mock("@/components/ui/label", () => ({
  Label: (props: any) => <label {...props} />,
}));
jest.mock("@/components/ui/slider", () => ({
  Slider: (props: any) => <div {...props} />,
}));

// Mock the components since we only need to verify if value is rendered/passed properly.
jest.mock("qrcode.react", () => ({
  QRCodeCanvas: ({ value }: { value: string }) => (
    <div data-testid="qrcode-canvas">{value}</div>
  ),
}));

describe("QRCodeGeneratorPage", () => {
  it("renders correctly and displays default text", () => {
    renderPage(<QRCodeGeneratorPage />);
    expect(screen.getByText("QR Code Generator")).toBeInTheDocument();
    expect(screen.getByTestId("qrcode-canvas")).toHaveTextContent(
      "https://leveled.com",
    );
  });

  it("updates QR code when input changes", () => {
    renderPage(<QRCodeGeneratorPage />);
    const input = screen.getByPlaceholderText("Enter URL or text");
    fireEvent.change(input, { target: { value: "https://example.com" } });
    expect(screen.getByTestId("qrcode-canvas")).toHaveTextContent(
      "https://example.com",
    );
  });

  it("shows empty state when input is empty", () => {
    renderPage(<QRCodeGeneratorPage />);
    const input = screen.getByPlaceholderText("Enter URL or text");
    fireEvent.change(input, { target: { value: "" } });
    expect(
      screen.getByText("Enter text or URL to generate QR code"),
    ).toBeInTheDocument();
  });
});
