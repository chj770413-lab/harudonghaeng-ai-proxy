import { OpenAI } from "openai";

export const config = {
  api: {
    bodyParser: false,
  },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  try {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));

    req.on("end", async () => {
      const buffer = Buffer.concat(chunks);

      const result = await openai.audio.transcriptions.create({
        file: {
          buffer,
          filename: "audio.wav",
          contentType: "audio/wav"
        },
        model: "whisper-1",
      });

      res.status(200).json({ text: result.text });
    });

  } catch (error) {
    console.error("Whisper error:", error);
    res.status(500).json({ error: "Whisper failed" });
  }
}

