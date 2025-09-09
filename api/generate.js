// api/generate.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// simple health check for GET
export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true });
    }
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY missing" });
    }

    const body = req.body || (await new Promise(resolve => {
      let raw=""; req.on("data", c => raw += c);
      req.on("end", () => { try { resolve(JSON.parse(raw||"{}")); } catch { resolve({}); } });
    }));

    const {
      mode = "order",              // "analyze" | "decision" | "order"
      language = "marathi",        // "marathi" | "english"
      caseText = "", grText = "", legalText = "",
      selectedCaseType = "", applicantName = "", caseNumber = "",
      legalSections = "", caseDescription = ""
    } = body;

    const systemPrompt = `You are a Government Quasi-Judicial Drafting Engine for CEO, ZP Chandrapur. 
Generate outputs strictly from provided texts. Do not invent facts. 
If any value missing, use [—]. Keep analysis separate from decision/order.`;

    // Build the user prompt compactly
    const userPrompt = `
ACTION: ${mode.toUpperCase()}
LANG: ${language}

KNOWN FIELDS:
- selectedCaseType: ${selectedCaseType || "[—]"}
- applicantName: ${applicantName || "[—]"}
- caseNumber: ${caseNumber || "[—]"}
- legalSections: ${legalSections || "[—]"}
- caseDescription: ${caseDescription || "[—]"}
- today: ${new Date().toLocaleDateString("en-GB")}

[CASE FILE TEXT]
${caseText.slice(0, 120000)}

[GR TEXT]
${grText.slice(0, 120000)}

[ADDITIONAL LEGAL TEXT]
${legalText.slice(0, 80000)}

Return JSON only:
- For ACTION=analyze: {"facts":{...}}
- For ACTION=decision: {"facts":{...}, "decisionText":"..."}
- For ACTION=order: {"facts":{...}, "orderText":"..."}
`;

    // GPT call (Responses API)
    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      max_output_tokens: 1800,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const text = resp.output_text?.trim() || "";
    // Try safe JSON extraction
    let parsed;
    try {
      const m = text.match(/\{[\s\S]*\}$/);
      parsed = JSON.parse(m ? m[0] : text);
    } catch {
      return res.status(200).json({ raw: text });
    }
    return res.status(200).json(parsed);

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error", details: String(e?.message || e) });
  }
}
