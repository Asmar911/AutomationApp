export interface SrtCue {
  index: number;
  start: number;
  end: number;
  text: string;
}

const parseTimestamp = (value: string): number => {
  const [time, ms] = value.split(',');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + Number(seconds) + Number(ms) / 1000;
};

export const parseSrt = (content: string): SrtCue[] => {
  const blocks = content
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const cues: SrtCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 2) continue;
    const index = Number(lines[0]);
    const [startRaw, endRaw] = lines[1].split(' --> ').map((item) => item.trim());
    const text = lines.slice(2).join('\n');
    cues.push({
      index: Number.isNaN(index) ? cues.length + 1 : index,
      start: parseTimestamp(startRaw),
      end: parseTimestamp(endRaw),
      text
    });
  }

  return cues;
};

export const buildSrt = (cues: SrtCue[]): string =>
  cues
    .map((cue, index) => {
      const start = formatTimestamp(cue.start);
      const end = formatTimestamp(cue.end);
      return `${index + 1}\n${start} --> ${end}\n${cue.text}`;
    })
    .join('\n\n');

const formatTimestamp = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0');
  const mins = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  const ms = Math.round((seconds % 1) * 1000)
    .toString()
    .padStart(3, '0');
  return `${hrs}:${mins}:${secs},${ms}`;
};
