import { formatHtml, minifyHtml } from "./html-formatter";

describe("HTML Formatter", () => {
  describe("formatHtml", () => {
    it("should format simple HTML", () => {
      const input = "<div><h1>Title</h1><p>Text</p></div>";
      // Note: The formatter splits tags and content onto new lines with indentation.
      const expected = `<div>
  <h1>
    Title
  </h1>
  <p>
    Text
  </p>
</div>`;
      expect(formatHtml(input)).toBe(expected);
    });

    it("should handle void tags correctly", () => {
      const input = "<div><img src='test.jpg'><br></div>";
      const expected = `<div>
  <img src='test.jpg'>
  <br>
</div>`;
      expect(formatHtml(input)).toBe(expected);
    });
  });

  describe("minifyHtml", () => {
    it("should minify HTML", () => {
      const input = `
        <div>
          <h1>Title</h1>
        </div>
      `;
      const expected = "<div><h1>Title</h1></div>";
      expect(minifyHtml(input)).toBe(expected);
    });

    it("should remove comments", () => {
      const input = "<div><!-- comment --></div>";
      const expected = "<div></div>";
      expect(minifyHtml(input)).toBe(expected);
    });
  });
});
