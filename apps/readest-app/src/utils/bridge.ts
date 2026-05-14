import { invoke, Channel } from '@tauri-apps/api/core';

export interface CopyURIRequest {
  uri: string;
  dst: string;
}

export interface CopyURIResponse {
  success: boolean;
  path?: string;
  displayName?: string;
  error?: string;
}

export interface UseBackgroundAudioRequest {
  enabled: boolean;
}

export interface InstallPackageRequest {
  path: string;
}

export interface InstallPackageResponse {
  success: boolean;
  error?: string;
}

export interface SetSystemUIVisibilityRequest {
  visible: boolean;
  darkMode: boolean;
}

export interface SetSystemUIVisibilityResponse {
  success: boolean;
  error?: string;
}

export interface GetStatusBarHeightResponse {
  height: number;
  error?: string;
}

export interface GetSystemFontsListResponse {
  fonts: Record<string, string>; // { fontName: fontFamily }
  error?: string;
}

export interface InterceptKeysRequest {
  volumeKeys?: boolean;
  backKey?: boolean;
}

export interface LockScreenRequest {
  orientation: 'portrait' | 'landscape' | 'auto';
}

export interface GetSystemColorSchemeResponse {
  colorScheme: 'light' | 'dark';
  error?: string;
}

export interface GetSafeAreaInsetsResponse {
  top: number;
  right: number;
  bottom: number;
  left: number;
  error?: string;
}

interface GetScreenBrightnessResponse {
  brightness: number; // 0.0 to 1.0
  error?: string;
}

interface SetScreenBrightnessRequest {
  brightness: number; // 0.0 to 1.0
}

interface SetScreenBrightnessResponse {
  success: boolean;
  error?: string;
}

interface GetExternalSDCardPathResponse {
  path: string | null;
  error?: string;
}

interface SelectDirectoryResponse {
  cancelled?: boolean;
  uri?: string;
  path?: string;
  error?: string;
}

export interface LocalEpubFile {
  path: string;
  basePath?: string;
  size?: number;
}

export interface FindLocalEpubFilesResponse {
  files: LocalEpubFile[];
  error?: string;
}

export interface FindLocalEpubFilesProgress {
  scannedCount: number;
  file?: string;
}

export type FindLocalEpubFilesProgressHandler = (progress: FindLocalEpubFilesProgress) => void;

export interface GetStorefrontRegionCodeResponse {
  regionCode?: string;
  error?: string;
}

export async function copyURIToPath(request: CopyURIRequest): Promise<CopyURIResponse> {
  const result = await invoke<CopyURIResponse>('plugin:native-bridge|copy_uri_to_path', {
    payload: request,
  });

  return result;
}

export async function invokeUseBackgroundAudio(request: UseBackgroundAudioRequest): Promise<void> {
  await invoke('plugin:native-bridge|use_background_audio', {
    payload: request,
  });
}

export async function installPackage(
  request: InstallPackageRequest,
): Promise<InstallPackageResponse> {
  const result = await invoke<InstallPackageResponse>('plugin:native-bridge|install_package', {
    payload: request,
  });
  return result;
}

export async function setSystemUIVisibility(
  request: SetSystemUIVisibilityRequest,
): Promise<SetSystemUIVisibilityResponse> {
  const result = await invoke<SetSystemUIVisibilityResponse>(
    'plugin:native-bridge|set_system_ui_visibility',
    {
      payload: request,
    },
  );
  return result;
}

export async function getStatusBarHeight(): Promise<GetStatusBarHeightResponse> {
  const result = await invoke<GetStatusBarHeightResponse>(
    'plugin:native-bridge|get_status_bar_height',
  );
  return result;
}

let cachedSysFontsResult: GetSystemFontsListResponse | null = null;

export async function getSysFontsList(): Promise<GetSystemFontsListResponse> {
  if (cachedSysFontsResult) {
    return cachedSysFontsResult;
  }
  const result = await invoke<GetSystemFontsListResponse>(
    'plugin:native-bridge|get_sys_fonts_list',
  );
  cachedSysFontsResult = result;
  return result;
}

export async function interceptKeys(request: InterceptKeysRequest): Promise<void> {
  await invoke('plugin:native-bridge|intercept_keys', {
    payload: request,
  });
}

export async function lockScreenOrientation(request: LockScreenRequest): Promise<void> {
  await invoke('plugin:native-bridge|lock_screen_orientation', {
    payload: request,
  });
}

export async function getSystemColorScheme(): Promise<GetSystemColorSchemeResponse> {
  const result = await invoke<GetSystemColorSchemeResponse>(
    'plugin:native-bridge|get_system_color_scheme',
  );
  return result;
}

export async function getSafeAreaInsets(): Promise<GetSafeAreaInsetsResponse> {
  const result = await invoke<GetSafeAreaInsetsResponse>(
    'plugin:native-bridge|get_safe_area_insets',
  );
  return result;
}

export async function getScreenBrightness(): Promise<GetScreenBrightnessResponse> {
  const result = await invoke<GetScreenBrightnessResponse>(
    'plugin:native-bridge|get_screen_brightness',
  );
  return result;
}

export async function setScreenBrightness(
  request: SetScreenBrightnessRequest,
): Promise<SetScreenBrightnessResponse> {
  const result = await invoke<SetScreenBrightnessResponse>(
    'plugin:native-bridge|set_screen_brightness',
    {
      payload: request,
    },
  );
  return result;
}

interface ResetScreenBrightnessResponse {
  success: boolean;
  error?: string;
}

export async function resetScreenBrightness(): Promise<ResetScreenBrightnessResponse> {
  const result = await invoke<ResetScreenBrightnessResponse>(
    'plugin:native-bridge|reset_screen_brightness',
  );
  return result;
}

interface CheckWriteSettingsPermissionResponse {
  granted: boolean;
}

export async function checkWriteSettingsPermission(): Promise<boolean> {
  const result = await invoke<CheckWriteSettingsPermissionResponse>(
    'plugin:native-bridge|check_write_settings_permission',
  );
  return result.granted;
}

interface RequestWriteSettingsPermissionResponse {
  success: boolean;
  error?: string;
}

export async function requestWriteSettingsPermission(): Promise<RequestWriteSettingsPermissionResponse> {
  const result = await invoke<RequestWriteSettingsPermissionResponse>(
    'plugin:native-bridge|request_write_settings_permission',
  );
  return result;
}

export async function getExternalSDCardPath(): Promise<GetExternalSDCardPathResponse> {
  const result = await invoke<GetExternalSDCardPathResponse>(
    'plugin:native-bridge|get_external_sdcard_path',
  );
  return result;
}

export async function selectDirectory(): Promise<SelectDirectoryResponse> {
  const result = await invoke<SelectDirectoryResponse>('plugin:native-bridge|select_directory');
  return result;
}

export async function findLocalEpubFiles(
  progressHandler?: FindLocalEpubFilesProgressHandler,
): Promise<FindLocalEpubFilesResponse> {
  if (!progressHandler) {
    return await invoke<FindLocalEpubFilesResponse>('plugin:native-bridge|find_local_epub_files');
  }

  const onProgress = new Channel<FindLocalEpubFilesProgress>();
  onProgress.onmessage = progressHandler;

  return await invoke<FindLocalEpubFilesResponse>('plugin:native-bridge|find_local_epub_files', {
    payload: { onProgress },
  });
}

export async function getStorefrontRegionCode(): Promise<GetStorefrontRegionCodeResponse> {
  const result = await invoke<GetStorefrontRegionCodeResponse>(
    'plugin:native-bridge|get_storefront_region_code',
  );
  return result;
}
