import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // This is the permanent Google Play package name. Change it BEFORE the first
  // Play Console upload and keep it in sync with android/fastlane/Appfile.
  appId: 'com.aech.slate',
  appName: 'SLATE',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
