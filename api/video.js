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

  try {
    const { Innertube } = await import('youtubei.js');
    const yt = await Innertube.create({ cache: null, generate_session_locally: true });

    let videoId = url;
    const match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([^&?/\s]{11})/);
    if (match) videoId = match[1];

    const info = await yt.getInfo(videoId);
    const details = info.basic_info;

    const combined = (info.streaming_data?.formats || []).map(f => ({
      itag: f.itag,
      quality: f.quality_label || 'N/A',
      type: 'Combined',
      container: f.mime_type?.split(';')[0]?.split('/')[1] || 'N/A',
      size: formatBytes(f.content_length),
      url: f.url
    }));

    const adaptive = (info.streaming_data?.adaptive_formats || []).map(f => {
      const isVideo = f.mime_type?.startsWith('video/');
      return {
        itag: f.itag,
        quality: f.quality_label || (f.bitrate ? Math.round(f.bitrate / 1000) + 'kbps' : 'N/A'),
        type: isVideo ? 'Video only' : 'Audio only',
        container: f.mime_type?.split(';')[0]?.split('/')[1] || 'N/A',
        size: formatBytes(f.content_length),
        url: f.url
      };
    });

    const formats = [...combined, ...adaptive].filter(f => f.url);

    res.json({
      title: details.title,
      channel: details.author,
      duration: details.duration,
      thumbnail: details.thumbnail?.[0]?.url,
      formats
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
