import { put, list } from '@vercel/blob';
import ExcelJS from 'exceljs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const { blobs } = await list();
      const found = blobs.find(b => b.pathname === 'guestbook.xlsx');
      if (found && found.url) {
        const response = await fetch(found.url);
        if (!response.ok) {
          res.status(200).json({ success: true, entries: [], url: found.url, filename: 'guestbook.xlsx' });
          return;
        }
        const arrayBuffer = await response.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(arrayBuffer));
        const sheet = workbook.worksheets[0];
        const entries = [];
        if (sheet) {
          const rows = sheet.getSheetValues();
          // rows[1] is header; start from 2
          for (let i = 2; i < rows.length; i++) {
            const r = rows[i];
            if (!r) continue;
            const timestamp = r[1];
            const name = r[2];
            const message = r[3];
            if (name || message) entries.push({ timestamp, name, message });
          }
        }
        res.status(200).json({ success: true, entries, url: found.url, filename: 'guestbook.xlsx' });
      } else {
        res.status(200).json({ success: true, entries: [] });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed. Only GET and POST are supported.' });
    return;
  }

  try {
    // Basic spam protection: honeypot and lightweight rate limit per IP
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString();
    const now = Date.now();
    globalThis.__guestRate = globalThis.__guestRate || new Map();
    const last = globalThis.__guestRate.get(ip) || 0;
    if (now - last < 5000) { // 5s min interval
      res.status(429).json({ success: false, error: 'Too many requests. Please wait a few seconds and try again.' });
      return;
    }
    globalThis.__guestRate.set(ip, now);
    // Parse body: support both URL-encoded and multipart/form-data
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

  let name = '';
  let message = '';
  let honeypot = '';
    let timestamp = new Date().toISOString();

    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(buffer.toString());
      name = params.get('name') || '';
      message = params.get('message') || '';
      honeypot = params.get('website') || '';
      timestamp = params.get('timestamp') || timestamp;
    } else {
      // Very simple multipart parser good enough for small text fields
      const text = buffer.toString();
      const extract = (field) => {
        const regex = new RegExp(`name=\"${field}\"[\s\S]*?\r\n\r\n([\s\S]*?)\r\n`, 'i');
        const m = text.match(regex);
        return m ? m[1].trim() : '';
      };
      name = extract('name');
      message = extract('message');
      honeypot = extract('website');
      const ts = extract('timestamp');
      if (ts) timestamp = ts;
    }

    if (honeypot) {
      res.status(200).json({ success: true, message: 'Thanks!' });
      return;
    }

    // Download or create Excel file
    let workbook = new ExcelJS.Workbook();
    let worksheet;
    let fileExists = false;
    let existingUrl = '';

    try {
      // Look for an existing guestbook.xlsx in the default blob store
      const { blobs } = await list();
      const found = blobs.find(b => b.pathname === 'guestbook.xlsx');
      if (found && found.url) {
        existingUrl = found.url;
        const response = await fetch(found.url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          await workbook.xlsx.load(Buffer.from(arrayBuffer));
          fileExists = true;
        }
      }
    } catch (_) {
      // ignore and create new workbook
    }

    if (!fileExists) {
      worksheet = workbook.addWorksheet('Guestbook');
      worksheet.addRow(['Timestamp', 'Name', 'Message']);
    } else {
      worksheet = workbook.worksheets[0];
    }

    // Add new entry
    worksheet.addRow([timestamp, name, message]);

    // Write to buffer
    const excelBuffer = await workbook.xlsx.writeBuffer();

    // Upload updated file to Vercel Blob
    const upload = await put('guestbook.xlsx', Buffer.from(excelBuffer), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    // Return success and download URL
    res.status(200).json({
      success: true,
      url: upload.url,
      filename: 'guestbook.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      message: 'Guestbook entry saved to Excel file.',
      timestamp
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export const config = {
  api: {
    bodyParser: false,
    maxDuration: 30
  }
};
