import { list } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { blobs } = await list();
    // Filter for media files (images/videos), skip guestbook.xlsx
    const media = blobs
      .filter(b => b.pathname && !/guestbook\.xlsx$/i.test(b.pathname))
      .filter(b => {
        const p = b.pathname.toLowerCase();
        return /\.(jpg|jpeg|png|gif|webp|heic|mp4|mov|avi|webm)$/i.test(p);
      })
      .map(b => ({
        name: b.pathname,
        url: b.url,
        size: b.size,
        uploadedAt: b.uploadedAt || undefined
      }));

    res.status(200).json({ success: true, media });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export const config = {
  api: {
    maxDuration: 20
  }
};
