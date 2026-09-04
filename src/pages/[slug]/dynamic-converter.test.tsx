import React from "react";
import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import DynamicConverterClient from "../DynamicConverter";

// Mock dependencies
jest.mock("@imagemagick/magick-wasm");
jest.mock("@/components/image-converter", () => ({
  ImageConverter: ({ title }: { title: string }) => (
    <div>ImageConverter: {title}</div>
  ),
}));
jest.mock("@/pages/audio/convert/audio-converter", () => ({
  AudioConverter: ({ title }: { title: string }) => (
    <div>AudioConverter: {title}</div>
  ),
}));

function renderAtSlug(slug: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/${slug}`]}>
        <Routes>
          <Route path="/:slug" element={<DynamicConverterClient />} />
          <Route path="/404" element={<div>Not Found</div>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("Dynamic Converter Page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders ImageConverter for valid image permutation", async () => {
    renderAtSlug("webp-to-avif");
    expect(
      await screen.findByText("ImageConverter: Convert WEBP to AVIF"),
    ).toBeInTheDocument();
  });

  it("renders AudioConverter for valid audio permutation", async () => {
    renderAtSlug("mp3-to-ogg");
    expect(
      await screen.findByText("AudioConverter: Convert MP3 to OGG"),
    ).toBeInTheDocument();
  });

  it("serves retired alias routes with JPEG/PNG presets", async () => {
    renderAtSlug("jpeg-to-png");
    expect(
      await screen.findByText("ImageConverter: Convert JPEG to PNG"),
    ).toBeInTheDocument();
  });

  it("navigates to 404 for invalid slug format", async () => {
    renderAtSlug("invalid-slug");
    expect(await screen.findByText("Not Found")).toBeInTheDocument();
  });

  it("navigates to 404 for unknown formats", async () => {
    renderAtSlug("foo-to-bar");
    expect(await screen.findByText("Not Found")).toBeInTheDocument();
  });

  it("navigates to 404 for mixed audio/image formats", async () => {
    renderAtSlug("mp3-to-png");
    expect(await screen.findByText("Not Found")).toBeInTheDocument();
  });
});
