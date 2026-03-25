## FFmpeg binary

Place `ffmpeg.exe` here to bundle it into the app build:

- `resources/ffmpeg/win32/ffmpeg.exe`

At runtime the app will prefer the bundled binary. If not found, it will fall back to `ffmpeg` in the system `PATH`.

