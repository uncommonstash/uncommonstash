import { LockClosedIcon, LockOpen1Icon } from "@radix-ui/react-icons";
import { useState } from "react";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { csr } from "@/lib/compat";
import { decrypt, encrypt } from "./crypto-utils";

export default csr(function EncryptTextPage() {
  const [inputText, setInputText] = useState("");
  const [password, setPassword] = useState("");
  const [outputText, setOutputText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleEncrypt = async () => {
    setError(null);
    setOutputText("");
    if (!inputText) {
      setError("Please enter text to encrypt.");
      return;
    }
    if (!password) {
      setError("Please enter a secret key.");
      return;
    }

    try {
      const result = await encrypt(inputText, password);
      setOutputText(result);
    } catch (e) {
      console.error(e);
      setError("Encryption failed.");
    }
  };

  const handleDecrypt = async () => {
    setError(null);
    setOutputText("");
    if (!inputText) {
      setError("Please enter text to decrypt.");
      return;
    }
    if (!password) {
      setError("Please enter a secret key.");
      return;
    }

    try {
      const result = await decrypt(inputText, password);
      setOutputText(result);
    } catch (e) {
      console.error(e);
      setError("Decryption failed. Check your password or input text.");
    }
  };

  return (
    <div className="min-h-screen bg-secondary/30 flex items-center justify-center p-4 relative">
      <div className="absolute top-0 left-0 p-6 md:p-12">
        <BackLink />
      </div>
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Encrypt / Decrypt Text</CardTitle>
          <CardDescription>
            Securely encrypt and decrypt text using AES-GCM in your browser.
            Nothing is sent to the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="input-text"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Input Text
            </label>
            <Textarea
              id="input-text"
              placeholder="Enter text to encrypt or decrypt..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="min-h-[120px] font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Secret Key
            </label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your secret key"
              value={password}
              onChange={(val: string) => setPassword(val)}
            />
          </div>

          <div className="flex gap-4">
            <Button onClick={handleEncrypt} className="flex-1">
              <LockClosedIcon className="mr-2 h-4 w-4" /> Encrypt
            </Button>
            <Button
              onClick={handleDecrypt}
              variant="secondary"
              className="flex-1"
            >
              <LockOpen1Icon className="mr-2 h-4 w-4" /> Decrypt
            </Button>
          </div>

          {error && (
            <div className="text-destructive text-sm font-medium">{error}</div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="output-text"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Output Text
            </label>
            <Textarea
              id="output-text"
              readOnly
              placeholder="Result will appear here..."
              value={outputText}
              className="min-h-[120px] font-mono text-sm bg-muted"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
