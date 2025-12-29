export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "한 단어만 말해줘" }],
        max_tokens: 10,
      }),
    });

    const data = await r.json();

    res.status(200).json({
      ok: true,
      reply: data.choices?.[0]?.message?.content || "응답 없음",
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
}
