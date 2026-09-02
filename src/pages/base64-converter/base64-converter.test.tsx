import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Base64Converter from "./base64-converter";

// Mock gtag
jest.mock("@/lib/gtag", () => ({
  event: jest.fn(),
}));

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn().mockResolvedValue(undefined),
  },
});

describe("Base64Converter", () => {
  it("renders correctly", () => {
    render(<Base64Converter ssr={true} />);
    expect(screen.getByText("Base64 Converter")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter plain text here...")).toBeInTheDocument();
  });

  it("encodes text to standard Base64", async () => {
    render(<Base64Converter ssr={true} />);
    const input = screen.getByPlaceholderText("Enter plain text here...");
    const output = screen.getByPlaceholderText("Result will appear here...");

    fireEvent.change(input, { target: { value: "Hello World" } });

    await waitFor(() => {
      expect(output).toHaveValue("SGVsbG8gV29ybGQ=");
    });
  });

  it("encodes text with UTF-8 correctly", async () => {
    render(<Base64Converter ssr={true} />);
    const input = screen.getByPlaceholderText("Enter plain text here...");
    const output = screen.getByPlaceholderText("Result will appear here...");

    fireEvent.change(input, { target: { value: "🚀 Conic" } });

    await waitFor(() => {
      expect(output).toHaveValue("8J+agCBDb25pYw==");
    });
  });

  it("encodes text to URL-safe Base64 without padding", async () => {
    render(<Base64Converter ssr={true} />);
    const input = screen.getByPlaceholderText("Enter plain text here...");
    const output = screen.getByPlaceholderText("Result will appear here...");

    // Switch to URL Safe - Radix Tabs trigger on click/pointerDown in some environments
    const urlSafeTab = screen.getByRole("tab", { name: /URL Safe/i });
    fireEvent.mouseDown(urlSafeTab);
    fireEvent.click(urlSafeTab);

    // Disable padding
    fireEvent.click(screen.getByLabelText("Padding (=)"));

    fireEvent.change(input, { target: { value: "Testing URL-safe variant with special characters >>" } });

    await waitFor(() => {
      expect(output).toHaveValue("VGVzdGluZyBVUkwtc2FmZSB2YXJpYW50IHdpdGggc3BlY2lhbCBjaGFyYWN0ZXJzID4-");
    });
  });

  it("decodes standard Base64 correctly", async () => {
    render(<Base64Converter ssr={true} />);
    // Switch to Decode mode
    const decodeTab = screen.getByRole("tab", { name: /Decode/i });
    fireEvent.mouseDown(decodeTab);
    fireEvent.click(decodeTab);

    const input = await screen.findByPlaceholderText("Enter Base64 string here...");
    const output = screen.getByPlaceholderText("Result will appear here...");

    fireEvent.change(input, { target: { value: "SGVsbG8gV29ybGQ=" } });

    await waitFor(() => {
      expect(output).toHaveValue("Hello World");
    });
  });

  it("decodes URL-safe Base64 without padding correctly", async () => {
    render(<Base64Converter ssr={true} />);
    // Switch to Decode mode
    const decodeTab = screen.getByRole("tab", { name: /Decode/i });
    fireEvent.mouseDown(decodeTab);
    fireEvent.click(decodeTab);
    // Switch to URL Safe
    const urlSafeTab = screen.getByRole("tab", { name: /URL Safe/i });
    fireEvent.mouseDown(urlSafeTab);
    fireEvent.click(urlSafeTab);

    const input = await screen.findByPlaceholderText("Enter Base64 string here...");
    const output = screen.getByPlaceholderText("Result will appear here...");

    // Without padding and using URL-safe chars
    fireEvent.change(input, { target: { value: "VGVzdGluZyBVUkwtc2FmZSB2YXJpYW50IHdpdGggc3BlY2lhbCBjaGFyYWN0ZXJzID4-" } });

    await waitFor(() => {
      expect(output).toHaveValue("Testing URL-safe variant with special characters >>");
    });
  });

  it("shows error for invalid Base64 input", async () => {
    render(<Base64Converter ssr={true} />);
    const decodeTab = screen.getByRole("tab", { name: /Decode/i });
    fireEvent.mouseDown(decodeTab);
    fireEvent.click(decodeTab);

    const input = await screen.findByPlaceholderText("Enter Base64 string here...");
    fireEvent.change(input, { target: { value: "!!!" } });

    await waitFor(() => {
      expect(screen.getByText("Invalid Base64 input.")).toBeInTheDocument();
    });
  });

  it("clears both fields", async () => {
    render(<Base64Converter ssr={true} />);
    const input = screen.getByPlaceholderText("Enter plain text here...");
    fireEvent.change(input, { target: { value: "Hello" } });

    await waitFor(() => {
        expect(screen.getByPlaceholderText("Result will appear here...")).toHaveValue("SGVsbG8=");
    });

    fireEvent.click(screen.getByTitle("Clear All"));

    expect(input).toHaveValue("");
    expect(screen.getByPlaceholderText("Result will appear here...")).toHaveValue("");
  });

  it("swaps input and output", async () => {
    render(<Base64Converter ssr={true} />);
    const input = screen.getByPlaceholderText("Enter plain text here...");
    fireEvent.change(input, { target: { value: "Hello" } });

    await waitFor(() => {
        expect(screen.getByPlaceholderText("Result will appear here...")).toHaveValue("SGVsbG8=");
    });

    fireEvent.click(screen.getByTitle("Swap Input/Output"));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Decode/i })).toHaveAttribute("data-state", "active");
    });
    expect(input).toHaveValue("SGVsbG8=");
    await waitFor(() => {
        expect(screen.getByPlaceholderText("Result will appear here...")).toHaveValue("Hello");
    });
  });
});
