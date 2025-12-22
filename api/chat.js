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
  for (const key in CORS_HEADERS) {
    res.setHeader(key, CORS_HEADERS[key]);
  }
  res.json(body);
}

// ----------------------------
// 하루동행 SYSTEM PROMPT (최종 고정)
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
- 수치나 정보가 주어졌을 때는 "감사합니다", "고마워요" 같은 인사로 시작하지 않습니다.


응답 방식:
- 항상 2~3문장으로 응답합니다.
- 마지막에는 질문을 1개만 합니다.
- 말투는 차분하고 시니어에게 부담이 없어야 합니다.
- 명령하지 않고, 선택할 수 있게 말합니다.
`;

// ----------------------------
// 수치 관련 유틸
// ----------------------------
function extractNumeric(text = "") {
  const match = text.match(/\d{2,3}/);
  return match ? Number(match[0]) : null;
}

function hasAmbiguousWord(text = "") {
  return /쯤|정도|약/.test(text);
}

function isDangerQuestion(text = "") {
  return /위험|괜찮은|큰일|문제/.test(text);
}

function isPositiveConfirm(text = "") {
  return /^(응|맞아|그래|예|네)$/i.test(text.trim());
}

// ----------------------------
// 메인 핸들러
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

  // ----------------------------
  // 🔒 재확인 상태 판단
  // ----------------------------
  const lastAssistant = [...clientMessages].reverse().find(m => m.role === "assistant");
  const awaitingConfirm =
    lastAssistant &&
    /맞는지.*확인/.test(lastAssistant.content || "");

  const currentNumeric = extractNumeric(message || "");

  // ----------------------------
  // STEP A: 재확인 응답 처리 (최우선)
  // ----------------------------
  if (awaitingConfirm) {
    // 사용자가 숫자를 다시 말해준 경우
    if (currentNumeric !== null) {
      // 재확인 종료 → 정상 흐름으로 넘어감
      // (아래 AI 호출로 진행)
    }
    // "응 / 맞아" 같은 긍정 응답
    else if (isPositiveConfirm(message || "")) {
      // 숫자는 직전 assistant 질문에 있던 숫자를 그대로 인정
      // 재확인 종료 → 정상 흐름으로 넘어감
    }
    // 그 외 애매한 답
    else {
      return sendResponse(res, 200, {
        reply: "숫자를 한 번만 다시 말씀해 주실 수 있을까요?",
      });
    }
    // 여기로 내려오면 재확인 단계는 종료
  }

  // ----------------------------
  // STEP 0: 새 수치 등장 → 재확인 질문
  // ----------------------------
  if (currentNumeric !== null && !awaitingConfirm) {
    if (hasAmbiguousWord(message || "")) {
      return sendResponse(res, 200, {
        reply: `혹시 제가 잘못 들었을 수도 있어서요.
${currentNumeric}가 맞는지 한 번만 확인해도 될까요?`,
      });
    }
  }

  // ----------------------------
  // 불안 질문 분기
  // ----------------------------
  let extraSystemRule = "";
  if (isDangerQuestion(message || "")) {
    extraSystemRule = `
추가 규칙(불안 대응):
- 먼저 공감합니다.
- 위험/안전으로 단정하지 않습니다.
- 숫자 하나보다 변화와 흐름을 강조합니다.
- 마지막에는 "같이 정리해드릴게요. 지금은 혼자 판단하려고 애쓰지 않으셔도 괜찮아요." 톤을 유지합니다.
`;
  }

  // ----------------------------
  // OpenAI 호출
  // ----------------------------
  const messages = [
    { role: "system", content: systemPrompt + extraSystemRule },
    ...clientMessages,
    ...(message ? [{ role: "user", content: message }] : []),
  ];

  try {
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
    if (!openaiRes.ok) {
      return sendResponse(res, openaiRes.status, data);
    }

    return sendResponse(res, 200, {
      reply: data.choices?.[0]?.message?.content || "",
    });
  } catch (err) {
    return sendResponse(res, 500, {
      error: err.message || "서버 오류",
    });
  }
};
