// Vercel Function (gratis): /api/tiktok?u=username&v=link1,link2,...
// Profil dibaca dari halaman publik TikTok. Statistik video dibaca dari link video yang ditempel pengguna (opsional).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const H = { 'user-agent': UA, 'accept-language': 'id-ID,id;q=0.9,en;q=0.8' };
const cache = new Map();

function rehydrate(html) {
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('TikTok memblokir server ini');
  return JSON.parse(m[1])['__DEFAULT_SCOPE__'] || {};
}

async function getProfile(u) {
  const r = await fetch('https://www.tiktok.com/@' + u, { headers: H });
  if (r.status === 404) throw new Error('Akun tidak ditemukan');
  if (!r.ok) throw new Error('TikTok membalas HTTP ' + r.status);
  const ui = (rehydrate(await r.text())['webapp.user-detail'] || {}).userInfo;
  if (!ui || !ui.user) throw new Error('Akun tidak ditemukan atau tidak bisa dibaca');
  const s = ui.stats || {}, us = ui.user;
  return { nickname: us.nickname, bio: us.signature || '', bioLink: (us.bioLink && us.bioLink.link) || '', avatar: !!us.avatarLarger,
    followers: s.followerCount || 0, following: s.followingCount || 0, likesTotal: s.heartCount || 0, videos: s.videoCount || 0 };
}

async function getVideo(url) {
  const r = await fetch(url, { headers: H, redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const it = ((rehydrate(await r.text())['webapp.video-detail'] || {}).itemInfo || {}).itemStruct;
  if (!it || !it.stats) throw new Error('data video tidak ada');
  return { v: +it.stats.playCount || 0, l: +it.stats.diggCount || 0, c: +it.stats.commentCount || 0, s: +it.stats.shareCount || 0,
    sv: +it.stats.collectCount || 0, d: it.video ? +it.video.duration || 0 : 0, t: (+it.createTime || 0) * 1000 };
}

async function getVideos(u, urls) {
  const ok = urls.filter(x => new RegExp('^https://(www\\.)?tiktok\\.com/@[A-Za-z0-9_.]+/video/\\d+').test(x)).slice(0, 10);
  if (!ok.length) return null;
  const res = (await Promise.allSettled(ok.map(getVideo))).filter(x => x.status === 'fulfilled').map(x => x.value);
  if (!res.length) throw new Error('Link video tidak bisa dibaca (kemungkinan diblokir TikTok)');
  const avg = k => Math.round(res.reduce((a, x) => a + x[k], 0) / res.length);
  const ts = res.map(x => x.t).filter(Boolean);
  let ppw = 0;
  if (ts.length >= 2) { const span = Math.max((Math.max(...ts) - Math.min(...ts)) / 864e5, 1); ppw = Math.min(21, Math.round((ts.length - 1) / span * 70) / 10); }
  return { sample: res.length, avg: { views: avg('v'), likes: avg('l'), comments: avg('c'), shares: avg('s'), saves: avg('sv'), duration: avg('d'), ppw } };
}

module.exports = async (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  const q = req.query || {};
  const u = String(q.u || '').replace(/^@/, '').trim();
  if (!/^[A-Za-z0-9_.]{2,24}$/.test(u)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Username tidak valid' })); }
  const urls = String(q.v || '').split(',').map(x => x.trim()).filter(Boolean);
  const key = u + '|' + urls.join(',');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 10 * 60 * 1000) return res.end(JSON.stringify(hit.v));
  const [p, v] = await Promise.allSettled([getProfile(u), getVideos(u, urls)]);
  if (p.status !== 'fulfilled') { res.statusCode = 502; return res.end(JSON.stringify({ error: p.reason.message })); }
  const out = Object.assign({ username: u, avgLikes: p.value.videos ? Math.round(p.value.likesTotal / p.value.videos) : 0 }, p.value);
  if (v.status === 'fulfilled' && v.value) { out.avg = v.value.avg; out.sample = v.value.sample; }
  else if (v.status === 'rejected') out.warn = v.reason.message + '.';
  cache.set(key, { t: Date.now(), v: out });
  res.end(JSON.stringify(out));
};
    
