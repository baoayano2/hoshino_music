# Kiến trúc Hoshino Music

## Tổng quan

Hoshino gồm hai runtime chính:

1. Electron main process quản lý cửa sổ, filesystem, protocol, network đặc quyền, tray, OAuth và Discord.
2. React renderer quản lý giao diện, playback state, Web Audio graph và tương tác người dùng.

Renderer không truy cập Node.js trực tiếp. Mọi capability đặc quyền đi qua `electron/preload.ts`, contract `ElectronApi` và các IPC handler.

```text
React components
      |
      v
window.electronApi (preload)
      |
      v
IPC channels / main handlers
      |
      +-- Music storage and metadata
      +-- Spotify and YouTube resolver
      +-- Discord presence
      +-- Window, tray and OS integration
```

## Renderer

- `src/App.tsx`: composition root và orchestration của player.
- `src/app/config.ts`: endpoint, storage key và default renderer settings.
- `src/app/discovery.ts`: mapping/filter/cache helpers cho Discovery và Spotify tracks.
- `src/app/usePlaybackShortcuts.ts`: keyboard playback behavior.
- `src/app/usePlaybackHistory.ts`: theo dõi thời gian nghe thực, chốt lượt phát và lượt skip.
- `src/app/lazyModals.ts`: lazy-loading registry cho modal.
- `src/components/SettingsModals.tsx`: settings, account, update và Discord dialogs.
- `src/components/LibraryModals.tsx`: import, playlist, edit, delete và download dialogs.
- `src/components/Modals.tsx`: barrel export để giữ API import ổn định.

Playback dùng hai `HTMLAudioElement` để hỗ trợ crossfade. Khi EQ được bật, audio đi qua Web Audio `MediaElementAudioSourceNode`, các biquad filter và gain node.

Một lượt nghe chỉ được ghi khi thời gian nghe tích lũy đạt ngưỡng nhỏ hơn giữa 30 giây và 50% duration. Seek và thời gian pause không được cộng. Favorite/history của track online được upsert vào library để có thể xuất hiện trong Liked songs và Recently played dù được phát từ Discovery hoặc Spotify.

Liked songs, Recently played và Recently added là các smart collection có playback source/queue tự động riêng và phân trang 20 bài. Recently played được lấy từ `lastPlayedAt`; Recently added được lấy từ `addedAt`. Cài đặt Extended Library quyết định chúng xuất hiện dưới Library hay chỉ đưa Liked songs xuống Your playlists dưới dạng playlist ảo.

Custom Queue được bật trong Music → Preferences và chia thành `customQueueNextUp` và `customQueueLater`. Khi tắt, sidebar queue tiếp tục hiển thị queue tự động theo playlist/shuffle hiện tại. Hai mảng custom chứa snapshot `MusicTrack`, được lưu cùng player state để giữ queue qua lần khởi động lại; mọi thay đổi library phát sinh khi favorite, ghi lịch sử hoặc lưu queue thành playlist vẫn đi qua transaction queue của main process.

## Electron main process

- `electron/main.ts`: app lifecycle, windows và custom protocols.
- `electron/ipc/types.ts`: model dùng chung và public preload contract.
- `electron/ipc/channels.ts`: tên channel tập trung.
- `electron/ipc/main-handlers.ts`: validation/orchestration IPC.
- `electron/music/storage.ts`: JSON persistence và managed audio files.
- `electron/security/credential-store.ts`: OS-backed encryption cho Spotify/Discord credentials.
- `electron/spotify/*`: token, Spotify pages, image cache và audio resolver.
- `electron/discord/*`: Rich Presence legacy và OAuth/gateway v2.

## Custom protocols

- `hoshino-audio://`: đọc audio local có hỗ trợ HTTP range.
- `hoshino-online-audio://`: proxy audio HTTP(S) để renderer phát được nguồn online.
- `hoshino-hero://`: playlist hero images.
- `hoshino-spotify-image://`: Spotify image cache.

## Nguyên tắc khi mở rộng

- Thêm model/capability renderer-facing vào `electron/ipc/types.ts` trước.
- Khai báo channel trong `electron/ipc/channels.ts`, sau đó nối preload và main handler.
- Không đưa filesystem token, cookie hoặc Node API trực tiếp vào renderer.
- UI component không nên gọi storage; đi qua callback/App service hoặc IPC contract.
- Mutation của thư viện phải được serialize để tránh read-modify-write ghi đè nhau.
- Mọi thao tác read-modify-write trên library phải chạy qua transaction queue chung; không tạo queue riêng theo tính năng.
