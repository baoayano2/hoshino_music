# Hoshino Music

Hoshino Music là trình phát nhạc desktop xây dựng bằng Electron, React và TypeScript. Ứng dụng kết hợp thư viện nhạc local với Hoshino Discovery, Spotify discovery, lyrics đồng bộ, tinh chỉnh âm thanh và Discord Rich Presence.

## Tính năng chính

- Import một hoặc nhiều file MP3, WAV, FLAC, M4A, OGG, AAC và WebM.
- Đọc metadata, duration, cover nhúng và lyrics LRC.
- Quản lý playlist, thư mục playlist, cover/hero và thứ tự bài hát.
- Stream hoặc tải bài từ Hoshino Discovery.
- Liên kết Spotify để xem Home, tìm kiếm, duyệt playlist/album và phát qua nguồn audio được resolve.
- Liked songs, Recently played/added và thống kê `playCount`, `skipCount`, `lastPlayedAt` cho cả bài local lẫn online.
- Extended Library có thể bật trong General settings; khi tắt, Liked songs được hiển thị như playlist tim trong Your playlists.
- Queue tự động luôn khả dụng; có thể bật Custom Queue trong Music → Preferences để dùng Next up/Later, kéo đổi thứ tự, Play next, Add to queue, clear, lưu thành playlist và khôi phục sau khi mở lại app.
- Shuffle, repeat, mini player, fullscreen player và khôi phục phiên phát.
- EQ 3/5/10/15 band, Q factor, speed, pitch, crossfade và chọn audio output.
- Discord Rich Presence legacy/v2, system tray, start with Windows và custom CSS.

## Bắt đầu phát triển

Yêu cầu: Node.js LTS, pnpm và môi trường desktop có thể chạy Electron.

```bash
pnpm install
pnpm dev
```

Các lệnh kiểm tra:

```bash
pnpm exec tsc --noEmit
pnpm exec eslint . --report-unused-disable-directives --max-warnings 0
```

Tạo installer/package cho nền tảng hiện tại:

```bash
pnpm build
```

Artifact được đặt trong `release/<version>/`. Cấu hình package nằm tại `electron-builder.json5`.

## Cấu trúc project

```text
src/                         React renderer
  app/                       cấu hình, domain helpers và hooks cấp ứng dụng
  components/                màn hình và UI components
electron/                    Electron main process và preload
  ipc/                       contract, channels và IPC handlers
  music/                     metadata, image và persistent storage
  spotify/                   Spotify API, image cache và playback resolver
  discord/                   Discord Rich Presence integrations
public/                      static assets
scripts/                     packaging hooks
build/                       icon và build resources
```

`src/components/Modals.tsx` là barrel tương thích. Implementation modal được chia thành `SettingsModals.tsx` và `LibraryModals.tsx`.

## Tài liệu

- [Kiến trúc](docs/ARCHITECTURE.md)
- [Quy trình phát triển](docs/DEVELOPMENT.md)
- [Dữ liệu, network và quyền riêng tư](docs/DATA_AND_PRIVACY.md)
- [Chiến lược kiểm thử và phát hành](docs/TESTING_AND_RELEASES.md)

## Trạng thái project

Project hiện chưa có test suite tự động và updater đang kiểm tra version qua endpoint riêng rồi mở link tải installer. Xem `docs/TESTING_AND_RELEASES.md` trước khi triển khai auto-update hoặc CI phát hành production.

## License

Repository hiện chưa khai báo license. Không nên phân phối source hoặc binary như phần mềm mã nguồn mở cho đến khi có file `LICENSE` và chính sách sử dụng rõ ràng.
