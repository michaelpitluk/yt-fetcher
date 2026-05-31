const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const { YoutubeTranscript } = require('youtube-transcript');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

function formatBytes(bytes) {
  if (!bytes) return 'N/A';
  const b = parseInt(bytes);
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

app.get('/api/video', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  const args = ['--dump-json', '--no-playlist', '--no-warnings', '--extractor-retries', '3', url];

  execFile('yt-dlp', args, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });

    try {
      const data = JSON.parse(stdout);

      const formats = (data.formats || [])
        .filter(f => f.url)
        .map(f => ({
          id: f.format_id,
          quality: f.height ? `${f.height}p`
                 : f.abr   ? `${Math.round(f.abr)}kbps`
                 : f.format_note || 'N/A',
          type: f.vcodec !== 'none' && f.acodec !== 'none' ? 'Combined'
              : f.vcodec !== 'none' ? 'Video only'
              : 'Audio only',
          container: f.ext,
          size: formatBytes(f.filesize || f.filesize_approx),
          url: f.url,
        }))
        .sort((a, b) => {
          const order = { 'Combined': 0, 'Video only': 1, 'Audio only': 2 };
          return (order[a.type] ?? 3) - (order[b.type] ?? 3);
        });

      res.json({
        title: data.title,
        channel: data.uploader || data.channel || 'Unknown',
        duration: data.duration || 0,
        thumbnail: data.thumbnail,
        formats,
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse video info: ' + e.message });
    }
  });
});

app.get('/api/transcript', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(url);
    res.json({ transcript });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No transcript available' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`yt-fetcher running on port ${PORT}`));
