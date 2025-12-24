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
// OpenAI (axios 안정 버전)
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
    console.error(
      "OpenAI axios error:",
      e.response?.status,
      e.response?.data || e.message
    );
    return null;
  }
}

// ----------------------------
// handler (🔥 여기 중요)
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
    sessionFlow = "free", // 🔒 추가: free | numeric
  } = req.body || {};

  if (!process.env.OPENAI_API_KEY) {
    // ❗ 사용자에게 오류 노출 금지: 항상 정상 응답
    return sendResponse(res, 200, {
      reply: "말씀해 주셔서 고마워요. 이어서 도와드릴게요.",
    });
  }

  // ============================
  // 🔴 숫자 확인 결과 분기
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

      if (!reply) {
  return sendResponse(res, 200, {
    reply:
      "말씀해 주신 수치를 기준으로 지금 상태를 함께 살펴볼게요.\n" +
      "한 번의 수치만으로 판단하기보다는 흐름을 같이 보는 게 중요해요.\n" +
      "오늘 컨디션은 어떠셨나요?",
    needConfirm: false,
    heardNumber: null,
    sessionFlow: "free",
  });
}


      return sendResponse(res, 200, {
        reply,
        needConfirm: false,
        heardNumber: null,
      });
    }

    if (confirmAction === "no") {
      return sendResponse(res, 200, {
        reply:
          "괜찮아요.\n숫자를 한 자리씩 천천히 말씀해 주세요.\n예를 들어 1, 4, 5 처럼요.",
        needConfirm: true,
        heardNumber: null,
      });
    }
  }

  // ============================
// 🔵 일반 대화 (수치 흐름 차단)
// ============================
if (sessionFlow !== "numeric") {
  const reply = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: String(message).trim() },
  ]);

  // ❗ 오류 문구 노출 금지: 항상 의미 있는 응답 반환
  return sendResponse(res, 200, {
    reply:
      reply ||
      "말씀해 주셔서 고마워요. 조금 더 자세히 알려주실 수 있을까요?",
  });
}

// ============================
// ❌ 수치 흐름 중 일반 대화 진입 방지
// ============================
return sendResponse(res, 200, {
  reply:
    "지금 말씀해 주신 수치를 기준으로 이어서 확인해 볼게요.",
});
