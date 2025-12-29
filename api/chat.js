export const config = {
  runtime: "nodejs",
};

// ----------------------------
// CORS
// ----------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function send(res, status, body) {
  res.status(status);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.json(body);
}

// ----------------------------
// SYSTEM PROMPT
// ----------------------------
const systemPrompt = `
당신은 '하루동행' 시니어 건강 도우미입니다.
간호사처럼 차분하고 부드럽게 설명합니다.

규칙:
- 한 번의 수치로 단정하지 않습니다.
- "정상/위험" 같은 표현은 쓰지 않습니다.
- 2~3문장으로만 설명합니다.
- 마지막 문장은 항상 이렇게 끝냅니다:
  "제가 잘못 이해했다면, 정확한 숫자를 다시 알려주세요."
`;

// ----------------------------
// 숫자 추출
// ----------------------------
function extractNumber(text = "") {
  const m = String(text).match(/\d{2,3}/);
  return m ? Number(m[0]) : null;
}

// ----------------------------
// OpenAI 호출 (fetch 안정 버전)
// ----------------------------
async function callOpenAI(messages) {
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 300,
        messages,
      }),
    });

    if (!r.ok) return null;
    const data = await r.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

// ----------------------------
// handler
// ----------------------------
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }

  const { message = "", mode = "" } = req.body || {};
  const text = String(message).trim();

  // API 키 없어도 사용자 UX는 유지
  if (!process.env.OPENAI_API_KEY) {
    return send(res, 200, {
      reply:
        "말씀해 주신 내용을 기준으로 차분히 살펴볼게요. " +
        "제가 잘못 이해했다면, 정확한 숫자를 다시 알려주세요.",
    });
  }

  const num = extractNumber(text);

  // ============================
  // 🔴 숫자 있으면 즉시 설명
  // ============================
  if (num !== null) {
    const prompt = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          mode === "health"
            ? `공복 혈당 수치 ${num}에 대해 설명해 주세요.`
            : `말씀해 주신 수치 ${num}에 대해 설명해 주세요.`,
      },
    ];

    const reply = await callOpenAI(prompt);

    return send(res, 200, {
      reply:
        reply ||
        "말씀해 주신 수치를 기준으로 차분히 살펴볼게요. " +
        "제가 잘못 이해했다면, 정확한 숫자를 다시 알려주세요.",
    });
  }

  // ============================
  // 🔵 숫자 없는 일반 대화
  // ============================
  const reply = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: text },
  ]);

  return send(res, 200, {
    reply:
      reply ||
      "말씀해 주셔서 고마워요. " +
      "제가 잘못 이해했다면, 정확한 숫자를 다시 알려주세요.",
  });
}
