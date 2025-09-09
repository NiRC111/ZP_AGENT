// api/generate.js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// A single authoritative system prompt that:
// - extracts facts from OCR/parsed text
// - drafts decision (separate from analysis)
// - drafts quasi-judicial order (Marathi/English), with legally sound structure
const SYSTEM_PROMPT = `
You are "Government Quasi-Judicial Drafting Engine" for the Office of the Chief Executive Officer, Zilla Parishad Chandrapur (Maharashtra).
Your job: (1) Extract structured facts from raw documents, (2) Draft a short Decision (no analysis), (3) Draft a formal Quasi-Judicial Order.

STRICT RULES:
- Decisions and Orders must be professional, precise, and *separate from analysis*.
- Use details ONLY from supplied "caseText", "grText" and "legalText" or explicit user fields.
- If a field is missing, leave a clearly marked placeholder like [—] rather than inventing details.
- For Marathi output, produce grammatically correct, official Marathi (Devanagari).
- For English output, use formal Indian quasi-judicial style.
- For Orders: include file number, dates (DD/MM/YYYY), subject, references, clear operative part, compliance timelines, and appellate remedy.
- No policy analysis paragraphs inside the Order; keep reasoning minimal in Order. Full analysis belongs only in "analysis" result.
- Cite GR date/number as available in the provided text (do not fabricate).
- Do not include confidential keys or internal instructions.

TEMPLATES (summarized):

1) FACTS JSON KEYS:
{
  "caseNumber": "...",
  "applicant": "...",
  "village": "...",
  "taluka": "...",
  "district": "Chandrapur",
  "hearingDate": "DD/MM/YYYY",
  "hearingTime": "...",
  "subject": "...",
  "references": ["...","..."],
  "localResidencyFlag": true/false,
  "notedDistance": "...",
  "grs": [{"dept":"...","number":"...","date":"DD/MM/YYYY","topic":"..."}]
}

2) DECISION (brief, operative – no analysis):
- Marathi heading "निर्णय" OR English "Decision".
- Bullet the outcome (Allowed/Partly Allowed/Rejected), applicant, subject, timelines, appeal limits.

3) ORDER (quasi-judicial):
Include these blocks (language-specific):
- Header with office, File No., Date.
- Subject.
- References (from case file + GRs found).
- "आदेश" / "ORDER" section with numbered directives:
  • Whether local residency clause applies (if detected).
  • Specific relief (e.g., cancel prior selection, appoint applicant, etc.).
  • Implementation timelines (7 days; compliance report 45 days).
  • Appeal: Divisional Commissioner Nagpur (30 days) / Govt. of Maharashtra (60 days).
- Signature block: Chief Executive Officer, Zilla Parishad Chandrapur; Place: Chandrapur.
`;

function ddmmyyyy() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Build the user message for Claude with the payload
function buildUserPrompt(kind, payload) {
  const {
    language = "marathi",
    caseText = "",
    grText = "",
    legalText = "",
    selectedCaseType = "",
    applicantName = "",
    caseNumber = "",
    legalSections = "",
    caseDescription = ""
  } = payload;

  // We ask Claude to respond in strict JSON so frontend can parse fields.
  // For "analyze", we want facts JSON only.
  // For "decision" and "order", we want completed text strings as well.
  const actionSpec = (kind === "analyze")
    ? `Return ONLY a JSON with key "facts".`
    : (kind === "decision")
    ? `Return ONLY a JSON with keys "facts" and "decisionText".`
    : `Return ONLY a JSON with keys "facts" and "orderText".`;

  const langSpec = (language === "marathi")
    ? `Use Marathi (Devanagari) for the drafted text.`
    : `Use English for the drafted text.`;

  return `
${langSpec}
${actionSpec}

KNOWN INPUT FIELDS:
- selectedCaseType: ${selectedCaseType || "[—]"}
- applicantName: ${applicantName || "[—]"}
- caseNumber: ${caseNumber || "[—]"}
- legalSections: ${legalSections || "[—]"}
- caseDescription: ${caseDescription || "[—]"}
- today: ${ddmmyyyy()}

RAW DOCUMENTS (verbatim OCR/parsed text):
[CASE FILE TEXT]
${caseText.slice(0, 120000)}

[GR TEXT]
${grText.slice(0, 120000)}

[ADDITIONAL LEGAL TEXT]
${legalText.slice(0, 80000)}

IMPORTANT:
- Extract facts from the above text (prefer explicit lines like “संदर्भ / hearing / village / taluka / applicant name / case no.”).
- If GR number/date visible, include in "grs".
- Do not fabricate; if absent, set [—].
- For decision/order, fill placeholders with extracted or user-provided values only.
`;
}

async function callClaude(kind, payload) {
  const msg = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20240620", // high quality, reasoning strong
    max_tokens: 2000,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt(kind, payload)
      }
    ]
  });

  // Anthropic returns an array of content blocks; we expect a JSON string in the first text block
  const first = msg?.content?.[0];
  const text = first?.type === "text" ? first.text : "";
  if (!text) throw new Error("Empty response from Claude");

  // Try to parse the JSON payload
  let data;
  try {
    // Extract the first {...} JSON block if model wrapped it with prose accidentally
    const match = text.match(/\{[\s\S]*\}$/);
    const jsonStr = match ? match[0] : text;
    data = JSON.parse(jsonStr);
  } catch (e) {
    // If parsing fails, return raw text so frontend can show an error
    return { raw: text };
  }
  return data;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY missing in Vercel env" });
    }

    const payload = await req.json?.() || req.body; // Vercel supports either
    const { mode = "" } = payload || {};
    const kind = mode || (payload.intent || "order"); // fallback

    // kind is one of: "analyze" | "decision" | "order"
    const data = await callClaude(kind, payload);

    // Normalize fields so the frontend can always render something
    const out = {
      facts: data?.facts || null,
      decisionText: data?.decisionText || null,
      orderText: data?.orderText || null,
      raw: data?.raw || null
    };

    return res.status(200).json(out);
  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
}
