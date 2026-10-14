// Nhạc nền thiệp cưới – 2 nguồn, không lo bản quyền:
//  1) "Hộp nhạc": giai điệu cổ điển đã hết bản quyền (Pachelbel, Wagner, Beethoven) do chính trình duyệt chơi bằng
//     Web Audio – không dùng file ghi âm của ai, không tốn dung lượng tải.
//  2) Link YouTube do cô dâu chú rể tự dán → phát qua trình phát nhúng chính thức của YouTube.
// Trình duyệt chỉ cho phát tiếng sau khi người xem chạm vào trang → bắt đầu phát khi khách mở phong bì.

const SEMITONE = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
const freq = (name) => {
  const [, note, octave] = /^([A-G]#?)(\d)$/.exec(name);
  return 440 * 2 ** ((SEMITONE[note] + (Number(octave) - 4) * 12) / 12);
};
// "F#5:2 E5 D5:0.5" → [{ beat, note, len }] (mặc định 1 phách)
function parse(line) {
  let beat = 0;
  return line.replace(/\|/g, ' ').trim().split(/\s+/).map((token) => {
    const [note, len = '1'] = token.split(':');
    const event = { beat, note, len: Number(len) };
    beat += event.len;
    return event;
  });
}
const total = (events) => events.reduce((s, e) => s + e.len, 0);

export const MUSIC_TRACKS = [
  {
    key: 'canon', name: 'Canon in D – Pachelbel', bpm: 66,
    melody: [
      'F#5:2 E5:2 D5:2 C#5:2 B4:2 A4:2 B4:2 C#5:2',
      'D5:2 C#5:2 B4:2 A4:2 G4:2 F#4:2 G4:2 E4:2',
      'D5 F#5 A5 G5 F#5 D5 F#5 E5 D5 B4 D5 A5 G5 B5 A5 G5',
      'D5:0.5 F#5:0.5 A5:0.5 F#5:0.5 C#5:0.5 E5:0.5 A5:0.5 E5:0.5 B4:0.5 D5:0.5 F#5:0.5 D5:0.5 A4:0.5 C#5:0.5 F#5:0.5 C#5:0.5'
        + ' B4:0.5 D5:0.5 G5:0.5 D5:0.5 A4:0.5 D5:0.5 F#5:0.5 D5:0.5 B4:0.5 D5:0.5 G5:0.5 B5:0.5 A5:0.5 G5:0.5 E5:0.5 C#5:0.5',
    ].join(' '),
    bass: 'D3:2 A2:2 B2:2 F#2:2 G2:2 D2:2 G2:2 A2:2 '.repeat(4),
  },
  {
    key: 'bride', name: 'Here Comes the Bride – Wagner', bpm: 72,
    melody: [
      'C5 F5:0.75 F5:0.25 F5:2 | C5 G5:0.75 E5:0.25 F5:2 | C5 F5:0.75 A#5:0.25 A#5 A5:0.75 G5:0.25 | F5:0.75 E5:0.25 F5:0.75 G5:0.25 C5:2',
      'C5 F5:0.75 F5:0.25 F5:2 | C5 G5:0.75 E5:0.25 F5:2 | C5 F5:0.75 A#5:0.25 C6 A#5:0.75 G5:0.25 | A5:0.75 F5:0.25 G5:0.75 E5:0.25 F5:2',
    ].join(' '),
    bass: 'F3:2 C3:2 C3:2 F3:2 F3:2 A#2:2 C3:2 F3:2 '.repeat(2),
  },
  {
    key: 'joy', name: 'Ode to Joy – Beethoven', bpm: 92,
    melody: [
      'E5 E5 F5 G5 G5 F5 E5 D5 C5 C5 D5 E5 E5:1.5 D5:0.5 D5:2',
      'E5 E5 F5 G5 G5 F5 E5 D5 C5 C5 D5 E5 D5:1.5 C5:0.5 C5:2',
      'D5 D5 E5 C5 D5 E5:0.5 F5:0.5 E5 C5 D5 E5:0.5 F5:0.5 E5 D5 C5 D5 G4:2',
      'E5 E5 F5 G5 G5 F5 E5 D5 C5 C5 D5 E5 D5:1.5 C5:0.5 C5:2',
    ].join(' '),
    bass: [
      'C3:2 G3:2 G2:2 D3:2 C3:2 G3:2 G2:2 D3:2',
      'C3:2 G3:2 G2:2 D3:2 C3:2 G3:2 G2:2 C3:2',
      'G2:2 D3:2 C3:2 G3:2 G2:2 D3:2 C3:2 G2:2',
      'C3:2 G3:2 G2:2 D3:2 C3:2 G3:2 G2:2 C3:2',
    ].join(' '),
  },
];

export const trackOf = (key) => MUSIC_TRACKS.find((t) => t.key === key) ?? MUSIC_TRACKS[0];

// ---------- HỘP NHẠC (Web Audio) ----------
function musicBox(track, onState) {
  const spb = 60 / track.bpm;   // giây mỗi phách
  const events = [
    ...parse(track.melody).filter((e) => e.note !== 'r').map((e) => ({ ...e, vol: 0.2, decay: 1.7, bell: true })),
    ...parse(track.bass).map((e) => ({ ...e, vol: 0.11, decay: 2.4, bell: false })),
  ].sort((a, b) => a.beat - b.beat);
  const loopBeats = Math.max(total(parse(track.melody)), total(parse(track.bass)));
  let ctx;
  let master;
  let timer = null;
  let base = 0;          // thời điểm (giây, theo đồng hồ âm thanh) của phách 0 vòng 0
  let loop = 0;
  let idx = 0;

  function setup() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    // Tiếng vang nhẹ: tạo "phòng" bằng nhiễu tắt dần
    const reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.2);
    const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    reverb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    master.connect(ctx.destination);
    master.connect(reverb).connect(wet).connect(ctx.destination);
  }

  function note(time, e) {
    const f = freq(e.note);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, time);
    out.gain.linearRampToValueAtTime(e.vol, time + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, time + e.decay);
    out.connect(master);
    const partials = e.bell ? [[1, 1], [2, 0.28], [3.01, 0.08]] : [[1, 1], [2, 0.15]];
    for (const [mul, amp] of partials) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f * mul;
      g.gain.value = amp;
      osc.connect(g).connect(out);
      osc.start(time);
      osc.stop(time + e.decay + 0.05);
    }
  }

  function schedule() {
    const horizon = ctx.currentTime + 0.25;
    for (;;) {
      const e = events[idx];
      const time = base + (loop * loopBeats + e.beat) * spb;
      if (time > horizon) break;
      if (time >= ctx.currentTime - 0.02) note(time, e);
      idx += 1;
      if (idx >= events.length) { idx = 0; loop += 1; }
    }
  }

  let wanted = false;   // người xem muốn nghe (để báo đúng trạng thái khi trình duyệt tự tạm dừng âm thanh)
  const report = () => onState?.(wanted && ctx?.state === 'running');

  return {
    prepare() {},
    // Gọi NGAY trong lúc người dùng chạm (không await trước) – iPhone chỉ mở tiếng trong lúc chạm
    play() {
      wanted = true;
      if (!ctx) {
        setup();
        ctx.onstatechange = report;
      }
      // "Mở khóa" âm thanh trên iPhone: phát 1 mẫu âm câm ngay trong lúc chạm
      const silent = ctx.createBufferSource();
      silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      silent.connect(ctx.destination);
      silent.start(0);
      const resumed = ctx.resume();
      const start = () => {
        if (!wanted) return;
        base = ctx.currentTime + 0.12 - (loop * loopBeats + events[idx].beat) * spb;   // tiếp tục từ nốt đang dở
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
        master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.2);
        clearInterval(timer);
        schedule();
        timer = setInterval(schedule, 60);
        report();
      };
      return resumed.then(start, () => report());
    },
    pause() {
      wanted = false;
      report();
      if (!ctx) return;
      clearInterval(timer);
      timer = null;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      setTimeout(() => { if (!timer) ctx.suspend(); }, 350);
    },
  };
}

// ---------- YOUTUBE ----------
/** Link YouTube (watch, youtu.be, shorts, embed) → mã video 11 ký tự, sai thì null */
export function youtubeIdFrom(input) {
  const text = String(input || '').trim();
  const m = text.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    || text.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}

// Nhạc nền từ link YouTube – CHỈ phát tiếng: trình phát nằm trong màn hình với kích thước thật (200×113) nhưng trong suốt,
// không bấm vào được → khách không thấy video, chỉ có nút ♪. (Không thu nhỏ 1px / đẩy ra ngoài màn hình: iPhone sẽ bật
// video toàn màn hình.) Lưu ý: điều khoản YouTube không cho giấu trình phát – chủ dự án đã chọn chấp nhận rủi ro này.
// prepare() tải sẵn khi khách vừa mở link → lúc chạm con dấu chỉ việc gửi lệnh playVideo (điện thoại cho phát ngay).
function youtubePlayer(id, onState) {
  const ORIGIN = 'https://www.youtube-nocookie.com';
  let box = null;
  let frame = null;
  let ready = false;
  let wanted = false;
  let checkTimer = null;
  const send = (data) => frame?.contentWindow?.postMessage(JSON.stringify(data), ORIGIN);
  const command = (func, args = []) => send({ event: 'command', func, args, id: 'tramhy-music', channel: 'widget' });
  const show = (on) => box?.classList.toggle('is-on', on);

  window.addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow) return;
    let data;
    try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (data?.event === 'onReady' && !ready) {
      ready = true;
      if (wanted) { command('unMute'); command('playVideo'); }
    }
    // playerState: 1 đang phát, 2 tạm dừng, 0 hết bài, 3 đang tải, -1 / 5 chưa phát
    const state = data?.event === 'onStateChange' ? data.info : data?.info?.playerState;
    if (state === 1) { clearTimeout(checkTimer); wanted = true; show(true); onState?.(true); }
    if (state === 2 || state === 0) onState?.(false);
  });

  const prepare = () => {
    if (frame) return;
    box = document.createElement('div');
    box.className = 'music-yt';
    box.setAttribute('aria-hidden', 'true');
    frame = document.createElement('iframe');
    frame.title = 'Nhạc nền thiệp cưới';
    frame.allow = 'autoplay; encrypted-media';
    frame.src = `${ORIGIN}/embed/${id}?enablejsapi=1&loop=1&playlist=${id}&controls=1&playsinline=1&rel=0&modestbranding=1`
      + `&origin=${encodeURIComponent(location.origin)}`;
    frame.addEventListener('load', () => send({ event: 'listening', id: 'tramhy-music', channel: 'widget' }));
    frame.tabIndex = -1;
    box.append(frame);
    document.body.append(box);
  };

  const player = {
    prepare,
    play() {
      wanted = true;
      prepare();
      show(true);
      if (ready) { command('unMute'); command('playVideo'); }
      // Không thấy "đang phát" sau vài giây (iPhone chặn tự phát) → nút ♪ hiện "tắt"; khung mini vẫn hiện để khách chạm ▶
      clearTimeout(checkTimer);
      checkTimer = setTimeout(() => onState?.(false), 4000);
      return Promise.resolve();
    },
    pause() {
      wanted = false;
      clearTimeout(checkTimer);
      command('pauseVideo');
      show(false);
      onState?.(false);
    },
  };
  return player;
}

/**
 * music: { kind: 'box', track } | { kind: 'youtube', id } | null → trình phát { prepare, play, pause } hoặc null
 * onState(playing): báo trạng thái THẬT (đang phát hay không) để nút bật / tắt hiển thị đúng.
 * play() phải được gọi ngay trong sự kiện chạm / bấm của người dùng.
 */
export function createWeddingMusic(music, { onState } = {}) {
  if (music?.kind === 'youtube' && youtubeIdFrom(music.id)) return youtubePlayer(youtubeIdFrom(music.id), onState);
  if (music?.kind === 'box') return musicBox(trackOf(music.track), onState);
  return null;
}
