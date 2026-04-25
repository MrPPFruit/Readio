// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(__dirname, '../../..');
const projectRoot = resolve(appRoot, '../..');

describe('Readio Android package identity', () => {
  it('uses a package id that can coexist with upstream Readest', () => {
    const tauriConfig = JSON.parse(
      readFileSync(resolve(appRoot, 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as { identifier: string };
    const androidBuild = readFileSync(
      resolve(appRoot, 'src-tauri/gen/android/app/build.gradle.kts'),
      'utf8',
    );
    const mainActivityPath = resolve(
      appRoot,
      'src-tauri/gen/android/app/src/main/java/com/ppg/readio/MainActivity.kt',
    );
    const duplicateTauriActivityPath = resolve(
      appRoot,
      'src-tauri/gen/android/app/src/main/java/com/ppg/readio/TauriActivity.kt',
    );
    const generatedTauriActivityPath = resolve(
      appRoot,
      'src-tauri/gen/android/app/src/main/java/com/ppg/readio/generated/TauriActivity.kt',
    );
    const staleReadestSourcePath = resolve(
      appRoot,
      'src-tauri/gen/android/app/src/main/java/com/bilingify/readest',
    );

    expect(tauriConfig.identifier).toBe('com.ppg.readio');
    expect(androidBuild).toContain('namespace = "com.ppg.readio"');
    expect(androidBuild).toContain('applicationId = "com.ppg.readio"');
    expect(existsSync(mainActivityPath)).toBe(true);
    expect(existsSync(generatedTauriActivityPath)).toBe(true);
    expect(existsSync(duplicateTauriActivityPath)).toBe(false);
    expect(existsSync(staleReadestSourcePath)).toBe(false);

    const mainActivity = readFileSync(mainActivityPath, 'utf8');
    const tauriActivity = readFileSync(generatedTauriActivityPath, 'utf8');
    expect(mainActivity).toContain('package com.ppg.readio');
    expect(tauriActivity).toContain('package com.ppg.readio');
  });

  it('uses Readio product versioning and a high Android versionCode', () => {
    const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8')) as {
      version: string;
      scripts: Record<string, string>;
    };
    const tauriConfig = JSON.parse(
      readFileSync(resolve(appRoot, 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as { bundle: { android: { versionCode: number } } };
    const gitignore = readFileSync(resolve(projectRoot, '.gitignore'), 'utf8');

    expect(packageJson.version).toBe('0.1.0-alpha.1');
    expect(packageJson.scripts['build-readio-apk']).toBe('bash scripts/build-readio-apk.sh');
    expect(tauriConfig.bundle.android.versionCode).toBe(1001001);
    expect(gitignore).toContain('/apks/*.apk');
    expect(gitignore).toContain('/apks/*.aab');
  });
});
