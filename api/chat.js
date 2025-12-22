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
  const m = text.match(/\d{2,3}/);
  return m ? Number(m[0]) : null;
}

function isPositiveConfirm(text = "") {
  return /^(맞아|네|예|그래)$/i.test(text.trim());
}

function isNegativeConfirm(text = "") {
  return /^(아니야|아니|틀려|다시)$/i.test(text.trim());
}

function isDangerQuestion(text = "") {
  return /위험|괜찮은|큰일|문제/.test(text);
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

  const { message = "", messages: clientMessages = [] } = req.body || {};
  if (!message && clientMessages.length === 0) {
    return sendResponse(res, 400, { error: "메시지 없음" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return sendResponse(res, 500, { error: "API KEY 없음" });
  }

  const text = message.trim();
  const currentNumeric = extractNumeric(text);

  // ----------------------------
  // 상태 판단
  // ----------------------------
  const lastAssistant = [...clientMessages].reverse().find(m => m.role === "assistant");
  const awaitingConfirm =
    lastAssistant && /제가 이렇게 들었어요/.test(lastAssistant.content || "");

  // ----------------------------
  // STEP 1️⃣ 숫자 확인 응답 처리
  // ----------------------------
  if (awaitingConfirm) {
    if (isPositiveConfirm(text)) {
      // 확인 완료 → 다음 단계 진행
    } else if (isNegativeConfirm(text) || extractNumeric(text) !== null) {
      // 다시 숫자 입력 유도
      return sendResponse(res, 200, {
        reply:
          "괜찮아요.\n" +
          "숫자를 한 자리씩 천천히 말씀해 주세요.\n" +
          "예를 들어 1, 4, 5 처럼요.",
      });
    } else {
      return sendResponse(res, 200, {
        reply: "맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
      });
    }
  }

  // ----------------------------
  // STEP 2️⃣ 새 숫자 인식 → 눈으로 확인
  // ----------------------------
  if (currentNumeric !== null && !awaitingConfirm) {
    return sendResponse(res, 200, {
      reply:
        `제가 이렇게 들었어요: ${currentNumeric}\n` +
        "맞으면 '맞아'라고 말씀해 주시고,\n" +
        "아니면 숫자를 다시 말씀해 주세요.",
    });
  }

  // ----------------------------
  // 불안 질문 분기
  // ----------------------------
  let extraRule = "";
  if (isDangerQuestion(text)) {
    extraRule = `
추가 규칙:
- 먼저 공감
- 위험/안전 단정 금지
- 변화와 흐름 강조
- "같이 정리해드릴게요" 톤 유지
`;
  }

  // ----------------------------
  // 일반 대화 / 설명 단계
  // ----------------------------
  const messages = [
    { role: "system", content: systemPrompt + extraRule },
    ...clientMessages,
    { role: "user", content: text },
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
    let reply = data.choices?.[0]?.message?.content || "";

    // 수치 설명 단계에서도 감사/고마워요 제거
    if (currentNumeric !== null) {
      reply = reply.replace(
        /^(혈당|혈압)?( 수치에 대해)?( 말씀해 주셔서)?( 감사합니다| 고마워요)[.!]?\s*/i,
        ""
      );
    }

    return sendResponse(res, 200, { reply });
  } catch (err) {
    return sendResponse(res, 500, { error: err.message || "서버 오류" });
  }
};

