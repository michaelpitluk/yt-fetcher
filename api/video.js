const ytdl = require('@distube/ytdl-core');

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
    const info = await ytdl.getInfo(url);

    const formats = info.formats
      .filter(f => f.url)
      .map(f => ({
        itag: f.itag,
        quality: f.qualityLabel || (f.audioBitrate ? f.audioBitrate + 'kbps' : 'N/A'),
        type: f.hasVideo && f.hasAudio ? 'Combined' : f.hasVideo ? 'Video only' : 'Audio only',
        container: f.container,
        size: formatBytes(f.contentLength),
        url: f.url
      }))
      .sort((a, b) => {
        const order = { 'Combined': 0, 'Video only': 1, 'Audio only': 2 };
        return order[a.type] - order[b.type];
      });

    res.json({
      title: info.videoDetails.title,
      channel: info.videoDetails.author.name,
      duration: parseInt(info.videoDetails.lengthSeconds),
      thumbnail: info.videoDetails.thumbnails.slice(-1)[0]?.url,
      formats
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
