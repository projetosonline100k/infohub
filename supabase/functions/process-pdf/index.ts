import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileUrl, fileName } = await req.json();
    
    console.log("Processing file:", fileName, "from URL:", fileUrl);

    if (!fileUrl) {
      throw new Error("File URL is required");
    }

    // Fetch the file
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error("Failed to fetch file");
    }

    const contentType = fileResponse.headers.get("content-type") || "";
    let content = "";

    if (contentType.includes("text/plain") || fileName.endsWith(".txt") || fileName.endsWith(".md")) {
      // Plain text files
      content = await fileResponse.text();
    } else if (contentType.includes("application/pdf")) {
      // For PDFs, we'll use a simple approach - just note that it's a PDF
      // Full PDF parsing would require additional libraries
      // For now, return a placeholder that the user can see the file was uploaded
      const arrayBuffer = await fileResponse.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      // Try to extract some text from PDF (basic extraction)
      // This is a simplified approach - for production, use a proper PDF library
      let extractedText = "";
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      
      // Look for text streams in PDF
      const streamRegex = /stream\s*\n([\s\S]*?)\nendstream/g;
      let match;
      while ((match = streamRegex.exec(text)) !== null) {
        const streamContent = match[1];
        // Filter readable ASCII characters
        const readable = streamContent.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
        if (readable.length > 20) {
          extractedText += readable + "\n";
        }
      }
      
      if (extractedText.length > 100) {
        content = extractedText.slice(0, 50000); // Limit to 50k chars
      } else {
        // Fallback: try to find any readable text
        const readableText = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
        // Find segments that look like sentences
        const sentences = readableText.match(/[A-Z][^.!?]*[.!?]/g) || [];
        content = sentences.slice(0, 500).join(' ');
        
        if (content.length < 100) {
          content = `[PDF importado: ${fileName}]\n\nO conteúdo do PDF foi carregado mas a extração de texto foi limitada. Use este documento como referência.`;
        }
      }
    } else {
      content = await fileResponse.text();
    }

    console.log("Extracted content length:", content.length);

    return new Response(
      JSON.stringify({ content, length: content.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Process PDF error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        content: "[Erro ao processar documento]"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
