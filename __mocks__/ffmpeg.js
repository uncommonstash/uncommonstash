module.exports = {
  FFmpeg: jest.fn().mockImplementation(() => ({
    load: jest.fn(),
    exec: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
  })),
};
