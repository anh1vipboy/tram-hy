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
function musicBox(track) {
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

  return {
    async play() {
      if (!ctx) setup();
      await ctx.resume();
      // tiếp tục từ nốt đang dở
      base = ctx.currentTime + 0.12 - (loop * loopBeats + events[idx].beat) * spb;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.2);
      clearInterval(timer);
      schedule();
      timer = setInterval(schedule, 60);
    },
    pause() {
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

function youtubePlayer(id) {
  let frame = null;
  const command = (func) => frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
  return {
    async play() {
      if (frame) { command('playVideo'); return; }
      frame = document.createElement('iframe');
      frame.className = 'music-frame';
      frame.title = 'Nhạc nền thiệp cưới';
      frame.allow = 'autoplay; encrypted-media';
      frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&controls=0&playsinline=1&rel=0&enablejsapi=1`;
      document.body.append(frame);
    },
    pause() { command('pauseVideo'); },
  };
}

/** music: { kind: 'box', track } | { kind: 'youtube', id } | null → trình phát { play, pause } hoặc null */
export function createWeddingMusic(music) {
  if (music?.kind === 'youtube' && youtubeIdFrom(music.id)) return youtubePlayer(youtubeIdFrom(music.id));
  if (music?.kind === 'box') return musicBox(trackOf(music.track));
  return null;
}
