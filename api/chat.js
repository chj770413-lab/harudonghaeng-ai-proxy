// ----------------------------
// CORS 설정
// ----------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ----------------------------
// 응답 헬퍼
// ----------------------------
function sendResponse(res, status, body) {
  res.status(status);
  for (const k in CORS_HEADERS) res.setHeader(k, CORS_HEADERS[k]);
  res.json(body);
}

// ----------------------------
// 하루동행 SYSTEM PROMPT
// ----------------------------
const systemPrompt = `
당신은 '하루동행'이라는 시니어 건강 도우미입니다.
당신의 역할은 말을 잘 듣고 핵심만 정리해 주는 간호사입니다.

원칙:
- 건강 수치 하나만으로 판단하거나 단정하지 않습니다.
- "정상", "위험", "높다", "낮다" 같은 단정적인 표현을 사용하지 않습니다.
- 불안을 키우지 않습니다.
- 항상 2~3문장으로 말합니다.
- 마지막에는 질문을 1개만 합니다.
- 수치에 대해 감사/고마워요로 시작하지 않습니다.
`;

// ----------------------------
// 유틸
// ----------------------------
function extractNumeric(text = "") {
  const m = text.match(/\d{2,3}/);
  return m ? Number(m[0]) : null;
}

function isPositiveConfirm(text = "") {
  return /^(맞아|네|예)$/i.test(text.trim());
}
function isNegativeConfirm(text = "") {
  return /^(아니야|아니|틀려|다시)$/i.test(text.trim());
}
function isLooseConfirm(text = "") {
  return /(응\s*맞아|응|맞는\s*것\s*같아|그런\s*것\s*같아)/i.test(text.trim());
}

// ----------------------------
// OpenAI 호출
// ----------------------------
async function callOpenAI(messages) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ----------------------------
// 메인 핸들러
// ----------------------------
module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    for (const k in CORS_HEADERS) res.setHeader(k, CORS_HEADERS[k]);
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendResponse(res, 405, { error: "POST only" });
  }

  const {
    message = "",
    messages: clientMessages = [],
    pendingNumericConfirm = false, // ✅ 핵심
  } = req.body || {};

  const text = message.trim();
  const currentNumeric = extractNumeric(text);

  // ======================================================
  // ✅ STEP 1. 숫자 확인 단계 (오직 pendingNumericConfirm)
  // ======================================================
  if (pendingNumericConfirm) {
    // 느슨한 동의 차단
    if (isLooseConfirm(text)) {
      return sendResponse(res, 200, {
        reply: "확인을 위해서요. 맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
      });
    }

    // 확인 완료
    if (isPositiveConfirm(text)) {
      return sendResponse(res, 200, {
        reply: "확인되었습니다. 그 수치에 대해 차분히 정리해 드릴게요.",
      });
    }

    // 다시 말하기
    if (isNegativeConfirm(text) || currentNumeric !== null) {
      return sendResponse(res, 200, {
        reply: "괜찮아요. 숫자를 한 자리씩 천천히 다시 말씀해 주세요.",
      });
    }

    return sendResponse(res, 200, {
      reply: "맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
    });
  }

  // ======================================================
  // ✅ STEP 2. 새 숫자 → 확인 요청
  // ======================================================
  if (currentNumeric !== null) {
    return sendResponse(res, 200, {
      reply: `제가 이렇게 들었어요: ${currentNumeric}\n맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.`,
    });
  }

  // ======================================================
  // ✅ STEP 3. 일반 대화
  // ======================================================
  const reply = await callOpenAI([
    { role: "system", content: systemPrompt },
    ...clientMessages,
    { role: "user", content: text },
  ]);

  return sendResponse(res, 200, { reply });
};
