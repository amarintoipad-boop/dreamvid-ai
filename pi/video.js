
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "กรุณาใช้ POST"
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel"
    });
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-lite-generate-preview:predictLongRunning",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          instances: [
            {
              prompt: String(req.body?.prompt || "A beautiful cinematic landscape")
            }
          ],
          parameters: {
            aspectRatio: "9:16",
            durationSeconds: 4
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "เริ่มสร้างวิดีโอไม่สำเร็จ"
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: "เกิดข้อผิดพลาดในการเชื่อมต่อ AI"
    });
  }
}
