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
말을 잘 듣고 핵심만 정리해 주는 간호사입니다.

원칙:
- 수치 하나로 판단하지 않습니다.
- 불안을 키우지 않습니다.
- 2~3문장으로 답합니다.
- 질문은 1개만 합니다.
- 수치 응답에 감사 인사는 사용하지 않습니다.
`;

// ----------------------------
// Utils
// ----------------------------
function extractNumeric(text = "") {
  const m = String(text).match(/\d{2,3}/);
  return m ? Number(m[0]) : null;
}

function stripThanks(text = "") {
  return text.replace(/^(감사합니다|고마워요)[.!]?\s*/i, "");
}

// ----------------------------
// OpenAI
// ----------------------------
async function callLLM(messages) {
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
  const j = await r.json();
  return j.choices?.[0]?.message?.content || "";
}

// ----------------------------
// Handler
// ----------------------------
module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    for (const k in CORS_HEADERS) res.setHeader(k, CORS_HEADERS[k]);
    return res.status(200).end();
  }

  const {
    message = "",
    pendingNumericConfirm = false,
    heardNumber = null,
  } = req.body || {};

  const text = String(message).trim();
  const numeric = extractNumeric(text);

  // ----------------------------
  // 🔒 1) 확인 단계 (LLM 절대 호출 금지)
  // ----------------------------
  if (pendingNumericConfirm === true) {
    if (text === "맞아") {
      if (!Number.isFinite(heardNumber)) {
        return sendResponse(res, 200, {
          reply: "숫자를 다시 한 번만 말씀해 주세요.",
          needConfirm: true,
          heardNumber: null,
        });
      }

      const userReq = `공복 혈당 ${heardNumber}에 대해 한 번의 수치로 단정하지 말고 2~3문장으로 설명해 주세요. 마지막에 질문 1개만 해 주세요.`;
      const reply = await callLLM([
        { role: "system", content: systemPrompt },
        { role: "user", content: userReq },
      ]);

      return sendResponse(res, 200, {
        reply: stripThanks(reply),
        needConfirm: false,
        heardNumber: null,
      });
    }

    if (text === "아니야") {
      return sendResponse(res, 200, {
        reply: "괜찮아요. 숫자를 다시 한 자리씩 천천히 말씀해 주세요.",
        needConfirm: true,
        heardNumber: null,
      });
    }

    if (numeric !== null) {
      return sendResponse(res, 200, {
        reply:
          `제가 이렇게 들었어요: ${numeric}\n` +
          "맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
        needConfirm: true,
        heardNumber: numeric,
      });
    }

    return sendResponse(res, 200, {
      reply: "맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
      needConfirm: true,
      heardNumber,
    });
  }

  // ----------------------------
  // 2) 새 숫자 → 확인 시작
  // ----------------------------
  if (numeric !== null) {
    return sendResponse(res, 200, {
      reply:
        `제가 이렇게 들었어요: ${numeric}\n` +
        "맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
      needConfirm: true,
      heardNumber: numeric,
    });
  }

  // ----------------------------
  // 3) 일반 대화
  // ----------------------------
  const reply = await callLLM([
    { role: "system", content: systemPrompt },
    { role: "user", content: text },
  ]);

  return sendResponse(res, 200, { reply: stripThanks(reply) });
};
