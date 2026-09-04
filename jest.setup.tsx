import type React from "react";
import "@testing-library/jest-dom";
import "jest-canvas-mock";
import { TextDecoder, TextEncoder } from "util";

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as never;

global.AudioContext = jest.fn().mockImplementation(() => ({
  createMediaStreamSource: jest.fn().mockReturnValue({
    connect: jest.fn(),
  }),
  createAnalyser: jest.fn().mockReturnValue({
    connect: jest.fn(),
    fftSize: 2048,
    frequencyBinCount: 1024,
    getByteTimeDomainData: jest.fn(),
  }),
  createMediaStreamDestination: jest.fn().mockReturnValue({
    stream: {
      getAudioTracks: jest.fn().mockReturnValue([]),
    },
  }),
  resume: jest.fn(),
  close: jest.fn(),
  suspend: jest.fn(),
}));

jest.mock("@radix-ui/react-slider", () => {
  const Slider = ({
    children,
    value,
    ...props
  }: {
    children?: React.ReactNode;
    value?: number[];
  }) => (
    <div {...props}>
      {children}
      {value &&
        value
          .map((v, position) => ({
            key: `mock-thumb-${position}`,
            value: v,
          }))
          .map((thumb) => (
            <div key={thumb.key} role="slider" aria-valuenow={thumb.value} />
          ))}
    </div>
  );
  return {
    Root: Slider,
    Track: Slider,
    Range: Slider,
    Thumb: (props: Record<string, unknown>) => <div {...props} />,
  };
});

jest.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: jest.fn().mockImplementation(() => ({
    load: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    exec: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  })),
}));

jest.mock("@ffmpeg/util", () => ({
  fetchFile: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));

jest.mock("@imagemagick/magick-wasm");

jest.mock("@/lib/gtag", () => ({
  GA_TRACKING_ID: "G-TEST",
  pageview: jest.fn(),
  event: jest.fn(),
}));

// react-router Link requires Router context; render as plain anchor in unit tests.
// (Integration tests that need routing wrap with MemoryRouter explicitly.)
jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  const ReactActual = jest.requireActual("react");
  void ReactActual;
  return {
    ...actual,
    Link: ({
      to,
      children,
      ...rest
    }: {
      to: string;
      children?: React.ReactNode;
    }) => (
      <a href={typeof to === "string" ? to : "#"} {...rest}>
        {children}
      </a>
    ),
  };
});

window.URL.createObjectURL = jest.fn();
window.URL.revokeObjectURL = jest.fn();

Object.defineProperty(File.prototype, "arrayBuffer", {
  writable: true,
  value: jest.fn(function (this: File) {
    return Promise.resolve(new ArrayBuffer(1));
  }),
});
