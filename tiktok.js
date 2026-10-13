// Versi Vercel Function dari /api/tiktok (server.js tetap untuk jalan lokal / VPS)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
async function getProfile(u) {
  const r = await fetch('https://www.tiktok.com/@' + u, { headers: { 'user-agent': UA, 'accept-language': 'id-ID,id;q=0.9,en;q=0.8' } });
  if (r.status === 404) throw new Error('Akun tidak ditemukan');
  if (!r.ok) throw new Error('TikTok membalas HTTP ' + r.status + ' (kemungkinan diblokir sementara)');
  const html = await r.text();
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Data profil tidak ditemukan (TikTok meminta verifikasi / memblokir server ini)');
  const d = JSON.parse(m[1]);
  const ui = d['__DEFAULT_SCOPE__'] && d['__DEFAULT_SCOPE__']['webapp.user-detail'] && d['__DEFAULT_SCOPE__']['webapp.user-detail'].userInfo;
  if (!ui || !ui.user) throw new Error('Akun tidak ditemukan atau tidak bisa dibaca');
  return ui;
}
module.exports = async (req, res) => {
  const u = String((req.query && req.query.u) || '').replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9_.]{2,24}$/.test(u)) return res.status(400).json({ error: 'Username tidak valid' });
  try {
    const ui = await getProfile(u), s = ui.stats || {}, us = ui.user;
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    res.status(200).json({
      username: us.uniqueId, nickname: us.nickname, bio: us.signature || '', bioLink: (us.bioLink && us.bioLink.link) || '',
      verified: !!us.verified, avatar: !!us.avatarLarger,
      followers: s.followerCount || 0, following: s.followingCount || 0, likesTotal: s.heartCount || 0, videos: s.videoCount || 0,
      avgLikes: s.videoCount ? Math.round((s.heartCount || 0) / s.videoCount) : 0
    });
  } catch (e) { res.status(502).json({ error: e.message }); }
};
