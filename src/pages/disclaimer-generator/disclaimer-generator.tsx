import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { csr } from "@/lib/compat";
import AppBar from "@/components/app-bar";
import { Check, Copy } from "lucide-react";

export default csr(function DisclaimerGeneratorPage() {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [generatedText, setGeneratedText] = useState("");
  const [copied, setCopied] = useState(false);

  const toggleType = (type: string) => {
    const newTypes = new Set(selectedTypes);
    if (newTypes.has(type)) {
      newTypes.delete(type);
    } else {
      newTypes.add(type);
    }
    setSelectedTypes(newTypes);
  };

  const generateDisclaimer = () => {
    let text = `# Disclaimer for ${companyName || "[Company Name]"}\n\n`;
    text += `If you require any more information or have any questions about our site's disclaimer, please feel free to contact us by email at ${email || "[Email Address]"}.\n\n`;

    if (selectedTypes.has("Affiliate Links")) {
      text += `## Affiliate Disclaimer\n\n`;
      text += `Some of the links on this website are affiliate links, meaning that we may earn a commission if you click on the link or make a purchase using the link. When you make a purchase, the price you pay will be the same whether you use the affiliate link or go directly to the vendor's website using a non-affiliate link. By using the affiliate links, you are helping support the ${companyName || "[Company Name]"} website, and we genuinely appreciate your support.\n\n`;
    }

    if (selectedTypes.has("Professional Advice (Medical/Legal)")) {
      text += `## Professional Advice Disclaimer\n\n`;
      text += `The information provided on ${url || "[Website URL]"} is for general informational purposes only. All information on the site is provided in good faith, however we make no representation or warranty of any kind, express or implied, regarding the accuracy, adequacy, validity, reliability, availability, or completeness of any information on the site.\n\n`;
      text += `Under no circumstance shall we have any liability to you for any loss or damage of any kind incurred as a result of the use of the site or reliance on any information provided on the site. Your use of the site and your reliance on any information on the site is solely at your own risk.\n\n`;
      text += `This disclaimer was generated for ${companyName || "[Company Name]"}.\n\n`;
    }

    if (selectedTypes.has("Testimonials")) {
      text += `## Testimonials Disclaimer\n\n`;
      text += `The site may contain testimonials by users of our products and/or services. These testimonials reflect the real-life experiences and opinions of such users. However, the experiences are personal to those particular users, and may not necessarily be representative of all users of our products and/or services. We do not claim, and you should not assume, that all users will have the same experiences. Your individual results may vary.\n\n`;
    }

    if (selectedTypes.has("Errors and Omissions")) {
      text += `## Errors and Omissions Disclaimer\n\n`;
      text += `While we have made every attempt to ensure that the information contained in this site has been obtained from reliable sources, ${companyName || "[Company Name]"} is not responsible for any errors or omissions, or for the results obtained from the use of this information. All information in this site is provided "as is", with no guarantee of completeness, accuracy, timeliness or of the results obtained from the use of this information, and without warranty of any kind, express or implied, including, but not limited to warranties of performance, merchantability and fitness for a particular purpose.\n\n`;
    }

    setGeneratedText(text);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-secondary/30 flex flex-col">
      <AppBar />
      <div className="flex-1 container mx-auto p-4 md:p-8">
        <h1 className="text-3xl font-bold mb-8 text-center md:text-left">
          Disclaimer Generator
        </h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
          {/* Form */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>
                Enter your details to generate a custom disclaimer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="companyName">Company/Site Name</Label>
                <Input
                  id="companyName"
                  placeholder="e.g. Acme Corp"
                  value={companyName}
                  onChange={setCompanyName}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Contact Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="e.g. contact@example.com"
                  value={email}
                  onChange={setEmail}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="url">Website URL</Label>
                <Input
                  id="url"
                  placeholder="e.g. https://example.com"
                  value={url}
                  onChange={setUrl}
                />
              </div>
              <div className="space-y-2">
                <Label>Disclaimer Types</Label>
                <div className="grid gap-2">
                  {[
                    "Affiliate Links",
                    "Professional Advice (Medical/Legal)",
                    "Testimonials",
                    "Errors and Omissions",
                  ].map((type) => {
                    const id = type
                      .replace(/\s+/g, "-")
                      .replace(/[^a-zA-Z0-9-]/g, "")
                      .toLowerCase();
                    return (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={id}
                          checked={selectedTypes.has(type)}
                          onCheckedChange={() => toggleType(type)}
                        />
                        <label
                          htmlFor={id}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {type}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={generateDisclaimer} className="w-full">
                Generate Disclaimer
              </Button>
            </CardFooter>
          </Card>

          {/* Output */}
          <Card className="flex flex-col h-full">
            <CardHeader>
              <CardTitle>Generated Disclaimer</CardTitle>
              <CardDescription>
                Copy and paste this into your website.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-[300px]">
              <Textarea
                className="w-full h-full resize-none font-mono text-sm"
                placeholder="Your generated disclaimer will appear here..."
                value={generatedText}
                readOnly
              />
            </CardContent>
            <CardFooter>
              <Button
                onClick={copyToClipboard}
                className="w-full"
                variant="outline"
                disabled={!generatedText}
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" /> Copy to Clipboard
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
});
