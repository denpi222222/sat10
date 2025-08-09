'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Music, VolumeX, Play, Pause } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';


// Trusted audio domains
const TRUSTED_AUDIO_DOMAINS = [
  'kybbbbb.netlify.app',
  'dulcet-cannoli-e7490f.netlify.app',
  'crazycube.xyz',
  'localhost',
  'cdn.pixabay.com',
];

// Validate audio URL
const validateAudioUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return TRUSTED_AUDIO_DOMAINS.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
};

// Safe localStorage operations
const safeGetLocalStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetLocalStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore localStorage errors
  }
};

// Sanitize track data
const sanitizeTrackData = (track: unknown) => {
  if (!track || typeof track !== 'object') return null;
  
  const trackObj = track as { id?: unknown; name?: unknown; url?: unknown; theme?: unknown };
  
  return {
    id: String(trackObj.id || ''),
    name: String(trackObj.name || ''),
    url: validateAudioUrl(String(trackObj.url || '')) ? String(trackObj.url) : '',
    theme: String(trackObj.theme || 'party'),
  };
};

const musicTracks = [
  {
    id: 'track1',
    name: 'Romantic Ballad',
    url: 'https://cdn.pixabay.com/audio/2023/04/11/audio_cba4e40c2e.mp3',
    theme: 'party',
  },
  {
    id: 'track2',
    name: 'Pixabay Music',
    url: 'https://cdn.pixabay.com/audio/2023/04/11/audio_d1c8b8f2e.mp3',
    theme: 'retro',
  },
  {
    id: 'track3',
    name: 'Chill Cube',
    url: 'https://cdn.pixabay.com/audio/2023/04/11/audio_e2f9b8c1d.mp3',
    theme: 'chill',
  },
  {
    id: 'track4',
    name: 'Z Party',
    url: 'https://cdn.pixabay.com/audio/2023/04/11/audio_f3a0c9d2e.mp3',
    theme: 'dance',
  },
].map(sanitizeTrackData).filter(Boolean);

export const CompactMusicPlayer: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(musicTracks[0]);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load saved state
  useEffect(() => {
    const savedTrack = safeGetLocalStorage('crazycube_current_track');
    const savedVolume = safeGetLocalStorage('crazycube_volume');
    const savedMuted = safeGetLocalStorage('crazycube_muted');
    
    if (savedTrack) {
      const track = musicTracks.find(t => t?.id === savedTrack);
      if (track) setCurrentTrack(track);
    }
    
    if (savedVolume) {
      const vol = parseFloat(savedVolume);
      if (!isNaN(vol) && vol >= 0 && vol <= 1) {
        setVolume(vol);
      }
    }
    
    if (savedMuted === 'true') {
      setIsMuted(true);
    }
  }, []);

  // Save state changes
  useEffect(() => {
    if (currentTrack) {
      safeSetLocalStorage('crazycube_current_track', currentTrack.id);
    }
  }, [currentTrack]);

  useEffect(() => {
    safeSetLocalStorage('crazycube_volume', volume.toString());
  }, [volume]);

  useEffect(() => {
    safeSetLocalStorage('crazycube_muted', isMuted.toString());
  }, [isMuted]);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      // Auto-play next track
      const currentIndex = musicTracks.findIndex(t => t?.id === currentTrack?.id);
      const nextIndex = (currentIndex + 1) % musicTracks.length;
      const nextTrack = musicTracks[nextIndex];
      if (nextTrack) {
        setCurrentTrack(nextTrack);
      }
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentTrack]);

  // Update audio source and volume
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    audio.src = currentTrack.url;
    audio.volume = isMuted ? 0 : volume;
  }, [currentTrack, volume, isMuted]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    setIsLoading(true);
    
    try {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch (error) {
      console.error('Audio playback error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectTrack = (track: { id: string; name: string; url: string; theme: string } | null) => {
    if (!track) return;
    
    const audio = audioRef.current;
    if (!audio) return;

    const wasPlaying = !audio.paused;
    setCurrentTrack(track);
    
    if (wasPlaying) {
      // Resume playback with new track
      setTimeout(() => {
        audio.play().catch(console.error);
      }, 100);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Audio element */}
      <audio
        ref={audioRef}
        preload="metadata"
        onError={(error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : 'Audio error';
          console.error('Audio error:', errorMessage);
        }}
      />

      {/* Play/Pause button */}
      <Button
        size="sm"
        variant="outline"
        onClick={togglePlay}
        disabled={isLoading}
        className="h-8 px-2 bg-black/20 border-cyan-500/30 text-cyan-300 hover:bg-black/40"
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
      </Button>

      {/* Track selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2 bg-black/20 border-cyan-500/30 text-cyan-300 hover:bg-black/40"
          >
            <Music className="w-4 h-4 mr-1" />
            {currentTrack?.name || 'Music'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="bg-black/80 border-cyan-500/50 text-cyan-300"
        >
          {musicTracks.map((track) => (
            <DropdownMenuItem
              key={track?.id}
              onClick={() => selectTrack(track)}
              className={`cursor-pointer ${
                currentTrack?.id === track?.id ? 'bg-cyan-900/30' : ''
              }`}
            >
              <Music className="w-4 h-4 mr-2" />
              {track?.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mute button */}
      <Button
        size="sm"
        variant="outline"
        onClick={toggleMute}
        className="h-8 px-2 bg-black/20 border-cyan-500/30 text-cyan-300 hover:bg-black/40"
      >
        {isMuted ? (
          <VolumeX className="w-4 h-4" />
        ) : (
          <Music className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
}; 