import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EncryptTextPage from "./encrypt-text";
import { encrypt, decrypt } from "./crypto-utils";

// Mock crypto-utils
jest.mock("./crypto-utils", () => ({
  encrypt: jest.fn(),
  decrypt: jest.fn(),
}));

describe("EncryptTextPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders correctly", () => {
    render(<EncryptTextPage ssr={true} />);
    expect(screen.getByText("Encrypt / Decrypt Text")).toBeInTheDocument();
    expect(screen.getByLabelText("Input Text")).toBeInTheDocument();
    expect(screen.getByLabelText("Secret Key")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /encrypt/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /decrypt/i }),
    ).toBeInTheDocument();
  });

  it("handles encryption correctly", async () => {
    (encrypt as jest.Mock).mockResolvedValue("encrypted-string");

    render(<EncryptTextPage ssr={true} />);

    const input = screen.getByLabelText("Input Text");
    const password = screen.getByLabelText("Secret Key");
    const encryptBtn = screen.getByRole("button", { name: /encrypt/i });

    fireEvent.change(input, { target: { value: "secret message" } });
    fireEvent.change(password, { target: { value: "my-password" } });
    fireEvent.click(encryptBtn);

    await waitFor(() => {
      expect(encrypt).toHaveBeenCalledWith("secret message", "my-password");
      expect(screen.getByDisplayValue("encrypted-string")).toBeInTheDocument();
    });
  });

  it("handles decryption correctly", async () => {
    (decrypt as jest.Mock).mockResolvedValue("decrypted-string");

    render(<EncryptTextPage ssr={true} />);

    const input = screen.getByLabelText("Input Text");
    const password = screen.getByLabelText("Secret Key");
    const decryptBtn = screen.getByRole("button", { name: /decrypt/i });

    fireEvent.change(input, { target: { value: "encrypted-string" } });
    fireEvent.change(password, { target: { value: "my-password" } });
    fireEvent.click(decryptBtn);

    await waitFor(() => {
      expect(decrypt).toHaveBeenCalledWith("encrypted-string", "my-password");
      expect(screen.getByDisplayValue("decrypted-string")).toBeInTheDocument();
    });
  });

  it("shows error when fields are empty", async () => {
    render(<EncryptTextPage ssr={true} />);

    const encryptBtn = screen.getByRole("button", { name: /encrypt/i });
    fireEvent.click(encryptBtn);

    expect(
      screen.getByText("Please enter text to encrypt."),
    ).toBeInTheDocument();
  });
});
