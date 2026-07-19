type VercelRequest = { method?: string; body?: unknown };
type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const reportSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["verified", "mostly_supported", "mixed", "unsupported", "cannot_determine"] },
    answer: { type: "string" },
    claim: { type: "string" },
    whatWeKnow: { type: "string" },
    why: { type: "string" },
    whatStillUnknown: { type: "string" },
    whatWouldChange: { type: "string" },
    whatIsMissing: { type: "string" },
    score: { type: "integer", minimum: 0, maximum: 100 },
    sources: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          kind: { type: "string", enum: ["primary", "independent", "context"] },
          whyItMatters: { type: "string" }
        },
        required: ["title", "url", "kind", "whyItMatters"]
      }
    }
  },
  required: ["status", "answer", "claim", "whatWeKnow", "why", "whatStillUnknown", "whatWouldChange", "whatIsMissing", "score", "sources"]
};

function outputText(response: any) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || []).flatMap((item: any) => item.content || []).filter((part: any) => part.type === "output_text").map((part: any) => part.text).join("");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const { claim, sourceUrl } = (req.body || {}) as { claim?: string; sourceUrl?: string };
  if (!claim || claim.trim().length < 8) return res.status(400).json({ error: "Paste the exact claim or quotation you want checked." });

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "The analysis service is not configured yet. Add OPENROUTER_API_KEY in Vercel, then redeploy." });

  const sourceNote = sourceUrl?.trim() ? "\nThe user also supplied this source URL. Treat it as a lead, not proof: " + sourceUrl.trim() : "";
  const instructions = [
    "You are Double Edge Insight's evidence-first fact-checking researcher.",
    "Write for an ordinary citizen or first-time voter. Use short, plain sentences.",
    "Search the web before answering. Prefer primary records: laws, court filings, government datasets, official transcripts, original studies, company filings, and full recordings.",
    "Do not treat repeated news stories as independent confirmation. Search for credible evidence that challenges the claim too.",
    "Never invent a source, quotation, date, number, or URL. If the evidence cannot settle the claim, use cannot_determine or unsupported.",
    "The score measures how well the evidence supports the conclusion; it does not mean that a sentence is a percentage true.",
    "answer must be a direct plain-English conclusion in one sentence. whatWeKnow, whatIsMissing, why, whatStillUnknown, and whatWouldChange must each be complete, factual paragraphs of no more than 90 words. whatIsMissing must plainly name omitted facts, definitions, dates, totals, legal standards, or context that could change how a person understands the claim. If nothing material is missing, say that plainly.",
    "Every source must be a real, clickable URL returned or directly verified during research. Explain why each source matters. Do not put markdown links, raw URLs, citation markers, or a source list inside answer, whatWeKnow, whatIsMissing, why, whatStillUnknown, or whatWouldChange. Put all URLs only in the sources array."
  ].join(" ");

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://double-edge-insight-ai-pipeline.vercel.app",
        "X-Title": "Double Edge Insight"
      },
      body: JSON.stringify({
        model: "openai/gpt-5.2",
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: "Fact-check this exact claim. Preserve its wording before evaluating it:\n\n" + claim.trim() + sourceNote }
        ],
        tools: [{ type: "openrouter:web_search", parameters: { engine: "auto", max_results: 6 } }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "double_edge_truth_report", strict: true, schema: reportSchema }
        }
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      console.error("OpenAI response error", payload);
      const code = payload?.error?.code;
      if (code === "insufficient_quota" || code === "insufficient_credits" || response.status === 402) {
        return res.status(503).json({ error: "This site's OpenRouter account needs credit before it can run claim checks. The key is connected; add credit, then try again." });
      }
      return res.status(502).json({ error: "The research service could not complete this check. Please try again." });
    }

    const text = payload?.choices?.[0]?.message?.content || outputText(payload);
    if (!text) return res.status(502).json({ error: "The research service returned no report. Please try again." });
    return res.status(200).json(JSON.parse(text));
  } catch (error) {
    console.error("Analysis error", error);
    return res.status(500).json({ error: "Something went wrong while checking this claim." });
  }
}
