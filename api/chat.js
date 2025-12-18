// ----------------------------
// CORS 설정
// ----------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const fetch = require("node-fetch");

// ----------------------------
// 응답 헬퍼
// ----------------------------
function sendResponse(res, status, body) {
  res.status(status);
  for (const key in CORS_HEADERS) {
    res.setHeader(key, CORS_HEADERS[key]);
  }
  res.json(body);
}

// ----------------------------
// 하루동행 SYSTEM PROMPT
// ----------------------------
const systemPrompt = `
당신은 '하루동행'이라는 시니어 건강 도우미입니다.
당신의 역할은 말을 잘 듣고 핵심만 정리해 주는 간호사입니다.
질문은 항상 1개만 합니다.
단정하지 않고, 불안을 키우지 않습니다.
`;

// ----------------------------
// 메인 핸들러 (단 하나)
// ----------------------------
module.exports = async function handler(req, res) {

  if (req.method === "OPTIONS") {
    for (const key in CORS_HEADERS) {
      res.setHeader(key, CORS_HEADERS[key]);
    }
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendResponse(res, 405, { error: "POST 요청만 허용됩니다." });
  }

  const { message, messages: clientMessages = [] } = req.body || {};
  if (!message && clientMessages.length === 0) {
    return sendResponse(res, 400, { error: "메시지가 없습니다." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return sendResponse(res, 500, { error: "OPENAI_API_KEY가 없습니다." });
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...clientMessages,
    ...(message ? [{ role: "user", content: message }] : [])
  ];

  try {
    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
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
      }
    );

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      return sendResponse(res, openaiRes.status, data);
    }

    return sendResponse(res, 200, {
      reply: data.choices?.[0]?.message?.content || ""
    });

  } catch (err) {
    return sendResponse(res, 500, { error: err.toString() });
  }
};
