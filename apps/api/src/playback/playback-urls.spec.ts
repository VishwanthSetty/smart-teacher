import { playbackUrls } from './playback-urls';

describe('playbackUrls', () => {
  it('builds absolute API URLs and omits a missing poster', () => {
    expect(playbackUrls('api', 'http://localhost:4000/', 'video-a', false, 'a+b/c=')).toEqual({
      manifestUrl: 'http://localhost:4000/videos/video-a/hls/master.m3u8?t=a%2Bb%2Fc%3D',
      posterUrl: null,
    });
  });

  it('builds edge URLs whose paths are object keys', () => {
    expect(playbackUrls('edge', 'https://videos.example.com', 'video-a', true, 'token')).toEqual({
      manifestUrl: 'https://videos.example.com/videos/video-a/master.m3u8?t=token',
      posterUrl: 'https://videos.example.com/videos/video-a/poster.jpg?t=token',
    });
  });
});
