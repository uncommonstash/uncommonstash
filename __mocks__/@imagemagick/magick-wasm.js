module.exports = {
  initializeImageMagick: jest.fn().mockResolvedValue(undefined),
  ImageMagick: {
    read: jest.fn((_data, cb) => {
      if (typeof cb === "function") {
        cb({
          write: jest.fn((_format, wcb) => {
            if (typeof wcb === "function") wcb(new Uint8Array([1, 2, 3]));
          }),
        });
      }
    }),
  },
  MagickFormat: {
    Jpeg: "Jpeg",
    Png: "Png",
    WebP: "WebP",
    Avif: "Avif",
    Heic: "Heic",
    Gif: "Gif",
    Tiff: "Tiff",
    Bmp: "Bmp",
    Ico: "Ico",
    Psd: "Psd",
  },
  MagickGeometry: jest.fn(),
};
