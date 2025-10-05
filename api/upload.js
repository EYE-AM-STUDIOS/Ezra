// Vercel serverless function for file uploads using Vercel Blob
import { put } from '@vercel/blob';

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
    
    // Get filename from headers
    const filename = req.headers['x-filename'] ? decodeURIComponent(req.headers['x-filename']) : 'unknown-file';
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    
    console.log('Processing upload:', { filename, contentType });
    
    // Validate file type
    const allowedTypes = [
      'image/jpeg', 
      'image/jpg', 
      'image/png', 
      'image/gif', 
      'image/webp',
      'video/mp4', 
      'video/mov', 
      'video/avi',
      'video/quicktime'
    ];
    
    if (!allowedTypes.some(type => contentType.toLowerCase().includes(type.split('/')[1]))) {
      res.status(400).json({ 
        success: false,
        error: 'Invalid file type. Please upload images (JPEG, PNG, GIF, WebP) or videos (MP4, MOV, AVI).' 
      });
      return;
    }

    // Get file size from content-length header or body
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

    console.log('File validation passed:', { filename, size: fileSize, type: contentType });

    // Upload to Vercel Blob
    const blob = await put(filename, req, {
      access: 'public',
      addRandomSuffix: false, // Keep original filename
    });

    console.log('Blob uploaded successfully:', blob);

    // Return success response
    const uploadResult = {
      success: true,
      filename: filename,
      size: fileSize,
      contentType: contentType,
      url: blob.url, // The public URL from Vercel Blob
      message: 'Upload successful',
      timestamp: new Date().toISOString()
    };

    console.log('Upload successful:', uploadResult);
    
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
