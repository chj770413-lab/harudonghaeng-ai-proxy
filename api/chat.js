import axios from "axios";

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
        timeout: 8000, // ⏱️ Vercel 안정 타임아웃
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
// handler
// ----------------------------
export default async function handler(req, res) {
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

      if (!reply) {
        return sendResponse(res, 200, {
          reply:
            "설명을 준비하는 데 잠시 시간이 걸리고 있어요.\n" +
            "조금 후에 다시 한 번 말씀해 주실 수 있을까요?",
          needConfirm: false,
          heardNumber: null,
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
  // 🔵 2️⃣ 일반 대화
  // ============================
  const reply = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: String(message).trim() },
  ]);

  if (!reply) {
    return sendResponse(res, 200, {
      reply:
        "지금 잠시 응답이 늦어지고 있어요.\n" +
        "조금 후에 다시 말씀해 주시면 이어서 도와드릴게요.",
    });
  }

  return sendResponse(res, 200, { reply });
}

