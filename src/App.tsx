import { useState, type FormEvent } from "react";
import "./index.css";

type Source = {
  title: string;
  url: string;
  kind: "primary" | "independent" | "context";
  whyItMatters: string;
};

type Report = {
  status: "verified" | "mostly_supported" | "mixed" | "unsupported" | "cannot_determine";
  answer: string;
  claim: string;
  whatWeKnow: string;
  why: string;
  whatStillUnknown: string;
  whatWouldChange: string;
  whatIsMissing: string;
  score: number;
  sources: Source[];
};

function plainText(value: string) {
  return value
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "the linked receipt")
    .replace(/\s+/g, " ")
    .trim();
}

const labels: Record<Report["status"], string> = {
  verified: "The evidence supports this",
  mostly_supported: "Mostly supported",
  mixed: "Partly true, but incomplete",
  unsupported: "The evidence does not support this",
  cannot_determine: "We need more proof"
};

export default function App() {
  const [claim, setClaim] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function useExample(example: string) {
    setClaim(example);
    document.getElementById("claim")?.focus();
  }

  async function checkClaim(event: FormEvent) {
    event.preventDefault();
    setError("");
    setReport(null);
    setLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim, sourceUrl })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The check could not be completed.");
      setReport(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  function copyReport() {
    if (!report) return;
    const text = [
      "DOUBLE EDGE INSIGHT — TRUTH REPORT",
      "",
      "Claim: " + report.claim,
      "Answer: " + report.answer,
      "",
      "What we know: " + report.whatWeKnow,
      "",
      "Why: " + report.why,
      "",
      "What we still need to know: " + report.whatStillUnknown,
      "",
      "What would change the answer: " + report.whatWouldChange,
      "",
      "Receipts:",
      ...report.sources.map((source) => "- " + source.title + ": " + source.url)
    ].join("\n");
    navigator.clipboard.writeText(text);
  }

  return (
    <main>
      <header>
        <a className="brand" href="/">DOUBLE EDGE <span>INSIGHT</span></a>
        <p>Truth backed by receipts.</p>
      </header>

      <section className="hero">
        <p className="eyebrow">CLAIM CHECKER</p>
        <h1>Can we prove it?</h1>
        <p className="intro">Paste a claim, quotation, or a link. We will look for the original records, explain what they show, and tell you what remains uncertain.</p>
      </section>

      <section className="example-strip" aria-label="Example claims">
        <p>Not sure where to start?</p>
        <button onClick={() => useExample("The national debt passed $36 trillion.")}>Try an economic claim</button>
        <button onClick={() => useExample("This video quote is what the speaker actually said.")}>Try a quote check</button>
        <button onClick={() => useExample("This bill abolishes the Department of Education.")}>Try a policy claim</button>
      </section>

      <section className="checker" aria-label="Claim checker">
        <form onSubmit={checkClaim}>
          <label htmlFor="claim">What do you want checked?</label>
          <textarea id="claim" value={claim} onChange={(event) => setClaim(event.target.value)} placeholder="Paste the exact claim or quotation here." required />
          <label htmlFor="source">Optional: where did you see it?</label>
          <input id="source" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://example.com/source" />
          <p className="helper">A link helps us find the original source. The exact wording tells us what must be proved.</p>
          <button type="submit" disabled={loading || claim.trim().length < 8}>{loading ? "Checking the evidence…" : "Check this claim"}</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <section className="getting-started" aria-labelledby="getting-started-title">
        <p className="eyebrow">GETTING STARTED</p>
        <h2 id="getting-started-title">Check a claim in three easy steps.</h2>
        <ol>
          <li><span>1</span><div><strong>Paste the exact words.</strong><p>Use the full quote or claim—not just your opinion about it.</p></div></li>
          <li><span>2</span><div><strong>Add the original link, if you have it.</strong><p>This could be a video, a post, a news story, a speech, or a government page.</p></div></li>
          <li><span>3</span><div><strong>Read the answer, then open the receipts.</strong><p>We show what the evidence proves, what it does not prove, and the records we used.</p></div></li>
        </ol>
        <p className="guide-note"><strong>Try it:</strong> “The national debt passed $36 trillion.” Or paste a line from a speech and the source link.</p>
        <p className="guide-note"><strong>What this tool will not do:</strong> It will not choose your politics or pretend an opinion is a fact. When the evidence cannot settle a claim, it will say so.</p>
      </section>

      {report && (
        <section className="report" aria-live="polite">
          <p className="eyebrow">YOUR ANSWER</p>
          <h2>{labels[report.status]}</h2>
          <p className="answer">{plainText(report.answer)}</p>

          <section className="truth-map" aria-label="Truth map">
            <div className="truth-map-heading">
              <p className="eyebrow">THE TRUTH MAP</p>
              <p>Follow the evidence trail. Each step shows what the record can—and cannot—prove.</p>
            </div>
            <div className="map-steps">
              <article><span>1</span><div><small>THE CLAIM</small><strong>{plainText(report.claim)}</strong></div></article>
              <article><span>2</span><div><small>THE RECORD</small><strong>{report.sources.length} source{report.sources.length === 1 ? "" : "s"} checked, beginning with original records where available.</strong></div></article>
              <article><span>3</span><div><small>WHAT THE RECORD SHOWS</small><strong>{plainText(report.whatWeKnow)}</strong></div></article>
              <article className="map-conclusion"><span>4</span><div><small>THE CONCLUSION</small><strong>{plainText(report.answer)}</strong></div></article>
            </div>
          </section>

          <div className="question-grid">
            <article><span>1</span><div><h3>What was claimed?</h3><p>{plainText(report.claim)}</p></div></article>
            <article><span>2</span><div><h3>What did we find?</h3><p>{plainText(report.whatWeKnow)}</p></div></article>
            <article><span>3</span><div><h3>What is being left out?</h3><p>{plainText(report.whatIsMissing)}</p></div></article>
            <article><span>4</span><div><h3>Why does that matter?</h3><p>{plainText(report.why)}</p></div></article>
            <article><span>5</span><div><h3>What would settle this?</h3><p>{plainText(report.whatWouldChange)}</p></div></article>
          </div>

          <section className="receipts">
            <p className="eyebrow">SHOW ME THE RECEIPTS</p>
            <p>These records support, challenge, or explain the answer. Open them and judge the evidence yourself.</p>
            <div className="source-list">
              {report.sources.map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                  <span className={"tag " + source.kind}>{source.kind === "primary" ? "PRIMARY RECORD" : source.kind === "independent" ? "INDEPENDENT CHECK" : "CONTEXT"}</span>
                  <strong>{source.title}</strong>
                  <small>{plainText(source.whyItMatters)}</small>
                  <b>Open receipt ↗</b>
                </a>
              ))}
            </div>
          </section>

          <details>
            <summary>For researchers: confidence and unresolved questions</summary>
            <p><strong>Evidence confidence: {report.score}/100.</strong> This score reflects the strength and completeness of the evidence, not the percentage of a sentence that is true.</p>
            <p><strong>Still unknown:</strong> {plainText(report.whatStillUnknown)}</p>
          </details>

          <div className="actions">
            <button onClick={copyReport}>Copy report</button>
            <button className="outline" onClick={() => window.print()}>Print / Save PDF</button>
          </div>
        </section>
      )}

      <footer>Double Edge Insight — We separate facts, inference, and opinion.</footer>
    </main>
  );
}
