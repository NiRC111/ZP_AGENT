import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true });
    }
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body || {};
    const { mode = "order", language = "marathi", caseText = "", grText = "" } = body;

    const systemPrompt = `You are a Quasi-Judicial Drafting Assistant for CEO ZP Chandrapur. 
Always draft professional decisions and orders in ${language}.`;

    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: caseText + "\n\n" + grText }
      ]
    });

    return res.status(200).json({ output: resp.output_text });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
}
