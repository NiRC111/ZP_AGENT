// /api/generate.js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Strict system prompt for quasi-judicial drafting
const SYSTEM = `You are the "Government Quasi-Judicial Drafting Engine" for
Chief Executive Officer, Zilla Parishad Chandrapur (Maharashtra).
Write ONLY the requested artifact (Decision OR Order), no extra commentary.
Follow these rules strictly:
- Be precise, factual, and cite only from provided Case/GR text.
- If a detail is missing, leave a bracketed placeholder like [____] instead of guessing.
- Use official tone; include file number, date (dd/mm/yyyy), subject, and a clear operative section.
- For ORDERS: DO NOT include analysis. Only operative findings, legal basis lines, directions, timelines, appeal clause.
- For DECISIONS: brief findings and reasoning allowed, but concise.
- Language must match "lang" input: Marathi (mr) or English (en).
- Use the CEO quasi-judicial capacity (Sec 95, ZP & PS Act, 1961) only if applicable in the text.
- Prefer data detected in "facts" and the user's typed fields.`;

function todayDDMMYYYY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

// Build user prompt with tight templates
function buildUserPrompt(body) {
  const {
    lang = "mr",
    mode = "order",
    caseNumber = "",
    applicantName = "",
    caseDescription = "",
    legalSections = "",
    facts = {},
    texts = { caseText: "", grText: "", legalText: "" },
  } = body;

  const common = `
[meta]
lang=${lang}
mode=${mode}
date_today=${todayDDMMYYYY()}

[inputs]
case_number: ${caseNumber || "[____]"}
applicant_name: ${applicantName || "[____]"}
legal_sections_user: ${legalSections || "-"}
facts_detected: ${JSON.stringify(facts, null, 2)}
case_text_start:
<<<CASE>>>
${(texts.caseText || "").slice(0, 7000)}
<<<END_CASE>>>
gr_text_start:
<<<GR>>>
${(texts.grText || "").slice(0, 7000)}
<<<END_GR>>>
other_legal:
<<<LEGAL>>>
${(texts.legalText || "").slice(0, 4000)}
<<<END_LEGAL>>>
`;

  if (lang === "mr") {
    if (mode === "order") {
      return `${common}

[task]
मराठीत केवळ "आदेश" (अर्ध-न्यायिक) तयार करा — विश्लेषण नाही.
खालील स्वरूप पाळा (शीर्षक/उपशीर्षकांसह). रिक्त तपशील असल्यास [____] ठेवा.

📝 निर्णय आदेश (अर्ध-न्यायिक)

कार्यालय : मुख्य कार्यकारी अधिकारी, जिल्हा परिषद, चंद्रपूर
फाईल क्र.: {case_number}
दिनांक : {date_today}
विषय : [प्रकरणाचा संक्षेप — गाव/विषय]

संदर्भ :
1) प्रकरणातील सादर कागदपत्रे (केस फाईल) — आवश्यक तेवढे ठळक मुद्दे
2) शासन निर्णय(े) — GR क्रमांक व दिनांक (उपलब्ध मजकुरातून)
3) अन्य कायदेशीर तरतुदी/पत्रव्यवहार (असल्यास)

आदेश :
1) नोंदी व शासन निर्णयातील तरतुदींनुसार पुढील आदेश देण्यात येतो —
   • अर्जदार : {applicant_name}
   • गाव/तालुका : [facts.village]/[facts.taluka]
   • सुनावणी : [facts.hearingDate] [facts.hearingTime]
   • लागू तरतुदी : [legal_sections_user किंवा GR मधील महत्त्वाची तरतूद]
2) प्रकरणात [स्थानिक रहिवासी अट/इतर] लागू असल्याचे नोंदीवरून स्पष्ट होत असल्याने,
   संबंधित अधिकाऱ्यांनी/प्रकल्प अधिकाऱ्यांनी {applicant_name} यांना शासन निर्णयानुसार
   अपेक्षित दिलासा/नियुक्ती/कारवाई देऊन आदेश निर्गमित करावा.
3) अंमलबजावणीचा कालावधी : या आदेशाच्या तारखेपासून ७ (सात) दिवस.
4) अनुपालन अहवाल : आदेश निर्गमित केल्यानंतर ४५ दिवसांच्या आत सादर करावा.
5) विरोधाभासी पूर्वनिर्णय/आदेश असल्यास ते रद्दबातल.
6) अपील तरतूद : या आदेशाविरुद्ध सक्षम अपीलीय प्राधिकरणाकडे ६० दिवसांच्या आत अपील करता येईल.

(मुख्य कार्यकारी अधिकारी)
जिल्हा परिषद, चंद्रपूर

सूचना:
• कृपया केवळ वरील स्वरूपातच अंतिम आदेश द्या; विश्लेषण/तर्क देऊ नका.`;
    }

    // DECISION (mr)
    return `${common}

[task]
मराठीत संक्षिप्त "निर्णय" तयार करा — थोडक्यात निष्कर्ष व तर्क; फॉर्मॅट:

अर्ध-न्यायिक निर्णय (संक्षेप)

फाईल क्र.: {case_number} | दिनांक: {date_today}
अर्जदार: {applicant_name}
प्रकरण: [संक्षेप]

तथ्ये (थोडक्यात) :
• [मुख्य तथ्य1]
• [मुख्य तथ्य2]

कायदेशीर चौकट :
• [लागू GR क्रमांक/दिनांक] • [इतर नियम/कलमे]

निष्कर्ष :
• [स्थानिक रहिवासी/इ.] तरतूद लागू — दिलासा/नियुक्ती मान्य/इ.

दिशा-निर्देश :
• ७ दिवसांत आदेश, ४५ दिवसांत अनुपालन, ६० दिवसांत अपील.`;
  }

  // English
  if (mode === "order") {
    return `${common}

[task]
Draft ONLY the "OFFICIAL ORDER" (no analysis). Format:

OFFICE OF THE CHIEF EXECUTIVE OFFICER
ZILLA PARISHAD, CHANDRAPUR

File No.: {case_number}     Date: {date_today}
Subject: [short matter]

REFERENCES:
1) Case records (key points)
2) Government Resolution(s) — number & date (from provided GR text)
3) Other legal provisions/correspondence (if any)

ORDER:
1) Based on record and applicable GR(s):
   • Applicant: {applicant_name}
   • Village/Taluka: [facts.village]/[facts.taluka]
   • Hearing: [facts.hearingDate] [facts.hearingTime]
   • Governing provision(s): [legal_sections_user or GR clause]
2) Accordingly, the concerned authority shall issue appointment/relief/action
   to {applicant_name} strictly as per the GR.
3) Implementation: within 7 (seven) days from this Order.
4) Compliance report: within 45 (forty-five) days.
5) Any earlier contrary orders/decisions stand cancelled.
6) Appeal: before competent appellate authority within 60 days.

(Chief Executive Officer)
Zilla Parishad, Chandrapur

Note: Output must be final order text only.`;
  }

  // DECISION (en)
  return `${common}

[task]
Draft a concise "Decision" — findings & brief reasoning only. Format:

QUASI-JUDICIAL DECISION (Brief)

File No.: {case_number} | Date: {date_today}
Applicant: {applicant_name}
Matter: [short description]

Facts (brief):
• [fact 1]
• [fact 2]

Legal framework:
• [GR number/date] • [other rules]

Conclusion:
• Relief/appointment allowed/denied as per GR.

Directions:
• Order within 7 days; compliance within 45 days; appeal within 60 days.`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    const body = req.body || (await new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(JSON.parse(data || "{}")));
    }));

    const user = buildUserPrompt(body);

    const completion = await client.chat.completions.create({
      model: "gpt-5",            // ✅ latest
      temperature: 0.2,          // accuracy
      top_p: 0.9,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || "";
    const title =
      body.lang === "mr"
        ? (body.mode === "order" ? "आदेश" : "निर्णय")
        : (body.mode === "order" ? "Order" : "Decision");

    res.status(200).json({ title, content: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}
