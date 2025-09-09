// api/generate.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helper: safe string
const s = (v) => (v || "").toString().trim();

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const {
      language = "marathi",           // "marathi" | "english"
      caseText = "",
      grText = "",
      legalText = "",
      selectedCaseType = "",
      applicantName = "",
      caseNumber = "",
      legalSections = "",
      caseDescription = ""
    } = await req.json?.() || await getBody(req);

    const sys = `
You are a senior quasi-judicial drafting assistant for the **Chief Executive Officer, Zilla Parishad, Chandrapur**.
Your job:
1) Extract precise facts (names, dates, places, case numbers, departments, hearing date/time, references).
2) Produce two separate outputs:
   A) DECISION (short memorandum) — concise, no analysis blocks, operative findings only.
   B) ORDER (final quasi-judicial order) — formal, NO analysis paragraphs, includes:
      - Office heading for CEO ZP Chandrapur
      - File No., Date, Subject
      - संदर्भ / References (numbered, pulled from the case/GR)
      - Operative part: clear directions, timelines (7/30/45 days), cancellation/supersession if any
      - Appellate remedy (Divisional Commissioner 30 days; Govt 60 days)
      - Signature block
Use strictly the facts provided. If a fact is missing, use “—” (do NOT invent).
Language: ${language === "marathi" ? "Marathi (official government register, precise, clean)" : "English (formal government legal style)"}.
Output as JSON with keys: facts, decisionText, orderText. Facts must include:
{ complainant, village, taluka, hearingDate, hearingTime, caseNumber, references[], subject }`;

    // Build the user content
    const userContent = `
=== CASE TYPE ===
${s(selectedCaseType)}

=== CASE NUMBER ===
${s(caseNumber)}

=== APPLICANT NAME ===
${s(applicantName)}

=== CASE DESCRIPTION (Officer entered) ===
${s(caseDescription)}

=== LEGAL SECTIONS ENTERED BY OFFICER ===
${s(legalSections)}

=== CASE FILE (raw text) ===
${s(caseText)}

=== GOVERNMENT RESOLUTION (raw text) ===
${s(grText)}

=== ADDITIONAL LEGAL DOCS / PRECEDENTS (raw text) ===
${s(legalText)}
    `.trim();

    // Use a strong, instruction-following model
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini", // works well for structure + Marathi
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userContent }
      ]
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      data = { decisionText: "", orderText: "", facts: {}, _raw: raw };
    }

    return res.status(200).json({
      ok: true,
      facts: data.facts || {},
      decisionText: data.decisionText || "",
      orderText: data.orderText || ""
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
}

// For Vercel's edge/body
async function getBody(req) {
  const text = await new Response(req.body).text();
  try { return JSON.parse(text); } catch { return {}; }
}
