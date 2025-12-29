// 🔥 OpenAI 연결 테스트용 (임시)
module.exports.testOpenAI = async function testOpenAI(req, res) {
  try {
    const r = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "한 단어만 말해줘" }],
        max_tokens: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json({
      ok: true,
      reply: r.data.choices[0].message.content,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.response?.data || e.message,
    });
  }
};

export const config = {
  runtime: "nodejs",
};

const axios = require("axios");

// ----------------------------
// CORS
// ----------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendResponse(res, status, body) {
  res.status(status);
  for (const k in CORS_HEADERS) res.setHeader(k, CORS_HEADERS[k]);
  res.json(body);
}

// ----------------------------
// SYSTEM PROMPT (UX 확정 반영)
// ----------------------------
const systemPrompt = `
당신은 '하루동행'이라는 시니어 건강 도우미입니다.
간호사처럼 차분하고 부드럽게 설명합니다.

규칙:
- 한 번의 수치로 판단하지 않습니다.
- "정상/위험" 같은 단정 표현은 사용하지 않습니다.
- 2~3문장으로만 설명합니다.
- 마지막 문장은 반드시 다음 문장으로 끝냅니다:
  "제가 잘못 이해했다면, 정확한 숫자를 다시 알려주세요."
`;

// ----------------------------
// 숫자 추출
// ----------------------------
function extractNumeric(text = "") {
  const m = String(text).match(/\d{2,3}/);
  return m ? Number(m[0]) : null;
}

// ----------------------------
// OpenAI
// ----------------------------
async function callOpenAI(messages) {
  try {
    const r = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 300,
        messages,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );

    return r.data.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.error("OpenAI error:", e.message);
    return null;
  }
}

// ----------------------------
// handler (🔥 여기만 보면 됩니다)
// ----------------------------
module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    for (const k in CORS_HEADERS) res.setHeader(k, CORS_HEADERS[k]);
    return res.status(200).end();
  }

  const { message = "", mode = "", forceExplain = false } = req.body || {};

  // API 키 없어도 사용자에겐 자연스럽게
  if (!process.env.OPENAI_API_KEY) {
    return sendResponse(res, 200, {
      reply:
        "말씀해 주신 수치를 기준으로 차분히 살펴볼게요. 제가 잘못 이해했다면, 정확한 숫자를 다시 알려주세요.",
    });
  }

  const num = extractNumeric(message);

  // ============================
  // 🔴 즉시 설명 UX (핵심)
  // ============================
  if (forceExplain && num !== null) {
    const prompt = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          mode === "health"
            ? "말씀해 주신 수치를 기준으로 공복 혈당에 대해 설명해 주세요."
            : "말씀해 주신 수치를 기준으로 설명해 주세요.",
      },
    ];

    const reply = await callOpenAI(prompt);

    return sendResponse(res, 200, {
      reply:
        reply ||
        "말씀해 주신 수치를 기준으로 설명드릴게요. 제가 잘못 이해했다면, 정확한 숫자를 다시 알려주세요.",
    });
  }

  // ============================
  // 🔵 일반 대화 (fallback)
  // ============================
  const reply = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: String(message).trim() },
  ]);

  return sendResponse(res, 200, {
    reply:
      reply ||
      "말씀해 주셔서 고마워요. 제가 잘못 이해했다면, 정확한 숫자를 다시 알려주세요.",
  });
};
