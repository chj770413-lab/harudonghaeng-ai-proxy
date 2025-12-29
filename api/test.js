export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  try {
    res.status(200).json({
      ok: true,
      message: "서버 함수 정상 실행",
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
}
