// Battle with Ideas: menu and victory music (local file when present, otherwise the official YouTube video in a small corner player).

const TRACK = { file: 'music/mr-blue-sky.mp3', yt: 'aQUlA8Hcv4s', title: 'Mr. Blue Sky', artist: 'Electric Light Orchestra' };

export class Music {
  constructor() {
    this.vol = parseFloat(localStorage.getItem('bwi.music') || '0.45');
    this.audio = null;
    this.yt = null;
    this.ytReady = null;
    this.mode = null;
    this.want = false;
    this.box = document.createElement('div');
    this.box.className = 'music off';
    this.box.innerHTML = `<div class="yt"><div id="yt-frame"></div></div><span>♪ ${TRACK.title} · ${TRACK.artist}</span>`;
    document.body.append(this.box);
  }

  async init() {
    try {
      const r = await fetch(TRACK.file, { method: 'HEAD' });
      if (r.ok && (r.headers.get('content-type') || '').includes('audio')) {
        this.audio = new Audio(TRACK.file);
        this.audio.loop = true;
        this.audio.volume = this.vol;
        this.mode = 'file';
        return;
      }
    } catch (e) { /* no local file */ }
    this.mode = 'yt';
  }

  loadYT() {
    if (this.ytReady) return this.ytReady;
    this.ytReady = new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('YouTube did not load')), 15000);
      const make = () => {
        this.yt = new window.YT.Player('yt-frame', {
          width: 192, height: 108, videoId: TRACK.yt,
          playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3, fs: 0, loop: 1, playlist: TRACK.yt },
          events: { onReady: () => { clearTimeout(timer); this.yt.setVolume(this.vol * 100); res(this.yt); }, onError: () => { this.mode = 'none'; this.box.classList.add('off'); } },
        });
      };
      if (window.YT && window.YT.Player) { make(); return; }
      window.onYouTubeIframeAPIReady = make;
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { clearTimeout(timer); rej(new Error('YouTube blocked')); };
      document.head.append(s);
    });
    this.ytReady.catch(() => { this.mode = 'none'; });
    return this.ytReady;
  }

  async play(from = null) {
    this.want = true;
    if (this.vol <= 0.001) return;
    if (this.mode === 'file') {
      if (from != null) this.audio.currentTime = from;
      this.audio.volume = this.vol;
      this.audio.play().catch(() => {});
      this.box.classList.remove('off');
      this.box.classList.add('file');
    } else if (this.mode === 'yt') {
      this.box.classList.remove('off');
      try { await this.loadYT(); } catch (e) { this.box.classList.add('off'); return; }
      if (!this.want) return;
      if (from != null) this.yt.seekTo(from, true);
      this.yt.playVideo();
    }
  }

  pause() {
    this.want = false;
    if (this.audio) this.audio.pause();
    if (this.yt && this.yt.pauseVideo) this.yt.pauseVideo();
    this.box.classList.add('off');
  }

  setVolume(v) {
    this.vol = v;
    localStorage.setItem('bwi.music', String(v));
    if (this.audio) this.audio.volume = v;
    if (this.yt && this.yt.setVolume) this.yt.setVolume(v * 100);
    if (v <= 0.001) this.pause();
  }
}
