// 테스트용 영상·사진 만들기 (ffmpeg 필요): node scripts/e2e/make-media.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const out = join(resolve(dirname(fileURLToPath(import.meta.url))), '.media');
mkdirSync(out, { recursive: true });
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });
ff('-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '5', '-c:v', 'libvpx', '-b:v', '600k', '-c:a', 'libvorbis', join(out, 'v1.webm'));
ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=660', '-t', '4', '-c:v', 'libvpx', '-b:v', '600k', '-c:a', 'libvorbis', join(out, 'v2.webm'));
ff('-f', 'lavfi', '-i', 'testsrc2=size=1080x1350', '-frames:v', '1', join(out, 'photo.png'));
ff('-f', 'lavfi', '-i', 'smptebars=size=1080x1350', '-frames:v', '1', join(out, 'photo2.png'));
console.log('만들었어요:', out);
