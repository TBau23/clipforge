import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Converts an absolute file path to a webview-safe URL.
 * Use this for loading local media files (images, videos) in HTML elements.
 * 
 * @param path Absolute file path (e.g., /Users/you/Videos/video.mp4)
 * @returns Webview-safe URL (e.g., https://asset.localhost/...)
 */
export function getAssetUrl(path: string): string {
  return convertFileSrc(path);
}

