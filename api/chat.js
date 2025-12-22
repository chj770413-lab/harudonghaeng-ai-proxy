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
// SYSTEM PROMPT
// ----------------------------
const systemPrompt = `
당신은 '하루동행'이라는 시니어 건강 도우미입니다.
간호사처럼 차분하고 단정하지 않게 설명합니다.

규칙:
- 한 번의 수치로 판단하지 않습니다.
- "정상/위험" 같은 단정 금지
- 2~3문장으로만 말합니다.
- 마지막에 질문은 1개만 합니다.
`;

// ----------------------------
// OpenAI
// ----------------------------
async function callOpenAI(messages) {
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
  const data = await r.json();
  return data.choices?.[0]?.message?.content || "";
}

// ----------------------------
// handler
// ----------------------------
module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    for (const k in CORS_HEADERS) res.setHeader(k, CORS_HEADERS[k]);
    return res.status(200).end();
  }

  const {
    messageType = "",
    message = "",
    pendingNumericConfirm = false,
    heardNumber = null,
    confirmAction = null,
    mode = "",
  } = req.body || {};

  if (!process.env.OPENAI_API_KEY) {
    return sendResponse(res, 500, { error: "API KEY 없음" });
  }

  // ============================
  // 🔴 1️⃣ 숫자 확인 결과 분기
  // ============================
  if (messageType === "numericConfirm") {
    if (confirmAction === "yes") {
      if (!Number.isFinite(heardNumber)) {
        return sendResponse(res, 200, {
          reply: "숫자를 다시 한 번만 말씀해 주실 수 있을까요?",
          needConfirm: true,
          heardNumber: null,
        });
      }

      const prompt = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            mode === "health"
              ? `공복 혈당 수치 ${heardNumber}에 대해, 한 번의 수치로 단정하지 말고 2~3문장으로 설명해 주세요. 마지막에 질문 1개만 해 주세요.`
              : `수치 ${heardNumber}에 대해 단정하지 말고 2~3문장으로 설명해 주세요.`,
        },
      ];

      const reply = await callOpenAI(prompt);
      return sendResponse(res, 200, {
        reply,
        needConfirm: false,
        heardNumber: null,
      });
    }

    if (confirmAction === "no") {
      return sendResponse(res, 200, {
        reply:
          "괜찮아요.\n숫자를 한 자리씩 천천히 말씀해
