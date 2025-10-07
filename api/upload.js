// Vercel serverless function for file uploads using Vercel Blob
// Now supports generating Direct Upload URLs so the browser can upload
// large files straight to Vercel Blob, avoiding serverless body limits.
import { put, generateUploadURL } from '@vercel/blob';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-filename, content-type');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ 
      success: false,
      error: 'Method not allowed. Only POST requests are supported.' 
    });
    return;
  }

  try {
    console.log('Upload API called');
    console.log('Headers:', req.headers);

    const headerContentType = (req.headers['content-type'] || '').toLowerCase();

    // If the request is JSON, treat it as a request to generate a direct upload URL
    if (headerContentType.includes('application/json')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const json = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const filename = (json.filename || 'upload').toString();
      const contentType = (json.contentType || 'application/octet-stream').toString();
      const size = Number(json.size || 0);

      // Validate file type (broad check because browser MIME varies)
      const allowedTypes = [
        'image/jpeg','image/jpg','image/png','image/gif','image/webp','image/heic',
        'video/mp4','video/mov','video/avi','video/quicktime','video/x-msvideo','video/webm'
      ];
      if (!allowedTypes.some(t => contentType.includes(t.split('/')[1]))) {
        res.status(400).json({
          success: false,
          error: 'Invalid file type. Allowed: images (JPEG/PNG/GIF/WebP/HEIC) or videos (MP4/MOV/QuickTime/AVI/WebM).'
        });
        return;
      }

      const maxSize = 500 * 1024 * 1024; // 500MB
      if (size > maxSize) {
        res.status(400).json({
          success: false,
          error: `File too large (${Math.round(size / 1024 / 1024)}MB). Maximum size is 500MB.`
        });
        return;
      }

      const { url, uploadUrl } = await generateUploadURL({
        contentType,
        access: 'public',
        tokenPayload: { filename }
      });

      res.status(200).json({ success: true, filename, contentType, url, uploadUrl, maxSize });
      return;
    }

    // Legacy path: proxy the upload through the serverless function
    const filename = req.headers['x-filename'] ? decodeURIComponent(req.headers['x-filename']) : 'unknown-file';
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    console.log('Processing legacy upload:', { filename, contentType });

    const allowedTypes = [
      'image/jpeg','image/jpg','image/png','image/gif','image/webp','image/heic',
      'video/mp4','video/mov','video/avi','video/quicktime','video/x-msvideo','video/webm'
    ];
    if (!allowedTypes.some(type => contentType.toLowerCase().includes(type.split('/')[1]))) {
      res.status(400).json({ 
        success: false,
        error: 'Invalid file type. Allowed: images (JPEG/PNG/GIF/WebP/HEIC) or videos (MP4/MOV/QuickTime/AVI/WebM).' 
      });
      return;
    }

    const contentLength = req.headers['content-length'];
    const fileSize = contentLength ? parseInt(contentLength) : 0;
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (fileSize > maxSize) {
      res.status(400).json({ 
        success: false,
        error: `File too large (${Math.round(fileSize / 1024 / 1024)}MB). Maximum size is 500MB.` 
      });
      return;
    }

    console.log('Legacy file validation passed:', { filename, size: fileSize, type: contentType });

    const blob = await put(filename, req, {
      access: 'public',
      addRandomSuffix: false,
    });

    const uploadResult = {
      success: true,
      filename,
      size: fileSize,
      contentType,
      url: blob.url,
      message: 'Upload successful',
      timestamp: new Date().toISOString()
    };

    res.status(200).json(uploadResult);
    
  } catch (error) {
    console.error('Upload API error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error during upload',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Configure API route
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '500mb',
    },
  },
}
