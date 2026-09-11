import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WindsorRow = Record<string, unknown>;

const numberValue = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const stringValue = (value: unknown) => typeof value === "string" ? value : "";

const rowsFrom = (payload: unknown): WindsorRow[] => {
  if (Array.isArray(payload)) return payload as WindsorRow[];
  if (payload && typeof payload === "object") {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) return data as WindsorRow[];
  }
  return [];
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("WINDSOR_API_KEY");
    if (!apiKey) throw new Error("A chave da integração Windsor.ai não está configurada.");

    const accountId = Deno.env.get("WINDSOR_INSTAGRAM_ACCOUNT_ID");
    const endpoint = new URL("https://connectors.windsor.ai/instagram");
    endpoint.searchParams.set("api_key", apiKey);
    endpoint.searchParams.set("date_preset", "last_90d");
    endpoint.searchParams.set("_renderer", "json");
    endpoint.searchParams.set(
      "fields",
      [
        "date", "account_id", "account_name", "followers_count",
        "media_id", "media_type", "media_url", "media_caption", "media_timestamp",
        "media_like_count", "media_comments_count", "media_impressions", "media_reach", "media_engagement",
        "audience_gender_age", "audience_gender_age_related",
        "audience_city", "audience_city_related", "audience_country", "audience_country_related",
        "online_followers", "hour",
      ].join(",")
    );
    if (accountId) endpoint.searchParams.set("filter", JSON.stringify([["account_id", "eq", accountId]]));

    const response = await fetch(endpoint, { headers: { "User-Agent": "InfoproHub/1.0" } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "Não foi possível consultar a Windsor.ai.";
      throw new Error(message);
    }

    const rows = rowsFrom(payload);
    const followers = Math.max(...rows.map((row) => numberValue(row.followers_count)), 0);
    const datedFollowers = new Map<string, number>();
    rows.forEach((row) => {
      const date = stringValue(row.date);
      if (date && numberValue(row.followers_count) > 0) datedFollowers.set(date, numberValue(row.followers_count));
    });
    const followerHistory = [...datedFollowers.entries()].sort(([a], [b]) => a.localeCompare(b));
    const initialFollowers = followerHistory[0]?.[1] ?? followers;

    const media = rows
      .filter((row) => stringValue(row.media_id))
      .map((row) => ({
        id: stringValue(row.media_id),
        type: stringValue(row.media_type),
        url: stringValue(row.media_url),
        caption: stringValue(row.media_caption),
        timestamp: stringValue(row.media_timestamp) || stringValue(row.date),
        views: numberValue(row.media_impressions),
        reach: numberValue(row.media_reach),
        engagement: numberValue(row.media_engagement),
        likes: numberValue(row.media_like_count),
        comments: numberValue(row.media_comments_count),
      }))
      .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const breakdown = (metric: string, label: string) => rows
      .map((row) => ({ label: stringValue(row[label]), value: numberValue(row[metric]) }))
      .filter((item) => item.label && item.value > 0)
      .sort((a, b) => b.value - a.value)
      .filter((item, index, items) => items.findIndex((candidate) => candidate.label === item.label) === index);

    const activeHours = rows
      .map((row) => ({ label: stringValue(row.hour), value: numberValue(row.online_followers) }))
      .filter((item) => item.label && item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    const videos = media.filter((item) => /video|reel/i.test(item.type));

    return Response.json({
      accountName: stringValue(rows[0]?.account_name),
      followers,
      growth: followers - initialFollowers,
      videosOver3k: videos.filter((item) => item.views >= 3000),
      topVideos: [...videos].sort((a, b) => b.views - a.views).slice(0, 5),
      audience: {
        genderAge: breakdown("audience_gender_age", "audience_gender_age_related"),
        cities: breakdown("audience_city", "audience_city_related").slice(0, 5),
        countries: breakdown("audience_country", "audience_country_related").slice(0, 5),
        activeHours,
      },
      fetchedAt: new Date().toISOString(),
    }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Instagram insights error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Erro inesperado" }, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
