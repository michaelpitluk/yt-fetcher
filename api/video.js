function formatBytes(bytes) {
  if (!bytes) return 'N/A';
  const b = parseInt(bytes);
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  let videoId = url.trim();
  const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([^&?/\s]{11})/);
  if (match) videoId = match[1];

  try {
    const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
        'X-YouTube-Client-Name': '5',
        'X-YouTube-Client-Version': '19.29.1',
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: 'IOS',
            clientVersion: '19.29.1',
            deviceModel: 'iPhone16,2',
            hl: 'en',
            timeZone: 'UTC',
            utcOffsetMinutes: 0,
          },
        },
      }),
    });

    const data = await playerRes.json();

    if (data.playabilityStatus?.status !== 'OK') {
      return res.status(400).json({ error: data.playabilityStatus?.reason || 'Video not available' });
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
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
