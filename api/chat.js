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
- 불안을 키우지 않고, 먼저 공감합니다.
- 조언보다는 관찰과 기록을 중심으로 안내합니다.
- 병원이나 의사 언급은 필요 조건이 충족될 때만 합니다.
- 수치나 정보가 주어졌을 때는 감사/고마워요로 시작하지 않습니다.

응답 방식:
- 항상 2~3문장
- 질문은 1개만
- 차분하고 시니어에게 부담 없는 말투
`;

// ----------------------------
// 유틸
// ----------------------------
function extractNumeric(text = "") {
  const m = String(text).match(/\d{2,3}/);
  return m ? Number(m[0]) : null;
}

// ✅ 확인 단계에서 "정확 키워드"만 인정
function isPositiveConfirm(text = "") {
  return /^(맞아|네|예)$/i.test(text.trim());
}
function isNegativeConfirm(text = "") {
  return /^(아니야|아니|틀려|다시)$/i.test(text.trim());
}

// ❌ "응 맞아" 같은 느슨한 동의는 "맞아"로 강제 유도(확인 단계에서만)
function isLooseConfirm(text = "") {
  return /^(응\s*맞아|응|맞는\s*것\s*같아|그런\s*것\s*같아)$/i.test(text.trim());
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

function stripThanks(reply = "") {
  return String(reply).replace(
    /^(혈당|혈압)?( 수치에 대해)?( 말씀해 주셔서)?\s*(감사합니다|고마워요)[.!]?\s*/i,
    ""
  );
}

// ----------------------------
// OpenAI 호출 공통
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

// ----------------------------
// 설명 단계 공통 처리
// ----------------------------
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

  return sendResponse(res, 200, { reply });
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

    // ✅ 프론트에서 보내줄 상태 (없어도 동작하도록 처리)
    pendingNumericConfirm = false,

    // ✅ 프론트에서 저장해둔 "내가 이렇게 들었어요: N"의 N
    // (대표님이 messages를 안 보내는 구조라서 이게 최소로 필요)
    heardNumber = null,
  } = req.body || {};

  if (!message && clientMessages.length === 0) {
    return sendResponse(res, 400, { error: "메시지 없음" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return sendResponse(res, 500, { error: "API KEY 없음" });
  }

  const text = String(message).trim();
  const currentNumeric = extractNumeric(text);

  // ----------------------------
  // ✅ 확인 상태는 "문구 매칭"이 아니라, 프론트가 준 플래그로 판단
  // ----------------------------
  const awaitingConfirm = pendingNumericConfirm === true;

  // ----------------------------
  // STEP 1️⃣ 숫자 확인 응답 처리
  // ----------------------------
  if (awaitingConfirm) {
    // 1-0) 느슨한 동의는 차단하고 '맞아/아니야'만 받기
    if (isLooseConfirm(text)) {
      return sendResponse(res, 200, {
        reply:
          "확인을 위해서요.\n" +
          "맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
      });
    }

    // 1-1) 확인 완료
    if (isPositiveConfirm(text)) {
      const confirmed = Number.isFinite(heardNumber) ? Number(heardNumber) : null;

      if (!confirmed) {
        // ✅ confirmed 숫자를 모르면 절대 진행하지 않음
        return sendResponse(res, 200, {
          reply: "숫자를 한 번만 다시 말씀해 주실 수 있을까요?",
        });
      }

      const explanationRequest =
        `혈당 수치 ${confirmed}에 대해 ` +
        "한 번의 수치로 단정하지 말고, 2~3문장으로 차분히 설명해 주세요. " +
        "마지막에 질문 1개만 해 주세요.";

      return proceedToExplanation({
        res,
        clientMessages,
        userText: explanationRequest,
        numericContext: true,
      });
    }

    // 1-2) 수정 요청 또는 숫자 재입력
    if (isNegativeConfirm(text) || currentNumeric !== null) {
      return sendResponse(res, 200, {
        reply:
          "괜찮아요.\n" +
          "숫자를 한 자리씩 천천히 말씀해 주세요.\n" +
          "예를 들어 1, 4, 5 처럼요.",
      });
    }

    // 1-3) 애매한 응답
    return sendResponse(res, 200, {
      reply: "맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
    });
  }

  // ----------------------------
  // STEP 2️⃣ 새 숫자 인식 → 눈으로 확인
  // ----------------------------
  if (currentNumeric !== null && !awaitingConfirm) {
    // ✅ 프론트가 저장할 수 있도록 숫자도 같이 내려줌
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
  // STEP 3️⃣ 패턴 요약 (대화 내 수치 3개 이상)
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
  // 불안 질문 분기
  // ----------------------------
  let extraRule = "";
  if (isDangerQuestion(text)) {
    extraRule = `
추가 규칙(불안 대응):
- 먼저 공감합니다.
- 위험/안전 단정 금지
- 변화와 흐름 강조
- "같이 정리해드릴게요" 톤 유지
`;
  }

  // ----------------------------
  // STEP 4️⃣ 일반 대화
  // ----------------------------
  return proceedToExplanation({
    res,
    clientMessages,
    userText: text,
    extraRule,
    numericContext: false,
  });
};
