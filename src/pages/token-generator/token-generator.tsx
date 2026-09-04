import { Check, Copy, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BackLink } from "@/components/back-link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { csr } from "@/lib/compat";
import * as gtag from "@/lib/gtag";

export default csr(function TokenGenerator() {
  const [activeTab, setActiveTab] = useState("password");

  // Password State
  const [passwordLength, setPasswordLength] = useState(16);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [generatedPassword, setGeneratedPassword] = useState("");

  // UUID State
  const [uuidQuantity, setUuidQuantity] = useState(1);
  const [generatedUUIDs, setGeneratedUUIDs] = useState<string[]>([]);

  // Base64 State
  const [base64Mode, setBase64Mode] = useState<"encode" | "decode">("encode");
  const [base64Input, setBase64Input] = useState("");
  const [base64Output, setBase64Output] = useState("");

  // Copy Feedback State
  const [copiedState, setCopiedState] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedState(id);
    setTimeout(() => setCopiedState(null), 2000);
    gtag.event({
      action: "copy",
      category: "engagement",
      label: activeTab,
      value: 1,
    });
  };

  const generatePassword = useCallback(() => {
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

    let charset = "";
    if (includeUppercase) charset += uppercase;
    if (includeLowercase) charset += lowercase;
    if (includeNumbers) charset += numbers;
    if (includeSymbols) charset += symbols;

    if (charset === "") {
      setGeneratedPassword("");
      return;
    }

    let password = "";
    const values = new Uint32Array(passwordLength);
    crypto.getRandomValues(values);

    for (let i = 0; i < passwordLength; i++) {
      password += charset[values[i] % charset.length];
    }

    setGeneratedPassword(password);
    gtag.event({
      action: "generate",
      category: "engagement",
      label: "password",
      value: 1,
    });
  }, [
    passwordLength,
    includeUppercase,
    includeLowercase,
    includeNumbers,
    includeSymbols,
  ]);

  const generateUUIDs = useCallback(() => {
    const uuids: string[] = [];
    for (let i = 0; i < uuidQuantity; i++) {
      uuids.push(crypto.randomUUID());
    }
    setGeneratedUUIDs(uuids);
    gtag.event({
      action: "generate",
      category: "engagement",
      label: "uuid",
      value: uuidQuantity,
    });
  }, [uuidQuantity]);

  useEffect(() => {
    if (activeTab === "password" && !generatedPassword) {
      generatePassword();
    } else if (activeTab === "uuid" && generatedUUIDs.length === 0) {
      generateUUIDs();
    }
  }, [
    activeTab,
    generatedPassword,
    generatedUUIDs.length,
    generatePassword,
    generateUUIDs,
  ]);

  useEffect(() => {
    if (base64Mode === "encode") {
      try {
        setBase64Output(btoa(base64Input));
      } catch (_e) {
        setBase64Output("Error: Invalid input for Base64 encoding");
      }
    } else {
      try {
        setBase64Output(atob(base64Input));
      } catch (_e) {
        setBase64Output("Error: Invalid Base64 string");
      }
    }
  }, [base64Input, base64Mode]);

  return (
    <div className="min-h-screen bg-secondary/30 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <BackLink />
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center">
              Token Generator
            </CardTitle>
            <CardDescription className="text-center text-lg mt-2">
              Generate secure random passwords, UUIDs, and Base64 strings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              defaultValue="password"
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3 mb-8">
                <TabsTrigger value="password">Password</TabsTrigger>
                <TabsTrigger value="uuid">UUID</TabsTrigger>
                <TabsTrigger value="base64">Base64</TabsTrigger>
              </TabsList>

              {/* Password Mode */}
              <TabsContent value="password" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="length" className="text-base">
                        Length: {passwordLength}
                      </Label>
                      <Input
                        id="length"
                        type="number"
                        min={4}
                        max={128}
                        value={passwordLength}
                        onChange={(val) => setPasswordLength(Number(val))}
                        className="mt-2"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label className="text-base">Character Types</Label>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="uppercase"
                          checked={includeUppercase}
                          onCheckedChange={(c) => setIncludeUppercase(!!c)}
                        />
                        <Label htmlFor="uppercase">Uppercase (A-Z)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="lowercase"
                          checked={includeLowercase}
                          onCheckedChange={(c) => setIncludeLowercase(!!c)}
                        />
                        <Label htmlFor="lowercase">Lowercase (a-z)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="numbers"
                          checked={includeNumbers}
                          onCheckedChange={(c) => setIncludeNumbers(!!c)}
                        />
                        <Label htmlFor="numbers">Numbers (0-9)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="symbols"
                          checked={includeSymbols}
                          onCheckedChange={(c) => setIncludeSymbols(!!c)}
                        />
                        <Label htmlFor="symbols">Symbols (!@#$)</Label>
                      </div>
                    </div>
                    <Button onClick={generatePassword} className="w-full mt-4">
                      <RefreshCw className="mr-2 h-4 w-4" /> Generate Password
                    </Button>
                  </div>
                  <div className="flex flex-col justify-center space-y-4">
                    <Label className="text-base">Generated Password</Label>
                    <div className="relative">
                      <Textarea
                        readOnly
                        value={generatedPassword}
                        className="min-h-[120px] font-mono text-lg resize-none p-4"
                      />
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={() =>
                          handleCopy(generatedPassword, "password")
                        }
                        disabled={!generatedPassword}
                      >
                        {copiedState === "password" ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* UUID Mode */}
              <TabsContent value="uuid" className="space-y-6">
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <Label htmlFor="quantity" className="text-base">
                      Quantity (Max 100)
                    </Label>
                    <Input
                      id="quantity"
                      type="number"
                      min={1}
                      max={100}
                      value={uuidQuantity}
                      onChange={(val) =>
                        setUuidQuantity(Math.min(100, Math.max(1, Number(val))))
                      }
                      className="mt-2"
                    />
                  </div>
                  <Button onClick={generateUUIDs} className="mb-0.5">
                    <RefreshCw className="mr-2 h-4 w-4" /> Generate UUIDs
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-base">Generated UUIDs</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleCopy(generatedUUIDs.join("\n"), "uuids-all")
                      }
                      disabled={generatedUUIDs.length === 0}
                    >
                      {copiedState === "uuids-all" ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      Copy All
                    </Button>
                  </div>
                  <div className="border rounded-md divide-y max-h-[400px] overflow-y-auto bg-card">
                    {generatedUUIDs.map((uuid) => (
                      <div
                        key={uuid}
                        className="flex items-center justify-between p-3 group hover:bg-muted/50 transition-colors"
                      >
                        <code className="font-mono text-sm">{uuid}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleCopy(uuid, uuid)}
                        >
                          {copiedState === uuid ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                    {generatedUUIDs.length === 0 && (
                      <div className="p-8 text-center text-muted-foreground">
                        Click Generate to create UUIDs
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Base64 Mode */}
              <TabsContent value="base64" className="space-y-6">
                <div className="flex justify-center mb-6">
                  <div className="bg-muted p-1 rounded-lg inline-flex">
                    <Button
                      variant={base64Mode === "encode" ? "default" : "ghost"}
                      onClick={() => setBase64Mode("encode")}
                      size="sm"
                    >
                      Encode
                    </Button>
                    <Button
                      variant={base64Mode === "decode" ? "default" : "ghost"}
                      onClick={() => setBase64Mode("decode")}
                      size="sm"
                    >
                      Decode
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>
                      Input ({base64Mode === "encode" ? "Plain Text" : "Base64"}
                      )
                    </Label>
                    <Textarea
                      value={base64Input}
                      onChange={(e) => setBase64Input(e.target.value)}
                      placeholder={
                        base64Mode === "encode"
                          ? "Type text to encode..."
                          : "Paste Base64 to decode..."
                      }
                      className="min-h-[200px] font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>
                        Output (
                        {base64Mode === "encode" ? "Base64" : "Plain Text"})
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleCopy(base64Output, "base64-output")
                        }
                        disabled={!base64Output}
                      >
                        {copiedState === "base64-output" ? (
                          <Check className="mr-2 h-4 w-4" />
                        ) : (
                          <Copy className="mr-2 h-4 w-4" />
                        )}
                        Copy
                      </Button>
                    </div>
                    <Textarea
                      readOnly
                      value={base64Output}
                      className="min-h-[200px] font-mono bg-muted/30"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
