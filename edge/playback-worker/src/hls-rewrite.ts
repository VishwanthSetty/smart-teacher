export function rewriteHlsManifest(manifest: string, mapUri: (uri: string) => string): string {
  return manifest
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      if (line.length === 0) return line;
      if (!line.startsWith('#')) return mapUri(line);
      return line.replace(/URI="([^"]*)"/, (_match, uri: string) => `URI="${mapUri(uri)}"`);
    })
    .join('\n');
}
