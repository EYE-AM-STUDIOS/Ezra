import { put, get } from '@vercel/blob';
import ExcelJS from 'exceljs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed. Only POST requests are supported.' });
    return;
  }

  try {
    // Parse form data
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const params = new URLSearchParams(buffer.toString());
    const name = params.get('name') || '';
    const message = params.get('message') || '';
    const timestamp = params.get('timestamp') || new Date().toISOString();

    // Download or create Excel file
    let workbook = new ExcelJS.Workbook();
    let worksheet;
    let fileExists = false;
    let blobUrl = '';
    try {
      // Try to get the existing Excel file from Vercel Blob
      blobUrl = process.env.GUESTBOOK_BLOB_URL;
      if (blobUrl) {
        const response = await fetch(blobUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          await workbook.xlsx.load(Buffer.from(arrayBuffer));
          fileExists = true;
        }
      }
    } catch (err) {
      // File does not exist or failed to load
      fileExists = false;
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
    const upload = await put('guestbook.xlsx', Buffer.from(excelBuffer), { access: 'public', addRandomSuffix: false });

    // Return success and download URL
    res.status(200).json({
      success: true,
      url: upload.url,
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
