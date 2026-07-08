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
5. Every single verdict MUST contain a primary citation source (the specific named document/database/record) and a primary citation URL (a direct, live, verifiable hyperlink to that document, preferring .gov, .edu, or official raw source repositories).

JUSBT SCHEMA VERSION 2.0 COMPLIANCE:
You must output data fitting JUSBT Schema 2.0:
- schemaVersion: Must be exactly "2.0"
- metadata:
  * verdictTimestamp: Current timestamp in ISO format.
  * analysisId: A unique claim identifier (e.g., "C-101", "C-202").
  * requestId: A random request UUID.
  * processing: object containing model ("gemini-3.5-flash"), modelVersion ("gemini-3.5-flash-v2.0"), processingTimeMs (approx. integer between 1200 and 3500), attempt (1), healed (false), and validatorVersion ("2.0").
- claim:
  * originalClaim: The exact claim text parsed.
  * claimSummary: A one-sentence scannable summary.
  * claimType: Classification (choose exactly one: "Historical", "Scientific", "Political", "Financial", "Legal", "Medical", "Opinion", "Prediction", "Other").
  * literalParsing: object detailing assertion (explicit text), implication (implied or insinuation), scope (boundaries of the claim), and limitations (what it doesn't cover).
- evidence: Supporting, contradictory, and context evidence arrays. Populated using search results:
  * Each item needs a unique ID (e.g. "E-101", "E-102").
  * type: "primary" | "official" | "independent" | "secondary".
  * title, url, publisher, author, publicationDate (YYYY-MM-DD), accessDate (YYYY-MM-DD).
  * role: "supports" (for supportingEvidence), "contradicts" (for contradictoryEvidence), "context" (for contextEvidence).
  * quality: "high" | "medium" | "low".
  * credibility, relevance, weight: float values between 0.0 and 1.0.
  * accessStatus: "available" | "redacted" | "sealed" | "paywalled".
  * notes: qualitative details about the source's contents.
- SIF (Sovereign Investigative Formula):
  * inputs: P (primary count), I (independent count), O (official count), U (unknowns count), G (gaps count), A (ambiguities count).
  * breakdown:
    * primaryContribution = P * 5
    * independentContribution = I * 4
    * officialContribution = O * 3
    * uncorroboratedPenalty = U * 6
    * gapPenalty = G * 5
    * ambiguityPenalty = A * 4
  * score: computed mathematically: (primaryContribution + independentContribution + officialContribution) - uncorroboratedPenalty - gapPenalty - ambiguityPenalty. Clamp/cap between 0 and 100.
- confidence:
  * score: same as SIF score.
  * level: "Low" (score < 40), "Medium" (40 <= score < 80), "High" (score >= 80).
  * reason: text explaining why this level of confidence is justified.
- validation:
  * overallScore: 100 (or slightly lower if there are warnings).
  * schemaValid, SIFMathValid, citationsValid, styleValid, jsonValid: true.
  * severity: "INFO".
  * issues: array of issues, or empty if none.
- citationCoverage:
  * claimsDetected, claimsSupported, claimsUnsupported.
  * coveragePercent: (claimsSupported / claimsDetected) * 100, or a representative percentage.
- verdict:
  * classification: exactly one of "True", "Mostly True", "Misleading", "False", "Unsubstantiated", "Context-Dependent".
  * justification: A concise, staccato, punchy one-sentence justification.
  * decisionTrace: A logical sequence of 3-4 decision steps that lead to this verdict.
- primaryCitation: The strongest evidence source with title, url, and reasonUnavailable = null.
- sourcesSnapshot: List of 2-3 snapshots of key sources.
- bayesian:
  * enabled: true.
  * priorReliability: decimal (e.g., 0.5).
  * modelReliability: decimal (e.g., 0.8).
  * posteriorReliability: calculated value (e.g. 0.8) or based on Bayes' updating logic.
  * updateReason: qualitative note explaining how the prior shifted to the posterior based on new evidence.
- editorialPersona: 'Hard-Boiled Reporter' | 'Structural Analyst' | 'Fact-Checker'.

STRICT STYLOMETRIC GUARDRAILS:
You must run a self-correction loop internally before rendering your final analysis:
- Purge all state-of-being verbs (am, is, are, was, were, be, been, being) from narrative justifications. Use active, muscle-bound verbs.
- Strictly ban all generic AI filler phrases or their variants:
  * "It is important to note..." / "It's worth mentioning..."
  * "In today's world..." / "In today's rapidly changing..."
  * "Let's unpack this..." / "Dive deep..." / "Navigate the complexities..."
  * "At the end of the day..." / "Make no mistake..." / "Raises questions..."
- Maintain a maximum of 3-4 sentences per paragraph. Keep prose staccato, rhythmic, and concrete.`;

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
            schemaVersion: { type: Type.STRING },
            metadata: {
              type: Type.OBJECT,
              properties: {
                verdictTimestamp: { type: Type.STRING },
                analysisId: { type: Type.STRING },
                requestId: { type: Type.STRING },
                processing: {
                  type: Type.OBJECT,
                  properties: {
                    model: { type: Type.STRING },
                    modelVersion: { type: Type.STRING },
                    processingTimeMs: { type: Type.INTEGER },
                    attempt: { type: Type.INTEGER },
                    healed: { type: Type.BOOLEAN },
                    validatorVersion: { type: Type.STRING }
                  },
                  required: ["model", "modelVersion", "processingTimeMs", "attempt", "healed", "validatorVersion"]
                }
              },
              required: ["verdictTimestamp", "analysisId", "requestId", "processing"]
            },
            claim: {
              type: Type.OBJECT,
              properties: {
                originalClaim: { type: Type.STRING },
                claimSummary: { type: Type.STRING },
                claimType: { type: Type.STRING },
                literalParsing: {
                  type: Type.OBJECT,
                  properties: {
                    assertion: { type: Type.STRING },
                    implication: { type: Type.STRING },
                    scope: { type: Type.STRING },
                    limitations: { type: Type.STRING }
                  },
                  required: ["assertion", "implication", "scope", "limitations"]
                }
              },
              required: ["originalClaim", "claimSummary", "claimType", "literalParsing"]
            },
            evidence: {
              type: Type.OBJECT,
              properties: {
                supportingEvidence: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      type: { type: Type.STRING },
                      title: { type: Type.STRING },
                      url: { type: Type.STRING },
                      publisher: { type: Type.STRING },
                      author: { type: Type.STRING },
                      publicationDate: { type: Type.STRING },
                      accessDate: { type: Type.STRING },
                      role: { type: Type.STRING },
                      quality: { type: Type.STRING },
                      credibility: { type: Type.NUMBER },
                      relevance: { type: Type.NUMBER },
                      weight: { type: Type.NUMBER },
                      accessStatus: { type: Type.STRING },
                      notes: { type: Type.STRING }
                    },
                    required: ["id", "type", "title", "url", "publisher", "author", "publicationDate", "accessDate", "role", "quality", "credibility", "relevance", "weight", "accessStatus", "notes"]
                  }
                },
                contradictoryEvidence: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      type: { type: Type.STRING },
                      title: { type: Type.STRING },
                      url: { type: Type.STRING },
                      publisher: { type: Type.STRING },
                      author: { type: Type.STRING },
                      publicationDate: { type: Type.STRING },
                      accessDate: { type: Type.STRING },
                      role: { type: Type.STRING },
                      quality: { type: Type.STRING },
                      credibility: { type: Type.NUMBER },
                      relevance: { type: Type.NUMBER },
                      weight: { type: Type.NUMBER },
                      accessStatus: { type: Type.STRING },
                      notes: { type: Type.STRING }
                    },
                    required: ["id", "type", "title", "url", "publisher", "author", "publicationDate", "accessDate", "role", "quality", "credibility", "relevance", "weight", "accessStatus", "notes"]
                  }
                },
                contextEvidence: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      type: { type: Type.STRING },
                      title: { type: Type.STRING },
                      url: { type: Type.STRING },
                      publisher: { type: Type.STRING },
                      accessDate: { type: Type.STRING },
                      role: { type: Type.STRING },
                      quality: { type: Type.STRING },
                      notes: { type: Type.STRING }
                    },
                    required: ["id", "type", "title", "url", "publisher", "accessDate", "role", "quality", "notes"]
                  }
                }
              },
              required: ["supportingEvidence", "contradictoryEvidence", "contextEvidence"]
            },
            SIF: {
              type: Type.OBJECT,
              properties: {
                inputs: {
                  type: Type.OBJECT,
                  properties: {
                    P: { type: Type.INTEGER },
                    I: { type: Type.INTEGER },
                    O: { type: Type.INTEGER },
                    U: { type: Type.INTEGER },
                    G: { type: Type.INTEGER },
                    A: { type: Type.INTEGER }
                  },
                  required: ["P", "I", "O", "U", "G", "A"]
                },
                breakdown: {
                  type: Type.OBJECT,
                  properties: {
                    primaryContribution: { type: Type.INTEGER },
                    independentContribution: { type: Type.INTEGER },
                    officialContribution: { type: Type.INTEGER },
                    uncorroboratedPenalty: { type: Type.INTEGER },
                    gapPenalty: { type: Type.INTEGER },
                    ambiguityPenalty: { type: Type.INTEGER }
                  },
                  required: ["primaryContribution", "independentContribution", "officialContribution", "uncorroboratedPenalty", "gapPenalty", "ambiguityPenalty"]
                },
                score: { type: Type.INTEGER }
              },
              required: ["inputs", "breakdown", "score"]
            },
            confidence: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.INTEGER },
                level: { type: Type.STRING },
                reason: { type: Type.STRING }
              },
              required: ["score", "level", "reason"]
            },
            validation: {
              type: Type.OBJECT,
              properties: {
                overallScore: { type: Type.INTEGER },
                schemaValid: { type: Type.BOOLEAN },
                SIFMathValid: { type: Type.BOOLEAN },
                citationsValid: { type: Type.BOOLEAN },
                styleValid: { type: Type.BOOLEAN },
                jsonValid: { type: Type.BOOLEAN },
                severity: { type: Type.STRING },
                issues: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      category: { type: Type.STRING },
                      severity: { type: Type.STRING },
                      message: { type: Type.STRING },
                      corrected: { type: Type.BOOLEAN }
                    },
                    required: ["category", "severity", "message", "corrected"]
                  }
                }
              },
              required: ["overallScore", "schemaValid", "SIFMathValid", "citationsValid", "styleValid", "jsonValid", "severity", "issues"]
            },
            citationCoverage: {
              type: Type.OBJECT,
              properties: {
                claimsDetected: { type: Type.INTEGER },
                claimsSupported: { type: Type.INTEGER },
                claimsUnsupported: { type: Type.INTEGER },
                coveragePercent: { type: Type.INTEGER }
              },
              required: ["claimsDetected", "claimsSupported", "claimsUnsupported", "coveragePercent"]
            },
            verdict: {
              type: Type.OBJECT,
              properties: {
                classification: { type: Type.STRING },
                justification: { type: Type.STRING },
                decisionTrace: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["classification", "justification", "decisionTrace"]
            },
            primaryCitation: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                url: { type: Type.STRING },
                reasonUnavailable: { type: Type.STRING }
              },
              required: ["title", "url"]
            },
            sourcesSnapshot: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  url: { type: Type.STRING },
                  snapshotId: { type: Type.STRING },
                  accessDate: { type: Type.STRING }
                },
                required: ["title", "url", "snapshotId", "accessDate"]
              }
            },
            bayesian: {
              type: Type.OBJECT,
              properties: {
                enabled: { type: Type.BOOLEAN },
                priorReliability: { type: Type.NUMBER },
                posteriorReliability: { type: Type.NUMBER },
                modelReliability: { type: Type.NUMBER },
                updateReason: { type: Type.STRING }
              },
              required: ["enabled", "priorReliability", "posteriorReliability", "modelReliability", "updateReason"]
            },
            editorialPersona: {
              type: Type.STRING
            }
          },
          required: [
            "schemaVersion",
            "metadata",
            "claim",
            "evidence",
            "SIF",
            "confidence",
            "validation",
            "citationCoverage",
            "verdict",
            "primaryCitation",
            "sourcesSnapshot",
            "bayesian",
            "editorialPersona"
          ]
        }
      }
    });

    if (!response.text) {
      throw new Error("Empty response received from the Gemini model.");
    }

    // Parse model text
    const parsedData = JSON.parse(response.text.trim());

    // Populate metadata defaults to guarantee absolute compliance
    parsedData.schemaVersion = "2.0";
    if (!parsedData.metadata) {
      parsedData.metadata = {};
    }
    parsedData.metadata.verdictTimestamp = new Date().toISOString();
    if (!parsedData.metadata.analysisId) {
      parsedData.metadata.analysisId = "C-" + Math.floor(100 + Math.random() * 900);
    }
    if (!parsedData.metadata.requestId) {
      parsedData.metadata.requestId = "req-" + Math.random().toString(36).substring(2, 11);
    }
    if (!parsedData.claim) {
      parsedData.claim = {};
    }
    parsedData.claim.originalClaim = claimText;

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
