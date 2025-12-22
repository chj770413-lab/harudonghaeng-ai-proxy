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
- 불안을 키우지 않으며, 조언보다는 관찰과 기록을 중심으로 안내합니다.
- 수치나 정보가 주어졌을 때는 감사/고마워요로 시작하지 않습니다.

응답 방식:
- 항상 2~3문장
- 마지막에는 질문 1개만
- 차분하고 부담 없는 말투
`;

// ----------------------------
// 유틸
// ----------------------------
function extractNumeric(text = "") {
  const m = String(text).match(/\d{2,3}/);
  return m ? Number(m[0]) : null;
}

function isPositiveConfirm(text = "") {
  return /^(맞아|네|예)$/i.test(String(text).trim());
}
function isNegativeConfirm(text = "") {
  return /^(아니야|아니|틀려|다시)$/i.test(String(text).trim());
}
// 느슨한 동의는 확인 단계에서 차단
function isLooseConfirm(text = "") {
  return /^(응\s*맞아|응|맞는\s*것\s*같아|그런\s*것\s*같아)$/i.test(String(text).trim());
}

function stripThanks(reply = "") {
  return String(reply).replace(
    /^(혈당|혈압)?( 수치에 대해)?( 말씀해 주셔서)?\s*(감사합니다|고마워요)[.!]?\s*/i,
    ""
  );
}

// ----------------------------
// OpenAI 호출
// ----------------------------
async function callOpenAI(messages) {
  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
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

  const data = await openaiRes.json();
  return { ok: openaiRes.ok, status: openaiRes.status, data };
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
    // 대표님 앱은 messages 히스토리를 안 보내는 구조 → 없어도 됨
    messages: clientMessages = [],

    // ✅ 프론트가 보내는 확인 상태/숫자
    pendingNumericConfirm = false,
    heardNumber = null,
  } = req.body || {};

  if (!message && clientMessages.length === 0) {
    return sendResponse(res, 400, { error: "메시지 없음" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return sendResponse(res, 500, { error: "OPENAI_API_KEY가 없습니다." });
  }

  const text = String(message).trim();
  const currentNumeric = extractNumeric(text);

  // ✅ 확인 상태는 문구매칭이 아니라 프론트 플래그로만 판단
  const awaitingConfirm = pendingNumericConfirm === true;

  // ----------------------------
  // STEP 1: 확인 단계 처리
  // ----------------------------
  if (awaitingConfirm) {
    // 느슨한 동의(응/응 맞아) 차단
    if (isLooseConfirm(text)) {
      return sendResponse(res, 200, {
        reply: "확인을 위해서요.\n맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
        needConfirm: true,
        heardNumber: Number.isFinite(heardNumber) ? heardNumber : null,
      });
    }

    // 부정이면 다시 숫자 말하게 안내 (확인 단계 유지)
    if (isNegativeConfirm(text) || currentNumeric !== null) {
      return sendResponse(res, 200, {
        reply: "괜찮아요.\n숫자를 한 자리씩 천천히 말씀해 주세요.\n예를 들어 1, 4, 5 처럼요.",
        needConfirm: true,
        heardNumber: null,
      });
    }

    // 긍정(맞아/네/예) → 여기서만 LLM 설명 호출
    if (isPositiveConfirm(text)) {
      const confirmed = Number.isFinite(heardNumber) ? Number(heardNumber) : null;

      // 숫자 없으면 절대 설명으로 못 넘어감
      if (!confirmed) {
        return sendResponse(res, 200, {
          reply: "숫자를 한 번만 다시 말씀해 주실 수 있을까요?",
          needConfirm: true,
          heardNumber: null,
        });
      }

      const messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            `혈당 수치 ${confirmed}에 대해 ` +
            "한 번의 수치로 단정하지 말고 2~3문장으로 차분히 설명해 주세요. " +
            "마지막에는 질문 1개만 해 주세요.",
        },
      ];

      const result = await callOpenAI(messages);
      if (!result.ok) return sendResponse(res, result.status, result.data);

      let reply = result.data.choices?.[0]?.message?.content || "";
      reply = stripThanks(reply);

      // ✅ 설명 단계로 넘어가므로 needConfirm을 주지 않음(프론트가 pending 해제)
      return sendResponse(res, 200, { reply });
    }

    // 그 외 입력은 확인 키워드로 유도 (확인 단계 유지)
    return sendResponse(res, 200, {
      reply: "맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
      needConfirm: true,
      heardNumber: Number.isFinite(heardNumber) ? heardNumber : null,
    });
  }

  // ----------------------------
  // STEP 2: 숫자 들어오면 무조건 확인 단계로 전환
  // ----------------------------
  if (currentNumeric !== null && !awaitingConfirm) {
    return sendResponse(res, 200, {
      reply:
        `제가 이렇게 들었어요: ${currentNumeric}\n` +
        "맞으면 '맞아'라고 말씀해 주시고,\n" +
        "아니면 숫자를 다시 말씀해 주세요.",
      needConfirm: true,
      heardNumber: currentNumeric,
    });
  }

  // ----------------------------
  // STEP 3: 일반 대화 (숫자 아님)
  // ----------------------------
  const messages = [
    { role: "system", content: systemPrompt },
    ...clientMessages,
    { role: "user", content: text },
  ];

  const result = await callOpenAI(messages);
  if (!result.ok) return sendResponse(res, result.status, result.data);

  const reply = result.data.choices?.[0]?.message?.content || "";
  return sendResponse(res, 200, { reply });
};
