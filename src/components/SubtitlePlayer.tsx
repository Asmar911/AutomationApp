import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { parseSrt, type SrtCue } from '../utils/srt';

interface SubtitlePlayerProps {
  videoId: string;
  audioPath?: string;
  subtitlePath?: string;
  title?: string;
}

const buildRawUrl = (owner: string, repo: string, branch: string, path: string) =>
  `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;

export const SubtitlePlayer = ({ videoId, audioPath, subtitlePath, title }: SubtitlePlayerProps) => {
  const { repo } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [cues, setCues] = useState<SrtCue[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioUrl = useMemo(() => {
    if (!audioPath) return undefined;
    return buildRawUrl(repo.owner, repo.name, repo.defaultBranch, audioPath);
  }, [audioPath, repo.defaultBranch, repo.name, repo.owner]);

  const subtitleUrl = useMemo(() => {
    if (!subtitlePath) return undefined;
    return buildRawUrl(repo.owner, repo.name, repo.defaultBranch, subtitlePath);
  }, [repo.defaultBranch, repo.name, repo.owner, subtitlePath]);

  useEffect(() => {
    const loadSubtitles = async () => {
      if (!subtitleUrl) {
        setCues([]);
        return;
      }
      try {
        const response = await fetch(subtitleUrl);
        if (!response.ok) {
          throw new Error(`Failed to load subtitles ${response.status}`);
        }
        const text = await response.text();
        setCues(parseSrt(text));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    loadSubtitles();
  }, [subtitleUrl]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;

    const handleTimeUpdate = () => {
      const currentTime = element.currentTime;
      if (!cues || cues.length === 0) return;
      const found = cues.findIndex((cue) => currentTime >= cue.start && currentTime <= cue.end);
      if (found >= 0) {
        setActiveIndex(found);
      }
    };

    element.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      element.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [cues]);

  return (
    <div className="card">
      <h2>Preview · {title ?? videoId}</h2>
      {!audioUrl ? (
        <p style={{ opacity: 0.7 }}>Audio not available yet.</p>
      ) : (
        <audio ref={audioRef} controls className="audio-player" src={audioUrl} preload="metadata" />
      )}
      {error && <div className="alert-error" style={{ marginTop: 16 }}>{error}</div>}
      <div className="subtitle-box">
        {cues.length === 0 ? (
          <span style={{ opacity: 0.6 }}>Subtitles unavailable.</span>
        ) : (
          cues.map((cue, index) => (
            <div key={cue.index} className={`subtitle-line ${index === activeIndex ? 'active' : ''}`}>
              {cue.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
