// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');
const pluginRoot = resolve(appRoot, 'src-tauri/plugins/tauri-plugin-native-bridge');
const readPluginFile = (path: string) => readFileSync(resolve(pluginRoot, path), 'utf8');

describe('Readio EPUB discovery native bridge', () => {
  it('registers the Android local EPUB scan command end-to-end', () => {
    expect(readPluginFile('build.rs')).toContain('find_local_epub_files');
    expect(readPluginFile('src/lib.rs')).toContain('commands::find_local_epub_files');
    expect(readPluginFile('src/commands.rs')).toContain('fn find_local_epub_files');
    expect(readPluginFile('src/commands.rs')).toContain('payload: Option<serde_json::Value>');
    expect(readPluginFile('src/commands.rs')).toContain('find_local_epub_files(payload.unwrap_or');
    expect(readPluginFile('src/mobile.rs')).toContain('payload: serde_json::Value');
    expect(readPluginFile('src/mobile.rs')).toContain(
      'run_mobile_plugin("find_local_epub_files", payload)',
    );
    expect(readPluginFile('src/commands.rs')).toContain('callback_state: State<');
    expect(readPluginFile('src/commands.rs')).toContain('PathBuf::from(&file.path)');
    expect(readPluginFile('src/commands.rs')).toContain('callback(&app, &parent.to_path_buf());');
    expect(readPluginFile('src/mobile.rs')).toContain('run_mobile_plugin("find_local_epub_files"');
    expect(readPluginFile('permissions/default.toml')).toContain('allow-find-local-epub-files');
    const androidPlugin = readPluginFile('android/src/main/java/NativeBridgePlugin.kt');
    expect(androidPlugin).toContain('fun find_local_epub_files');
    expect(androidPlugin).toContain('onProgress');
    expect(androidPlugin).toContain('onProgress?.send');
  });
});
