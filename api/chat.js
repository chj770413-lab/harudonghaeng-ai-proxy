// ----------------------------
// CORS 설정
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
당신의 역할은 말을 잘 듣고 핵심만 정리해 주는 간호사입니다.

원칙:
- 건강 수치 하나만으로 판단하거나 단정하지 않습니다.
- 불안을 키우지 않습니다.
- 항상 2~3문장으로 말하고 질문은 1개만 합니다.
`;

// ----------------------------
// 유틸
// ----------------------------
function extractNumeric(text = "") {
  const m = String(text).match(/\d{2,3}/);
  return m ? Number(m[0]) : null;
}

function isConfirm(text = "") {
  return /^(맞아|네|예|응|응 맞아)$/i.test(text.trim());
}

function isReject(text = "") {
  return /^(아니야|아니|틀려|다시)$/i.test(text.trim());
}

// ----------------------------
// OpenAI 호출
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

  const d = await r.json();
  if (!r.ok) throw new Error("OpenAI error");
  return d.choices[0].message.content;
}

// ----------------------------
// 메인 핸들러
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
  // 🔴 확인 단계 (AI 호출 ❌)
  // ----------------------------
  if (pendingNumericConfirm) {
    // 확인 완료
    if (isConfirm(text)) {
      if (!heardNumber) {
        return sendResponse(res, 200, {
          reply: "숫자를 한 번만 다시 말씀해 주세요.",
        });
      }

      // ❗ 여기서 OpenAI 호출하지 않는다
      return sendResponse(res, 200, {
        reply:
          `말씀해주신 ${heardNumber}라는 수치는 ` +
          "한 번의 측정만으로 판단하기엔 조심스러워요. " +
          "최근 며칠간의 변화나 상황을 같이 보는 게 도움이 될 수 있어요. " +
          "최근에 식사나 활동에 변화가 있었을까요?",
      });
    }

    // 수정 요청
    if (isReject(text) || numeric !== null) {
      return sendResponse(res, 200, {
        reply:
          "괜찮아요.\n" +
          "숫자를 한 자리씩 천천히 말씀해 주세요.\n" +
          "예를 들어 1, 4, 5 처럼요.",
      });
    }

    return sendResponse(res, 200, {
      reply: "맞으면 '맞아', 아니면 '아니야'라고 말씀해 주세요.",
    });
  }

  // ----------------------------
  // 🔵 숫자 최초 인식
  // ----------------------------
  if (numeric !== null) {
    return sendResponse(res, 200, {
      reply:
        `제가 이렇게 들었어요: ${numeric}\n` +
        "맞으면 '맞아'라고 말씀해 주시고,\n" +
        "아니면 숫자를 다시 말씀해 주세요.",
      needConfirm: true,
      heardNumber: numeric,
    });
  }

  // ----------------------------
  // 🔵 일반 대화 (여기서만 OpenAI 호출)
  // ----------------------------
  try {
    const reply = await callOpenAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ]);
    return sendResponse(res, 200, { reply });
  } catch (e) {
    return sendResponse(res, 500, { error: "서버 오류" });
  }
};
