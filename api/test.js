import axios from "axios";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  try {
    const r = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "한 단어만 말해줘" }],
        max_tokens: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json({
      ok: true,
      reply: r.data.choices[0].message.content,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.response?.data || e.message,
    });
  }
}
