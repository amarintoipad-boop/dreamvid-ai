const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'veo-3.1-lite-generate-preview';
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function getKey() { return process.env.GEMINI_API_KEY || ''; }
function safeOperationName(value) {
  if (typeof value !== 'string' || value.length > 300) return false;
  if (value.includes('..') || value.startsWith('/') || value.includes('://')) return false;
  return /^[A-Za-z0-9_./:-]+$/.test(value);
}
function safeVideoUri(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'generativelanguage.googleapis.com';
  } catch { return false; }
}
async function getPlan(body, key) {
  const topic = String(body.topic || '').trim().slice(0, 1500);
  if (!topic) return { status: 400, body: { error: 'กรุณากรอกหัวข้อคลิป' } };
  const seconds = ['4','6','8'].includes(String(body.seconds)) ? String(body.seconds) : '4';
  const ratio = body.ratio === '16:9' ? '16:9' : '9:16';
  const prompt = `คุณเป็นผู้กำกับวิดีโอสั้นและนักเขียนคอนเทนต์ ตอบเป็น JSON object ภาษาไทยเท่านั้น หัวข้อ: ${topic}. รูปแบบ: ${ratio}. ความยาววิดีโอ AI: ${seconds} วินาที. keys: title, hook, concept, voiceover, video_prompt, caption, hashtags (array). video_prompt ต้องเป็นคำอธิบายภาพเคลื่อนไหวแบบละเอียดที่สามารถใช้กับโมเดลสร้างวิดีโอได้ โดยระบุฉาก การเคลื่อนกล้อง แสง สไตล์ภาพ และเสียงหากเหมาะสม ห้ามอ้างสรรพคุณสินค้า ราคา หรือข้อเท็จจริงที่ไม่ได้รับข้อมูล`;
  const r = await fetch(`${BASE}/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.7 } })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { status: r.status, body: { error: d?.error?.message || 'Gemini ยังสร้างแผนคลิปไม่ได้ ตรวจสอบ API key และโควตา' } };
  const raw = d?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  try { return { status: 200, body: { plan: JSON.parse(raw) } }; }
  catch { return { status: 502, body: { error: 'AI ส่งผลลัพธ์กลับมาในรูปแบบที่อ่านไม่ได้ กรุณาลองใหม่' } }; }
}
export default async function handler(req, res) {
  const key = getKey();
  if (!key) return send(res, 500, { error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel Project Settings → Environment Variables' });

  const action = req.method === 'GET' ? String(req.query?.action || '') : String(req.body?.action || '');

  if (req.method === 'POST' && action === 'plan') {
    try {
      const result = await getPlan(req.body || {}, key);
      return send(res, result.status, result.body);
    } catch { return send(res, 502, { error: 'ติดต่อ Gemini ไม่สำเร็จ กรุณาลองใหม่' }); }
  }

  if (req.method === 'POST' && action === 'start') {
    const prompt = String(req.body?.prompt || '').trim().slice(0, 1500);
    if (!prompt) return send(res, 400, { error: 'กรุณากรอกคำอธิบายวิดีโอ' });
    const aspectRatio = req.body?.aspectRatio === '16:9' ? '16:9' : '9:16';
    const durationSeconds = ['4','6','8'].includes(String(req.body?.durationSeconds)) ? String(req.body.durationSeconds) : '4';
    try {
      const r = await fetch(`${BASE}/models/${MODEL}:predictLongRunning`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ instances: [{ prompt }], parameters: { aspectRatio, durationSeconds, resolution: '720p', numberOfVideos: 1 } })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return send(res, r.status, { error: d?.error?.message || 'Google ปฏิเสธคำขอสร้างวิดีโอ กรุณาตรวจสอบการเรียกเก็บเงินและสิทธิ์เข้าถึง Veo' });
      if (!d.name) return send(res, 502, { error: 'Google ไม่ได้ส่งรหัสงานกลับมา' });
      return send(res, 200, { name: d.name });
    } catch { return send(res, 502, { error: 'ติดต่อบริการสร้างวิดีโอไม่สำเร็จ' }); }
  }

  if (req.method === 'GET' && action === 'status') {
    const name = req.query?.name;
    if (!safeOperationName(name)) return send(res, 400, { error: 'รหัสงานไม่ถูกต้อง' });
    try {
      const r = await fetch(`${BASE}/${name}`, { headers: { 'x-goog-api-key': key } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return send(res, r.status, { error: d?.error?.message || 'ตรวจสถานะงานไม่สำเร็จ' });
      if (!d.done) return send(res, 200, { done: false });
      if (d.error) return send(res, 502, { error: d.error.message || 'Google สร้างวิดีโอไม่สำเร็จ' });
      const sample = d?.response?.generateVideoResponse?.generatedSamples?.[0] || d?.response?.generatedVideos?.[0];
      const uri = sample?.video?.uri || sample?.video?.url;
      if (!uri || !safeVideoUri(uri)) return send(res, 502, { error: 'งานเสร็จแล้วแต่ไม่พบลิงก์ไฟล์วิดีโอที่ถูกต้อง' });
      const videoUrl = `/api/video?action=download&uri=${encodeURIComponent(uri)}`;
      return send(res, 200, { done: true, videoUrl });
    } catch { return send(res, 502, { error: 'ตรวจสถานะวิดีโอไม่สำเร็จ กรุณาลองใหม่' }); }
  }

  if (req.method === 'GET' && action === 'download') {
    const uri = req.query?.uri;
    if (!safeVideoUri(uri)) return send(res, 400, { error: 'ลิงก์วิดีโอไม่ถูกต้อง' });
    try {
      const upstream = await fetch(uri, { headers: { 'x-goog-api-key': key } });
      if (!upstream.ok) return send(res, upstream.status, { error: 'ดาวน์โหลดไฟล์จาก Google ไม่สำเร็จ กรุณาสร้างใหม่อีกครั้ง' });
      res.statusCode = 200;
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
      res.setHeader('Content-Disposition', 'inline; filename="dreamvid-ai.mp4"');
      res.setHeader('Cache-Control', 'no-store');
      if (upstream.body) return upstream.body.pipeTo(new WritableStream({
        write(chunk) { res.write(Buffer.from(chunk)); },
        close() { res.end(); },
        abort() { res.end(); }
      })).catch(() => { if (!res.writableEnded) res.end(); });
      const buffer = Buffer.from(await upstream.arrayBuffer());
      return res.end(buffer);
    } catch { return send(res, 502, { error: 'ดาวน์โหลดไฟล์วิดีโอไม่สำเร็จ' }); }
  }

  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, { error: 'Method หรือ action ไม่ถูกต้อง' });
}
