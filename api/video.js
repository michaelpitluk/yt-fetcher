function formatBytes(bytes) {
  if (!bytes) return 'N/A';
  const b = parseInt(bytes);
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function fetchPlayer(videoId, clientName, clientVersion, extra = {}) {
  const body = {
    videoId,
    context: {
      client: { clientName, clientVersion, hl: 'en', timeZone: 'UTC', utcOffsetMinutes: 0, ...extra },
    },
  };

  const headers = { 'Content-Type': 'application/json' };

  if (clientName === 'ANDROID') {
    headers['User-Agent'] = `com.google.android.youtube/${clientVersion} (Linux; U; Android 11) gzip`;
    headers['X-YouTube-Client-Name'] = '3';
    headers['X-YouTube-Client-Version'] = clientVersion;
  } else if (clientName === 'IOS') {
    headers['User-Agent'] = `com.google.ios.youtube/${clientVersion} (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)`;
    headers['X-YouTube-Client-Name'] = '5';
    headers['X-YouTube-Client-Version'] = clientVersion;
  } else if (clientName === 'TVHTML5') {
    headers['X-YouTube-Client-Name'] = '7';
    headers['X-YouTube-Client-Version'] = clientVersion;
  }

  const url = clientName === 'ANDROID'
    ? 'https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
    : 'https://www.youtube.com/youtubei/v1/player';

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return res.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url, debug } = req.query;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  let videoId = url.trim();
  const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([^&?/\s]{11})/);
  if (match) videoId = match[1];

  try {
    // Try clients in order — Android returns pre-deciphered URLs and is most reliable
    const clients = [
      ['ANDROID', '17.31.35', { androidSdkVersion: 30 }],
      ['IOS',     '19.29.1', { deviceModel: 'iPhone16,2' }],
      ['TVHTML5', '2.0',     {}],
    ];

    let data = null;
    let usedClient = null;

    for (const [name, version, extra] of clients) {
      const attempt = await fetchPlayer(videoId, name, version, extra);
      if (debug) {
        return res.json({ client: name, raw: attempt });
      }
      if (attempt.playabilityStatus?.status === 'OK') {
        data = attempt;
        usedClient = name;
        break;
      }
    }

    if (!data) {
      // Return all three statuses so we can see what's happening
      const results = {};
      for (const [name, version, extra] of clients) {
        const attempt = await fetchPlayer(videoId, name, version, extra);
        results[name] = {
          status: attempt.playabilityStatus?.status,
          reason: attempt.playabilityStatus?.reason,
        };
      }
      return res.status(400).json({ error: 'All clients failed', results });
    }

    const details = data.videoDetails;
    const streaming = data.streamingData;

    const combined = (streaming?.formats || [])
      .filter(f => f.url)
      .map(f => ({
        itag: f.itag,
        quality: f.qualityLabel || 'N/A',
        type: 'Combined',
        container: f.mimeType?.split(';')[0]?.split('/')[1] || 'N/A',
        size: formatBytes(f.contentLength),
        url: f.url,
      }));

    const adaptive = (streaming?.adaptiveFormats || [])
      .filter(f => f.url)
      .map(f => {
        const isVideo = f.mimeType?.startsWith('video/');
        return {
          itag: f.itag,
          quality: f.qualityLabel || (f.bitrate ? Math.round(f.bitrate / 1000) + 'kbps' : 'N/A'),
          type: isVideo ? 'Video only' : 'Audio only',
          container: f.mimeType?.split(';')[0]?.split('/')[1] || 'N/A',
          size: formatBytes(f.contentLength),
          url: f.url,
        };
      });

    const thumbnail = details.thumbnail?.thumbnails?.slice(-1)[0]?.url
      || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    res.json({
      title: details.title,
      channel: details.author,
      duration: parseInt(details.lengthSeconds) || 0,
      thumbnail,
      formats: [...combined, ...adaptive],
      _client: usedClient,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
