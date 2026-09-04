import { convertAudio, cutAudio, getFFmpeg, combineAudio } from "./ffmpeg";

jest.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: jest.fn().mockImplementation(() => ({
    load: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    exec: jest.fn().mockResolvedValue(undefined),
    readFile: jest
      .fn()
      .mockResolvedValue(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
  })),
}));

describe("ffmpeg", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should call ffmpeg.exec with the correct arguments for cutting", async () => {
    const file = new File([""], "test.mp3");
    await cutAudio(file, 5, 10);
    const ffmpeg = await getFFmpeg();
    expect(ffmpeg.exec).toHaveBeenCalledWith([
      "-i",
      "test.mp3",
      "-ss",
      "5",
      "-to",
      "10",
      "-c",
      "copy",
      "output.mp3",
    ]);
  });

  it("should call ffmpeg.exec with the correct arguments for converting", async () => {
    const file = new File([""], "test.mp3");
    await convertAudio(file, "wav");
    const ffmpeg = await getFFmpeg();
    expect(ffmpeg.exec).toHaveBeenCalledWith(["-i", "test.mp3", "output.wav"]);
  });

  it("should call ffmpeg.exec with the correct arguments for combining", async () => {
    const file1 = new File([""], "file1.mp3");
    const file2 = new File([""], "file2.mp3");
    await combineAudio([file1, file2]);
    const ffmpeg = await getFFmpeg();
    expect(ffmpeg.writeFile).toHaveBeenCalledWith(
      "concat_list.txt",
      `file 'input_0_mp3'
file 'input_1_mp3'`,
    );
    expect(ffmpeg.exec).toHaveBeenCalledWith([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "concat_list.txt",
      "output.mp3",
    ]);
  });
});
