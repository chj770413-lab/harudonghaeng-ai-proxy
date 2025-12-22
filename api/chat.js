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
// 하루동행 SYSTEM PROMPT (고정)
// ----------------------------
const systemPrompt = `
당신은 '하루동행'이라는 시니어 건강 도우미입니다.
당신의 역할은 말을 잘 듣고 핵심만 정리해 주는 간호사입니다.

원칙:
- 건강 수치 하나만으로 판단하거나 단정하지 않습니다.
- "정상", "위험", "높다", "낮다" 같은 단정적인 표현을 사용하지 않습니다.
- 불안을 키우지 않으며, 차분합니다.
- 조언보다는 관찰과 기록 중심으로 안내합니다.
- 수치/정보가 주어졌을 때 감사/고마워요로 시작하지 않습니다.

응답 방식:
- 항상 2~3문장
- 마지막에는 질문 1개만
`;

// ----------------------------
// 유틸
// ----------------------------
function extractNumeric(text = "") {
  const m = String(text).match(/\d{2,3}/);
  return m ? Number(m[0]) : null;
}

function stripThanks(reply = "") {
  return String(reply).replace(
    /^(혈당|혈압)?( 수치에 대해)?( 말씀해 주셔서)?\s*(감사합니다|고마워요)[.!]?\s*/i,
    ""
  );
}

function isDangerQuestion(text = "") {
  return /위험|괜찮은|큰일|문제/.test(text);
}

function extractHistoryNumerics(messages = []) {
  return messages
    .map((m) => extractNumeric(m.content))
    .filter((v) => v !== null);
}

function hasPattern(values = []) {
  return values.length >= 3;
}

// ----------------------------
// OpenAI 호출
// ----------------------------
async function callOpenAI({ messages }) {
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
  if (!openaiRes.ok) return { ok: false, status: openaiRes.status, data };
  return { ok: true, data };
}

async function proceedToExplanation({
  res,
  clientMessages,
  userText,
  extraRule = "",
  numericContext = false,
}) {
  const messages = [
    { role: "system", content: systemPrompt + extraRule },
    ...clientMessages,
    { role: "user", content: userText },
  ];

  const result = await callOpenAI({ messages });
  if (!result.ok) return sendResponse(res, result.status, result.data);

  let reply = result.data.choices?.[0]?.message?.content || "";
  if (numericContext) reply = stripThanks(reply);

  return sendResponse(res, 200, { reply, needConfirm: false, heardNumber: null });
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

    // 프론트 상태
    pendingNumericConfirm = false,
    heardNumber = null,
    confirmAction = null, // "yes" | "no" | "loose" | null

    mode = "",
  } = req.body || {};

  if (!process.env.OPENAI_API_KEY) {
    return sendResponse(res, 500, { error: "OPENAI_API_KEY가 없습니다." });
  }

  const text = String(message).trim();
  const currentNumeric = extractNumeric(text);

  // ----------------------------
  // ✅ 1) 확인 단계: LLM 호출 금지 (여기서 모든 문제 해결)
  // ----------------------------
  if (pendingNumericConfirm === true) {
    // 느슨한 동의(응 맞아/응)는 버튼이 아님 → 강제 유도
    if (confirmAction === "loose") {
      return sendResponse(res, 200, {
        reply: "확인을 위해서요.\n맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
        needConfirm: true,
        heardNumber: Number.isFinite(heardNumber) ? heardNumber : null,
      });
    }

    // 아니야 → 숫자 다시 말하기 안내 (확인 유지)
    if (confirmAction === "no") {
      return sendResponse(res, 200, {
        reply:
          "괜찮아요.\n숫자를 한 자리씩 천천히 말씀해 주세요.\n예를 들어 1, 4, 5 처럼요.",
        needConfirm: true,
        heardNumber: null,
      });
    }

    // 맞아 → 여기서만 설명 단계로 넘어감 (LLM 호출)
    if (confirmAction === "yes") {
      const confirmed = Number.isFinite(heardNumber) ? Number(heardNumber) : null;
      if (!confirmed) {
        return sendResponse(res, 200, {
          reply: "숫자를 한 번만 다시 말씀해 주실 수 있을까요?",
          needConfirm: true,
          heardNumber: null,
        });
      }

      // ✅ "맞아"라는 단어는 절대 LLM에 전달하지 않는다
      const explanationRequest =
        mode === "health"
          ? `공복 혈당 수치 ${confirmed}에 대해, 한 번의 수치로 단정하지 말고 2~3문장으로 차분히 설명해 주세요. 마지막에 질문 1개만 해 주세요.`
          : `수치 ${confirmed}에 대해, 단정하지 말고 2~3문장으로 설명해 주세요. 마지막에 질문 1개만 해 주세요.`;

      return proceedToExplanation({
        res,
        clientMessages,
        userText: explanationRequest,
        numericContext: true,
      });
    }

    // confirmAction이 없고 숫자만 다시 말한 경우(예: "145") → 새 숫자 확인으로 대체
    if (currentNumeric !== null) {
      return sendResponse(res, 200, {
        reply:
          `제가 이렇게 들었어요: ${currentNumeric}\n` +
          "맞으면 '맞아'라고 말씀해 주시고,\n" +
          "아니면 숫자를 다시 말씀해 주세요.",
        needConfirm: true,
        heardNumber: currentNumeric,
      });
    }

    // 그 외 입력은 확인 유도
    return sendResponse(res, 200, {
      reply: "맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
      needConfirm: true,
      heardNumber: Number.isFinite(heardNumber) ? heardNumber : null,
    });
  }

  // ----------------------------
  // ✅ 2) 숫자 입력 → 바로 확인 단계로 전환
  // ----------------------------
  if (currentNumeric !== null) {
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
  // ✅ 3) 패턴 요약 (히스토리 수치 3개 이상)
  // ----------------------------
  const historyValues = extractHistoryNumerics(clientMessages);
  if (hasPattern(historyValues)) {
    const patternRule = `
추가 규칙(패턴 요약):
- 여러 수치를 종합해 "흐름"만 요약합니다.
- 평균/정상/위험 같은 단정은 하지 않습니다.
- "최근 기록을 보면", "며칠간의 흐름을 보면" 같은 표현을 사용합니다.
- 다음 행동은 선택지로 제안합니다.
`;
    return proceedToExplanation({
      res,
      clientMessages,
      userText: "최근 수치 흐름을 2~3문장으로 요약하고, 마지막에 질문 1개만 해 주세요.",
      extraRule: patternRule,
      numericContext: true,
    });
  }

  // ----------------------------
  // ✅ 4) 불안 질문 분기
  // ----------------------------
  let extraRule = "";
  if (isDangerQuestion(text)) {
    extraRule = `
추가 규칙(불안 대응):
- 먼저 공감합니다.
- 위험/안전 단정 금지
- 변화와 흐름 강조
`;
  }

  // ----------------------------
  // ✅ 5) 일반 대화
  // ----------------------------
  return proceedToExplanation({
    res,
    clientMessages,
    userText: text,
    extraRule,
    numericContext: false,
  });
};


