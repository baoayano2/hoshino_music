# Dữ liệu, network và quyền riêng tư

## Dữ liệu local

Hoshino tạo thư mục `HoshinoMusic` bên trong Electron `userData`:

```text
HoshinoMusic/
  audio/             file audio được import hoặc download
  heroes/            playlist hero images
  library.json       songs, playlists, folders, favorite và listening counters
  player-state.json  volume, phiên phát gần nhất và Custom Queue
  settings.json      cấu hình ứng dụng và integration state
  credentials.json   cookie/token được mã hóa bằng Electron safeStorage
```

Đường dẫn `userData` phụ thuộc hệ điều hành. Có thể xác nhận bằng `app.getPath('userData')` trong Electron.

Một số cache Discovery được lưu trong renderer `localStorage`; Spotify images nằm trong Electron cache.

Mỗi track có thể lưu `favorite`, `lastPlayedAt`, `playCount` và `skipCount`. Track online được người dùng thích hoặc nghe đủ ngưỡng cũng được lưu dưới dạng record online trong `library.json`; URL phát có thể được resolve lại khi cần. Custom Queue lưu snapshot metadata và source của track, tối đa 500 mục cho mỗi phần Next up/Later.

## Dịch vụ network

Ứng dụng có thể kết nối tới:

- Hoshino CDN để lấy catalog, ping, version và installer.
- Spotify web/API để đăng nhập, đồng bộ profile, Home, search và collections.
- YouTube Music/YouTube để resolve nguồn phát từ Spotify metadata.
- Discord để cập nhật Rich Presence và OAuth v2.
- URL cover, lyrics hoặc audio được cung cấp bởi catalog/metadata.

## Credential

Spotify `sp_dc`/`sp_t`, Spotify access token và Discord OAuth access/refresh token không được ghi rõ vào `settings.json`. Chúng được mã hóa bằng Electron `safeStorage`: DPAPI trên Windows, Keychain trên macOS và secret store phù hợp trên Linux. Dữ liệu plaintext từ phiên bản cũ được migrate khi ứng dụng khởi động rồi bị loại khỏi settings JSON.

Trên Linux, backend `basic_text` không được chấp nhận vì không phải OS-backed secret store. Trong môi trường không có keyring phù hợp, credential mới chỉ tồn tại trong phiên chạy hiện tại và người dùng có thể cần liên kết lại tài khoản sau khi khởi động lại.

Không đính kèm `settings.json`, cookie, access token hoặc thư mục userData khi gửi log hỗ trợ.

## Xóa dữ liệu

Gỡ ứng dụng hiện không tự xóa app data (`deleteAppDataOnUninstall: false`). Điều này giúp giữ thư viện qua lần cài lại, nhưng cần được giải thích rõ trong UI/uninstaller. Các chức năng “delete all” là thao tác không thể hoàn tác; nên bổ sung backup/snapshot trước khi triển khai cho người dùng production.
