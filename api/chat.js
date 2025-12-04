// 내부노트: 함수 이름은 "채팅", 
// "응답 시간": "지연시간".

// CORS 헤더 설정 (필요 시 수정 가능)
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// 기본 핸들러 함수 (API 엔드포인트)
export default async function handler(req, res) {
  // OPTIONS 요청 처리 (CORS Preflight)
  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  // POST 요청만 허용
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "허용되지 않는 메서드입니다!",
    });
  }

  // API 키 체크
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY가 없습니다!",
    });
  }

  // 요청 body에서 메시지 추출
  const { message } = req.body;

  if (!message || message.trim() === "") {
    return res.status(400).json({
      error: "유효하지 않은 메시지입니다.",
    });
  }

  try {
    // OpenAI Chat Completion 호출
    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: message }],
          max_tokens: 300,
