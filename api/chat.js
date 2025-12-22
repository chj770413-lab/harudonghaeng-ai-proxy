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
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.json(body);
}

// ----------------------------
// SYSTEM PROMPT
// ----------------------------
const systemPrompt = `
당신은 '하루동행' 시니어 건강 도우미입니다.
간호사처럼 차분하고 단정하지 않습니다.
수치 하나만으로 판단하지 않습니다.
항상 2~3문장, 질문은 1개만 합니다.
`;

// ----------------------------
// 유틸
// ----------------------------
function extractNumeric(text = "") {
  const m = String(text).match(/\d{2,3}/);
  return m ? Number(m[0]) : null;
}

function stripThanks(t = "") {
  return t.replace(/감사합니다|고마워요/g, "");
}

function isYes(t = "") {
  return /^(맞아|네|예)$/i.test(t.trim());
}
function isNo(t = "") {
  return /^(아니야|아니|틀려)$/i.test(t.trim());
}
function isLoose(t = "") {
  return /(응\s*맞아|응|맞는\s*것\s*같아)/i.test(t.trim());
}

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
  const j = await r.json();
  return j.choices?.[0]?.message?.content || "";
}

// ----------------------------
// handler
// ----------------------------
module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return sendResponse(res, 405, { error: "POST only" });

  const {
    message = "",
    pendingNumericConfirm = false,
    heardNumber = null,
  } = req.body || {};

  const text = message.trim();
  const num = extractNumeric(text);

  // ----------------------------
  // 1️⃣ 확인 단계
  // ----------------------------
  if (pendingNumericConfirm === true) {
    if (isLoose(text)) {
      return sendResponse(res, 200, {
        reply: "맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
        needConfirm: true,
        heardNumber,
      });
    }

    if (isNo(text)) {
      return sendResponse(res, 200, {
        reply: "숫자를 다시 한 자리씩 말씀해 주세요. 예: 1, 4, 5",
        needConfirm: true,
        heardNumber: null,
      });
    }

    if (isYes(text)) {
      if (!Number.isFinite(heardNumber)) {
        return sendResponse(res, 200, {
          reply: "숫자를 한 번만 다시 말씀해 주세요.",
          needConfirm: true,
          heardNumber: null,
        });
      }

      const userPrompt =
        `공복 혈당 ${heardNumber}에 대해 ` +
        `한 번의 수치로 단정하지 말고 2~3문장으로 설명하고 질문 1개만 해 주세요.`;

      const reply = await callOpenAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);

      return sendResponse(res, 200, {
        reply: stripThanks(reply),
        needConfirm: false,
        heardNumber: null,
      });
    }

    return sendResponse(res, 200, {
      reply: "맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
      needConfirm: true,
      heardNumber,
    });
  }

  // ----------------------------
  // 2️⃣ 숫자 들어오면 확인 단계 진입
  // ----------------------------
  if (num !== null) {
    return sendResponse(res, 200, {
      reply:
        `제가 이렇게 들었어요: ${num}\n` +
        "맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
      needConfirm: true,
      heardNumber: num,
    });
  }

  // ----------------------------
  // 3️⃣ 일반 대화
  // ----------------------------
  const reply = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: text },
  ]);

  return sendResponse(res, 200, {
    reply: stripThanks(reply),
    needConfirm: false,
    heardNumber: null,
  });
};
