const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withMainApplication,
  withAppBuildGradle,
} = require('expo/config-plugins');

// Play Protect heavily flags APKs containing BitTorrent engines + local HTTP
// servers (P2P heuristics). No provider currently emits magnet/.torrent links,
// so the torrent stack is excluded by default. Set INCLUDE_TORRENT=1 to opt in.
const includeTorrent = process.env.INCLUDE_TORRENT === '1';

function withCustomNativeModules(config) {
  // 1. Copy the files over
  config = withDangerousMod(config, [
    'android',
    async cfg => {
      const projectRoot = cfg.modRequest.projectRoot;
      const packageName = cfg.android?.package || 'com.cine.pix';
      const packagePath = packageName.replace(/\./g, '/');
      const targetDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        packagePath,
      );

      fs.mkdirSync(targetDir, {recursive: true});

      // Copy from native-src/android/com/cine/pix
      const sourceDir = path.join(
        projectRoot,
        'native-src',
        'android',
        'com',
        'cine',
        'pix',
      );

      if (fs.existsSync(sourceDir)) {
        const files = fs.readdirSync(sourceDir);
        for (const file of files) {
          if (file.endsWith('.kt')) {
            // Torrent sources need libtorrent4j/nanohttpd deps — skip when excluded.
            const targetFile = path.join(targetDir, file);
            if (!includeTorrent && /torrent/i.test(file)) {
              if (fs.existsSync(targetFile)) {
                fs.rmSync(targetFile);
              }
              continue;
            }

            const sourceFile = path.join(sourceDir, file);

            // Read the file and update the package name
            let content = fs.readFileSync(sourceFile, 'utf8');
            content = content.replace(
              /^package com\.vega$/m,
              `package ${packageName}`,
            );

            fs.writeFileSync(targetFile, content, 'utf8');
          }
        }
      }

      return cfg;
    },
  ]);

  // 2. Add packages and DoH factory registration to MainApplication.kt
  config = withMainApplication(config, cfg => {
    let currentContents = cfg.modResults.contents;

    const packagesToAdd = [
      'DohPackage()',
      'HttpDownloadPackage()',
      'LauncherIconPackage()',
      'VideoThumbnailPackage()',
    ];
    if (includeTorrent) {
      packagesToAdd.push('TorrentPackage()');
    }

    for (const pkg of packagesToAdd) {
      if (!currentContents.includes(`add(${pkg})`)) {
        currentContents = currentContents.replace(
          /PackageList\(this\)\.packages\.apply \{\n/,
          match => `${match}              add(${pkg})\n`,
        );
      }
    }

    // Register DohOkHttpFactory with OkHttpClientProvider in onCreate
    const factoryLine =
      'OkHttpClientProvider.setOkHttpClientFactory(DohOkHttpFactory(cacheDir))';
    if (!currentContents.includes('setOkHttpClientFactory')) {
      // Add the import if missing
      if (
        !currentContents.includes(
          'import com.facebook.react.modules.network.OkHttpClientProvider',
        )
      ) {
        currentContents = currentContents.replace(
          /^(package .+\n)/m,
          match =>
            `${match}\nimport com.facebook.react.modules.network.OkHttpClientProvider\n`,
        );
      }

      // Inject factory registration after loadReactNative(this)
      currentContents = currentContents.replace(
        /loadReactNative\(this\)\n/,
        match =>
          `${match}    OkHttpClientProvider.setOkHttpClientFactory(DohOkHttpFactory(cacheDir))\n`,
      );
    }

    cfg.modResults.contents = currentContents;
    return cfg;
  });

  // 3. Add necessary dependencies to app/build.gradle
  config = withAppBuildGradle(config, cfg => {
    let contents = cfg.modResults.contents;

    // Add okhttp-dnsoverhttps if not present
    if (!contents.includes('okhttp-dnsoverhttps')) {
      // Find the dependencies block
      contents = contents.replace(
        /dependencies\s*\{/,
        match =>
          `${match}\n    implementation 'com.squareup.okhttp3:okhttp-dnsoverhttps:4.12.0'\n`,
      );
    }

    if (!contents.includes('com.squareup.okhttp3:okhttp:4.12.0')) {
      contents = contents.replace(
        /dependencies\s*\{/,
        match =>
          `${match}\n    implementation 'com.squareup.okhttp3:okhttp:4.12.0'\n`,
      );
    }

    // MediaMetadataRetriever can return the first frame for every timestamp
    // on remote videos. Media3's frame extractor performs a real HTTP/HLS seek.
    if (!contents.includes('androidx.media3:media3-transformer')) {
      contents = contents.replace(
        /dependencies\s*\{/,
        match =>
          `${match}\n    implementation 'androidx.media3:media3-transformer:1.8.0'\n`,
      );
    }

    // libtorrent4j + nanohttpd (torrent stack) — only when explicitly opted in.
    if (includeTorrent && !contents.includes('libtorrent4j:2.1.0-39')) {
      contents = contents.replace(
        /dependencies\s*\{/,
        match =>
          `${match}\n    implementation 'org.nanohttpd:nanohttpd:2.3.1'\n    implementation 'org.libtorrent4j:libtorrent4j:2.1.0-39'\n    implementation 'org.libtorrent4j:libtorrent4j-android-arm64:2.1.0-39'\n    implementation 'org.libtorrent4j:libtorrent4j-android-x86_64:2.1.0-39'\n`,
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
}

module.exports = withCustomNativeModules;
