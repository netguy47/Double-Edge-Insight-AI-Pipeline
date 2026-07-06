import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Lazy initializer for Gemini client
let _ai: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!_ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is missing. Please add your API key in the AI Studio Settings > Secrets menu."
      );
    }
    _ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return _ai;
}

const JUSBT_SYSTEM_PROMPT = `You are the James Uptown Semantic Baseline Truth (JUSBT) Agent — a ruthlessly accurate, non-partisan, evidence-first system representing the Sovereign Newsroom, specialized in cataloging and dissecting viral political, governmental, and Trump-related claims.

ROLE ORCHESTRATION MOAT:
For each claim, you must dynamically act as the most suited editorial persona:
1. Hard-Boiled Reporter: Best for fast-paced political campaigns, rumors of corruption, or rhetorical declarations. Focused on ground-level reporting and accountability.
2. Structural Analyst: Best for economic policies, legislative bills, financial budgets, or federal agency operations. Focused on systemic logistics and the flow of funds or authority.
3. Fact-Checker: Best for statistical claims, historical milestones, specific regulatory quotes, or direct legislative text. Focused on raw archival verification.

Core Rules (Never violate):
1. Prioritize primary sources (court records, .gov sites, official transcripts, congressional docs, raw data) above all.
2. Be strictly neutral. No moralizing, no favoritism.
3. Explicitly state uncertainties and source quality.
4. Never hallucinate facts, quotes, or events.
5. Every single verdict MUST contain a 'primaryCitationSource' (the specific named document/database/record) and a 'primaryCitationUrl' (a direct, live, verifiable hyperlink to that document, preferring .gov, .edu, or official raw source repositories).

DYNAMIC SIF CALCULATION:
You must calculate the Sovereign Investigative Formula (SIF) Confidence Score mathematically on the fly as an integer between 0 and 100:
Confidence (%) = (5 * Primary Sources Count) + (4 * Independent Sources Count) + (3 * Official Documents Count) - Unknowns - Gaps - Alternative Explanations
Ensure you explain this score in the baseline facts or justification, and output the computed value.

STRICT STYLOMETRIC GUARDRAILS:
You must run a self-correction loop internally before rendering your final analysis:
- Purge all state-of-being verbs (am, is, are, was, were, be, been, being) from narrative justifications. Use active, muscle-bound verbs.
- Strictly ban all generic AI filler phrases or their variants:
  * "It is important to note..." / "It's worth mentioning..."
  * "In today's world..." / "In today's rapidly changing..."
  * "Let's unpack this..." / "Dive deep..." / "Navigate the complexities..."
  * "At the end of the day..." / "Make no mistake..." / "Raises questions..."
- Maintain a maximum of 3-4 sentences per paragraph. Keep prose staccato, rhythmic, and concrete.

MANDATORY WORKFLOW (Execute in this exact order):
1. Catalog — Summarize the claim in one clear sentence.
2. Semantic Parsing — Precisely define what the claim literally says and what it implies.
3. Baseline Facts — Identify the strongest primary evidence. Calculate the SIF mathematically. State what is verified versus what is unverified or contested.
4. Truth Verdict — Choose exactly one of the allowed verdicts: True, Mostly True, Misleading, False, Unsubstantiated, Context-Dependent. Give a concise one-sentence justification. Mandatorily supply the name of the primary document ('primaryCitationSource') and the verifiable hyperlink ('primaryCitationUrl') used to confirm this decision.
5. Context & Implications — Outline the background, timeline, and real-world impact of the claim.`;

// API: Health / System Status
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    apiKeyConfigured: !!process.env.GEMINI_API_KEY
  });
});

// API: Analyze Claim
app.post("/api/jusbt/analyze", async (req, res) => {
  try {
    const { claimText, customSystemPrompt } = req.body;
    if (!claimText || !claimText.trim()) {
      return res.status(400).json({ error: "Claim text is required." });
    }

    const ai = getGeminiClient();
    const systemPrompt = customSystemPrompt || JUSBT_SYSTEM_PROMPT;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Perform a full JUSBT analysis on this claim:\n\n"${claimText}"\n\nEnsure you find accurate, real-world evidence.`,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: "A clear, concise, one-sentence summary of the claim."
            },
            semanticParsing: {
              type: Type.OBJECT,
              properties: {
                literalSays: {
                  type: Type.STRING,
                  description: "Precisely define what the claim literally, explicitly states."
                },
                implies: {
                  type: Type.STRING,
                  description: "Define the underlying insinuation or implication behind the claim."
                }
              },
              required: ["literalSays", "implies"]
            },
            baselineFacts: {
              type: Type.OBJECT,
              properties: {
                primarySources: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Specific primary sources consulted (e.g. .gov documents, court briefs, raw transcripts, official federal statements)."
                },
                keyEvidence: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Bullet points detailing the strongest factual evidence established."
                },
                conflictingInfo: {
                  type: Type.STRING,
                  description: "Any conflicting reports, active disputes, or notable lack of corroboration. Set to null if none."
                }
              },
              required: ["primarySources", "keyEvidence"]
            },
            truthVerdict: {
              type: Type.OBJECT,
              properties: {
                verdict: {
                  type: Type.STRING,
                  description: "Choose exactly one: True, Mostly True, Misleading, False, Unsubstantiated, Context-Dependent."
                },
                justification: {
                  type: Type.STRING,
                  description: "One-sentence, rigorous justification supporting the selected verdict."
                },
                primaryCitationSource: {
                  type: Type.STRING,
                  description: "The name of the primary document, regulation, court docket, or dataset that forms the foundation of this verdict."
                },
                primaryCitationUrl: {
                  type: Type.STRING,
                  description: "A direct, live, verifiable hyperlink (preferably ending in .gov, .edu, or official archives) where users can independently view this primary source."
                }
              },
              required: ["verdict", "justification", "primaryCitationSource", "primaryCitationUrl"]
            },
            additionalContext: {
              type: Type.STRING,
              description: "Nuance, legislative/legal background, chronological timeline, or real-world policy implications."
            },
            sifScore: {
              type: Type.INTEGER,
              description: "Sovereign Investigative Formula (SIF) score, calculated on the fly as an integer. Formula: (5 * primarySources count) + (4 * independentSources count) + (3 * otherOfficialDocs count) - unknowns - gaps. Capped at 0-100."
            },
            editorialPersona: {
              type: Type.STRING,
              description: "Choose the role that fits this claim's analysis the best: 'Hard-Boiled Reporter', 'Structural Analyst', or 'Fact-Checker'."
            }
          },
          required: ["summary", "semanticParsing", "baselineFacts", "truthVerdict", "additionalContext", "sifScore", "editorialPersona"]
        }
      }
    });

    if (!response.text) {
      throw new Error("Empty response received from the Gemini model.");
    }

    // Parse model text
    const parsedData = JSON.parse(response.text.trim());

    // Extract Grounding Chunks
    const groundingSources: any[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && Array.isArray(chunks)) {
      for (const chunk of chunks) {
        if (chunk.web?.uri) {
          groundingSources.push({
            title: chunk.web.title || "Web Reference",
            uri: chunk.web.uri
          });
        }
      }
    }

    // Assign temporary ID if missing
    parsedData.id = "C-" + Math.floor(100 + Math.random() * 900);
    parsedData.date = new Date().toISOString().split("T")[0];
    parsedData.claimText = claimText;
    parsedData.groundingSources = groundingSources;

    res.json(parsedData);
  } catch (error: any) {
    console.error("JUSBT analysis failed:", error);
    const errorStr = JSON.stringify(error) || String(error.message || error);
    const isQuota = errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("RESOURCE_EXHAUSTED") || error.status === "RESOURCE_EXHAUSTED" || error.code === 429;
    
    if (isQuota) {
      return res.status(429).json({
        isQuotaError: true,
        error: "QUOTA_EXHAUSTED",
        message: "Gemini API Quota/Rate Limit Exceeded. Free tier keys are restricted to 15 Requests Per Minute (RPM) and a daily request cap.",
        details: errorStr
      });
    }
    res.status(500).json({ error: error.message || "Analysis failed." });
  }
});

// API: Scan for Viral Claims
app.post("/api/jusbt/scan", async (req, res) => {
  try {
    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: "Scan recent public discussions, media, or congressional announcements for 3 highly viral political, governmental, or Trump-related claims currently being debated. Return them as a structured list of claims with a short placeholder title for each.",
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Short catchy title for the viral claim" },
              claimText: { type: Type.STRING, description: "The full, literal viral claim statement to be analyzed" }
            },
            required: ["title", "claimText"]
          }
        }
      }
    });

    if (!response.text) {
      throw new Error("Failed to scan for claims.");
    }

    const claimsList = JSON.parse(response.text.trim());
    res.json({ claims: claimsList });
  } catch (error: any) {
    console.error("Scan for viral claims failed:", error);
    const errorStr = JSON.stringify(error) || String(error.message || error);
    const isQuota = errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("RESOURCE_EXHAUSTED") || error.status === "RESOURCE_EXHAUSTED" || error.code === 429;
    
    if (isQuota) {
      return res.status(429).json({
        isQuotaError: true,
        error: "QUOTA_EXHAUSTED",
        message: "Gemini API Quota/Rate Limit Exceeded. Free tier keys are restricted to 15 Requests Per Minute (RPM) and a daily request cap.",
        details: errorStr
      });
    }
    res.status(500).json({ error: error.message || "Failed to scan for viral claims." });
  }
});

// Serve frontend assets
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`JUSBT Agent Server running on http://localhost:${PORT}`);
  });
}

startServer();
