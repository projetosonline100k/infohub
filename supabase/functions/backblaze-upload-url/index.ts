import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const keyId = Deno.env.get("B2_KEY_ID");
    const applicationKey = Deno.env.get("B2_APPLICATION_KEY");
    const bucket = Deno.env.get("B2_BUCKET_NAME");
    const endpoint = Deno.env.get("B2_ENDPOINT");
    const region = Deno.env.get("B2_REGION");

    if (!keyId || !applicationKey || !bucket || !endpoint || !region) {
      return json({ error: "Integração Backblaze não configurada no servidor" }, 500);
    }

    const { videoId, clienteId, platform, fileKind = "original", fileName, contentType, fileSize } = await req.json();
    if (!videoId || !clienteId || !["vertical", "youtube"].includes(platform)) {
      return json({ error: "Dados do vídeo inválidos" }, 400);
    }
    if (!["original", "editado"].includes(fileKind)) {
      return json({ error: "Tipo de arquivo inválido" }, 400);
    }
    if (!fileName || !contentType?.startsWith("video/")) {
      return json({ error: "Selecione um arquivo de vídeo válido" }, 400);
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > 5 * 1024 ** 3) {
      return json({ error: "O vídeo deve ter no máximo 5 GB" }, 400);
    }

    const extension = fileName.includes(".")
      ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase().replace(/[^a-z0-9.]/g, "")
      : "";
    const objectKey = `videos/${clienteId}/${platform}/${videoId}/${fileKind}/${crypto.randomUUID()}${extension}`;

    const client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId: keyId, secretAccessKey: applicationKey },
    });
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: fileSize,
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 15 * 60 });
    const publicBaseUrl = Deno.env.get("B2_PUBLIC_BASE_URL")?.replace(/\/$/, "");
    const fileUrl = publicBaseUrl
      ? `${publicBaseUrl}/${objectKey}`
      : `${endpoint.replace(/\/$/, "")}/${bucket}/${objectKey}`;

    return json({ uploadUrl, objectKey, fileUrl });
  } catch (error) {
    console.error("Erro ao assinar upload Backblaze:", error);
    return json({ error: "Não foi possível preparar o upload" }, 500);
  }
});
