import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import UTMBuilderPage from "./utm-builder";

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(),
  },
});

// Mock gtag
jest.mock("@/lib/gtag", () => ({
  event: jest.fn(),
}));

// Mock use-debounce to return value immediately
jest.mock("use-debounce", () => ({
  useDebounce: (val: any) => [val],
}));

describe("UTMBuilderPage", () => {
  it("renders correctly", () => {
    render(<UTMBuilderPage ssr={true} />);
    expect(screen.getByText("UTM Builder")).toBeInTheDocument();
    expect(screen.getByLabelText("Website URL (required)")).toBeInTheDocument();
  });

  it("generates URL correctly", () => {
    render(<UTMBuilderPage ssr={true} />);

    const websiteInput = screen.getByLabelText("Website URL (required)");
    fireEvent.change(websiteInput, {
      target: { value: "https://example.com" },
    });

    const sourceInput = screen.getByLabelText("Campaign Source");
    fireEvent.change(sourceInput, { target: { value: "google" } });

    const mediumInput = screen.getByLabelText("Campaign Medium");
    fireEvent.change(mediumInput, { target: { value: "cpc" } });

    const campaignInput = screen.getByLabelText("Campaign Name");
    fireEvent.change(campaignInput, { target: { value: "summer_sale" } });

    // Check if the generated URL is displayed
    // It's inside a div, so getting by text might need exact match or regex
    // The div has class "break-all" and contains the URL text.
    // URL toString() might add trailing slash if path is empty.
    expect(
      screen.getByText(
        "https://example.com/?utm_source=google&utm_medium=cpc&utm_campaign=summer_sale",
      ),
    ).toBeInTheDocument();
  });

  it("adds protocol if missing", () => {
    render(<UTMBuilderPage ssr={true} />);

    const websiteInput = screen.getByLabelText("Website URL (required)");
    fireEvent.change(websiteInput, { target: { value: "example.com" } });

    // URL constructor adds trailing slash if path is empty for root
    expect(screen.getByText("https://example.com/")).toBeInTheDocument();
  });

  it("copies URL to clipboard", () => {
    render(<UTMBuilderPage ssr={true} />);

    const websiteInput = screen.getByLabelText("Website URL (required)");
    fireEvent.change(websiteInput, {
      target: { value: "https://example.com" },
    });

    const copyButton = screen.getByText("Copy URL");
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://example.com/",
    );
    // Wait for "Copied!" to appear? It appears immediately.
    // But button text changes.
    // screen.getByText("Copied!") matches the text content inside the button.
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });
});
