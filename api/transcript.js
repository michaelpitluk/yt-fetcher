const { YoutubeTranscript } = require('youtube-transcript');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'No URL provided' });

  try {
    const transcript = await YoutubeTranscript.fetchTranscript(url);
    res.json({ transcript });
  } catch (e) {
    res.status(500).json({ error: e.message || 'No transcript available for this video' });
  }
};
